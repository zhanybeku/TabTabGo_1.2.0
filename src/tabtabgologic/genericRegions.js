// genericRegions.js - Finds and names the parts of any web page from the page's own structure
// (ARIA landmarks and semantic HTML), with a layout-based fallback for clickable elements
// that aren't inside any landmark. Used on every site, and on Gmail when Detection is "Dynamic".

import { findInteractiveElements, isVisible, nameOf, OWN_UI_SELECTOR } from './pageReader.js';

/* ========= PAGE LABELS (shared with regionManager.js) ========= */

export const LANDMARK_SELECTOR = '[role="banner"],[role="navigation"],[role="main"],[role="complementary"],' +
    '[role="dialog"],[role="region"],[role="search"],[role="form"],[role="toolbar"],[role="tabpanel"]';

// Semantic HTML equivalents, so headings inside e.g. a <nav> aren't attributed to its parent
const GENERIC_LANDMARK_SELECTOR = LANDMARK_SELECTOR +
    ',header,nav,main,aside,footer,dialog,search,section[aria-label],section[aria-labelledby],[role="contentinfo"]';

const PAGE_LABEL_MAX_CHARS = 60;

export function cleanLabel(text) {
    return (text || '').replace(/\s+/g, ' ').trim().slice(0, PAGE_LABEL_MAX_CHARS);
}

/**
 * The page's own label for an area: aria-label, aria-labelledby, or (if
 * includeHeadings) its first heading. Headings that belong to a nested area
 * are skipped, e.g. the search box's "Search" heading inside a header.
 */
export function getPageLabel(element, includeHeadings = true, nestedSelector = LANDMARK_SELECTOR) {
    if (!element || !element.getAttribute) return '';

    const ariaLabel = cleanLabel(element.getAttribute('aria-label'));
    if (ariaLabel) return ariaLabel;

    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
        const text = cleanLabel(labelledBy.split(/\s+/)
            .map(id => document.getElementById(id)?.textContent || '')
            .join(' '));
        if (text) return text;
    }

    if (!includeHeadings) return '';

    for (const heading of element.querySelectorAll('h1, h2, h3')) {
        const owner = heading.closest(nestedSelector);
        if (owner && owner !== element && element.contains(owner)) continue;

        const text = cleanLabel(heading.textContent);
        if (text) return text;
    }

    return '';
}

/* ========= REGION DETECTION ========= */

// Checked in order: an element gets the first type it matches
const REGION_TYPES = [
    { type: 'dialog', name: 'Dialog', icon: '💬', selector: '[role="dialog"], [role="alertdialog"], dialog[open]' },
    { type: 'header', name: 'Header', icon: '🔝', selector: '[role="banner"], header', pageLevelTag: true },
    { type: 'search', name: 'Search', icon: '🔍', selector: '[role="search"], search' },
    { type: 'navigation', name: 'Navigation', icon: '🧭', selector: '[role="navigation"], nav' },
    { type: 'main', name: 'Main Content', icon: '📄', selector: '[role="main"], main' },
    { type: 'sidebar', name: 'Sidebar', icon: '📌', selector: '[role="complementary"], aside' },
    { type: 'footer', name: 'Footer', icon: '⬇️', selector: '[role="contentinfo"], footer', pageLevelTag: true },
    { type: 'form', name: 'Form', icon: '📝', selector: '[role="form"], form[aria-label], form[aria-labelledby]' },
    { type: 'section', name: 'Section', icon: '📦', selector: '[role="region"], section[aria-label], section[aria-labelledby]' },
    { type: 'toolbar', name: 'Toolbar', icon: '🛠️', selector: '[role="toolbar"]' },
    { type: 'tabs', name: 'Tabs', icon: '🗂️', selector: '[role="tablist"]' },
    { type: 'menu', name: 'Menu', icon: '☰', selector: '[role="menubar"]' }
];

const AREA_TYPE = { type: 'area', name: 'Area', icon: '▫️' };
const SIDE_BOX_TYPE = { type: 'sidebox', name: 'Side Box', icon: '🗂️' };

// A box floated beside the text (e.g. a Wikipedia infobox) becomes its own region if it has
// at least this many elements and is narrower than this share of the window
const MIN_SIDE_BOX_ELEMENTS = 5;
const MAX_SIDE_BOX_WIDTH_RATIO = 0.5;

// <header>/<footer> only count as page header/footer outside these (per the HTML-ARIA mapping)
const SECTIONING_SELECTOR = 'article, aside, main, nav, section, [role="main"], [role="complementary"], [role="navigation"], [role="region"]';

// A nested landmark becomes its own region if it has at least this many elements and
// either its parent region is large or it is a type people look for directly
const MIN_CHILD_ELEMENTS = 2;
const SPLIT_LARGE_REGION_AT = 25;
const ALWAYS_SEPARATE_TYPES = new Set(['dialog', 'search', 'navigation', 'form', 'toolbar', 'tabs', 'menu']);

// Layout fallback: areas with more elements than this are split along the DOM tree
const MAX_AREA_ELEMENTS = 40;
const MAX_PARTITION_DEPTH = 30;

const SUMMARY_ITEMS = 4;
const SUMMARY_ITEM_MAX_CHARS = 24;

function isInViewport(rect) {
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

/**
 * The same elements the generic candidate extractor offers (pageReader), so counts match what gets navigated.
 * Not limited to the screen: navigating to an element scrolls it into view.
 */
function collectInteractiveElements() {
    return findInteractiveElements().map(item => item.element);
}

/**
 * An element matched by tag (e.g. <nav>) but with a different explicit role
 * (e.g. role="presentation") isn't that landmark
 */
function hasMatchingRole(element, regionType) {
    const role = element.getAttribute('role');
    return !role || regionType.selector.includes(`"${role}"`);
}

function collectLandmarks(interactive) {
    const seen = new Set();
    const landmarks = [];

    for (const regionType of REGION_TYPES) {
        for (const element of document.querySelectorAll(regionType.selector)) {
            if (seen.has(element) || element.closest(OWN_UI_SELECTOR)) continue;
            if (!hasMatchingRole(element, regionType)) continue;
            if (regionType.pageLevelTag && !element.hasAttribute('role') &&
                element.parentElement?.closest(SECTIONING_SELECTOR)) continue;
            if (!isVisible(element)) continue;

            const owned = interactive.filter(el => element.contains(el));
            if (owned.length === 0) continue;

            seen.add(element);
            landmarks.push({ element, regionType, owned });
        }
    }

    return landmarks;
}

/**
 * Boxes floated beside the text flow. In the page's HTML they often come before the
 * text they sit next to, so without this their links would be offered first.
 */
function collectSideBoxes(interactive, landmarks) {
    const floatCache = new Map();
    const isFloated = node => {
        if (!floatCache.has(node)) {
            const float = window.getComputedStyle(node).float;
            floatCache.set(node, float === 'left' || float === 'right');
        }
        return floatCache.get(node);
    };

    const owned = new Map();
    for (const el of interactive) {
        for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
            if (isFloated(node)) {
                if (!owned.has(node)) owned.set(node, []);
                owned.get(node).push(el);
                break;
            }
        }
    }

    const boxes = [];
    for (const [element, elements] of owned) {
        if (elements.length < MIN_SIDE_BOX_ELEMENTS) continue;
        if (element.getBoundingClientRect().width > window.innerWidth * MAX_SIDE_BOX_WIDTH_RATIO) continue;
        // A floated layout column that holds whole landmarks is page layout, not a side box
        if (landmarks.some(l => l.element === element || element.contains(l.element))) continue;
        boxes.push({ element, regionType: SIDE_BOX_TYPE, owned: elements });
    }
    return boxes;
}

/**
 * Title of a side box: its caption or first header cell (infoboxes have no headings)
 */
function boxTitle(element) {
    const title = element.querySelector('caption, th, [role="columnheader"], [role="heading"]');
    // innerText: visible text only (textContent would include embedded <style> rules)
    return title ? cleanLabel(title.innerText) : '';
}

function isModal(element) {
    if (element.getAttribute('aria-modal') === 'true') return true;
    try {
        return element.tagName === 'DIALOG' && element.matches(':modal');
    } catch (error) {
        return false;
    }
}

/**
 * Decide which landmarks become regions. Top-level landmarks always do; nested
 * ones only when they're worth navigating to separately (see MIN_CHILD_ELEMENTS).
 * A nested landmark that isn't separated stays part of its ancestor's region.
 */
function chooseLandmarkRegions(landmarks) {
    for (const landmark of landmarks) {
        landmark.parent = null;
        for (const other of landmarks) {
            if (other === landmark || !other.element.contains(landmark.element)) continue;
            if (!landmark.parent || landmark.parent.element.contains(other.element)) {
                landmark.parent = other;
            }
        }
    }

    const chosen = [];
    const visit = (landmark, ownerRegion) => {
        for (const child of landmarks.filter(l => l.parent === landmark)) {
            const separate = child.owned.length >= MIN_CHILD_ELEMENTS &&
                (ownerRegion.owned.length > SPLIT_LARGE_REGION_AT || ALWAYS_SEPARATE_TYPES.has(child.regionType.type));

            if (separate) {
                chosen.push(child);
                visit(child, child);
            } else {
                visit(child, ownerRegion);
            }
        }
    };

    for (const root of landmarks.filter(l => !l.parent)) {
        chosen.push(root);
        visit(root, root);
    }

    return chosen;
}

function directChildContaining(node, element) {
    let current = element;
    while (current && current.parentElement !== node) {
        current = current.parentElement;
    }
    return current;
}

/**
 * Group clickable elements that aren't in any landmark by walking down the DOM:
 * descend while one child holds all of them (so an area is as tight as possible),
 * a subtree with few enough elements becomes one area, larger ones are split by
 * child. Elements in tiny groups stay with the parent node, so none are lost.
 */
function partitionLayout(node, elements, out, depth = 0) {
    if (depth >= MAX_PARTITION_DEPTH) {
        out.push({ element: node, regionType: AREA_TYPE });
        return;
    }

    const groups = new Map();
    for (const el of elements) {
        const child = directChildContaining(node, el);
        if (!child) continue;
        if (!groups.has(child)) groups.set(child, []);
        groups.get(child).push(el);
    }

    if (groups.size === 1) {
        const [[child, childElements]] = groups;
        if (child === childElements[0]) {
            out.push({ element: node, regionType: AREA_TYPE });
        } else {
            partitionLayout(child, childElements, out, depth + 1);
        }
        return;
    }

    if (elements.length <= MAX_AREA_ELEMENTS) {
        out.push({ element: node, regionType: AREA_TYPE });
        return;
    }

    let leftover = 0;
    for (const [child, childElements] of groups) {
        if (childElements.length >= MIN_CHILD_ELEMENTS && child !== childElements[0]) {
            partitionLayout(child, childElements, out, depth + 1);
        } else {
            leftover += childElements.length;
        }
    }

    if (leftover > 0) {
        out.push({ element: node, regionType: AREA_TYPE });
    }
}

/* ========= NAMING ========= */

function positionName(bounds) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (bounds.width >= vw * 0.6) {
        if (bounds.bottom <= vh * 0.3) return 'Top';
        if (bounds.top >= vh * 0.7) return 'Bottom';
        return 'Center';
    }

    const centerX = bounds.left + bounds.width / 2;
    if (centerX < vw * 0.33) return 'Left';
    if (centerX > vw * 0.67) return 'Right';
    return 'Center';
}

function elementLabel(el) {
    const clean = nameOf(el);
    return clean.length > SUMMARY_ITEM_MAX_CHARS ? `${clean.slice(0, SUMMARY_ITEM_MAX_CHARS - 1)}…` : clean;
}

/**
 * e.g. "Home, Products, About, Contact…"
 */
function summarizeElements(elements) {
    const labels = [];
    for (const el of elements) {
        const label = elementLabel(el);
        if (label && !labels.includes(label)) labels.push(label);
        if (labels.length > SUMMARY_ITEMS) break;
    }
    const shown = labels.slice(0, SUMMARY_ITEMS).join(', ');
    return labels.length > SUMMARY_ITEMS ? `${shown}…` : shown;
}

/**
 * Landmarks: explicit ARIA label, else their type ("Navigation").
 * Layout areas: their own heading, else their position ("Left Area").
 * Description: the heading (if not used as the name) and what's inside.
 */
function nameRegion(region) {
    const explicitLabel = getPageLabel(region.element, false, GENERIC_LANDMARK_SELECTOR);
    const heading = explicitLabel ? '' : getPageLabel(region.element, true, GENERIC_LANDMARK_SELECTOR);
    const summary = summarizeElements(region.elements);
    const isArea = region.regionType === AREA_TYPE;

    let name;
    let description;
    if (isArea) {
        name = explicitLabel || heading || `${positionName(region.bounds)} Area`;
        description = summary;
    } else if (region.regionType === SIDE_BOX_TYPE) {
        name = explicitLabel || heading || boxTitle(region.element) || SIDE_BOX_TYPE.name;
        description = summary;
    } else {
        name = explicitLabel || region.regionType.name;
        description = heading && heading !== name ? `${heading} · ${summary}` : summary;
    }

    region.name = name;
    region.description = description || 'No labelled elements';
}

/**
 * "Navigation" twice becomes "Navigation (top)" and "Navigation (left)"
 */
function disambiguateNames(regions) {
    const byName = new Map();
    for (const region of regions) {
        if (!byName.has(region.name)) byName.set(region.name, []);
        byName.get(region.name).push(region);
    }

    for (const [name, group] of byName) {
        if (group.length < 2) continue;

        const positions = group.map(r => positionName(r.bounds).toLowerCase());
        const positionsUnique = new Set(positions).size === positions.length;
        group.forEach((region, i) => {
            region.name = positionsUnique ? `${name} (${positions[i]})` : `${name} ${i + 1}`;
        });
    }
}

/* ========= ENTRY POINT ========= */

/**
 * Detect and name the regions of the current page.
 * Returns regions in the same shape as regionManager's Gmail regions, plus
 * excludeElements: nested regions whose elements this region doesn't offer.
 */
export function detectGenericRegions() {
    let interactive = collectInteractiveElements();
    if (interactive.length === 0) return [];

    let landmarks = collectLandmarks(interactive);
    landmarks = landmarks.concat(collectSideBoxes(interactive, landmarks));

    // A modal dialog blocks the rest of the page, so only its parts are offered
    const modal = landmarks.find(l => l.regionType.type === 'dialog' && isModal(l.element));
    if (modal) {
        landmarks = landmarks.filter(l => modal.element.contains(l.element));
        interactive = interactive.filter(el => modal.element.contains(el));
    }

    const found = chooseLandmarkRegions(landmarks);

    const uncovered = interactive.filter(el => !found.some(r => r.element.contains(el)));
    if (uncovered.length > 0) {
        partitionLayout(modal ? modal.element : document.body, uncovered, found);
    }

    // Each region offers only the elements not inside a nested region
    for (const region of found) {
        region.excludeElements = found
            .filter(other => other !== region && other.element !== region.element && region.element.contains(other.element))
            .map(other => other.element);
        region.elements = interactive.filter(el =>
            region.element.contains(el) && !region.excludeElements.some(ex => ex.contains(el))
        );
        region.bounds = region.element.getBoundingClientRect();
    }

    // Offer the regions the user can see (all of a region's elements stay reachable, scrolling to each).
    // Otherwise every navigation box at the bottom of a long article would be its own entry in the list.
    const withElements = found.filter(r => r.elements.length > 0);
    const visible = withElements.filter(r => isInViewport(r.bounds));
    const regions = visible.length > 0 ? visible : withElements;
    regions.forEach(nameRegion);
    disambiguateNames(regions);

    // Dialogs first, then reading order (top to bottom, left to right)
    const bandOf = r => Math.round(Math.max(r.bounds.top, 0) / 40);
    regions.sort((a, b) =>
        (a.regionType.type === 'dialog' ? 0 : 1) - (b.regionType.type === 'dialog' ? 0 : 1) ||
        bandOf(a) - bandOf(b) ||
        a.bounds.left - b.bounds.left
    );

    return regions.map((region, i) => ({
        id: `generic-${region.regionType.type}-${i}`,
        type: region.regionType.type,
        name: region.name,
        description: region.description,
        icon: region.regionType.icon,
        element: region.element,
        priority: i,
        interactiveCount: region.elements.length,
        bounds: region.bounds,
        excludeElements: region.excludeElements
    }));
}
