// pageReader.js - Reads a page the way assistive technology does: which elements can be used,
// what each one is (its role) and what it is called (its accessible name). Uses only web
// standards (HTML elements, ARIA roles and labels), nothing specific to one site.
// Used by Dynamic detection for regions (genericRegions.js) and elements (expandedCandidateExtractor.js).

// ARIA roles of elements a user can operate
const WIDGET_ROLES = [
    'button', 'link', 'checkbox', 'radio', 'switch', 'tab',
    'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'treeitem',
    'textbox', 'searchbox', 'combobox', 'listbox', 'slider', 'spinbutton'
];
const INTERACTIVE_ROLES = new Set(WIDGET_ROLES);

// Roles whose content is what the user typed, so it can't serve as the element's name
const TEXT_ENTRY_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

// Candidates for querySelectorAll; isInteractive() makes the final decision
export const INTERACTIVE_SELECTOR = [
    'a[href]', 'area[href]', 'button', 'input:not([type="hidden"])', 'select', 'textarea', 'summary',
    '[contenteditable]:not([contenteditable="false"])',
    ...WIDGET_ROLES.map(role => `[role~="${role}"]`)
].join(',');

// TabTabGo's own overlays, popups and screens
export const OWN_UI_SELECTOR = '#tabtabgo-region-overlay, #tabtabgo-region-popup, #task-notification, ' +
    '#tabtabgo-sync-overlay, #tabtabgo-task-interstitial, [id^="smarttab-"]';

// Implicit roles of <input> types (anything else is a text field)
const INPUT_ROLES = {
    button: 'button', submit: 'button', reset: 'button', image: 'button',
    checkbox: 'checkbox', radio: 'radio', range: 'slider', number: 'spinbutton', search: 'searchbox'
};

const NAME_MAX_CHARS = 80;
const MIN_SIZE_PX = 6; // smaller than this is not meant to be clicked (e.g. 1px "skip to content" links)

function clean(text) {
    return (text || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX_CHARS);
}

/**
 * The element's role: its explicit ARIA role, else the one its HTML tag implies
 * (e.g. <a href> → link, <input type="checkbox"> → checkbox)
 */
export function roleOf(el) {
    const explicit = (el.getAttribute('role') || '').trim().split(/\s+/)[0];
    if (explicit) return explicit;

    const tag = el.tagName.toLowerCase();
    if (tag === 'a' || tag === 'area') return el.hasAttribute('href') ? 'link' : '';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'input') return INPUT_ROLES[(el.getAttribute('type') || 'text').toLowerCase()] || 'textbox';
    if (tag === 'select') return el.multiple || el.size > 1 ? 'listbox' : 'combobox';
    if (tag === 'textarea' || el.isContentEditable) return 'textbox';
    return '';
}

/**
 * The element's name, in the order browsers use for screen readers (simplified):
 * aria-labelledby, aria-label, <label>, button value, visible text, image alt text,
 * placeholder, title/tooltip. Text fields are never named by what was typed in them.
 */
export function nameOf(el) {
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
        const text = clean(labelledBy.split(/\s+/)
            .map(id => document.getElementById(id)?.innerText || '')
            .join(' '));
        if (text) return text;
    }

    const ariaLabel = clean(el.getAttribute('aria-label'));
    if (ariaLabel) return ariaLabel;

    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();

    if (el.labels && el.labels.length > 0) {
        const text = clean(Array.from(el.labels).map(label => label.innerText).join(' '));
        if (text) return text;
    }

    if (tag === 'input' && ['button', 'submit', 'reset'].includes(type)) {
        const value = clean(el.value);
        if (value) return value;
    }
    if (tag === 'input' && type === 'image') {
        const alt = clean(el.getAttribute('alt'));
        if (alt) return alt;
    }

    if (!TEXT_ENTRY_ROLES.has(roleOf(el)) && tag !== 'select') {
        // innerText: visible text only (textContent would include hidden text and embedded <style>)
        const text = clean(el.innerText);
        if (text) return text;

        // Image-only links and buttons are named by their image
        const image = el.querySelector('img[alt]:not([alt=""]), svg[aria-label], [role="img"][aria-label]');
        if (image) {
            const alt = clean(image.getAttribute('alt') || image.getAttribute('aria-label'));
            if (alt) return alt;
        }
        const svgTitle = clean(el.querySelector('svg title')?.textContent);
        if (svgTitle) return svgTitle;
    }

    return clean(
        el.getAttribute('placeholder') ||
        el.getAttribute('aria-placeholder') ||
        el.getAttribute('title') ||
        el.getAttribute('data-tooltip')
    );
}

/**
 * Rendered somewhere on the page (not necessarily on screen) and not hidden from assistive technology
 */
export function isVisible(el) {
    if (el.closest('[aria-hidden="true"], [inert]')) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

/**
 * Something the user can operate: a widget role and not disabled
 */
export function isInteractive(el) {
    if (!INTERACTIVE_ROLES.has(roleOf(el))) return false;
    return !(el.disabled === true || el.getAttribute('aria-disabled') === 'true');
}

/**
 * All usable, visible, named elements inside root, in page order.
 * An element nested in another one with the same name is dropped (they are one target).
 * @param {Element|Document} root
 * @returns {Array<{element: Element, role: string, name: string}>}
 */
export function findInteractiveElements(root = document) {
    const found = new Map();

    for (const el of root.querySelectorAll(INTERACTIVE_SELECTOR)) {
        if (el.closest(OWN_UI_SELECTOR)) continue;
        if (!isInteractive(el) || !isVisible(el)) continue;

        const rect = el.getBoundingClientRect();
        if (rect.width < MIN_SIZE_PX || rect.height < MIN_SIZE_PX) continue;

        const name = nameOf(el);
        if (!name) continue;

        found.set(el, { element: el, role: roleOf(el), name });
    }

    return Array.from(found.values()).filter(item => {
        for (let node = item.element.parentElement; node; node = node.parentElement) {
            const outer = found.get(node);
            if (outer) return outer.name !== item.name;
        }
        return true;
    });
}
