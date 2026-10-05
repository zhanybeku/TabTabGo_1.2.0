// popup.js
(function() {
  'use strict';

  let timerInterval = null;

  const MODE_LABELS = {
    'trackpad': 'Trackpad',
    'tabtabgo': 'TabTabGo',
    'tabtabgo-jev': 'TabTabGo + Jev',
    'tabtabgo-jev-history': 'TabTabGo + Jev + History'
  };

  // Format milliseconds to MM:SS
  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  // Update UI based on session state
  async function updateUI() {
    const result = await chrome.storage.local.get(['sessionActive', 'currentSession', 'currentTask']);

    if (result.sessionActive && result.currentSession) {
      // Show active session UI
      document.getElementById('session-setup').style.display = 'none';
      document.getElementById('session-active').style.display = 'block';

      // Update session info
      document.getElementById('session-user-id').textContent = result.currentSession.participantId;
      document.getElementById('session-mode').textContent =
          MODE_LABELS[result.currentSession.mode] || result.currentSession.mode;
      document.getElementById('session-interactions').textContent = result.currentSession.totalInteractions || 0;

      // Update current task info
      if (result.currentTask) {
        document.getElementById('task-info-title').textContent = `📋 Current Task: ${result.currentTask.taskId}`;
        document.getElementById('current-task-info').style.display = 'block';
        document.getElementById('current-task-number').textContent =
            `Task ${(result.currentSession.tasks?.length || 0)+1} of ${result.currentSession.totalTasks}`;
      } else {
        // No active task
        document.getElementById('current-task-info').style.display = 'none';
      }

      // Start timer
      startTimer(result.currentSession.sessionStartTs);
    } else {
      // Show setup UI
      document.getElementById('session-setup').style.display = 'block';
      document.getElementById('session-active').style.display = 'none';

      // Stop timer
      if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
      }
    }
  }

  // Start countdown timer
  function startTimer(sessionStart) {

    // Clear existing timer
    if (timerInterval) {
      clearInterval(timerInterval);
    }

    timerInterval = setInterval(async () => {
      const elapsed = Date.now() - sessionStart;

      document.getElementById('session-duration').textContent = formatTime(elapsed);

      // Update interaction count and task info
      const result = await chrome.storage.local.get(['currentSession', 'currentTask']);
      if (result.currentSession) {
        document.getElementById('session-interactions').textContent = result.currentSession.totalInteractions || 0;

        // Update current task display
        if (result.currentTask) {
          document.getElementById('task-info-title').textContent = `📋 Current Task: ${result.currentTask.taskId}`;
          document.getElementById('current-task-info').style.display = 'block';
          document.getElementById('current-task-number').textContent = `Task ${(result.currentSession.tasks?.length || 0)+1} of ${result.currentSession.totalTasks}`;
        }
      }
    }, 1000);
  }

  // Start session button
  document.getElementById('start-session-btn').addEventListener('click', async () => {
    const participantId = document.getElementById('participant-id-input').value.trim();
    const sessionId = document.getElementById('session-id-input').value.trim();
    const mode = document.getElementById('mode-select').value;

    if (!participantId) {
      return;
    }

    if (mode.startsWith('tabtabgo-jev')) {
      const { jevApiKey } = await chrome.storage.local.get(['jevApiKey']);
      if (!jevApiKey) {
        setJevKeyStatus('Save a Jev API key before starting this mode', '#ef4444');
        return;
      }
    }

    try {
      // Send message to background script to start session
      const response = await chrome.runtime.sendMessage({
        action: 'startSession',
        participantId: participantId,
        sessionId: sessionId,
        mode: mode
      });

      if (response.success) {
        await updateUI();
      }
    } catch (error) {
      console.error('Error starting session:', error);
    }
  });

  // Jev API key (stored locally in this browser only, never in the source code)
  function setJevKeyStatus(text, color = '#6b7280') {
    const status = document.getElementById('jev-key-status');
    status.textContent = text;
    status.style.color = color;
  }

  async function showJevKeyStatus() {
    const { jevApiKey } = await chrome.storage.local.get(['jevApiKey']);
    if (jevApiKey) {
      setJevKeyStatus(`Key saved (…${jevApiKey.slice(-4)})`, '#059669');
    }
  }

  document.getElementById('jev-key-save-btn').addEventListener('click', async () => {
    const input = document.getElementById('jev-key-input');
    const key = input.value.trim();

    if (!key) {
      await chrome.storage.local.remove(['jevApiKey']);
      setJevKeyStatus('Key removed');
      return;
    }

    await chrome.storage.local.set({ jevApiKey: key });
    input.value = '';
    await showJevKeyStatus();
  });

  showJevKeyStatus();

  // End session button
  // document.getElementById('end-session-btn').addEventListener('click', async () => {
  //   try {
  //     const response = await chrome.runtime.sendMessage({
  //       action: 'endSession'
  //     });
  //
  //     if (response.success) {
  //       await updateUI();
  //     }
  //   } catch (error) {
  //     console.error('Error ending session:', error);
  //   }
  // });

  // Complete task button (marks as completed)
  document.getElementById('complete-task-btn').addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'completeTask',
        endState: 'completed'
      });

      if (response.success) {
        await updateUI();
      }
    } catch (error) {
      console.error('Error completing task:', error);
    }
  });

  // Skip task button (marks as skipped)
  document.getElementById('skip-task-btn').addEventListener('click', async () => {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'completeTask',
        endState: 'skipped'
      });

      if (response.success) {
        await updateUI();
      }
    } catch (error) {
      console.error('Error skipping task:', error);
    }
  });

  // How to button - show modal
  const howtoBtn = document.getElementById('howto-btn');
  const howtoModal = document.getElementById('howto-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');

  howtoBtn.addEventListener('click', () => {
    howtoModal.classList.add('show');
  });

  modalCloseBtn.addEventListener('click', () => {
    howtoModal.classList.remove('show');
  });

  // Close modal when clicking outside
  howtoModal.addEventListener('click', (e) => {
    if (e.target === howtoModal) {
      howtoModal.classList.remove('show');
    }
  });

  // Cite button - show citation modal
  const citeBtn = document.getElementById('cite-btn');
  const citeModal = document.getElementById('cite-modal');
  const citeModalCloseBtn = document.getElementById('cite-modal-close-btn');

  citeBtn.addEventListener('click', () => {
    citeModal.classList.add('show');
  });

  citeModalCloseBtn.addEventListener('click', () => {
    citeModal.classList.remove('show');
  });

  // Close citation modal when clicking outside
  citeModal.addEventListener('click', (e) => {
    if (e.target === citeModal) {
      citeModal.classList.remove('show');
    }
  });

  // Initialize UI on load
  updateUI();

  // Listen for storage changes to update UI in real-time
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      updateUI();
    }
  });
})();