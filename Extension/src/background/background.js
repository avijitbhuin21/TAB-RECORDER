const activeRecordings = new Map();
const activeCountdowns = new Map();
const COUNTDOWN_UPDATE_INTERVAL_MS = 250;
const RECORDING_BUFFER_SECONDS = 2;

/**
 * Sends a message to the Chrome runtime with error handling.
 * @param {Object} message - The message object to send
 * @param {string} errorContext - Context description for error logging
 * @returns {Promise} Promise that resolves when message is sent or logs error
 */
function sendMessageSafely(message, errorContext) {
  return chrome.runtime.sendMessage(message).catch((error) => {
    console.error(`[BACKGROUND] ${errorContext}:`, error);
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'start-recording') {
    handleStartRecording(message.tabId, message.customFilename, message.countdownSeconds, message.useBackend || false, sendResponse);
    return true;
  } else if (message.type === 'stop-recording') {
    handleStopRecording(message.tabId, sendResponse);
    return true;
  } else if (message.type === 'get-recording-state') {
    const isRecording = activeRecordings.has(message.tabId);
    const countdown = activeCountdowns.get(message.tabId);
    sendResponse({
      isRecording,
      tabId: message.tabId,
      countdownEndAt: countdown?.endAt || null
    });
    return true;
  } else if (message.type === 'save-recording') {
    handleSaveRecording(message.tabId, message.data, message.filename);
    return true;
  } else if (message.type === 'recording-complete') {
    cleanupRecording(message.tabId);
    sendMessageSafely({
      type: 'recording-stopped',
      tabId: message.tabId
    }, 'Failed to send recording-stopped notification');
    return true;
  } else if (message.type === 'recording-error') {
    if (message.tabId) {
      cleanupRecording(message.tabId);
    }
    sendMessageSafely({
      type: 'recording-error',
      tabId: message.tabId,
      error: message.error
    }, 'Failed to forward recording error to popup');
    return true;
  }
});

/**
 * Starts a countdown timer for a recording session.
 * @param {number} tabId - The tab ID for the recording
 * @param {number} totalSeconds - Duration of countdown in seconds
 */
function startCountdown(tabId, totalSeconds) {
  if (totalSeconds <= 0) return;
  
  stopCountdown(tabId);
  
  const displayEndAt = Date.now() + totalSeconds * 1000;
  const actualEndAt = Date.now() + (totalSeconds + RECORDING_BUFFER_SECONDS) * 1000;
  
  const intervalId = setInterval(() => {
    const displayRemaining = Math.max(0, displayEndAt - Date.now());
    const actualRemaining = Math.max(0, actualEndAt - Date.now());
    
    sendMessageSafely({
      type: 'countdown-tick',
      tabId: tabId,
      remainingMs: displayRemaining
    }, 'Failed to send countdown update to popup');
    
    if (actualRemaining <= 0) {
      stopCountdown(tabId);
      handleStopRecording(tabId, () => {});
    }
  }, COUNTDOWN_UPDATE_INTERVAL_MS);
  
  activeCountdowns.set(tabId, { endAt: displayEndAt, intervalId });
}

/**
 * Stops and clears the countdown timer for a tab.
 * @param {number} tabId - The tab ID to stop countdown for
 */
function stopCountdown(tabId) {
  const countdown = activeCountdowns.get(tabId);
  if (countdown) {
    clearInterval(countdown.intervalId);
    activeCountdowns.delete(tabId);
  }
}
/**
 * Sends a recording error notification to the popup.
 * @param {number} tabId - The tab ID where error occurred
 * @param {string} message - The error message
 */
function sendRecordingError(tabId, message) {
  sendMessageSafely({
    type: 'recording-error',
    tabId: tabId,
    error: message
  }, 'Failed to send recording error notification');
}


/**
 * Cleans up recording state and stops countdown for a tab.
 * @param {number} tabId - The tab ID to cleanup
 */
function cleanupRecording(tabId) {
  activeRecordings.delete(tabId);
  stopCountdown(tabId);
}

/**
 * Ensures an offscreen document exists for media capture.
 * Creates one if it doesn't already exist.
 * @returns {Promise<void>}
 */
async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({});
  const offscreenDocument = existingContexts.find(
    (c) => c.contextType === 'OFFSCREEN_DOCUMENT'
  );

  if (!offscreenDocument) {
    await chrome.offscreen.createDocument({
      url: 'src/offscreen/offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Recording tab audio and video'
    });
  }
}

/**
 * Acquires a media stream ID for tab capture.
 * @param {number} tabId - The tab ID to capture
 * @returns {Promise<string>} The media stream ID
 */
async function acquireMediaStream(tabId) {
  return await chrome.tabCapture.getMediaStreamId({
    targetTabId: tabId
  });
}

/**
 * Handles starting a new recording session.
 * @param {number} tabId - The tab ID to record
 * @param {string|null} customFilename - Optional custom filename for the recording
 * @param {number} countdownSeconds - Optional countdown duration
 * @param {boolean} useBackend - Whether to use backend server for storage
 * @param {Function} sendResponse - Callback to send response to caller
 * @returns {Promise<void>}
 */
async function handleStartRecording(tabId, customFilename, countdownSeconds, useBackend, sendResponse) {
  try {
    if (activeRecordings.has(tabId)) {
      sendResponse({ error: 'Already recording this tab' });
      return;
    }

    await ensureOffscreenDocument();
    const streamId = await acquireMediaStream(tabId);

    activeRecordings.set(tabId, {
      streamId,
      startTime: Date.now(),
      customFilename: customFilename || null,
      useBackend: useBackend
    });

    await chrome.runtime.sendMessage({
      type: 'set-backend-mode',
      target: 'offscreen',
      useBackend: useBackend
    });

    await chrome.runtime.sendMessage({
      type: 'start-recording',
      target: 'offscreen',
      tabId: tabId,
      streamId: streamId,
      name: customFilename || `recording-${tabId}`
    });

    if (countdownSeconds && countdownSeconds > 0) {
      startCountdown(tabId, countdownSeconds);
    }

    sendMessageSafely({
      type: 'recording-started',
      tabId: tabId
    }, 'Failed to send recording-started notification');
    
    sendResponse({ success: true });
  } catch (error) {
    console.error(`[BACKGROUND] Error starting recording for tab ${tabId}:`, error);
    cleanupRecording(tabId);
    sendRecordingError(tabId, error.message);
    sendResponse({ error: error.message });
  }
}

/**
 * Handles stopping an active recording session.
 * @param {number} tabId - The tab ID to stop recording
 * @param {Function} sendResponse - Callback to send response to caller
 * @returns {Promise<void>}
 */
async function handleStopRecording(tabId, sendResponse) {
  try {
    if (!activeRecordings.has(tabId)) {
      sendResponse({ error: 'Not recording this tab' });
      return;
    }

    const recording = activeRecordings.get(tabId);
    stopCountdown(tabId);
    
    await chrome.runtime.sendMessage({
      type: 'stop-recording',
      target: 'offscreen',
      tabId: tabId,
      customFilename: recording.customFilename
    });

    sendResponse({ success: true });
  } catch (error) {
    cleanupRecording(tabId);
    sendRecordingError(tabId, error.message);
    sendResponse({ error: error.message });
  }
}

/**
 * Handles saving a completed recording to disk.
 * @param {number} tabId - The tab ID of the recording
 * @param {string} dataUrl - The data URL of the recording blob
 * @param {string} filename - The filename to save as
 * @returns {Promise<void>}
 */
async function handleSaveRecording(tabId, dataUrl, filename) {
  try {
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    });

    cleanupRecording(tabId);
    sendMessageSafely({
      type: 'recording-stopped',
      tabId: tabId
    }, 'Failed to send recording-stopped notification');
  } catch (error) {
    cleanupRecording(tabId);
    sendRecordingError(tabId, error.message);
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeRecordings.has(tabId)) {
    stopCountdown(tabId);
    handleStopRecording(tabId, () => {});
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (activeRecordings.has(tabId) && changeInfo.url) {
    stopCountdown(tabId);
    handleStopRecording(tabId, () => {});
  }
});