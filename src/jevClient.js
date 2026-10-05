// jevClient.js - Calls TypeSafe's Jev model to rank candidate elements
// Runs in the background service worker (content scripts are subject to the page's CORS rules)

const JEV_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';

// Pinned (instead of 'jev-latest') so results are reproducible across sessions
export const JEV_MODEL = 'jev-1.13.0';

// If Jev doesn't answer in time, navigation falls back to page order
const JEV_TIMEOUT_MS = 1200;

/**
 * Ask Jev which candidate the user will select next
 * @param {string} state - Plain-text description of the current situation
 * @param {Object<string, string>} criteria - Option id -> short element description
 * @returns {Promise<{model, choice, confidence, probabilities, inputTokens, latencyMs}>}
 */
export async function predictNext(state, criteria) {
    const { jevApiKey } = await chrome.storage.local.get(['jevApiKey']);
    if (!jevApiKey) {
        throw new Error('No Jev API key set (enter it in the extension popup)');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JEV_TIMEOUT_MS);
    const startTs = performance.now();

    try {
        const response = await fetch(JEV_ENDPOINT, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${jevApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                state: state,
                model: JEV_MODEL,
                questions: {
                    next_element: {
                        type: 'choice',
                        criteria: criteria
                    }
                }
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Jev API error ${response.status}: ${body.slice(0, 200)}`);
        }

        const json = await response.json();
        const answer = json.answers?.next_element;
        if (!answer?.probabilities) {
            throw new Error('Jev response missing next_element probabilities');
        }

        return {
            model: json.model,
            choice: answer.choice,
            confidence: answer.confidence,
            probabilities: answer.probabilities,
            inputTokens: json.usage?.input_tokens ?? null,
            latencyMs: Math.round(performance.now() - startTs)
        };
    } catch (error) {
        if (error.name === 'AbortError') {
            throw new Error(`Jev timed out after ${JEV_TIMEOUT_MS}ms`);
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}
