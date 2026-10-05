// background.js - Service worker for managing sessions

import { sessionManager } from './sessionManager.js';
import { predictNext } from './jevClient.js';

// Track the session tab ID
let sessionTabId = null;

// Initialize session manager on startup
chrome.runtime.onStartup.addListener(async () => {
    console.log('🚀 Extension startup - restoring session');
    await sessionManager.restoreSession();

    // Restore session tab ID
    const stored = await chrome.storage.local.get(['sessionTabId']);
    if (stored.sessionTabId) {
        sessionTabId = stored.sessionTabId;
        console.log('📌 Restored session tab ID:', sessionTabId);
    }
});

// Initialize on extension installation
chrome.runtime.onInstalled.addListener(async () => {
    console.log('📦 Extension installed - restoring session');
    await sessionManager.restoreSession();
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('📩 Background received message:', request.action, 'from tab:', sender.tab?.id);

    (async () => {
        try {
            if (request.action === 'startSession') {
                console.log('▶️ Starting session:', request.participantId, request.sessionId, request.mode);

                // Store the current tab as the session tab
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                sessionTabId = tab?.id;

                if (!sessionTabId) {
                    throw new Error('No active tab found to start session');
                }

                console.log('📌 Session will run on tab:', sessionTabId);

                // Start a new session
                const sessionData = await sessionManager.startSession(request.participantId, request.sessionId, request.mode);

                // Store session tab ID
                await chrome.storage.local.set({ sessionTabId: sessionTabId });

                console.log('✅ Session started successfully:', sessionData);
                sendResponse({ success: true, data: sessionData });

                // Show sync screen after a brief delay
                setTimeout(async () => {
                    await showSyncScreen();
                }, 500);
            }
            else if (request.action === 'syncComplete') {
                console.log('📊 Sync complete, data:', request.data);
                // Store sync data in session
                await sessionManager.logSyncData(request.data);

                // Start first task after sync
                setTimeout(async () => {
                    const task = await sessionManager.startTask(0);
                }, 500);

                sendResponse({ success: true });
            }
            else if (request.action === 'startNextTask') {
                const taskIndex = request.taskIndex;
                const task = await sessionManager.startTask(taskIndex);
                sendResponse({ success: true, task });
            }
            else if (request.action === 'completeTask') {
                console.log('✅ Completing task with endState:', request.endState);
                await sessionManager.completeTask(request.endState);

                // Get current session info to determine task progress
                const sessionInfo = sessionManager.getSessionInfo();
                const completedTaskNumber = sessionInfo.currentSession.tasks.length;
                const totalTasks = sessionInfo.TASKS.length;

                console.log(`📊 Task progress: ${completedTaskNumber}/${totalTasks}`);

                // Show interstitial
                await showTaskInterstitial(completedTaskNumber, totalTasks, request.endState);

                // Auto-start next task if not the last one
                if (completedTaskNumber < totalTasks) {
                    setTimeout(async () => {
                        console.log('🔄 Auto-starting next task...');
                        await sessionManager.startTask(completedTaskNumber); // Next task index
                    }, 2500); // Match interstitial duration
                } else {
                    // Last task completed, end session
                    setTimeout(async () => {
                        console.log('🏁 All tasks complete, ending session...');
                        await sessionManager.endSession();
                        // Clear session tab ID
                        sessionTabId = null;
                        await chrome.storage.local.remove(['sessionTabId']);
                    }, 3000);
                }

                sendResponse({ success: true });
            }
            else if (request.action === 'continueNextTask') {
                console.log('➡️ Continuing to next task');
                await sessionManager.continueToNextTask();
                sendResponse({ success: true });
            }
            else if (request.action === 'endSession') {
                console.log('⏹️ Ending session');
                // End the current session
                const finalData = await sessionManager.endSession();
                console.log('✅ Session ended, interactions:', finalData?.totalInteractions || 0);

                // Clear session tab ID
                sessionTabId = null;
                await chrome.storage.local.remove(['sessionTabId']);

                sendResponse({ success: true, data: finalData });
            }
            else if (request.action === 'getSessionInfo') {
                console.log('ℹ️ Getting session info');
                // Get current session information
                const info = sessionManager.getSessionInfo();
                console.log('📊 Session info:', info);
                sendResponse({ success: true, data: info });
            }
            else if (request.action === 'logInteraction') {
                console.log('📝 Logging interaction:', request.data);
                // Log an interaction during active session
                await sessionManager.logInteraction(request.data);
                console.log('✅ Interaction logged, total now:', sessionManager.sessionData?.totalInteractions);
                sendResponse({ success: true });
            }
            else if (request.action === 'predictNext') {
                // Rank candidates with Jev (TabTabGo + Jev mode)
                const prediction = await predictNext(request.state, request.criteria);
                console.log(`🔮 Jev predicted option ${prediction.choice} in ${prediction.latencyMs}ms`);
                sendResponse({ success: true, data: prediction });
            }
            else {
                console.warn('⚠️ Unknown action:', request.action);
                sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            console.error('❌ Background script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();

    // Return true to indicate async response
    return true;
});

// Show sync screen on session tab
async function showSyncScreen() {
    try {
        if (!sessionTabId) {
            console.error('❌ No session tab ID - cannot show sync screen');
            return;
        }

        console.log('📊 Showing sync screen on session tab:', sessionTabId);

        try {
            await chrome.tabs.sendMessage(sessionTabId, { action: 'showSync' });
            console.log('✅ Sync screen message sent successfully');
        } catch (msgError) {
            console.error('❌ Failed to send sync message:', msgError);
            console.error('Content script may not be loaded on tab:', sessionTabId);
        }
    } catch (error) {
        console.error('❌ Error showing sync screen:', error);
    }
}

// Show task completion interstitial on session tab
async function showTaskInterstitial(taskNumber, totalTasks, status) {
    try {
        if (!sessionTabId) {
            console.error('❌ No session tab ID - cannot show task interstitial');
            return;
        }

        console.log(`📋 Showing task interstitial on session tab ${sessionTabId}: ${taskNumber}/${totalTasks} (${status})`);

        try {
            const response = await chrome.tabs.sendMessage(sessionTabId, {
                action: 'showTaskInterstitial',
                taskNumber: taskNumber,
                totalTasks: totalTasks,
                status: status
            });
            console.log('✅ Task interstitial message sent, response:', response);
        } catch (msgError) {
            console.error('❌ Failed to send task interstitial message:', msgError);
            console.error('Content script may not be loaded on session tab:', sessionTabId);
            console.error('Error details:', msgError.message);
        }
    } catch (error) {
        console.error('❌ Error showing task interstitial:', error);
    }
}

// Listen for tab updates to track user behavior
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
        // Check if session is active
        const stored = await chrome.storage.local.get(['sessionActive']);
        if (stored.sessionActive) {
            console.log('🌐 Tab loaded during active session:', tab.url);

            // If session tab navigated, log it
            if (tabId === sessionTabId) {
                console.log('📍 Session tab navigated to:', tab.url);
            }
        }
    }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
    if (tabId === sessionTabId) {
        console.warn('⚠️ Session tab was closed!');
        sessionTabId = null;
        await chrome.storage.local.remove(['sessionTabId']);
    }
});

// Keep service worker alive with periodic checks
let keepAliveInterval = null;

function startKeepAlive() {
    if (keepAliveInterval) return;

    console.log('💚 Starting keep-alive');
    keepAliveInterval = setInterval(async () => {
        // Check session status periodically
        await sessionManager.restoreSession();
    }, 30000); // Every 30 seconds
}

function stopKeepAlive() {
    if (keepAliveInterval) {
        console.log('💔 Stopping keep-alive');
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
    }
}

// Start keep-alive on load
startKeepAlive();

// Monitor storage changes to detect session state
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.sessionActive) {
        console.log('🔄 Session state changed:', changes.sessionActive.newValue);
        if (changes.sessionActive.newValue) {
            startKeepAlive();
        } else {
            stopKeepAlive();
        }
    }
});