//this is inMemoryLogger.js file

import { navState } from './tabtabgologic/tabtabgoCore.js';

// Store recent interactions for online learning
const interactionLog = [];

export { logUserSelection };

/**
 * Logs user selection with proper Trackpad vs AI comparison
 * @param {Object} button - The selected button
 * @param {Array} displayedCandidates - Candidates shown to user (current ranking)
 * @param {boolean} isKeyboardActivation - Whether activated via keyboard
 * @param {number} selectedIndex - Index in displayed ranking
 * @param {number} cursorTraveledDistancePx - Cursor distance (for trackpad mode)
 * @param tabsRequired
 * @param entersRequired
 * @param tabsRequiredSinceLastClick
 * @param entersRequiredSinceLastClick
 * @param {Object|null} jev - Jev prediction details (Jev modes only)
 * @param {string|null} region - Name of the region the element is in
 */
async function logUserSelection(
    button,
    displayedCandidates,
    isKeyboardActivation = false,
    selectedIndex = null,
    cursorTraveledDistancePx = 0,
    tabsRequired = null,
    entersRequired = null,
    tabsRequiredSinceLastClick = null,
    entersRequiredSinceLastClick = null,
    jev = null,
    region = null
) {
    // Calculate selected index if not provided
    if (selectedIndex === null) {
        selectedIndex = displayedCandidates.findIndex(c => c.element === button.element);
    }

    const stateSnapshot = {
        focusedElement: navState.focusedElement,
        focusHistory: [...navState.focusHistory],
        mouse: { ...navState.mouse },
        hostname: window.location.hostname
    };

    const candidateSnapshot = displayedCandidates.map(c => ({
        text: c.text || c.features?.text || '',
        selector: c.selector || c.features?.id || c.features?.className || '',
        isFake: c.isFake || false
    }));

    const interaction = {
        timestamp: Date.now(),
        state: stateSnapshot,
        candidates: candidateSnapshot,
        selectedIndex: selectedIndex,
        isKeyboardActivation: isKeyboardActivation,
        cursorTraveledDistancePx: cursorTraveledDistancePx
    };

    interactionLog.push(interaction);

    // Optional: limit log size
    if (interactionLog.length > 1000) {
        interactionLog.shift();
    }

    console.log('📊 Interaction logged:', {
        selectedIndex,
        cursorTraveledDistancePx
    });

    // Send to session manager if session is active
    try {
        const result = await chrome.storage.local.get(['sessionActive', 'currentSession']);
        if (result.sessionActive) {
            await chrome.runtime.sendMessage({
                action: 'logInteraction',
                data: {
                    timestamp: Date.now(),
                    selectedIndex: selectedIndex,
                    manualClick: !isKeyboardActivation,
                    TabTabGoClick: isKeyboardActivation,
                    elementText: button.text || button.features?.text || '',
                    cursorTraveledDistancePx: cursorTraveledDistancePx,
                    url: window.location.href,
                    mode: result.currentSession.mode,
                    tabsRequired: tabsRequired,
                    entersRequired: entersRequired,
                    tabsRequiredSinceLastClick: tabsRequiredSinceLastClick,
                    entersRequiredSinceLastClick: entersRequiredSinceLastClick,
                    jev: jev,
                    region: region,
                }
            });
        }
    } catch (error) {
        console.error('Failed to log interaction to session:', error);
    }
}