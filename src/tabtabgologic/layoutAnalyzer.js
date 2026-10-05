// layoutAnalyzer.js - Geometry-based (class-name-independent) region detection
//
// Gmail's obfuscated CSS classes (.aeH, .Cp, .aKk, .biW, ...) can be renamed by
// Google at any time, silently breaking regionManager.js's selector-based
// extractors. This module offers a second way to find the same regions by
// analyzing where things sit on screen (a full-width strip near the top looks
// like a header, a narrow tall column on the left looks like nav, etc.) so
// regionManager.js can fall back to it instead of failing outright.
//
// This module never runs standalone: regionManager.js always tries its
// existing selector/custom extractors first and only consults this module's
// output when the legacy path finds nothing (or something invisible).

/* ========= CONFIG ========= */

const MIN_BLOCK_WIDTH = 80;
const MIN_BLOCK_HEIGHT = 24;
const MAX_BLOCK_SCAN_DEPTH = 2;

const HEADER_MAX_HEIGHT_RATIO = 0.08;
const HEADER_MAX_HEIGHT_PX = 100;
const HEADER_MIN_WIDTH_RATIO = 0.9;
const HEADER_MAX_TOP_PX = 80;

const NAV_MAX_WIDTH_RATIO = 0.22;
const NAV_MIN_HEIGHT_RATIO = 0.5;
const NAV_MAX_LEFT_PX = 20;

const RIGHT_PANEL_MAX_WIDTH_RATIO = 0.22;
const RIGHT_PANEL_MIN_HEIGHT_RATIO = 0.3;
const RIGHT_PANEL_MAX_RIGHT_GAP_PX = 20;

const MAIN_MIN_COVERAGE_RATIO = 0.4;

const TOOLBAR_MIN_WIDTH_RATIO = 0.85;
const TOOLBAR_MAX_HEIGHT_PX = 160;
const TOOLBAR_TOP_BAND_PX = 140;
const TOOLBAR_MIN_MERGED_WIDTH_RATIO = 0.6;

const MIN_DESKTOP_WIDTH_PX = 900;
const LOW_WIDTH_CONFIDENCE_PENALTY = 0.3;

const IGNORE_IDS = [
    'smarttab-popup',
    'smarttab-lasso',
    'smarttab-chord',
    'task-notification',
    'tabtabgo-region-overlay',
    'tabtabgo-region-popup',
    'tabtabgo-sync-overlay',
    'tabtabgo-task-interstitial',
];

/* ========= DEBUG ========= */

export function isLayoutDebugEnabled() {
    try {
        return localStorage.getItem('tabtabgo-layout-debug') === '1';
    } catch {
        return false;
    }
}

/* ========= MEASUREMENT ========= */

export function measureElement(el) {
    const rect = el._virtualBounds || el.getBoundingClientRect();
    const width = Math.max(0, rect.width);
    const height = Math.max(0, rect.height);
    return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width,
        height,
        area: width * height,
        cx: rect.left + width / 2,
        cy: rect.top + height / 2,
    };
}

function getViewportBox() {
    return {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
        width: window.innerWidth,
        height: window.innerHeight,
    };
}

function isElementIgnored(el) {
    if (!el) return true;
    if (el.id && IGNORE_IDS.includes(el.id)) return true;
    for (const id of IGNORE_IDS) {
        if (el.closest && el.closest(`#${id}`)) return true;
    }
    return false;
}

function isVisible(el) {
    if (el.dataset && el.dataset.combinedRegion === 'true') return true;
    const rect = measureElement(el);
    if (rect.width <= 0 || rect.height <= 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
}

function isInsideDialog(el) {
    return !!(el.closest && el.closest('[role="dialog"], [aria-modal="true"]'));
}

function intersectionArea(a, b) {
    const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return ix * iy;
}

function rectIntersectionOverUnion(a, b) {
    const intersection = intersectionArea(a, b);
    const union = a.area + b.area - intersection;
    if (union <= 0) return 0;
    return intersection / union;
}

function rectContains(outer, inner, tolerance = 2) {
    return (
        inner.left >= outer.left - tolerance &&
        inner.top >= outer.top - tolerance &&
        inner.right <= outer.right + tolerance &&
        inner.bottom <= outer.bottom + tolerance
    );
}

/* ========= LANDMARK SEEDS ========= */

const LANDMARK_SELECTORS = {
    main: '[role="main"]',
    nav: '[role="navigation"]',
    header: '[role="banner"]',
    rightPanel: '[role="complementary"]',
};

// Gmail can render multiple (sometimes hidden) copies of a landmark during
// view transitions, so this collects and visibility-filters ALL matches
// rather than trusting the first one -- the same pattern regionManager.js's
// own `main` custom extractor already uses.
export function collectLandmarkSeeds() {
    const seeds = { main: [], nav: [], header: [], rightPanel: [] };

    for (const [key, selector] of Object.entries(LANDMARK_SELECTORS)) {
        const elements = Array.from(document.querySelectorAll(selector));
        for (const el of elements) {
            if (isElementIgnored(el)) continue;
            if (!isVisible(el)) continue;
            seeds[key].push({ element: el, rect: measureElement(el) });
        }
    }

    return seeds;
}

/* ========= BLOCK SCAN (for regions with no landmark, e.g. the toolbar) ========= */

function findCommonAncestorPair(a, b) {
    const ancestorsOfA = new Set();
    let node = a;
    while (node) {
        ancestorsOfA.add(node);
        node = node.parentElement;
    }
    node = b;
    while (node) {
        if (ancestorsOfA.has(node)) return node;
        node = node.parentElement;
    }
    return null;
}

function findCommonAncestor(elements) {
    return elements.reduce((ancestor, el) => {
        if (!ancestor) return el;
        return findCommonAncestorPair(ancestor, el) || document.body;
    });
}

function collectShallow(root, depth, out) {
    if (depth > MAX_BLOCK_SCAN_DEPTH) return;
    for (const child of root.children) {
        out.push(child);
        collectShallow(child, depth + 1, out);
    }
}

// Finds candidate "chunks" for the one region with no ARIA landmark
// (top-navigation). Scoped to a shallow walk (depth <= 2) from the nearest
// common ancestor of the found main/nav/header landmarks -- Gmail's "app
// shell" root, found without hardcoding any class name. Falls back to
// document.body when fewer than 2 landmarks are available to anchor from.
export function collectBlockScanSeeds(landmarkSeeds) {
    const anchorElements = [
        ...(landmarkSeeds.main[0] ? [landmarkSeeds.main[0].element] : []),
        ...(landmarkSeeds.nav[0] ? [landmarkSeeds.nav[0].element] : []),
        ...(landmarkSeeds.header[0] ? [landmarkSeeds.header[0].element] : []),
    ];

    const root = anchorElements.length >= 2 ? findCommonAncestor(anchorElements) : document.body;

    const candidates = [];
    collectShallow(root, 0, candidates);

    const filtered = candidates.filter(el => {
        if (isElementIgnored(el)) return false;
        if (isInsideDialog(el)) return false;
        if (!isVisible(el)) return false;
        const rect = measureElement(el);
        return rect.width >= MIN_BLOCK_WIDTH && rect.height >= MIN_BLOCK_HEIGHT;
    });

    // De-duplicate nested boxes: keep the largest self-contained blocks only.
    const withRects = filtered.map(el => ({ element: el, rect: measureElement(el) }));
    withRects.sort((a, b) => b.rect.area - a.rect.area);

    const kept = [];
    for (const candidate of withRects) {
        const containedByKept = kept.some(k => rectContains(k.rect, candidate.rect));
        if (!containedByKept) kept.push(candidate);
    }

    return kept;
}

/* ========= CLASSIFICATION =========
 * These only ever score a seed that ALREADY carries the matching ARIA role
 * (see collectLandmarkSeeds) -- geometry here confirms/ranks candidates, it
 * never invents a header/nav/panel from an arbitrary block. That's what
 * keeps something like a promo banner from being misread as the real header.
 */

function pickBestSeed(seeds, viewport, classifier) {
    let best = null;
    for (const seed of seeds) {
        const result = classifier(seed.rect, viewport);
        if (result.confidence <= 0) continue;
        if (!best || result.confidence > best.confidence) {
            best = { element: seed.element, rect: seed.rect, confidence: result.confidence, reasons: result.reasons };
        }
    }
    return best;
}

function classifyHeader(rect, viewport) {
    const reasons = [];
    let confidence = 1;

    if (rect.top > HEADER_MAX_TOP_PX) { confidence -= 0.4; reasons.push('not near top'); }
    if (rect.width < viewport.width * HEADER_MIN_WIDTH_RATIO) { confidence -= 0.4; reasons.push('not full width'); }
    const maxHeight = Math.min(viewport.height * HEADER_MAX_HEIGHT_RATIO, HEADER_MAX_HEIGHT_PX);
    if (rect.height > maxHeight) { confidence -= 0.3; reasons.push('too tall for a header strip'); }

    return { confidence: Math.max(0, confidence), reasons };
}

function classifyNav(rect, viewport) {
    const reasons = [];
    let confidence = 1;

    if (rect.left > NAV_MAX_LEFT_PX) { confidence -= 0.4; reasons.push('not flush left'); }
    if (rect.width > viewport.width * NAV_MAX_WIDTH_RATIO) { confidence -= 0.3; reasons.push('too wide for nav column'); }
    if (rect.height < viewport.height * NAV_MIN_HEIGHT_RATIO) { confidence -= 0.3; reasons.push('too short for nav column'); }

    return { confidence: Math.max(0, confidence), reasons };
}

function classifyRightPanel(rect, viewport) {
    const reasons = [];
    let confidence = 1;

    const rightGap = viewport.width - rect.right;
    if (rightGap > RIGHT_PANEL_MAX_RIGHT_GAP_PX) { confidence -= 0.4; reasons.push('not flush right'); }
    if (rect.width > viewport.width * RIGHT_PANEL_MAX_WIDTH_RATIO) { confidence -= 0.3; reasons.push('too wide for side panel'); }
    if (rect.height < viewport.height * RIGHT_PANEL_MIN_HEIGHT_RATIO) { confidence -= 0.3; reasons.push('too short for side panel'); }

    return { confidence: Math.max(0, confidence), reasons };
}

function applyNarrowViewportPenalty(result, viewport) {
    if (!result) return result;
    if (viewport.width < MIN_DESKTOP_WIDTH_PX) {
        result.confidence = Math.max(0, result.confidence - LOW_WIDTH_CONFIDENCE_PENALTY);
        result.reasons.push('narrow viewport');
    }
    return result;
}

/* ========= REGION RESOLUTION ========= */

// Shrinks the remaining rectangle to exclude an already-resolved region.
// Assumes Gmail's real layout: header sits on top, nav on the left, the
// right panel on the right -- true for every desktop Gmail view.
function subtractRect(remaining, taken) {
    if (!taken) return remaining;
    const r = { ...remaining };

    if (taken.top <= remaining.top + 5 && taken.width >= remaining.width * 0.5) {
        r.top = Math.max(r.top, taken.bottom);
    } else if (taken.left <= remaining.left + 5) {
        r.left = Math.max(r.left, taken.right);
    } else if (taken.right >= remaining.right - 5) {
        r.right = Math.min(r.right, taken.left);
    }

    r.width = Math.max(0, r.right - r.left);
    r.height = Math.max(0, r.bottom - r.top);
    return r;
}

export function findMainRegion(remainingRect, landmarkSeeds, blockScanSeeds) {
    const remainingArea = remainingRect.width * remainingRect.height;
    if (remainingArea <= 0) return null;

    let best = null;
    let bestOverlapArea = 0;
    const candidates = [...landmarkSeeds.main, ...blockScanSeeds];

    for (const candidate of candidates) {
        const overlapArea = intersectionArea(candidate.rect, remainingRect);
        const coverage = overlapArea / remainingArea;
        if (coverage < MAIN_MIN_COVERAGE_RATIO) continue;
        if (overlapArea > bestOverlapArea) {
            bestOverlapArea = overlapArea;
            best = { element: candidate.element, rect: candidate.rect, confidence: Math.min(1, coverage) };
        }
    }

    return best;
}

export function findToolbarStrip(remainingRect, blockScanSeeds) {
    const topBandBottom = remainingRect.top + TOOLBAR_TOP_BAND_PX;

    const stripCandidates = blockScanSeeds.filter(seed => {
        const rect = seed.rect;
        if (rect.top < remainingRect.top - 5) return false;
        if (rect.top > topBandBottom) return false;
        if (rect.width < remainingRect.width * TOOLBAR_MIN_WIDTH_RATIO) return false;
        if (rect.height > TOOLBAR_MAX_HEIGHT_PX) return false;
        return true;
    });

    if (stripCandidates.length === 0) return null;

    // Sort top-to-bottom so rows merge in visual order (toolbar, then tabs).
    stripCandidates.sort((a, b) => a.rect.top - b.rect.top);

    const merged = buildVirtualRegionElement(stripCandidates.map(c => c.element));
    const mergedRect = measureElement(merged);

    if (mergedRect.width < remainingRect.width * TOOLBAR_MIN_MERGED_WIDTH_RATIO) return null;
    if (mergedRect.height <= 0 || mergedRect.height > TOOLBAR_MAX_HEIGHT_PX * 2) return null;

    assignGeometryMemberSlots(merged, stripCandidates.map(c => c.element));

    return { element: merged, rect: mergedRect, confidence: 0.7 };
}

// Geometry can't tell which merged piece is "the toolbar" vs "biW" vs
// "category tabs" the way the legacy extractor's class names can -- this is
// a best-effort guess so expandedCandidateExtractor.js's existing named-slot
// extraction still works most of the time. `_geometryMembers` (the raw,
// unlabeled list) is the real safety net if this guess is wrong.
function assignGeometryMemberSlots(wrapper, members) {
    wrapper._geometryMembers = members;

    let categoryTabs = null;
    const remaining = [];
    for (const el of members) {
        if (!categoryTabs && el.querySelector && el.querySelector('[role="tab"]')) {
            categoryTabs = el;
        } else {
            remaining.push(el);
        }
    }

    remaining.sort((a, b) => measureElement(b).width - measureElement(a).width);

    wrapper._toolbarElement = remaining[0] || null;
    wrapper._biWElement = remaining[1] || null;
    wrapper._categoryTabsElement = categoryTabs;
}

/* ========= VIRTUAL WRAPPER =========
 * Shared with regionManager.js's legacy top-navigation extractor, which
 * builds the same kind of detached wrapper element out of named class-based
 * pieces (aeH, biW, aKk) instead of geometry-found ones.
 */

export function buildVirtualRegionElement(memberElements) {
    const elements = memberElements.filter(Boolean);
    const rects = elements.map(el => measureElement(el));

    const left = Math.min(...rects.map(r => r.left));
    const top = Math.min(...rects.map(r => r.top));
    const right = Math.max(...rects.map(r => r.right));
    const bottom = Math.max(...rects.map(r => r.bottom));

    const wrapper = document.createElement('div');
    wrapper.className = 'tabtabgo-virtual-region';
    wrapper.dataset.combinedRegion = 'true';

    wrapper._virtualBounds = {
        left, top, right, bottom,
        width: right - left,
        height: bottom - top,
    };

    wrapper.getBoundingClientRect = function () {
        return this._virtualBounds;
    };

    return wrapper;
}

/* ========= ORCHESTRATOR ========= */

export function detectLayoutRegions() {
    const viewport = getViewportBox();
    const landmarkSeeds = collectLandmarkSeeds();
    const blockScanSeeds = collectBlockScanSeeds(landmarkSeeds);

    const header = applyNarrowViewportPenalty(pickBestSeed(landmarkSeeds.header, viewport, classifyHeader), viewport);
    const nav = applyNarrowViewportPenalty(pickBestSeed(landmarkSeeds.nav, viewport, classifyNav), viewport);
    const rightPanel = applyNarrowViewportPenalty(pickBestSeed(landmarkSeeds.rightPanel, viewport, classifyRightPanel), viewport);

    let remainingRect = { ...viewport };
    if (header) remainingRect = subtractRect(remainingRect, header.rect);
    if (nav) remainingRect = subtractRect(remainingRect, nav.rect);
    if (rightPanel) remainingRect = subtractRect(remainingRect, rightPanel.rect);

    const main = findMainRegion(remainingRect, landmarkSeeds, blockScanSeeds);
    const toolbar = findToolbarStrip(remainingRect, blockScanSeeds);

    return { header, nav, main, rightPanel, toolbar };
}

/* ========= DEBUG TABLE ========= */

// Lets a developer eyeball, per region, whether geometry agrees with the
// legacy (selector-based) result before ever trusting it, and later shows
// exactly when the fallback engaged for real (sourceUsed: 'geometry').
// Enable with: localStorage.setItem('tabtabgo-layout-debug', '1')
export function logLayoutDebugTable(layoutRegions, legacyResultsById) {
    if (!isLayoutDebugEnabled()) return;

    const rows = {};
    const ids = new Set([...Object.keys(layoutRegions), ...Object.keys(legacyResultsById)]);

    for (const id of ids) {
        const geo = layoutRegions[id];
        const legacy = legacyResultsById[id];
        const legacyFound = !!(legacy && legacy.element);

        let agreement = null;
        if (geo && legacyFound) {
            agreement = rectIntersectionOverUnion(geo.rect, measureElement(legacy.element)) > 0.7;
        }

        rows[id] = {
            legacyFound,
            geometryFound: !!geo,
            geometryConfidence: geo ? geo.confidence.toFixed(2) : null,
            agreement,
            sourceUsed: legacyFound ? 'legacy' : (geo ? 'geometry' : 'none'),
        };
    }

    console.table(rows);
}
