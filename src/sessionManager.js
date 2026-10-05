// sessionManager.js - Handles user study sessions with data collection and export

class SessionManager {
    constructor() {
        this.sessionData = null;
        this.sessionActive = false;
        this.sessionTimer = null;
        this.currentTask = null;
        this.currentTaskIndex = 0;
        this.lastInteractionTime = null;
        this.SESSION_DURATION_MS = 15 * 60 * 1000; // 15 minutes
        this.waitingForTaskContinue = false;
    }

    // Predefined task list
    TASKS = [
        {
            taskId: "task_0101",
            targets: ["Drafts", "FIRST MESSAGE — - HELLO THIS IS THE FIRST MESSAGE", "Close", "Inbox"]
        },
        {
            taskId: "task_0102",
            targets: ["Drafts", "SECOND MESSAGE — - THIS IS THE SECOND MESSAGE", "Close", "Inbox"]
        },
        {
            taskId: "task_0103",
            targets: ["Drafts", "THIRD MESSAGE — - This is the third message", "Close", "Inbox"]
        },
        {
            taskId: "task_0104",
            targets: ["Inbox", "Hello there! — - Dear user, Please read this message. Thank you Best regards, BK",
                "Not starred", "Inbox", "Starred",
                "Hello there! — - Dear user, Please read this message. Thank you Best regards, BK",
                "Starred", "Inbox"]
        },
        {
            taskId: "task_0105",
            targets: ["Compose", "Discard draft ‪(Ctrl-Shift-D)‬", "Inbox"]
        },
        {
            taskId: "task_0201",
            targets: ["Drafts", "FIRST MESSAGE — - HELLO THIS IS THE FIRST MESSAGE", "Close", "Inbox"]
        },
        {
            taskId: "task_0202",
            targets: ["Drafts", "SECOND MESSAGE — - THIS IS THE SECOND MESSAGE", "Close", "Inbox"]
        },
        {
            taskId: "task_0203",
            targets: ["Drafts", "THIRD MESSAGE — - This is the third message", "Close", "Inbox"]
        },
        {
            taskId: "task_0204",
            targets: ["Inbox", "Hello there! — - Dear user, Please read this message. Thank you Best regards, BK",
                "Not starred", "Inbox", "Starred",
                "Hello there! — - Dear user, Please read this message. Thank you Best regards, BK",
                "Starred", "Inbox"]
        },
        {
            taskId: "task_0205",
            targets: ["Compose", "Discard draft ‪(Ctrl-Shift-D)‬", "Inbox"]
        }
    ]

    async startSession(userId, sessionId, mode) {
        if (this.sessionActive) {
            throw new Error('Session already active');
        }

        const now = Date.now();
        const sessionDate = new Date(now).toISOString().split('T')[0]; // YYYY-MM-DD
        const participantId = `P${userId}`;
        const sessionNum = `P${userId}_S${sessionId}`;

        this.sessionData = {
            participantId: participantId,
            mode: mode, // 'trackpad' | 'tabtabgo' | 'tabtabgo-jev' | 'tabtabgo-jev-history'
            sessionId: sessionNum,
            sessionStartTs: now,
            sessionEndTs: null,
            sessionDuration: 0,
            sessionDate: sessionDate,
            totalInteractions: 0,
            totalManualClicks: 0,
            totalTabTabGoClicks: 0,
            totalTasks: this.TASKS.length,
            tasks: [],
            syncData: null // Will be populated after sync screen
        };

        this.sessionActive = true;
        this.currentTaskIndex = 0;
        this.lastInteractionTime = now;

        await chrome.storage.local.set({
            currentSession: this.sessionData,
            sessionActive: true
        });

        this.sessionTimer = setTimeout(() => {
            this.endSession();
        }, this.SESSION_DURATION_MS);

        this.broadcastSessionState();

        return this.sessionData;
    }

    async startTask(taskIndex = null) {
        if (!this.sessionActive) {
            throw new Error('No active session');
        }

        // Use provided index or current index
        if (taskIndex !== null) {
            this.currentTaskIndex = taskIndex;
        }

        const taskTemplate = this.TASKS[this.currentTaskIndex];
        if (!taskTemplate) {
            throw new Error('Invalid task index');
        }

        const now = Date.now();

        this.currentTask = {
            taskId: taskTemplate.taskId,
            targets: taskTemplate.targets || [],
            startTs: now,
            endTs: null,
            taskDuration: 0,
            success: false,
            interactions: [],
            clickSequence: []
        };

        this.lastInteractionTime = now;
        this.waitingForTaskContinue = false;

        // Save current task info
        await chrome.storage.local.set({
            currentSession: this.sessionData,
            currentTask: this.currentTask
        });

        // Broadcast task info to content script
        this.broadcastTaskInfo();

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'resetTabCounters' });
            }
        });

        return this.currentTask;
    }

    /**
     * Normalize text for comparison by removing extra whitespace and special characters
     */
    normalizeText(text) {
        if (!text) return '';

        return text
            .toLowerCase()
            .replace(/[\n\r\t]+/g, ' ')  // Replace newlines/tabs with spaces
            .replace(/\s+/g, ' ')         // Collapse multiple spaces
            .replace(/[—–-]/g, '-')       // Normalize dashes
            .replace(/['']/g, "'")        // Normalize quotes
            .replace(/[""]/g, '"')        // Normalize double quotes
            .replace(/[^\w\s'-]/g, '')    // Remove special chars except spaces, hyphens, apostrophes
            .trim();
    }

    /**
     * Compare clicked element text with expected target text
     * Uses normalized case-insensitive partial matching
     */
    matchesTarget(elementText, targetText) {
        if (!elementText || !targetText) return false;

        const normalizedElement = this.normalizeText(elementText);
        const normalizedTarget = this.normalizeText(targetText);

        // Exact match after normalization
        if (normalizedElement === normalizedTarget) {
            return true;
        }

        // Partial match - element contains target
        if (normalizedElement.includes(normalizedTarget)) {
            return true;
        }

        // Partial match - target contains element (for shorter clicks)
        if (normalizedTarget.includes(normalizedElement)) {
            return true;
        }

        // Check if they share significant overlap (at least 70% of words)
        const elementWords = normalizedElement.split(' ').filter(w => w.length > 0);
        const targetWords = normalizedTarget.split(' ').filter(w => w.length > 0);

        if (elementWords.length === 0 || targetWords.length === 0) {
            return false;
        }

        const commonWords = elementWords.filter(word => targetWords.includes(word));
        const overlapRatio = commonWords.length / Math.min(elementWords.length, targetWords.length);

        if (overlapRatio >= 0.5) {
            return true;
        }

        // Special case: handle common button text variations
        // e.g., "Close" matches "Save & close", "Discard" matches "Discard draft"
        const elementMainWords = elementWords.filter(w => w.length > 3); // Filter out small words
        const targetMainWords = targetWords.filter(w => w.length > 3);

        // If target is a single significant word, check if it appears in element
        if (targetMainWords.length === 1 && elementMainWords.includes(targetMainWords[0])) {
            return true;
        }

        // If element is a single significant word, check if it appears in target
        if (elementMainWords.length === 1 && targetMainWords.includes(elementMainWords[0])) {
            return true;
        }

        return false;
    }

    /**
     * Analyze click sequence against targets and categorize errors
     */
    analyzeClickSequence() {
        if (!this.currentTask) return [];

        const targets = this.currentTask.targets || [];
        const interactions = this.currentTask.interactions || [];
        const clickSequence = [];
        const mode = this.sessionData.mode;

        let targetIndex = 0;

        // Process each interaction
        for (let i = 0; i < interactions.length; i++) {
            const interaction = interactions[i];

            // Calculate tabsRequired based on mode
            // let tabsRequired = null;
            let distancePx = null;
            if (mode !== 'trackpad') {
                // tabsRequired = interaction.selectedIndex + 1; <- this is the index of element basically
                // tabsRequired = interaction.selectedIndex; // <- this is how many tabs were needed to reach the needed element
            }
            else {
                distancePx = interaction.cursorTraveledDistancePx;
            }

            const clickInfo = {
                timestamp: interaction.timestamp,
                tabsRequired: interaction.tabsRequiredSinceLastClick,
                entersRequired: interaction.entersRequiredSinceLastClick,
                elementText: interaction.elementText,
                TabTabGoClick: interaction.TabTabGoClick,
                manualClick: interaction.manualClick,
                cursorTraveledDistancePx: distancePx,
                timeSinceLastInteractionMs: interaction.timeSinceLastInteractionMs,
                jev: interaction.jev ?? null,
                region: interaction.region ?? null,
                expectedTarget: null,
                isError: false,
                errorReason: null
            };

            if (targetIndex < targets.length) {
                const expectedTarget = targets[targetIndex];
                clickInfo.expectedTarget = expectedTarget;

                if (this.matchesTarget(interaction.elementText, expectedTarget)) {
                    // Correct click
                    clickInfo.isError = false;
                    clickInfo.errorReason = null;
                    targetIndex++; // Move to next expected target
                } else {
                    // Incorrect click
                    clickInfo.isError = true;
                    clickInfo.errorReason = 'incorrect';
                    // Don't increment targetIndex - still expecting the same target
                }
            } else {
                // Extra click (more clicks than targets)
                clickInfo.isError = true;
                clickInfo.errorReason = 'extra';
                clickInfo.expectedTarget = null;
            }

            clickSequence.push(clickInfo);
        }

        // Add missing targets (targets that were never clicked)
        while (targetIndex < targets.length) {
            clickSequence.push({
                timestamp: null,
                tabsRequired: null,
                entersRequired: null,
                elementText: null,
                TabTabGoClick: false,
                manualClick: false,
                cursorTraveledDistancePx: 0,
                timeSinceLastInteractionMs: null,
                expectedTarget: targets[targetIndex],
                isError: true,
                errorReason: 'absent'
            });
            targetIndex++;
        }

        return clickSequence;
    }

    // Log interaction during task
    async logInteraction(data) {
        if (!this.sessionActive || !this.currentTask) {
            console.warn('No active task to log interaction');
            return;
        }

        const now = Date.now();
        const timeSinceLastInteraction = this.lastInteractionTime ? (now - this.lastInteractionTime) : 0;

        const interaction = {
            timestamp: data.timestamp,
            selectedIndex: data.selectedIndex,
            manualClick: data.manualClick,
            TabTabGoClick: data.TabTabGoClick,
            elementText: data.elementText,
            cursorTraveledDistancePx: data.cursorTraveledDistancePx || 0,
            timeSinceLastInteractionMs: timeSinceLastInteraction,
            tabsRequired: data.tabsRequired ?? null,
            entersRequired: data.entersRequired ?? null,
            tabsRequiredSinceLastClick: data.tabsRequiredSinceLastClick ?? null,
            entersRequiredSinceLastClick: data.entersRequiredSinceLastClick ?? null,
            jev: data.jev ?? null,
            region: data.region ?? null,
        };

        this.currentTask.interactions.push(interaction);
        this.sessionData.totalInteractions++;

        if (data.manualClick) {
            this.sessionData.totalManualClicks++;
        }
        if (data.TabTabGoClick) {
            this.sessionData.totalTabTabGoClicks++;
        }

        this.lastInteractionTime = now;

        await chrome.storage.local.set({
            currentSession: this.sessionData,
            currentTask: this.currentTask
        });

        // Check if task is complete
        await this.checkTaskCompletion();
    }

    /**
     * Log EMG sync click data at the start of a session
     * @param {Object} syncData - Sync data from sync screen
     * @param {Array<number>} syncData.timestamps - Timestamps of 3 clicks (in ms)
     * @param {Array<number>} syncData.intervals - Intervals between clicks (in ms)
     * @param {number} syncData.totalDuration - Total duration of 3 clicks (in ms)
     */
    async logSyncData(syncData) {
        if (!this.sessionActive || !this.sessionData) {
            console.warn('⚠️ Cannot log sync data - no active session');
            return;
        }

        // Add sync data to current session
        this.sessionData.syncData = {
            timestamps: syncData.timestamps,
            intervals: syncData.intervals,
            totalDuration: syncData.totalDuration,
            loggedAt: Date.now()
        };

        // Update storage
        await chrome.storage.local.set({
            currentSession: this.sessionData
        });

        console.log('✅ Sync data logged:', syncData);
    }

    async checkTaskCompletion() {
        if (!this.currentTask) return;

        const targets = this.currentTask.targets || [];
        const interactions = this.currentTask.interactions || [];

        // Analyze current sequence
        const clickSequence = this.analyzeClickSequence();

        // Count how many targets have been correctly reached
        let correctTargets = 0;
        for (const click of clickSequence) {
            if (!click.isError && click.timestamp !== null) {
                correctTargets++;
            }
        }

        // Task is complete if all targets reached
        if (correctTargets >= targets.length) {
            await this.completeTask('completed');
        }
    }

    async completeTask(endState = 'completed') {
        if (!this.currentTask) {
            return;
        }

        const now = Date.now();

        // Analyze final click sequence
        this.currentTask.clickSequence = this.analyzeClickSequence();

        // Determine task outcome
        const targets = this.currentTask.targets || [];
        let correctTargets = 0;
        let hasErrors = false;

        for (const click of this.currentTask.clickSequence) {
            if (click.isError) {
                hasErrors = true;
            }
            if (!click.isError && click.timestamp !== null) {
                correctTargets++;
            }
        }

        const totalTabsRequired = (this.currentTask.interactions || [])
            .reduce((sum, i) => sum + (i.tabsRequiredSinceLastClick ?? 0), 0);
        const totalEntersRequired = (this.currentTask.interactions || [])
            .reduce((sum, i) => sum + (i.entersRequiredSinceLastClick ?? 0), 0);

        this.currentTask.endTs = now;
        this.currentTask.taskDuration = now - this.currentTask.startTs;
        this.currentTask.endState = endState;
        this.currentTask.finalTargetReached = (correctTargets >= targets.length);
        this.currentTask.mistakesMade = hasErrors;
        this.currentTask.totalTabsRequired = totalTabsRequired;
        this.currentTask.totalEntersRequired = totalEntersRequired;

        // Remove raw interactions array (we have clickSequence now)
        delete this.currentTask.interactions;

        // Add task to session
        this.sessionData.tasks.push(this.currentTask);

        // Clear current task
        this.currentTask = null;

        await chrome.storage.local.set({
            currentSession: this.sessionData,
            currentTask: null
        });

        // Move to next task
        this.currentTaskIndex++;

        // Check if there are more tasks
        if (this.currentTaskIndex < this.TASKS.length) {
            // Start next task immediately
            await this.startTask(this.currentTaskIndex);
        } else {
            // No more tasks, end session
            await this.endSession();
        }

        return this.sessionData.tasks[this.sessionData.tasks.length - 1];
    }

    async continueToNextTask() {
        this.waitingForTaskContinue = false;

        // Complete current task as skipped if it's still active
        if (this.currentTask) {
            await this.completeTask('skipped');
        }

        if (this.currentTaskIndex < this.TASKS.length) {
            // Start next task (currentTaskIndex was already incremented in completeTask)
            await this.startTask(this.currentTaskIndex);
        } else {
            // No more tasks, end session
            await this.endSession();
        }
    }

    // End the session and export data
    async endSession() {
        if (!this.sessionActive) {
            return null;
        }

        // Complete current task if active
        if (this.currentTask && !this.waitingForTaskContinue) {
            await this.completeTask('ended_wrong');
        }

        if (this.sessionTimer) {
            clearTimeout(this.sessionTimer);
            this.sessionTimer = null;
        }

        const now = Date.now();
        this.sessionData.sessionEndTs = now;
        this.sessionData.sessionDuration = now - this.sessionData.sessionStartTs;

        this.sessionActive = false;

        await chrome.storage.local.set({
            currentSession: null,
            currentTask: null,
            sessionActive: false
        });

        const jsonData = this.exportToJSON();
        this.downloadJSON(jsonData);

        this.broadcastSessionState();

        const finalData = {...this.sessionData};
        this.sessionData = null;
        this.currentTaskIndex = 0;

        return finalData;
    }

    // Export session data as JSON string matching exact schema
    exportToJSON() {
        if (!this.sessionData) {
            return null;
        }

        // Build exact schema structure
        const cleanData = {
            participantId: this.sessionData.participantId,
            mode: this.sessionData.mode,
            sessionId: this.sessionData.sessionId,
            sessionStartTs: this.sessionData.sessionStartTs,
            sessionEndTs: this.sessionData.sessionEndTs,
            sessionDuration: this.sessionData.sessionDuration,
            sessionDate: this.sessionData.sessionDate,
            totalInteractions: this.sessionData.totalInteractions,
            totalManualClicks: this.sessionData.totalManualClicks,
            totalTabTabGoClicks: this.sessionData.totalTabTabGoClicks,
            totalTasks: this.sessionData.totalTasks,
            syncData: this.sessionData.syncData ? {
                syncTimestamp1: this.sessionData.syncData.timestamps[0],
                syncTimestamp2: this.sessionData.syncData.timestamps[1],
                syncTimestamp3: this.sessionData.syncData.timestamps[2],
                syncInterval1to2: this.sessionData.syncData.intervals[0],
                syncInterval2to3: this.sessionData.syncData.intervals[1],
                syncTotalDuration: this.sessionData.syncData.totalDuration,
                syncLoggedAt: this.sessionData.syncData.loggedAt
            } : null,
            tasks: this.sessionData.tasks.map(task => ({
                taskId: task.taskId,
                targets: task.targets || [],
                startTs: task.startTs,
                endTs: task.endTs,
                taskDuration: task.taskDuration,
                endState: task.endState,
                finalTargetReached: task.finalTargetReached,
                mistakesMade: task.mistakesMade,
                totalTabsRequired: task.totalTabsRequired ?? null,   // <-- add
                totalEntersRequired: task.totalEntersRequired ?? null, // <-- add
                interactions: task.clickSequence || []
            }))
        };

        return JSON.stringify(cleanData, null, 2);
    }

    // Download JSON file
    downloadJSON(jsonString) {
        if (!jsonString) {
            return;
        }

        const date = new Date();
        const dateStr = date.toISOString().replace(/[:.]/g, '-').split('T')[0];
        const timeStr = date.toTimeString().split(' ')[0].replace(/:/g, '-');
        const filename = `${this.sessionData.sessionId}_${this.sessionData.mode}_${dateStr}_${timeStr}.json`;

        const dataUrl = 'data:application/json;base64,' + btoa(unescape(encodeURIComponent(jsonString)));

        chrome.downloads.download({
            url: dataUrl,
            filename: filename,
            saveAs: true
        }, (downloadId) => {
            if (chrome.runtime.lastError) {
                console.error('Download error:', chrome.runtime.lastError);
            } else {
                console.log('Session data downloaded:', downloadId);
            }
        });
    }

    // Get current session info
    getSessionInfo() {
        if (!this.sessionActive) {
            return null;
        }

        const elapsed = Date.now() - this.sessionData.sessionStartTs;
        const remaining = Math.max(0, this.SESSION_DURATION_MS - elapsed);

        return {
            active: this.sessionActive,
            participantId: this.sessionData.participantId,
            mode: this.sessionData.mode,
            elapsed: elapsed,
            remaining: remaining,
            totalInteractions: this.sessionData.totalInteractions,
            currentTask: this.currentTask ? {
                taskNumber: this.currentTaskIndex + 1,
                totalTasks: this.TASKS.length
            } : null
        };
    }

    // Restore session from storage (in case of reload)
    async restoreSession() {
        const stored = await chrome.storage.local.get(['currentSession', 'sessionActive', 'currentTask']);

        if (stored.sessionActive && stored.currentSession) {
            this.sessionData = stored.currentSession;
            this.sessionActive = true;

            if (stored.currentTask) {
                this.currentTask = stored.currentTask;
            }

            const elapsed = Date.now() - this.sessionData.sessionStartTs;
            if (elapsed >= this.SESSION_DURATION_MS) {
                await this.endSession();
            } else {
                const remaining = this.SESSION_DURATION_MS - elapsed;
                this.sessionTimer = setTimeout(() => {
                    this.endSession();
                }, remaining);
            }
        }
    }

    broadcastSessionState() {
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'sessionStateChanged',
                    sessionActive: this.sessionActive,
                    mode: this.sessionActive ? this.sessionData.mode : null
                }).catch(() => {
                });
            });
        });
    }

    broadcastTaskInfo() {
        if (!this.currentTask) return;

        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'taskStarted',
                    task: {
                        taskNumber: this.currentTaskIndex + 1,
                        totalTasks: this.TASKS.length
                    }
                }).catch(() => {
                });
            });
        });
    }

    broadcastTaskComplete(nextTask) {
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, {
                    action: 'taskComplete',
                    nextTask: nextTask ? {
                        taskNumber: this.currentTaskIndex + 1,
                        totalTasks: this.TASKS.length
                    } : null
                }).catch(() => {
                });
            });
        });
    }
}

// Export singleton instance
export const sessionManager = new SessionManager();