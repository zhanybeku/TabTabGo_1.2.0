// sessionManager.js - Handles user study sessions with data collection and export

// Free recording ('record' mode): one open-ended task with no targets, ended from the popup
const FREE_RECORDING_TASKS = [
    { taskId: "free_recording", title: "Free recording", targets: [], steps: [] }
];

// Targets that only bring the participant to a page. When the participant is already on that page,
// the step is done without a click: nobody clicks "Inbox" while looking at the Inbox list (the star
// task starts there, and discarding a new message leaves the participant there)
const PAGE_TARGETS = {
    "Inbox": (page) => page?.site === "gmail" && page.folder === "inbox" &&
        !page.emailOpen && !page.composeOpen && !page.dialogOpen
};
const PAGE_CHECK_DELAY_MS = 1500; // after a click, before asking the session tab which page it shows

// Study tasks (EETP v1.2). steps[i] is the instruction for targets[i], worded as in the protocol
// (Supplementary Material A, Section 6); the popup shows them to the researcher.
const HELLO_THERE = "Hello there! — - Dear user, Please read this message. Thank you Best regards, BK";

function readDraftTask(taskId, subject, target) {
    return {
        taskId,
        title: `Read the draft "${subject}"`,
        targets: ["Drafts", target, "Close", "Inbox"],
        steps: [
            'In the navigation panel, click on "Drafts".',
            `Click on the email titled "${subject}" to open it.`,
            "Close the draft with the X (close) button at the top-right corner of the draft window.",
            'Click on "Inbox" in the navigation panel.'
        ]
    };
}

function starTask(taskId) {
    return {
        taskId,
        title: 'Star and unstar "Hello there!"',
        targets: ["Inbox", HELLO_THERE, "Not starred", "Inbox", "Starred", HELLO_THERE, "Starred", "Inbox"],
        steps: [
            'In the navigation panel, click on "Inbox".',
            'In the Inbox, click on the message titled "Hello there!" to open it.',
            "Click on the star icon in the top-right area of the open message so that it turns yellow.",
            'Click on "Inbox" in the navigation panel.',
            'Click on "Starred" in the navigation panel.',
            'Click on the message "Hello there!" to open it.',
            "Click on the yellow star icon in the top-right area of the message to unstar it.",
            'Click on "Inbox" in the navigation panel.'
        ]
    };
}

function composeTask(taskId) {
    return {
        taskId,
        title: "Compose and discard a message",
        targets: ["Compose", "Discard draft ‪(Ctrl-Shift-D)‬", "Inbox"],
        steps: [
            'Click on "Compose" to open a new message window.',
            "Click on the trash icon at the bottom-right corner of the compose window to discard the draft.",
            'Click on "Inbox" in the navigation panel.'
        ]
    };
}

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

    // Tasks of the current session's mode
    get TASKS() {
        return this.tasksForMode(this.sessionData?.mode);
    }

    tasksForMode(mode) {
        return mode === 'record' ? FREE_RECORDING_TASKS : this.STUDY_TASKS;
    }

    // Predefined task list
    STUDY_TASKS = [
        readDraftTask("task_0101", "FIRST MESSAGE", "FIRST MESSAGE — - HELLO THIS IS THE FIRST MESSAGE"),
        readDraftTask("task_0102", "SECOND MESSAGE", "SECOND MESSAGE — - THIS IS THE SECOND MESSAGE"),
        readDraftTask("task_0103", "THIRD MESSAGE", "THIRD MESSAGE — - This is the third message"),
        starTask("task_0104"),
        composeTask("task_0105"),
        readDraftTask("task_0201", "FIRST MESSAGE", "FIRST MESSAGE — - HELLO THIS IS THE FIRST MESSAGE"),
        readDraftTask("task_0202", "SECOND MESSAGE", "SECOND MESSAGE — - THIS IS THE SECOND MESSAGE"),
        readDraftTask("task_0203", "THIRD MESSAGE", "THIRD MESSAGE — - This is the third message"),
        starTask("task_0204"),
        composeTask("task_0205")
    ]

    async startSession(userId, sessionId, mode, detection = 'gmail-rules') {
        if (this.sessionActive) {
            throw new Error('Session already active');
        }

        const now = Date.now();
        const sessionDate = new Date(now).toISOString().split('T')[0]; // YYYY-MM-DD
        const participantId = `P${userId}`;
        const sessionNum = `P${userId}_S${sessionId}`;

        this.sessionData = {
            participantId: participantId,
            mode: mode, // 'trackpad' | 'record' | 'tabtabgo' | 'tabtabgo-jev-h0' | 'tabtabgo-jev-h5'
            detection: detection, // 'gmail-rules' | 'dynamic' (how regions/elements are found on Gmail)
            sessionId: sessionNum,
            sessionStartTs: now,
            sessionEndTs: null,
            sessionDuration: 0,
            sessionDate: sessionDate,
            totalInteractions: 0,
            totalManualClicks: 0,
            totalTabTabGoClicks: 0,
            totalTasks: this.tasksForMode(mode).length,
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

    async startTask(taskIndex = null, startTs = Date.now()) {
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

        const now = startTs;

        this.currentTask = {
            taskId: taskTemplate.taskId,
            title: taskTemplate.title || taskTemplate.taskId,
            targets: taskTemplate.targets || [],
            steps: taskTemplate.steps || [],
            targetsReached: 0, // for the popup's checklist; not exported
            satisfiedSteps: {}, // target index -> clicks before it, for steps done without a click (PAGE_TARGETS)
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
        this.schedulePageCheck(); // the task may start on a page its first step leads to

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'resetTabCounters' }).catch(() => {
                    console.warn('⚠️ Could not reset Tab/Enter counters: no content script in the active tab');
                });
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
        const satisfied = this.currentTask.satisfiedSteps || {};
        const clickSequence = [];
        const mode = this.sessionData.mode;

        let targetIndex = 0;

        // Steps done without a click (the participant was already on their page), in their place
        const addSatisfiedSteps = (clicksSoFar) => {
            while (targetIndex < targets.length && satisfied[targetIndex] !== undefined &&
                   satisfied[targetIndex] <= clicksSoFar) {
                clickSequence.push(this.stepWithoutClick(targets[targetIndex], {
                    isError: false,
                    errorReason: null,
                    satisfiedWithoutClick: true
                }));
                targetIndex++;
            }
        };

        // Process each interaction
        for (let i = 0; i < interactions.length; i++) {
            addSatisfiedSteps(i);
            const interaction = interactions[i];

            // Calculate tabsRequired based on mode
            // let tabsRequired = null;
            let distancePx = null;
            if (mode !== 'trackpad' && mode !== 'record') {
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
                context: interaction.context ?? null,
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
            } else if (targets.length > 0) {
                // Extra click (more clicks than targets)
                clickInfo.isError = true;
                clickInfo.errorReason = 'extra';
                clickInfo.expectedTarget = null;
            }
            // No targets at all (free recording): every click is just recorded

            clickSequence.push(clickInfo);
        }

        addSatisfiedSteps(interactions.length);

        // Add missing targets (targets that were never clicked)
        while (targetIndex < targets.length) {
            clickSequence.push(this.stepWithoutClick(targets[targetIndex], {
                isError: true,
                errorReason: 'absent'
            }));
            targetIndex++;
        }

        return clickSequence;
    }

    // Click-sequence entry for a step with no click: done without one, or never done ('absent')
    stepWithoutClick(target, outcome) {
        return {
            timestamp: null,
            tabsRequired: null,
            entersRequired: null,
            elementText: null,
            TabTabGoClick: false,
            manualClick: false,
            cursorTraveledDistancePx: 0,
            timeSinceLastInteractionMs: null,
            expectedTarget: target,
            ...outcome
        };
    }

    // Whether a click-sequence entry reached its target
    static isReached(entry) {
        return !entry.isError && (entry.timestamp !== null || entry.satisfiedWithoutClick === true);
    }

    /**
     * Marks the current task's next steps as done if they only lead to the page the participant is on
     * (PAGE_TARGETS). Returns whether a step was marked.
     */
    markStepsAlreadyDone(page) {
        const task = this.currentTask;
        if (!task || !page) return false;
        const targets = task.targets || [];
        task.satisfiedSteps = task.satisfiedSteps || {};

        let next = this.countReachedTargets();
        let marked = false;
        while (next < targets.length && PAGE_TARGETS[targets[next]]?.(page)) {
            task.satisfiedSteps[next] = task.interactions.length;
            marked = true;
            next++;
        }
        return marked;
    }

    /**
     * Before a click is added to the current task: steps that only lead to the page the click was made on
     * are already done. Returns true if that finished the task, so the click belongs to the next task.
     */
    applyPageSteps(data) {
        const task = this.currentTask;
        const targets = task.targets || [];
        if (targets.length === 0) return false;

        const reached = this.countReachedTargets();
        const matches = (i) => i >= 0 && i < targets.length && this.matchesTarget(data.elementText, targets[i]);

        // The participant clicked a step that already counted as done (e.g. "Inbox" on the Inbox list,
        // as the instructions say): the click is that step after all
        if (task.satisfiedSteps?.[reached - 1] !== undefined && !matches(reached) && matches(reached - 1)) {
            delete task.satisfiedSteps[reached - 1];
            return false;
        }
        if (matches(reached)) return false;

        this.markStepsAlreadyDone(data.context?.pageState);
        return this.countReachedTargets() >= targets.length;
    }

    // Time of the current task's last click (its start if there is none)
    lastClickTimestamp() {
        const clicks = this.currentTask?.interactions || [];
        return clicks.length > 0 ? clicks[clicks.length - 1].timestamp : this.currentTask?.startTs;
    }

    /**
     * When the next step only leads to a page, look at the session tab's page once the last click has
     * taken effect. This finishes e.g. the compose task, whose last step ("Inbox") is where discarding
     * the message leaves the participant, even when no click follows (the last task of the session).
     */
    schedulePageCheck() {
        clearTimeout(this.pageCheckTimer);
        const task = this.currentTask;
        if (!task || !PAGE_TARGETS[(task.targets || [])[this.countReachedTargets()]]) return;

        const clicks = task.interactions.length;
        const unchanged = () => this.currentTask === task && task.interactions.length === clicks;
        this.pageCheckTimer = setTimeout(async () => {
            if (!unchanged()) return;
            const page = await this.getSessionPage();
            if (!unchanged() || !this.markStepsAlreadyDone(page)) return;

            task.targetsReached = this.countReachedTargets();
            await chrome.storage.local.set({ currentTask: task });
            if (task.targetsReached >= task.targets.length) {
                await this.completeTask('completed', this.lastClickTimestamp());
            }
        }, PAGE_CHECK_DELAY_MS);
    }

    // The page the session tab shows now (from its content script), or null
    async getSessionPage() {
        try {
            const { sessionTabId } = await chrome.storage.local.get(['sessionTabId']);
            if (sessionTabId == null) return null;
            const response = await chrome.tabs.sendMessage(sessionTabId, { action: 'getPageState' });
            return response?.pageState ?? null;
        } catch (error) {
            console.warn('⚠️ Could not read the page of the session tab:', error.message);
            return null;
        }
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
            context: data.context ?? null,
        };

        // Steps the participant was already done with (see applyPageSteps); a finished task passes the
        // click on to the next one, ending when its last click took effect
        while (this.applyPageSteps(data)) {
            await this.completeTask('completed', this.lastClickTimestamp());
            if (!this.currentTask) return; // that was the last task
        }

        this.currentTask.interactions.push(interaction);
        this.sessionData.totalInteractions++;

        if (data.manualClick) {
            this.sessionData.totalManualClicks++;
        }
        if (data.TabTabGoClick) {
            this.sessionData.totalTabTabGoClicks++;
        }

        this.lastInteractionTime = now;
        this.currentTask.targetsReached = this.countReachedTargets();

        await chrome.storage.local.set({
            currentSession: this.sessionData,
            currentTask: this.currentTask
        });

        // Check if task is complete
        await this.checkTaskCompletion();
        this.schedulePageCheck();
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

        // Free recording has no targets, so it only ends from the popup
        if (targets.length === 0) return;

        // Task is complete if all targets reached
        if (this.countReachedTargets() >= targets.length) {
            await this.completeTask('completed');
        }
    }

    // How many of the current task's targets have been reached, in order
    countReachedTargets() {
        return this.analyzeClickSequence().filter(SessionManager.isReached).length;
    }

    async completeTask(endState = 'completed', endTs = Date.now()) {
        if (!this.currentTask) {
            return;
        }

        clearTimeout(this.pageCheckTimer);
        const now = endTs;

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
            if (SessionManager.isReached(click)) {
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
        const finishedTask = this.currentTask;
        this.sessionData.tasks.push(finishedTask);

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
            await this.startTask(this.currentTaskIndex, now);
        } else {
            // No more tasks, end session
            await this.endSession();
        }

        // endSession() clears sessionData after the last task, so return the saved reference
        return finishedTask;
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
            detection: this.sessionData.detection ?? 'gmail-rules',
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