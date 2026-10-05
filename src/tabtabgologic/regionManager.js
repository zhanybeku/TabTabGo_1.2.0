// regionManager.js - Handles region-based navigation for Gmail

import { detectLayoutRegions, buildVirtualRegionElement, logLayoutDebugTable } from './layoutAnalyzer.js';

/**
 * Define Gmail regions with their selectors and metadata
 */
const GMAIL_REGIONS = [
    {
        id: 'compose-window',
        name: 'Message window',
        description: 'A new compose message window',
        icon: '✍️',
        priority: 1, // Highest priority
        customExtractor: () => {
            // TYPE 1: Floating compose dialog
            // Structure: <div role="dialog"> with <h2.a3E> containing "Compose"/"Reply"/"Forward"

            const dialogs = document.querySelectorAll('[role="dialog"]');
            for (const dialog of dialogs) {
                // Check if it's visible
                const style = window.getComputedStyle(dialog);
                if (style.display === 'none' || style.visibility === 'hidden') continue;

                // Check for compose header
                const header = dialog.querySelector('h2.a3E');
                if (header) {
                    const text = header.textContent || '';
                    if (text.includes('Compose') || text.includes('New Message') ||
                        text.includes('Reply') || text.includes('Forward')) {
                        console.log('✍️ Found floating compose dialog:', text.trim());
                        return dialog;
                    }
                }
            }

            // TYPE 2: Inline compose (Reply/Forward within email thread)
            // Structure: <div class="aoI" role="region" data-compose-id="...">
            const inlineComposes = document.querySelectorAll('.aoI[role="region"][data-compose-id]');
            for (const compose of inlineComposes) {
                const style = window.getComputedStyle(compose);
                if (style.display === 'none' || style.visibility === 'hidden') continue;

                const ariaLabel = compose.getAttribute('aria-label') || '';
                console.log('✍️ Found inline compose:', ariaLabel);
                return compose;
            }

            return null;
        }
    },
    {
        id: 'mail-navigation',
        name: 'Mail Navigation',
        description: 'Compose, Inbox, Starred, Sent, Drafts',
        selector: '[role="navigation"]',
        icon: '📧',
        priority: 2,
        geometryRole: 'nav'
    },
    {
        id: 'main',
        name: 'Email List',
        description: 'Your emails',
        icon: '📬',
        priority: 3,
        geometryRole: 'main',
        customExtractor: () => {
            // <div role="main">
            //   ...
            //   <div class="Cp">   <-- message list / primary content
            //   </div>
            // </div>

            // Find all main regions (Gmail can render multiple during transitions)
            const mains = document.querySelectorAll('[role="main"]');

            for (const main of mains) {
                const style = window.getComputedStyle(main);
                if (style.display === 'none' || style.visibility === 'hidden') continue;

                // Find Cp container inside main
                const cp = main.querySelector('.Cp');
                if (!cp) return main; //this should be safe. If not Cp found, then return just the first main (the greatest parent). The second one is responsible for message content

                // Ensure Cp itself is visible and usable
                const cpStyle = window.getComputedStyle(cp);
                if (cpStyle.display === 'none' || cpStyle.visibility === 'hidden') continue;

                const rect = cp.getBoundingClientRect();
                if (rect.width < 20 || rect.height < 20) continue;

                console.log('📬 Found main mail content (.Cp inside role=main)');
                return cp;
            }
            return null; //if no mains were found, then it is empty
        }
    },
    {
        id: 'top-navigation',
        name: 'Top Navigation',
        description: 'Refresh, select, back and forth',
        icon: '🧭',
        priority: 4,
        geometryRole: 'toolbar',
        customExtractor: () => {
            // Normal case: div.aeH toolbar
            const aeH = document.querySelector('div.aeH');
            const main = document.querySelector('[role="main"]');
            const categoryTabs = main ? main.querySelector('table.aKk') : null;
            if (aeH) {
                const style = window.getComputedStyle(aeH);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                    // Check if both children are visible
                    const children = Array.from(aeH.children);
                    const allHidden = children.length > 0 && children.every(child => {
                        const childStyle = window.getComputedStyle(child);
                        return childStyle.display === 'none';
                    });

                    if (!allHidden) {
                        console.log('🧭 Using standard aeH toolbar');

                        // Check if category tabs exist (aKk)
                        if (categoryTabs) {
                            // Create combined region: aeH + category tabs
                            const wrapper = buildVirtualRegionElement([aeH, categoryTabs]);
                            wrapper._toolbarElement = aeH;
                            wrapper._categoryTabsElement = categoryTabs;

                            console.log('🧭 Using combined region: aeH + aKk');
                            return wrapper;
                        }
                        // No category tabs, just return aeH
                        return aeH;
                    }
                    console.log('🧭 aeH children all hidden, using adaptive mode');
                }
            }

            // Adaptive case: Combine nH.aqK, biW, and category tabs
            // Find nH.aqK inside role="main"
            const toolbar = main ? main.querySelector('.nH.aqK') : null;
            const biW = document.querySelector('.biW');

            if (!toolbar && !biW && !categoryTabs) {
                console.log('🧭 No top-navigation elements found');
                return null;
            }

            // Collect all elements that exist
            const elements = [toolbar, biW, categoryTabs].filter(el => el !== null);

            // Create a virtual combined region
            if (elements.length > 0) {
                // Create a wrapper that encompasses all elements
                const wrapper = buildVirtualRegionElement(elements);

                // Store references for candidate extraction
                wrapper._toolbarElement = toolbar;
                wrapper._biWElement = biW;
                wrapper._categoryTabsElement = categoryTabs;

                const parts = [];
                if (toolbar) parts.push('nH.aqK');
                if (biW) parts.push('biW');
                if (categoryTabs) parts.push('aKk');
                console.log(`🧭 Using combined region: ${parts.join(' + ')}`);
                return wrapper;
            }
        }
    },
    {
        id: 'header',
        name: 'Header',
        description: 'Search, settings, and account',
        selector: '[role="banner"]',
        icon: '🔍',
        priority: 5,
        geometryRole: 'header'
    },
    // {
    //     id: 'left-panel',
    //     name: 'Left Panel',
    //     description: 'Mail, Chat, Meet',
    //     selector: '[role="navigation"]',
    //     icon: '📑',
    //     priority: 6
    // },
    {
        id: 'right-panel',
        name: 'Right Panel',
        description: 'Calendar, Keep, Tasks, Contacts',
        selector: '[role="complementary"][aria-label*="Side panel"], [role="complementary"]',
        icon: '📅',
        priority: 7,
        geometryRole: 'rightPanel'
    }
];

const GEOMETRY_CONFIDENCE_THRESHOLD = 0.6;

/**
 * Resolve a region's element: try the legacy selector/custom extractor first
 * (unchanged behavior), and only fall back to geometry-based detection when
 * the legacy path finds nothing (or something invisible). Geometry never
 * overrides a working legacy result -- this feeds a live user study, so
 * graceful degradation matters more than always using the "purer" method.
 */
function resolveRegionElement(regionDef, layoutRegions, legacyResultsById) {
    let legacyElement = null;

    if (regionDef.customExtractor) {
        legacyElement = regionDef.customExtractor();
    } else if (regionDef.selector) {
        legacyElement = document.querySelector(regionDef.selector);
    }

    legacyResultsById[regionDef.id] = { element: legacyElement };

    if (legacyElement && isRegionVisible(legacyElement, regionDef.id)) {
        return legacyElement;
    }

    const geometryRole = regionDef.geometryRole;
    if (!geometryRole) {
        return legacyElement; // no geometry fallback defined for this region (e.g. compose-window)
    }

    const geoCandidate = layoutRegions[geometryRole];
    if (geoCandidate && geoCandidate.confidence >= GEOMETRY_CONFIDENCE_THRESHOLD) {
        console.log(`🧭 Using geometry fallback for "${regionDef.id}" (confidence ${geoCandidate.confidence.toFixed(2)})`);
        return geoCandidate.element;
    }

    return legacyElement;
}

/* ========= PAGE-DERIVED REGION NAMES ========= */

const LANDMARK_SELECTOR = '[role="banner"],[role="navigation"],[role="main"],[role="complementary"],' +
    '[role="dialog"],[role="region"],[role="search"],[role="form"],[role="toolbar"],[role="tabpanel"]';

// Used when an area has a role but no label of its own
const ROLE_NAMES = {
    banner: 'Header',
    navigation: 'Navigation',
    main: 'Main Content',
    complementary: 'Side Panel',
    dialog: 'Dialog',
    region: 'Section',
    search: 'Search',
    form: 'Form',
    toolbar: 'Toolbar'
};

const PAGE_LABEL_MAX_CHARS = 60;

function cleanLabel(text) {
    return (text || '').replace(/\s+/g, ' ').trim().slice(0, PAGE_LABEL_MAX_CHARS);
}

/**
 * The page's own label for an area: aria-label, aria-labelledby, or (if
 * includeHeadings) its first heading. Gmail mostly leaves aria-label empty but
 * renders headings ("Conversations", the email subject). Headings that belong to
 * a nested area are skipped, e.g. the search box's "Search" heading inside the header.
 */
function getPageLabel(element, includeHeadings = true) {
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
        const owner = heading.closest(LANDMARK_SELECTOR);
        if (owner && owner !== element && element.contains(owner)) continue;

        const text = cleanLabel(heading.textContent);
        if (text) return text;
    }

    return '';
}

/**
 * Name the main area by what it currently shows, using the page structure
 * (not the URL): an open conversation renders its messages as a list of
 * listitems with headings, the email list renders a tab panel / message rows.
 */
function describeMainView(element) {
    const main = element.closest?.('[role="main"]') || element;

    const threadList = Array.from(main.querySelectorAll('[role="list"]')).find(list =>
        isElementVisible(list) && list.querySelector('[role="listitem"] h2, [role="listitem"] h3')
    );
    if (threadList) {
        return {
            name: 'Open Email',
            description: getPageLabel(main) || 'The open conversation',
            icon: '📖'
        };
    }

    const tabPanel = Array.from(main.querySelectorAll('[role="tabpanel"]')).find(isElementVisible);
    if (tabPanel || main.querySelector('tr.zA')) {
        const tabLabel = tabPanel ? getPageLabel(tabPanel) : '';
        return {
            name: 'Email List',
            description: tabLabel ? `${tabLabel} tab` : (getPageLabel(main) || 'Your emails'),
            icon: '📬'
        };
    }

    // Some other view (settings, contacts, ...): use whatever the page calls it
    return {
        name: getPageLabel(main) || 'Main Content',
        description: 'Main content area',
        icon: '📄'
    };
}

/**
 * Name and description for a detected region, taken from the page where possible.
 * Order: the area's explicit ARIA label (names the whole area), the region's fixed
 * name, its first heading, its role. Headings come after the fixed name because a
 * first heading can belong to just one section (e.g. "Labels" in Gmail's sidebar).
 * The region id (used for candidate extraction) never changes.
 */
function describeRegionFromPage(regionDef, element) {
    if (regionDef.id === 'main') {
        return describeMainView(element);
    }

    // Virtual combined regions (e.g. top-navigation) aren't real page areas, so they have no label
    const isVirtual = element.dataset && element.dataset.combinedRegion === 'true';
    const explicitLabel = isVirtual ? '' : getPageLabel(element, false);
    const headingLabel = isVirtual ? '' : getPageLabel(element);
    const roleName = isVirtual ? '' : ROLE_NAMES[element.getAttribute('role')];

    return {
        name: explicitLabel || regionDef.name || headingLabel || roleName || 'Section',
        description: regionDef.description,
        icon: regionDef.icon
    };
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Extract available regions from the current page
 */
export function extractRegions() {
    const regions = [];
    const layoutRegions = detectLayoutRegions();
    const legacyResultsById = {};

    for (const regionDef of GMAIL_REGIONS) {
        const element = resolveRegionElement(regionDef, layoutRegions, legacyResultsById);

        if (element && isRegionVisible(element, regionDef.id)) {
            const interactiveCount = countInteractiveElements(element);
            const pageInfo = describeRegionFromPage(regionDef, element);

            regions.push({
                id: regionDef.id,
                name: pageInfo.name,
                description: pageInfo.description,
                icon: pageInfo.icon,
                element: element,
                priority: regionDef.priority,
                interactiveCount: interactiveCount,
                bounds: element.getBoundingClientRect()
            });
        }
    }

    regions.sort((a, b) => a.priority - b.priority);

    const topNavRegion = regions.find(r => r.id === 'top-navigation');
    if (!topNavRegion) {
        regions.push({
            id: 'top-navigation',
            name: 'Top Navigation',
            description: 'Toolbar and search refinement',
            icon: '🧭',
            element: document.querySelector('[role="main"]') || document.body,
            priority: 3,
            interactiveCount: 0,
            bounds: (document.querySelector('[role="main"]') || document.body).getBoundingClientRect()
        });
        regions.sort((a, b) => a.priority - b.priority);
        console.log('🧭 top-navigation: aeH missing, added placeholder for extractor');
    }

    // Re-key geometry results by region id (they're stored by geometryRole,
    // e.g. 'nav'/'toolbar') so the debug table can compare them side-by-side
    // with the legacy results, which are already keyed by region id.
    const layoutRegionsById = {};
    for (const regionDef of GMAIL_REGIONS) {
        if (regionDef.geometryRole) {
            layoutRegionsById[regionDef.id] = layoutRegions[regionDef.geometryRole] || null;
        }
    }
    logLayoutDebugTable(layoutRegionsById, legacyResultsById);

    console.log(`🗺️ Found ${regions.length} regions:`, regions.map(r => `${r.icon} ${r.name} (${r.interactiveCount})`));
    return regions;
}

function isRegionVisible(element, regionId) {
    // SPECIAL CASE: Virtual combined regions
    // These are wrapper elements we create that aren't in the DOM
    if (element.dataset && element.dataset.combinedRegion === 'true') {
        console.log('🧭 Virtual combined region - skipping visibility check');
        return true;
    }

    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    const checks = {
        hasSize: rect.width > 0 && rect.height > 0,
        width: rect.width,
        height: rect.height,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        displayOk: style.display !== 'none',
        visibilityOk: style.visibility !== 'hidden',
        opacityOk: style.opacity !== '0'
    };

    // Debug log for compose window
    if (element.querySelector && element.querySelector('h2.a3E')) {
        console.log('🔍 Compose window visibility check:', checks);
    }

    // Must have size
    if (!checks.hasSize) {
        return false;
    }

    // Display must not be none
    if (!checks.displayOk) {
        return false;
    }

    // Opacity must not be 0
    if (!checks.opacityOk) {
        return false;
    }

    // SPECIAL CASE: Compose window
    // Gmail's compose window uses visibility: hidden on the outer container
    // but the inner dialog is visible. We check if it has visible children.
    if (regionId === 'compose-window') {
        // If it has size, display is not none, and opacity is not 0,
        // then it's visible enough for us (even if visibility: hidden)
        console.log('✅ Compose window is visible (special handling)');
        return true;
    }

    // For other regions, also check visibility
    return checks.visibilityOk;
}

function countInteractiveElements(regionElement) {
    const selector = 'button,a[href],input,select,textarea,[role="button"],[role="link"],[role="menuitem"],[role="tab"],[onclick]';
    const elements = regionElement.querySelectorAll(selector);
    let count = 0;
    for (const el of elements) {
        if (isElementVisible(el)) count++;
    }
    return count;
}

function isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
}

export function extractCandidatesInRegion(region, extractCandidatesFn) {
    if (!region || !region.element) return [];
    const regionCandidates = extractCandidatesFn(region);
    console.log(`🎯 Found ${regionCandidates.length} candidates in "${region.name}" region`);
    return regionCandidates;
}

export function createRegionOverlay(regions, selectedIndex) {
    removeRegionOverlay();
    if (regions.length === 0) return null;

    const overlay = document.createElement('div');
    overlay.id = 'tabtabgo-region-overlay';
    overlay.style.cssText = `
        position: fixed;top: 0;left: 0;width: 100%;height: 100%;z-index: 999998;pointer-events: none;
    `;

    regions.forEach((region, index) => {
        const isSelected = index === selectedIndex;
        const bounds = region.bounds;

        const highlight = document.createElement('div');
        highlight.className = 'region-highlight';
        highlight.style.cssText = `
            position: absolute;left: ${bounds.left}px;top: ${bounds.top}px;width: ${bounds.width}px;height: ${bounds.height}px;
            border: ${isSelected ? '4px' : '2px'} solid ${isSelected ? '#10b981' : 'transparent'};
            background: ${isSelected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(147, 197, 253, 0.0)'};
            border-radius: 8px;pointer-events: none;transition: all 0.2s ease;
            box-shadow: ${isSelected ? '0 0 20px rgba(16, 185, 129, 0.4)' : '0 0 10px rgba(147, 197, 253, 0.2)'};
        `;

        overlay.appendChild(highlight);
    });

    document.body.appendChild(overlay);
    return overlay;
}

export function removeRegionOverlay() {
    const existing = document.getElementById('tabtabgo-region-overlay');
    if (existing) existing.remove();
}

export function createRegionSelectionPopup(regions, selectedIndex, mouseX, mouseY) {
    removeRegionSelectionPopup();
    if (regions.length === 0) return null;

    const popup = document.createElement('div');
    popup.id = 'tabtabgo-region-popup';
    popup.style.cssText = `
        position: fixed;left: ${mouseX}px;top: ${mouseY}px;background: white;border: 2px solid #10b981;
        border-radius: 12px;padding: 12px;box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;min-width: 280px;max-width: 400px;
    `;

    const header = document.createElement('div');
    header.style.cssText = `font-size: 13px;font-weight: 600;color: #10b981;margin-bottom: 8px;padding-bottom: 8px;border-bottom: 1px solid #e5e7eb;`;
    header.textContent = '🔎 Select Region';
    popup.appendChild(header);

    const list = document.createElement('div');
    list.style.cssText = `display: flex;flex-direction: column;gap: 4px;`;

    regions.forEach((region, index) => {
        const isSelected = index === selectedIndex;
        const item = document.createElement('div');
        item.style.cssText = `
            padding: 10px 12px;background: ${isSelected ? '#10b981' : '#f9fafb'};color: ${isSelected ? 'white' : '#374151'};
            border-radius: 8px;cursor: pointer;transition: all 0.2s ease;border: 2px solid ${isSelected ? '#10b981' : 'transparent'};
        `;

        item.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 18px;">${escapeHtml(region.icon)}</span>
                    <div>
                        <div style="font-weight: 600; font-size: 14px; margin-bottom: 2px;">${escapeHtml(region.name)}</div>
                        <div style="font-size: 11px; opacity: 0.8;">${escapeHtml(region.description)}</div>
                    </div>
                </div>
                <div style="font-size: 12px; font-weight: 600; opacity: 0.8;">${region.interactiveCount}</div>
            </div>
        `;

        if (!isSelected) {
            item.addEventListener('mouseenter', () => { item.style.background = '#e5e7eb'; });
            item.addEventListener('mouseleave', () => { item.style.background = '#f9fafb'; });
        }

        list.appendChild(item);
    });

    popup.appendChild(list);

    const instructions = document.createElement('div');
    instructions.style.cssText = `margin-top: 12px;padding-top: 12px;border-top: 1px solid #e5e7eb;font-size: 11px;color: #6b7280;line-height: 1.5;`;
    instructions.innerHTML = `
        <div style="margin-bottom: 4px;"><kbd style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace;">Tab</kbd> or <kbd style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace;">D</kbd> Next region</div>
        <div style="margin-bottom: 4px;"><kbd style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace;">Shift+Tab</kbd> or <kbd style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace;">S</kbd> Previous region</div>
        <div><kbd style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace;">Enter</kbd> or <kbd style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-family: monospace;">W</kbd> Select region</div>
    `;
    popup.appendChild(instructions);

    document.body.appendChild(popup);

    const rect = popup.getBoundingClientRect();
    if (rect.right > window.innerWidth) popup.style.left = `${window.innerWidth - rect.width - 20}px`;
    if (rect.bottom > window.innerHeight) popup.style.top = `${window.innerHeight - rect.height - 20}px`;

    return popup;
}

export function removeRegionSelectionPopup() {
    const existing = document.getElementById('tabtabgo-region-popup');
    if (existing) existing.remove();
}