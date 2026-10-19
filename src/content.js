// content.js
import {navState, updateFocusHistory} from './tabtabgologic/tabtabgoCore.js';
import {extractCandidates, extractOnScreenCandidates} from './tabtabgologic/expandedCandidateExtractor.js';
import {isVisible, roleOf} from './tabtabgologic/pageReader.js';
import {logUserSelection} from "./inMemoryLogger.js";
import {
    createRegionOverlay,
    createRegionSelectionPopup,
    extractCandidatesInRegion,
    extractRegions,
    removeRegionOverlay,
    removeRegionSelectionPopup,
    useGmailRegions
} from './tabtabgologic/regionManager.js';
import {performRobustClick} from "./tabtabgologic/clickHelper.js";
import './syncScreen.js'; // Import sync screen module
import './taskInterstitial.js';
import {taskInterstitial} from "./taskInterstitial.js"; // Import task interstitial module

(function () {
    'use strict';

    // Navigation state
    let navigationMode = 'none'; // 'none' | 'region' | 'element'
    let detectedRegions = [];
    let currentRegionIndex = -1;
    let detectedButtons = [];
    let currentIndex = -1;

    // UI elements
    let popupElement = null;
    let regionOverlay = null;
    let regionPopup = null;
    let currentLassoTarget = null; // Track the element the lasso is following
    let currentChordTarget = null; // Track the element the chord is pointing to

    // Timers and flags
    let detectionTimeout = null;
    let isDetecting = false;
    let autoCloseTimeout = null;
    let isKeyboardClick = false;

    // Visual settings
    let selectedColor = '#10b981';
    let currentChordElement = null;
    let currentLassoElement = null;

    // Session state
    let currentSessionMode = null;
    let detectionMethod = 'gmail-rules'; // popup setting: 'gmail-rules' | 'dynamic'
    let lastCursorPosition = { x: 0, y: 0 };
    let totalCursorDistance = 0;
    let lastInteractionTime = Date.now();
    let currentMouseX = 0;
    let currentMouseY = 0;

    let tabPressCount = 0;
    let enterPressCount = 0;
    let tabPressCountSinceLastClick = 0;
    let enterPressCountSinceLastClick = 0;

    // Constants
    const DETECTION_DEBOUNCE_MS = 500;
    const AUTO_CLOSE_MS = null;
    const LASSO_BORDER_WIDTH = 4;
    const LASSO_GLOW_WIDTH = 6;
    const MAX_TOP_BUTTONS = 35;
    const DETECTION_VALID_MS = 1500;
    const JEV_MODE = 'tabtabgo-jev';
    const JEV_HISTORY_MODE = 'tabtabgo-jev-history'; // same as JEV_MODE + this session's past interactions
    const JEV_MAX_OPTIONS = 40;
    const JEV_LABEL_MAX_CHARS = 80;
    const JEV_HISTORY_MAX = 20;
    const CLICK_NEAR_MAX_DEPTH = 3; // how far up from a click that missed every candidate to look for one
    const RECORD_MODE = 'record'; // free recording: mouse only, no task targets (data for the click-prediction tables)

    // Jev results, logged with the next element selection
    let lastJevRegionPrediction = null;  // ranking of the region list
    let lastJevRegionLog = null;         // ranking + which region the user picked
    let lastJevElementPrediction = null; // ranking of elements inside the region
    let jevPending = false;              // navigation keys are held while Jev is ranking
    let selectedRegionName = null;       // region the current element navigation is in (logged with clicks)

    let lastDetection = {
        timestamp: 0,
        candidates: []
    };

    /* ========= REGION NAVIGATION ========= */

    /**
     * Start region selection mode
     */
    async function startRegionNavigation() {
        console.log('🗺️ Starting region navigation...');

        // Extract available regions
        detectedRegions = extractRegions(detectionMethod);

        if (detectedRegions.length === 0) {
            console.warn('⚠️ No regions found on page');
            return false;
        }

        console.log(isJevMode()
            ? `🔮 Jev: on (${currentSessionMode})`
            : `🔮 Jev: off (session mode: ${currentSessionMode || 'no active session'})`);

        // In Jev mode, reorder so the most likely region comes first
        if (isJevMode()) {
            jevPending = true;
            try {
                const { state, historyCount } = await buildJevRequestState(
                    'Which region of the page will the user choose next?'
                );
                const result = await jevRank(state, detectedRegions, describeRegion);
                detectedRegions = result.items;
                lastJevRegionPrediction = { ...result.prediction, historyCount };
            } finally {
                jevPending = false;
            }
        }

        // Set mode and index
        navigationMode = 'region';
        currentRegionIndex = 0;

        // Show region selection UI
        showRegionSelection();

        return true;
    }

    /**
     * Show region selection UI
     */
    function showRegionSelection() {
        scrollRegionIntoView(detectedRegions[currentRegionIndex]);
        drawRegionOverlay();

        // Show popup near cursor
        removeRegionSelectionPopup();
        regionPopup = createRegionSelectionPopup(
            detectedRegions,
            currentRegionIndex,
            currentMouseX || window.innerWidth / 2,
            currentMouseY || 100
        );
    }

    /**
     * Draw the region boxes where the regions are now (the page may have scrolled since detection)
     */
    function drawRegionOverlay() {
        detectedRegions.forEach(updateRegionBounds);
        removeRegionOverlay();
        regionOverlay = createRegionOverlay(detectedRegions, currentRegionIndex);
    }

    function updateRegionBounds(region) {
        // Combined Gmail regions are detached wrappers (not in the page), so they keep their detected bounds
        if (!region.element || !region.element.isConnected) return;
        region.bounds = region.element.getBoundingClientRect();
    }

    /**
     * Scroll so a region that is completely off screen becomes visible (e.g. a page footer)
     */
    function scrollRegionIntoView(region) {
        if (!region || !region.element || !region.element.isConnected) return;
        const rect = region.element.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) {
            region.element.scrollIntoView({ block: 'nearest' });
        }
    }

    let regionRedrawPending = false;
    function onScrollDuringRegionSelection() {
        if (navigationMode !== 'region' || regionRedrawPending) return;
        regionRedrawPending = true;
        requestAnimationFrame(() => {
            regionRedrawPending = false;
            if (navigationMode === 'region') drawRegionOverlay();
        });
    }

    /**
     * Navigate to next region
     */
    function focusNextRegion() {
        if (detectedRegions.length === 0) return;

        currentRegionIndex = (currentRegionIndex + 1) % detectedRegions.length;
        showRegionSelection();

        console.log(`➡️ Region: ${detectedRegions[currentRegionIndex].name}`);
    }

    /**
     * Navigate to previous region
     */
    function focusPreviousRegion() {
        if (detectedRegions.length === 0) return;

        currentRegionIndex = currentRegionIndex - 1;
        if (currentRegionIndex < 0) {
            currentRegionIndex = detectedRegions.length - 1;
        }
        showRegionSelection();

        console.log(`⬅️ Region: ${detectedRegions[currentRegionIndex].name}`);
    }

    /**
     * Select current region and switch to element navigation
     */
    async function selectCurrentRegion() {
        if (currentRegionIndex < 0 || currentRegionIndex >= detectedRegions.length) {
            return;
        }

        const selectedRegion = detectedRegions[currentRegionIndex];
        console.log(`✅ Selected region: ${selectedRegion.name}`);
        selectedRegionName = selectedRegion.name;

        if (isJevMode()) {
            lastJevRegionLog = {
                ...(lastJevRegionPrediction || { applied: false, error: 'no prediction' }),
                selectedRegion: selectedRegion.name,
                selectedRank: currentRegionIndex,
                selectedDomIndex: selectedRegion.domIndex ?? currentRegionIndex,
                selectedProbability: selectedRegion.jevProbability ?? null
            };
        }

        // Remove region UI
        removeRegionOverlay();
        removeRegionSelectionPopup();

        // Switch to element navigation within this region
        await startElementNavigation(selectedRegion);
    }

    /**
     * Start element navigation within a region
     */
    async function startElementNavigation(region) {
        console.log(`🎯 Starting element navigation in: ${region.name}`);

        navigationMode = 'element';

        // Run detection scoped to this region
        detectedButtons = await runRegionScopedDetection(region);

        if (detectedButtons.length === 0) {
            console.warn(`⚠️ No interactive elements found in ${region.name}`);
            // Fall back to region selection
            navigationMode = 'region';
            showRegionSelection();
            return;
        }

        // In Jev mode, reorder so the most likely element comes first
        lastJevElementPrediction = null;
        if (isJevMode()) {
            jevPending = true;
            try {
                const { state, historyCount } = await buildJevRequestState(
                    `The user just chose the "${region.name}" region. Which element in it will the user select next?`
                );
                const result = await jevRank(state, detectedButtons, describeCandidate);
                detectedButtons = result.items;
                lastJevElementPrediction = { ...result.prediction, historyCount };

                // Keep mouse-click matching (findClickedCandidate) aligned with the new order
                lastDetection = {
                    timestamp: Date.now(),
                    candidates: detectedButtons.map(b => ({ element: b.element, candidate: b }))
                };
            } finally {
                jevPending = false;
            }
        }

        // Start at first element
        currentIndex = -1;
        await focusNextButton();
    }

    /* ========= JEV PREDICTION ========= */

    function isJevMode() {
        return currentSessionMode === JEV_MODE || currentSessionMode === JEV_HISTORY_MODE;
    }

    /**
     * Modes where the user clicks with the mouse and TabTabGo navigation is off
     */
    function isMouseMode() {
        return currentSessionMode === 'trackpad' || currentSessionMode === RECORD_MODE;
    }

    /**
     * State sent to Jev. Both Jev modes send the same description; the history mode
     * adds this session's past interactions, so history is the only difference between them.
     * @returns {Promise<{state: string|Object, historyCount: number|null}>}
     */
    async function buildJevRequestState(question) {
        const situation = buildJevState(question);
        if (currentSessionMode !== JEV_HISTORY_MODE) {
            return { state: situation, historyCount: null };
        }

        const history = await loadSessionHistory();
        return {
            state: {
                situation: situation,
                previous_interactions: history
            },
            historyCount: history.length
        };
    }

    /**
     * Last JEV_HISTORY_MAX interactions of the current session, oldest first.
     * Read from session storage, so it survives page reloads. Task targets and
     * correctness fields are deliberately left out (they would give away the answers).
     */
    async function loadSessionHistory() {
        try {
            const { currentSession, currentTask } = await chrome.storage.local.get(['currentSession', 'currentTask']);

            const toEntry = (click, during) => ({
                element: (click.elementText || '').replace(/\s+/g, ' ').trim().slice(0, JEV_LABEL_MAX_CHARS),
                region: click.region || 'unknown',
                input: click.TabTabGoClick ? 'keyboard' : 'mouse',
                during: during
            });

            // Completed tasks keep their clicks in clickSequence ('absent' placeholders have no elementText)
            const earlier = (currentSession?.tasks || []).flatMap(task =>
                (task.clickSequence || [])
                    .filter(click => click.elementText)
                    .map(click => toEntry(click, 'an earlier task'))
            );
            const current = (currentTask?.interactions || [])
                .filter(click => click.elementText)
                .map(click => toEntry(click, 'the current task'));

            return [...earlier, ...current].slice(-JEV_HISTORY_MAX);
        } catch (error) {
            console.warn('⚠️ Could not read session history for Jev:', error);
            return [];
        }
    }

    /**
     * Name of the detected region containing an element (for mouse clicks)
     */
    function regionNameFor(element) {
        const region = detectedRegions.find(r => r.element && r.element.contains(element));
        return region ? region.name : null;
    }

    /**
     * Describe the current page for Jev, ending with the question being asked.
     * Deliberately excludes document.title, which contains the signed-in account's email address.
     */
    function buildJevState(question) {
        const recent = navState.focusHistory
            .map(h => h.features.text.slice(0, JEV_LABEL_MAX_CHARS))
            .filter(Boolean);

        return [
            ...describePageForJev(),
            'The user is navigating by keyboard.',
            recent.length > 0
                ? `Previously selected elements, oldest first: ${recent.map(t => `"${t}"`).join(', ')}.`
                : 'No previous selections yet.',
            question
        ].filter(Boolean).join(' ');
    }

    function describePageForJev() {
        if (window.location.hostname !== 'mail.google.com') {
            const pageHeading = (document.querySelector('h1')?.textContent || '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, JEV_LABEL_MAX_CHARS);
            return [
                `Website: ${window.location.hostname}.`,
                pageHeading ? `Page heading: "${pageHeading}".` : ''
            ];
        }

        const hash = window.location.hash || '#inbox';
        const [folder, openItem] = hash.split('/');
        const composeOpen = window.location.search.includes('compose=') || hash.includes('compose=');

        return [
            `Gmail web app. Folder: ${folder.replace('#', '')}.`,
            openItem ? 'An email conversation is open.' : 'The email list is shown.',
            composeOpen ? 'A compose window is open.' : ''
        ];
    }

    /* ========= CLICK CONTEXT (logged with every click) ========= */

    let pageState = null;     // page the user is on now
    let prevPageState = null; // last page that was different from pageState

    /**
     * Simplified page state, e.g. {site: 'gmail', folder: 'inbox', emailOpen: true, composeOpen: false}.
     * Search queries and message ids are left out on purpose.
     */
    function getPageState() {
        if (window.location.hostname !== 'mail.google.com') {
            // Generic: which page, and whether a dialog covers it. The query string and hash are
            // left out (they can hold searches and ids); the analysis can group similar paths.
            return {
                site: window.location.hostname,
                path: window.location.pathname,
                dialogOpen: isDialogOpen()
            };
        }

        const hash = window.location.hash || '#inbox';
        const parts = hash.slice(1).split('?')[0].split('/');
        const base = parts[0] || 'inbox';
        // These keep a name in the next segment (#label/Work, #settings/general), so the email id comes one later
        const named = ['label', 'category', 'settings'].includes(base);
        const nested = named || ['search', 'advanced-search'].includes(base);

        return {
            site: 'gmail',
            folder: named && parts[1] ? `${base}/${parts[1]}` : base,
            emailOpen: parts.length > (nested ? 2 : 1),
            composeOpen: window.location.search.includes('compose=') || hash.includes('compose='),
            // Pop-ups like the Unsubscribe confirmation (Gmail also marks the compose window as a dialog)
            dialogOpen: isDialogOpen()
        };
    }

    /**
     * A visible pop-up window: the page marks it with role="dialog"/"alertdialog" or a <dialog> element
     */
    function isDialogOpen() {
        return Array.from(document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]'))
            .some(isVisible);
    }

    /**
     * Whether two labels name the same thing: compared on letters and digits only, one starts
     * with the other ("Inbox351" ~ "Inbox 351 unread", but "Older" !~ "Show more messages")
     */
    function labelsResemble(a, b) {
        const simplify = text => (text || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        const x = simplify(a);
        const y = simplify(b);
        return x.length > 0 && y.length > 0 && (x.startsWith(y) || y.startsWith(x));
    }

    /**
     * Update pageState, moving the old one to prevPageState if the page changed
     */
    function refreshPageState() {
        const now = getPageState();
        if (JSON.stringify(now) !== JSON.stringify(pageState)) {
            prevPageState = pageState;
            pageState = now;
        }
    }

    /**
     * Clickable elements on the page, for click logging and mouse-click matching.
     * Follows the Detection setting: Gmail rules use the original extractor, Dynamic the page reader.
     */
    function extractPageCandidates() {
        return useGmailRegions(detectionMethod) ? extractCandidates() : extractOnScreenCandidates();
    }

    /**
     * What the user saw when they clicked: page state, previous page state,
     * the clickable labels on offer, and which of them was clicked.
     * @param {Array} candidates - Detected candidates ({element, features})
     * @param {Element} clickedElement - The element actually under the cursor (event.target)
     * @param {string|null} clickedText - Text of the clicked element, if known; a "near" match must resemble it
     */
    function buildClickContext(candidates, clickedElement, clickedText = null) {
        refreshPageState();

        const real = candidates.filter(c => c.element);

        // Innermost candidate containing the clicked element (an email row contains its star button)
        let clickedIndex = -1;
        let clickMatch = null;
        real.forEach((c, i) => {
            if (c.element.contains(clickedElement) &&
                (clickedIndex < 0 || real[clickedIndex].element.contains(c.element))) {
                clickedIndex = i;
                clickMatch = 'on';
            }
        });

        // Clicked beside a candidate rather than on it (e.g. the padding of a menu item): use the
        // nearest ancestor that contains candidates, but only if it contains exactly one
        let el = clickedElement;
        for (let depth = 0; clickedIndex < 0 && el && depth <= CLICK_NEAR_MAX_DEPTH; depth++, el = el.parentElement) {
            const inside = real.flatMap((c, i) => el.contains(c.element) ? [i] : []);
            // A guess is only kept if its label resembles what was clicked (a click on a disabled
            // "Older" button must not be logged as the "Show more messages" button next to it)
            if (inside.length === 1 &&
                (clickedText === null || labelsResemble(clickedText, candidateLabel(real[inside[0]])))) {
                clickedIndex = inside[0];
                clickMatch = 'near';
            }
            if (inside.length > 0) break;
        }

        const labels = real.map(candidateLabel);
        return {
            pageState: pageState,
            prevPageState: prevPageState,
            candidates: labels,
            clickedCandidateIndex: clickedIndex,
            clickedLabel: clickedIndex >= 0 ? labels[clickedIndex] : null,
            clickedRole: clickedIndex >= 0 ? roleOf(real[clickedIndex].element) : null, // e.g. 'button', 'textbox'
            clickMatch: clickMatch // 'on' the candidate, 'near' it, or null (no candidate)
        };
    }

    /**
     * Short label for one region, e.g. "Email List: Messages in the current folder"
     */
    function describeRegion(region) {
        return region.description ? `${region.name}: ${region.description}` : region.name;
    }

    /**
     * Visible label of a candidate, e.g. "Send" or "Project update — Hi all..."
     * Dynamic detection provides the accessible name (features.name); the Gmail rules don't.
     */
    function candidateLabel(button) {
        const f = button.features || {};
        return (f.name || f.ariaLabel || f.tooltip || f.text || f.title || f.tagName || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, JEV_LABEL_MAX_CHARS);
    }

    /**
     * Short label for one candidate, e.g. "main:email-row: Project update — Hi all..."
     */
    function describeCandidate(button) {
        const f = button.features || {};
        const kind = f.reason || f.role || f.tagName || 'element';
        return `${kind}: ${candidateLabel(button)}`;
    }

    /**
     * Ask Jev for next-selection probabilities and sort the items by them.
     * Each returned item gets domIndex (original position) and jevProbability.
     * On any failure (no key, timeout, API error) the original order is kept.
     * @returns {Promise<{items: Array, prediction: Object}>}
     */
    async function jevRank(state, items, describe) {
        const options = items.slice(0, JEV_MAX_OPTIONS);
        const criteria = {};
        options.forEach((item, i) => {
            criteria[i] = describe(item);
        });

        let response;
        try {
            response = await chrome.runtime.sendMessage({
                action: 'predictNext',
                state: state,
                criteria: criteria
            });
        } catch (error) {
            response = { success: false, error: error.message };
        }

        if (!response?.success) {
            console.warn('⚠️ Jev ranking unavailable, using page order:', response?.error);
            return { items, prediction: { applied: false, error: response?.error || 'unknown' } };
        }

        const { probabilities } = response.data;
        const ranked = options
            .map((item, domIndex) => ({
                ...item,
                domIndex,
                jevProbability: probabilities[domIndex] ?? 0
            }))
            .sort((a, b) => b.jevProbability - a.jevProbability);

        // Options beyond the cap keep their page order after the ranked ones
        const rest = items.slice(JEV_MAX_OPTIONS)
            .map((item, i) => ({ ...item, domIndex: JEV_MAX_OPTIONS + i, jevProbability: null }));

        const prediction = {
            applied: true,
            model: response.data.model,
            confidence: response.data.confidence,
            latencyMs: response.data.latencyMs,
            inputTokens: response.data.inputTokens,
            optionCount: options.length,
            topPrediction: describe(ranked[0])
        };

        console.log(`🔮 Jev ranked ${options.length} options in ${response.data.latencyMs}ms, top:`, prediction.topPrediction);
        return { items: [...ranked, ...rest], prediction };
    }

    /**
     * Jev fields logged with a keyboard selection
     */
    function jevLogFor(button, index) {
        if (!isJevMode()) return null;
        return {
            region: lastJevRegionLog,
            element: {
                ...(lastJevElementPrediction || { applied: false, error: 'no prediction' }),
                selectedRank: index,
                selectedDomIndex: button.domIndex ?? index,
                selectedProbability: button.jevProbability ?? null
            }
        };
    }

    /**
     * Run detection scoped to a specific region
     */
    async function runRegionScopedDetection(region) {
        if (isDetecting) return [];
        isDetecting = true;

        try {
            // Get candidates within this region
            const regionCandidates = extractCandidatesInRegion(region, extractCandidates);

            console.log(`🎯 Found ${regionCandidates.length} candidates in ${region.name}`);

            // Store detection
            lastDetection = {
                timestamp: Date.now(),
                candidates: regionCandidates.map(c => ({
                    element: c.element,
                    candidate: c
                }))
            };

            return regionCandidates.map(c => ({
                element: c.element,
                highlightElement: c.highlightElement || null,
                text: c.features.text,
                selector: c.features.id || c.features.className,
                features: c.features
            }));
        } finally {
            isDetecting = false;
        }
    }

    /* ========= ELEMENT NAVIGATION (EXISTING) ========= */

    async function runAIMouseDetection() {
        if (isDetecting) return detectedButtons;
        isDetecting = true;

        try {
            const rawCandidates = extractPageCandidates();
            console.log('🎯 Raw candidates found:', rawCandidates.length);

            lastDetection = {
                timestamp: Date.now(),
                candidates: rawCandidates.map(c => ({
                    element: c.element,
                    candidate: c
                }))
            };

            const realButtons = rawCandidates.map(c => ({
                element: c.element,
                text: c.features.text,
                selector: c.features.id || c.features.className,
                features: c.features
            }));

            const fakeOptions = [{
                element: null,
                text: 'other',
                selector: 'fake-other',
                isFake: true,
                fakeAction: 'other'
            }];

            return [...realButtons, ...fakeOptions];
        } finally {
            isDetecting = false;
        }
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 16, g: 185, b: 129 };
    }

    function hexToRgba(hex, alpha) {
        const rgb = hexToRgb(hex);
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }

    let lassoUpdateHandler = null;

    function updateLassoPosition() {
        if (!currentLassoElement || !currentLassoTarget) return;

        const rect = currentLassoTarget.getBoundingClientRect();
        const padding = 4;

        const rectX = rect.left - padding;
        const rectY = rect.top - padding;
        const rectWidth = rect.width + padding * 2;
        const rectHeight = rect.height + padding * 2;

        const lassoRect = currentLassoElement.querySelector('rect:not([filter])');
        const glowRect = currentLassoElement.querySelector('rect[filter="url(#blur-filter)"]');

        if (lassoRect) {
            lassoRect.setAttribute('x', rectX);
            lassoRect.setAttribute('y', rectY);
            lassoRect.setAttribute('width', rectWidth);
            lassoRect.setAttribute('height', rectHeight);
        }

        if (glowRect) {
            glowRect.setAttribute('x', rectX);
            glowRect.setAttribute('y', rectY);
            glowRect.setAttribute('width', rectWidth);
            glowRect.setAttribute('height', rectHeight);
        }
    }

    function createLasso(element, color = selectedColor) {
        removeLasso();

        currentLassoTarget = element;
        const rect = element.getBoundingClientRect();
        const padding = 4;

        const rectX = rect.left - padding;
        const rectY = rect.top - padding;
        const rectWidth = rect.width + padding * 2;
        const rectHeight = rect.height + padding * 2;

        const rgb = hexToRgb(color);
        const lighterColor = `rgb(${Math.min(255, rgb.r + 50)}, ${Math.min(255, rgb.g + 50)}, ${Math.min(255, rgb.b + 50)})`;

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'smarttab-lasso';
        svg.style.position = 'fixed';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '999998';

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', 'blur-filter');
        const feGaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
        feGaussianBlur.setAttribute('stdDeviation', '4');
        filter.appendChild(feGaussianBlur);
        defs.appendChild(filter);

        svg.appendChild(defs);

        const glowRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        glowRect.setAttribute('x', rectX);
        glowRect.setAttribute('y', rectY);
        glowRect.setAttribute('width', rectWidth);
        glowRect.setAttribute('height', rectHeight);
        glowRect.setAttribute('rx', '6');
        glowRect.setAttribute('ry', '6');
        glowRect.setAttribute('stroke', lighterColor);
        glowRect.setAttribute('stroke-width', LASSO_GLOW_WIDTH);
        glowRect.setAttribute('fill', 'none');
        glowRect.setAttribute('opacity', '0.6');
        glowRect.setAttribute('filter', 'url(#blur-filter)');

        const lassoRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        lassoRect.setAttribute('x', rectX);
        lassoRect.setAttribute('y', rectY);
        lassoRect.setAttribute('width', rectWidth);
        lassoRect.setAttribute('height', rectHeight);
        lassoRect.setAttribute('rx', '6');
        lassoRect.setAttribute('ry', '6');
        lassoRect.setAttribute('stroke', color);
        lassoRect.setAttribute('stroke-width', LASSO_BORDER_WIDTH);
        lassoRect.setAttribute('fill', 'none');
        lassoRect.style.opacity = '1';
        lassoRect.style.transition = 'opacity 0.2s';

        svg.appendChild(glowRect);
        svg.appendChild(lassoRect);

        document.body.appendChild(svg);
        currentLassoElement = svg;

        lassoUpdateHandler = () => updateLassoPosition();
        window.addEventListener('scroll', lassoUpdateHandler, true);
        window.addEventListener('resize', lassoUpdateHandler);

        return svg;
    }

    function removeLasso() {
        if (lassoUpdateHandler) {
            window.removeEventListener('scroll', lassoUpdateHandler, true);
            window.removeEventListener('resize', lassoUpdateHandler);
            lassoUpdateHandler = null;
        }
        if (currentLassoElement) {
            currentLassoElement.remove();
            currentLassoElement = null;
        }
        currentLassoTarget = null;
    }

    let chordUpdateHandler = null;
    let chordMouseMoveHandler = null;

    function createChordEffect(element, mouseX, mouseY) {
        removeChord();

        currentChordTarget = element;
        const rect = element.getBoundingClientRect();

        const targetX = rect.left + rect.width / 2;
        const targetY = rect.top + rect.height / 2;

        const chordColor = hexToRgba(selectedColor, 0.8);

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'smarttab-chord';
        svg.style.position = 'fixed';
        svg.style.top = '0';
        svg.style.left = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = '999998';

        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', 'chord-blur-filter');
        const feGaussianBlur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
        feGaussianBlur.setAttribute('stdDeviation', '3');
        filter.appendChild(feGaussianBlur);
        defs.appendChild(filter);

        svg.appendChild(defs);

        const dx = targetX - mouseX;
        const dy = targetY - mouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        let pathData;
        if (distance < 5) {
            pathData = `M ${mouseX} ${mouseY} L ${targetX} ${targetY}`;
        } else {
            const curvature = 0.6;
            const baseOffset = Math.min(distance * 0.3, 100);
            const perpX = -dy / distance * baseOffset * curvature;
            const perpY = dx / distance * baseOffset * curvature;

            const cp1X = mouseX + (targetX - mouseX) * 0.35 + perpX;
            const cp1Y = mouseY + (targetY - mouseY) * 0.35 + perpY;
            const cp2X = mouseX + (targetX - mouseX) * 0.65 + perpX;
            const cp2Y = mouseY + (targetY - mouseY) * 0.65 + perpY;

            pathData = `M ${mouseX} ${mouseY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${targetX} ${targetY}`;
        }

        const glowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        glowPath.setAttribute('d', pathData);
        glowPath.setAttribute('stroke', selectedColor);
        glowPath.setAttribute('stroke-width', '8');
        glowPath.setAttribute('fill', 'none');
        glowPath.setAttribute('opacity', '0.5');
        glowPath.setAttribute('filter', 'url(#chord-blur-filter)');

        const chordPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        chordPath.setAttribute('d', pathData);
        chordPath.setAttribute('stroke', chordColor);
        chordPath.setAttribute('stroke-width', '3');
        chordPath.setAttribute('fill', 'none');
        chordPath.setAttribute('stroke-linecap', 'round');
        chordPath.style.opacity = '1';
        chordPath.style.transition = 'opacity 0.2s';

        svg.appendChild(glowPath);
        svg.appendChild(chordPath);

        document.body.appendChild(svg);
        currentChordElement = svg;

        chordUpdateHandler = () => updateChordPosition();
        window.addEventListener('scroll', chordUpdateHandler, true);
        window.addEventListener('resize', chordUpdateHandler);

        chordMouseMoveHandler = (e) => {
            currentMouseX = e.clientX;
            currentMouseY = e.clientY;
            if (currentChordElement && currentChordTarget) {
                updateChordPosition();
            }
        };

        navState.mouse.x = currentMouseX;
        navState.mouse.y = currentMouseY;

        document.addEventListener('mousemove', chordMouseMoveHandler);
    }

    function updateChordPosition() {
        if (!currentChordElement || !currentChordTarget) return;

        const rect = currentChordTarget.getBoundingClientRect();
        const targetX = rect.left + rect.width / 2;
        const targetY = rect.top + rect.height / 2;

        const dx = targetX - currentMouseX;
        const dy = targetY - currentMouseY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        let pathData;
        if (distance < 5) {
            pathData = `M ${currentMouseX} ${currentMouseY} L ${targetX} ${targetY}`;
        } else {
            const curvature = 0.6;
            const baseOffset = Math.min(distance * 0.3, 100);
            const perpX = -dy / distance * baseOffset * curvature;
            const perpY = dx / distance * baseOffset * curvature;

            const cp1X = currentMouseX + (targetX - currentMouseX) * 0.35 + perpX;
            const cp1Y = currentMouseY + (targetY - currentMouseY) * 0.35 + perpY;
            const cp2X = currentMouseX + (targetX - currentMouseX) * 0.65 + perpX;
            const cp2Y = currentMouseY + (targetY - currentMouseY) * 0.65 + perpY;

            pathData = `M ${currentMouseX} ${currentMouseY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${targetX} ${targetY}`;
        }

        const glowPath = currentChordElement.querySelector('path[filter]');
        const chordPath = currentChordElement.querySelector('path:not([filter])');

        if (glowPath) glowPath.setAttribute('d', pathData);
        if (chordPath) chordPath.setAttribute('d', pathData);
    }

    function removeChord() {
        if (chordUpdateHandler) {
            window.removeEventListener('scroll', chordUpdateHandler, true);
            window.removeEventListener('resize', chordUpdateHandler);
            chordUpdateHandler = null;
        }
        if (chordMouseMoveHandler) {
            document.removeEventListener('mousemove', chordMouseMoveHandler);
            chordMouseMoveHandler = null;
        }
        if (currentChordElement) {
            currentChordElement.remove();
            currentChordElement = null;
        }
        currentChordTarget = null;
    }

    async function focusNextButton() {
        if (detectedButtons.length === 0) return;

        currentIndex = (currentIndex + 1) % detectedButtons.length;
        focusCurrentButton();
    }

    async function focusPreviousButton() {
        if (detectedButtons.length === 0) return;

        currentIndex = currentIndex <= 0 ? detectedButtons.length - 1 : currentIndex - 1;
        focusCurrentButton();
    }

    /**
     * Highlight detectedButtons[currentIndex] and scroll it into view
     */
    function focusCurrentButton() {
        const button = detectedButtons[currentIndex];

        removeLasso();
        removeChord();

        if (button.isFake) {
            // For fake buttons, just close navigation
            closeSmartNavigation();
        } else if (button.element) {
            // Lasso and chord target the visual highlight element if set
            // (e.g. .Cp inside an email row), otherwise the element itself
            const lassoTarget = button.highlightElement || button.element;

            // Create lasso around element
            createLasso(lassoTarget, selectedColor);

            // Create chord (curved line) from cursor to element
            createChordEffect(lassoTarget, currentMouseX, currentMouseY);

            // Scroll the actual element into view
            button.element.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center'
            });
        }
    }

    function closeSmartNavigation() {
        navigationMode = 'none';
        currentRegionIndex = -1;
        currentIndex = -1;

        removeLasso();
        removeChord();
        removeRegionOverlay();
        removeRegionSelectionPopup();

        if (autoCloseTimeout) {
            clearTimeout(autoCloseTimeout);
            autoCloseTimeout = null;
        }
    }

    async function activateCurrentButton() {
        if (navigationMode === 'region') {
            // In region mode, Enter selects the region
            await selectCurrentRegion();
            return;
        }

        if (navigationMode !== 'element' || currentIndex < 0 || currentIndex >= detectedButtons.length) {
            return;
        }

        const button = detectedButtons[currentIndex];

        if (button.isFake && button.fakeAction === 'other') {
            // Switch back to region selection
            closeSmartNavigation();
            await startRegionNavigation();
            return;
        }

        if (!button.element) return;

        isKeyboardClick = true;

        updateFocusHistory(button.element);

        await logUserSelection(
            button,
            detectedButtons,
            true,
            currentIndex,
            0,
            tabPressCount,
            enterPressCount,
            tabPressCountSinceLastClick,
            enterPressCountSinceLastClick,
            jevLogFor(button, currentIndex),
            selectedRegionName,
            buildClickContext(detectedButtons, button.element)
        );

        // Reset per-interaction counters only
        tabPressCountSinceLastClick = 0;
        enterPressCountSinceLastClick = 0;

        resetCursorTracking();

        // Use robust click that handles Gmail's jsaction system
        console.log('🎯 Activating element with robust click...');
        performRobustClick(button.element);

        //button.element.click()
        setTimeout(() => {
            isKeyboardClick = false;
        }, 100);

        closeSmartNavigation();
    }

    /* ========= KEYBOARD INTERCEPTORS ========= */

    async function interceptTab(event) {
        const isTab = event.key === 'Tab';
        const isD = event.key === 'd' || event.key === 'D' || event.key === 'в' || event.key === 'В';
        const isS = event.key === 's' || event.key === 'S' || event.key === 'ы' || event.key === 'Ы';

        // Disable in trackpad mode - let Tab work normally
        if (isMouseMode()) {
            return true;
        }

        if ((isTab || isD || isS) && !event.ctrlKey && !event.altKey && !event.metaKey) {
            const activeElement = document.activeElement;

            // Check if user is in an input field
            let isInputField = false;
            if (activeElement) {
                const tagName = activeElement.tagName;
                const type = activeElement.type ? activeElement.type.toLowerCase() : '';

                if (tagName === 'TEXTAREA') {
                    isInputField = true;
                } else if (tagName === 'INPUT') {
                    const textInputTypes = ['text', 'email', 'password', 'search', 'tel', 'url', 'number', 'date', 'datetime-local', 'month', 'time', 'week'];
                    if (textInputTypes.includes(type) || !type || type === '') {
                        isInputField = true;
                    }
                } else if (activeElement.isContentEditable) {
                    isInputField = true;
                }
            }

            // Don't intercept Tab in input fields
            if (isInputField) {
                return true;
            }

            // Now handle Tab for navigation
            event.preventDefault();
            tabPressCount++;
            tabPressCountSinceLastClick++;
            event.stopPropagation();
            event.stopImmediatePropagation();

            // Ignore presses while Jev is ranking (the list is about to be reordered)
            if (jevPending) return;

            // If navigation not active, start region navigation
            if (navigationMode === 'none') {
                await startRegionNavigation();
                return;
            }

            // Handle navigation based on current mode
            if (navigationMode === 'region') {
                if (event.shiftKey || isS) {
                    focusPreviousRegion();
                } else {
                    focusNextRegion();
                }
            } else if (navigationMode === 'element') {
                if (event.shiftKey || isS) {
                    focusPreviousButton();
                } else {
                    focusNextButton();
                }
            }
        }
    }

    function interceptActivationKeys(event) {
        if (navigationMode === 'none') return;

        const isEnter = event.key === 'Enter';
        const isSpace = event.key === ' ';
        const isW = event.key === 'w' || event.key === 'W' || event.key === 'ц' || event.key === 'Ц';

        if (isEnter || isSpace || isW) {
            event.preventDefault();
            enterPressCount++;
            enterPressCountSinceLastClick++;
            event.stopPropagation();
            event.stopImmediatePropagation();

            if (jevPending) return;

            activateCurrentButton();
        }
    }

    function interceptEscape(event) {
        if (navigationMode === 'none') return;

        const isEscape = event.key === 'Escape';
        const isA = event.key === 'a' || event.key === 'A' || event.key === 'ф' || event.key === 'Ф';

        if (isEscape || isA) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            if (jevPending) return;

            if (navigationMode === 'element') {
                // Go back to region selection
                closeSmartNavigation();
                startRegionNavigation();
            } else {
                // Close everything
                closeSmartNavigation();
            }
        }
    }

    /* ========= CURSOR TRACKING ========= */

    function trackCursorMovement(e) {
        if (isMouseMode()) {
            const dx = e.clientX - lastCursorPosition.x;
            const dy = e.clientY - lastCursorPosition.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            totalCursorDistance += distance;

            lastCursorPosition.x = e.clientX;
            lastCursorPosition.y = e.clientY;
        }
    }

    function resetCursorTracking() {
        totalCursorDistance = 0;
        lastInteractionTime = Date.now();
    }

    /* ========= MESSAGE HANDLERS ========= */

    chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
        if (request.action === 'sessionStateChanged') {
            currentSessionMode = request.sessionActive ? request.mode : null;
            console.log(`🔄 Session mode changed to: ${currentSessionMode || 'inactive'}`);

            detectedButtons = [];
            currentIndex = -1;

            if (isMouseMode()) {
                resetCursorTracking();
            }

            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'toggleNavigation') {
            try {
                const wasActive = navigationMode !== 'none';

                if (wasActive) {
                    closeSmartNavigation();
                    sendResponse({ success: true, navigationActive: false });
                } else {
                    // Start with region selection
                    const success = await startRegionNavigation();
                    sendResponse({ success: success, navigationActive: success });
                }
            } catch (error) {
                console.error('Error toggling navigation:', error);
                sendResponse({ success: false, error: error.message });
            }
            return true;
        }
        if (request.action === 'showTaskInterstitial') {
            console.log('📋 Showing task interstitial...');

            taskInterstitial.show(
                request.taskNumber,
                request.totalTasks,
                request.status,
                () => {
                    console.log('✅ Interstitial complete');
                    sendResponse({ success: true });
                }
            );

            return true; // Keep channel open for async response
        }

        if (request.action === 'resetTabCounters') {
            tabPressCount = 0;
            enterPressCount = 0;
            sendResponse({ success: true });
            return true;
        }

        if (request.action === 'hideTaskInterstitial') {
            taskInterstitial.remove();
            sendResponse({ success: true });
        }

        return false;
    });

    function debouncedDetectButtons() {
        if (detectionTimeout) {
            clearTimeout(detectionTimeout);
        }

        detectionTimeout = setTimeout(async () => {
            // While navigating, detectedButtons is the list being cycled through: don't replace it
            if (navigationMode !== 'none') return;
            detectedButtons = await runAIMouseDetection();
            if (currentIndex >= detectedButtons.length) {
                currentIndex = -1;
            }
        }, DETECTION_DEBOUNCE_MS);
    }

    function findClickedCandidate(clickedElement) {
        const now = Date.now();

        if (now - lastDetection.timestamp > DETECTION_VALID_MS) {
            return null;
        }

        for (let i = 0; i < lastDetection.candidates.length; i++) {
            const { element } = lastDetection.candidates[i];
            if (element === clickedElement || element.contains(clickedElement)) {
                return {
                    button: detectedButtons[i],
                    selectedIndex: i
                };
            }
        }

        return null;
    }

    function getClassNameString(el) {
        if (!el.className) return '';
        return typeof el.className === 'string' ? el.className : el.className.toString();
    }

    /* ========= INITIALIZATION ========= */

    async function init() {
        document.addEventListener('mousemove', (e) => {
            currentMouseX = e.clientX;
            currentMouseY = e.clientY;
            trackCursorMovement(e);
        });

        // Gmail is a single-page app: folder / open email / compose changes show up as hash changes
        refreshPageState();
        window.addEventListener('hashchange', refreshPageState);
        window.addEventListener('popstate', refreshPageState);

        try {
            const { detectionMethod: savedDetection } = await chrome.storage.local.get(['detectionMethod']);
            if (savedDetection) detectionMethod = savedDetection;
        } catch (error) {
            console.warn('⚠️ Could not read the detection setting:', error);
        }

        // Keep the region boxes on their regions while the page scrolls
        window.addEventListener('scroll', onScrollDuringRegionSelection, { capture: true, passive: true });

        try {
            const result = await chrome.storage.local.get(['sessionActive', 'currentSession']);
            if (result.sessionActive && result.currentSession) {
                currentSessionMode = result.currentSession.mode;
                console.log(`📊 Session active in ${currentSessionMode} mode`);

                if (isMouseMode()) {
                    resetCursorTracking();
                }
            }
        } catch (error) {
            console.error('Failed to check session state:', error);
        }

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName === 'local' && changes.detectionMethod?.newValue) {
                detectionMethod = changes.detectionMethod.newValue;
                console.log(`🔎 Detection: ${detectionMethod}`);
            }

            if (areaName === 'local' && changes.currentSession) {
                if (changes.currentSession.newValue) {
                    currentSessionMode = changes.currentSession.newValue.mode;
                    console.log(`🔄 Session started via storage: ${currentSessionMode} mode`);

                    if (isMouseMode()) {
                        resetCursorTracking();
                    }
                } else {
                    currentSessionMode = null;
                    console.log('🔄 Session ended via storage');
                }
            }
        });

        // SOLUTION: Log interactions from mousedown + mouseup combination
// Since Gmail prevents click events on the Close button, we need to track mousedown + mouseup

// Add these variables at the top of your content.js (around line 44-50)
        let lastMouseDownData = null;
        let mouseDownLogged = false; // Track if we already logged this mousedown

// REPLACE the mousedown listener with this enhanced version:

        document.addEventListener('mousedown', async (event) => {
            if (!isMouseMode()) return;

            const clickedElement = event.target;
            const clickedId = clickedElement.id || clickedElement.closest('button')?.id;
            if (clickedId === 'skip-task-btn' || clickedId === 'next-task-btn' || clickedId === 'task-next-btn') {
                return;
            }

            // Find interactive element
            let targetElement = clickedElement;
            const interactiveTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG'];

            if (!interactiveTags.includes(clickedElement.tagName)) {
                const interactive = clickedElement.closest('button, a, img, [role="button"], [role="link"], [onclick], [tabindex]');
                if (interactive) {
                    targetElement = interactive;
                }
            }

            // Extract text
            const elementText = targetElement.getAttribute('aria-label') ||
                targetElement.getAttribute('data-tooltip') ||
                targetElement.title ||
                targetElement.textContent?.trim().slice(0, 100) ||
                targetElement.alt ||
                targetElement.value ||
                targetElement.tagName.toLowerCase();

            // Store for potential click event. Context is captured now, before the click changes the page
            lastMouseDownData = {
                timestamp: Date.now(),
                element: targetElement,
                elementText: elementText,
                context: buildClickContext(extractPageCandidates(), clickedElement, elementText)
            };
            mouseDownLogged = false; // Reset flag

            console.log('👇 Mousedown:', {
                tag: targetElement.tagName,
                text: elementText.substring(0, 30),
                ariaLabel: targetElement.getAttribute('aria-label')
            });
        }, true);

// ADD this new mouseup listener to log if click doesn't fire:

        document.addEventListener('mouseup', async (event) => {
            if (!isMouseMode()) return;
            if (!lastMouseDownData) return;
            if (mouseDownLogged) return; // Already logged

            // Wait a tiny bit to see if a click event fires
            await new Promise(resolve => setTimeout(resolve, 100));

            // If still not logged, it means click event was prevented
            if (!mouseDownLogged) {
                console.log('⚠️ Click event did not fire - logging from mouseup');

                const targetElement = lastMouseDownData.element;
                const elementText = lastMouseDownData.elementText;
                const context = lastMouseDownData.context;

                // Skip task control buttons (double check)
                const clickedId = targetElement.id || targetElement.closest('button')?.id;
                if (clickedId === 'skip-task-btn' || clickedId === 'next-task-btn' || clickedId === 'task-next-btn') {
                    lastMouseDownData = null;
                    return;
                }

                // Build selector
                let elementSelector = '';
                if (targetElement.id) {
                    elementSelector = `#${targetElement.id}`;
                } else if (targetElement.getAttribute('data-tooltip')) {
                    elementSelector = `[data-tooltip="${targetElement.getAttribute('data-tooltip')}"]`;
                } else if (targetElement.getAttribute('aria-label')) {
                    elementSelector = `[aria-label="${targetElement.getAttribute('aria-label')}"]`;
                } else if (targetElement.className && typeof targetElement.className === 'string') {
                    const classes = targetElement.className.split(' ').filter(c => c).slice(0, 2);
                    elementSelector = classes.length > 0 ? classes.join(' ') : targetElement.tagName;
                } else {
                    elementSelector = targetElement.tagName;
                }

                console.log('🖱️ Mouseup logged (no click):', {
                    tag: targetElement.tagName,
                    text: elementText.substring(0, 30),
                    distance: totalCursorDistance.toFixed(2)
                });

                // Log the interaction
                try {
                    const result = await chrome.storage.local.get(['sessionActive', 'currentSession']);
                    if (result.sessionActive) {
                        await chrome.runtime.sendMessage({
                            action: 'logInteraction',
                            data: {
                                timestamp: Date.now(),
                                selectedIndex: -1,
                                manualClick: true,
                                TabTabGoClick: false,
                                elementText: elementText.substring(0, 100),
                                elementSelector: elementSelector,
                                cursorTraveledDistancePx: totalCursorDistance,
                                url: window.location.href,
                                mode: result.currentSession.mode,
                                context: context
                            }
                        });

                        console.log('✅ Interaction logged from mouseup');
                        mouseDownLogged = true;
                    }
                } catch (error) {
                    console.error('Failed to log from mouseup:', error);
                }

                resetCursorTracking();
                lastMouseDownData = null;
            }
        }, true);

// UPDATE the click listener to mark when click fires:

        document.addEventListener('click', async (event) => {
            if (isKeyboardClick) {
                return;
            }

            const clickedElement = event.target;
            const clickedId = clickedElement.id || clickedElement.closest('button')?.id;
            if (clickedId === 'skip-task-btn' || clickedId === 'next-task-btn' || clickedId === 'task-next-btn') {
                return;
            }

            // In trackpad mode, always log clicks
            if (isMouseMode()) {
                let targetElement = clickedElement;
                let elementText = '';
                let context = null;

                // Prefer mousedown data if recent (within 500ms)
                if (lastMouseDownData && Date.now() - lastMouseDownData.timestamp < 500) {
                    targetElement = lastMouseDownData.element;
                    elementText = lastMouseDownData.elementText;
                    context = lastMouseDownData.context;
                    console.log('✓ Using mousedown data');
                } else {
                    // Fallback to extracting from click event
                    const interactiveTags = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA', 'IMG'];

                    if (!interactiveTags.includes(clickedElement.tagName)) {
                        const interactive = clickedElement.closest('button, a, img, [role="button"], [role="link"], [onclick], [tabindex]');
                        if (interactive) {
                            targetElement = interactive;
                        }
                    }

                    elementText = targetElement.getAttribute('aria-label') ||
                        targetElement.getAttribute('data-tooltip') ||
                        targetElement.title ||
                        targetElement.textContent?.trim().slice(0, 100) ||
                        targetElement.alt ||
                        targetElement.value ||
                        targetElement.tagName.toLowerCase();

                    context = buildClickContext(extractPageCandidates(), clickedElement, elementText);
                }

                // Build selector
                let elementSelector = '';
                if (targetElement.id) {
                    elementSelector = `#${targetElement.id}`;
                } else if (targetElement.getAttribute('data-tooltip')) {
                    elementSelector = `[data-tooltip="${targetElement.getAttribute('data-tooltip')}"]`;
                } else if (targetElement.getAttribute('aria-label')) {
                    elementSelector = `[aria-label="${targetElement.getAttribute('aria-label')}"]`;
                } else if (targetElement.className && typeof targetElement.className === 'string') {
                    const classes = targetElement.className.split(' ').filter(c => c).slice(0, 2);
                    elementSelector = classes.length > 0 ? classes.join(' ') : targetElement.tagName;
                } else {
                    elementSelector = targetElement.tagName;
                }

                console.log('🖱️ Click logged:', {
                    tag: targetElement.tagName,
                    text: elementText.substring(0, 30),
                    distance: totalCursorDistance.toFixed(2)
                });

                // Log the interaction
                try {
                    const result = await chrome.storage.local.get(['sessionActive', 'currentSession']);
                    if (result.sessionActive) {
                        await chrome.runtime.sendMessage({
                            action: 'logInteraction',
                            data: {
                                timestamp: Date.now(),
                                selectedIndex: -1,
                                manualClick: true,
                                TabTabGoClick: false,
                                elementText: elementText.substring(0, 100),
                                elementSelector: elementSelector,
                                cursorTraveledDistancePx: totalCursorDistance,
                                url: window.location.href,
                                mode: result.currentSession.mode,
                                context: context
                            }
                        });

                        // Mark as logged
                        mouseDownLogged = true;

                        // Clear mousedown data
                        lastMouseDownData = null;
                    }
                } catch (error) {
                    console.error('Failed to log trackpad click:', error);
                }

                resetCursorTracking();
                return;
            }

            // AI mode: use the existing detection-based approach
            const now = Date.now();
            if (now - lastDetection.timestamp > DETECTION_VALID_MS) {
                detectedButtons = await runAIMouseDetection();
            }

            const match = findClickedCandidate(event.target);
            if (!match) return;

            const { button, selectedIndex } = match;
            updateFocusHistory(button.element);

            await logUserSelection(
                button,
                detectedButtons,
                false,
                selectedIndex,
                totalCursorDistance,
                null,
                null,
                null,
                null,
                null,
                regionNameFor(button.element),
                buildClickContext(detectedButtons, button.element)
            );

            resetCursorTracking();
        }, true);

        setTimeout(async () => {
            detectedButtons = await runAIMouseDetection();
        }, 1000);

        window.addEventListener('keydown', interceptTab, true);
        document.addEventListener('keydown', interceptTab, true);

        window.addEventListener('keydown', interceptActivationKeys, true);
        document.addEventListener('keydown', interceptActivationKeys, true);

        window.addEventListener('keydown', interceptEscape, true);
        document.addEventListener('keydown', interceptEscape, true);

        const observer = new MutationObserver((mutations) => {
            let shouldRedetect = false;

            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1) {
                            const tagName = node.tagName?.toLowerCase();
                            const role = node.getAttribute?.('role');
                            const className = getClassNameString(node);

                            if (tagName === 'button' ||
                                role === 'button' ||
                                className.includes('button')) {
                                shouldRedetect = true;
                                break;
                            }
                        }
                    }
                }

                if (shouldRedetect) break;
            }

            if (shouldRedetect) {
                debouncedDetectButtons();
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'role']
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();