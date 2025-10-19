const activeRecordings = new Map();
const activeCountdowns = new Map();
// Timing constant for countdown updates
const COUNTDOWN_UPDATE_INTERVAL_MS = 250;


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
    console.log(`[BACKGROUND] Recording completed for tab ${message.tabId}`);
    activeRecordings.delete(message.tabId);
    stopCountdown(message.tabId);
    
    chrome.runtime.sendMessage({
      type: 'recording-stopped',
      tabId: message.tabId
    }).catch((error) => {
      console.error('[BACKGROUND] Failed to send recording-stopped notification:', error);
    });
    return true;
  } else if (message.type === 'recording-error') {
    if (message.tabId) {
      activeRecordings.delete(message.tabId);
      stopCountdown(message.tabId);
    }
    chrome.runtime.sendMessage({
      type: 'recording-error',
      tabId: message.tabId,
      error: message.error
    }).catch((error) => {
      console.error('Failed to forward recording error to popup:', error);
    });
    return true;
  }
});

function startCountdown(tabId, totalSeconds) {
  if (totalSeconds <= 0) return;
  
  stopCountdown(tabId);
  
  const endAt = Date.now() + totalSeconds * 1000;
  const intervalId = setInterval(() => {
    const remaining = Math.max(0, endAt - Date.now());
    
    chrome.runtime.sendMessage({
      type: 'countdown-tick',
      tabId: tabId,
      remainingMs: remaining
    }).catch((error) => {
      console.error('Failed to send countdown update to popup:', error);
    });
    
    if (remaining <= 0) {
      stopCountdown(tabId);
      handleStopRecording(tabId, () => {});
    }
  }, COUNTDOWN_UPDATE_INTERVAL_MS);
  
  activeCountdowns.set(tabId, { endAt, intervalId });
}

function stopCountdown(tabId) {
  const countdown = activeCountdowns.get(tabId);
  if (countdown) {
    clearInterval(countdown.intervalId);
    activeCountdowns.delete(tabId);
  }
}
function sendRecordingError(tabId, message) {
  chrome.runtime.sendMessage({
    type: 'recording-error',
    tabId: tabId,
    error: message
  }).catch((error) => {
    console.error('Failed to send recording error notification:', error);
  });
}


function cleanupRecording(tabId) {
  activeRecordings.delete(tabId);
  stopCountdown(tabId);
}

async function handleStartRecording(tabId, customFilename, countdownSeconds, useBackend, sendResponse) {
  console.log(`[BACKGROUND] Starting recording for tab ${tabId}`);
  console.log(`[BACKGROUND] Filename: ${customFilename || 'default'}`);
  console.log(`[BACKGROUND] Use Backend: ${useBackend}`);
  console.log(`[BACKGROUND] Countdown: ${countdownSeconds || 0} seconds`);
  
  try {
    if (activeRecordings.has(tabId)) {
      console.error(`[BACKGROUND] Tab ${tabId} is already recording`);
      sendResponse({ error: 'Already recording this tab' });
      return;
    }

    const existingContexts = await chrome.runtime.getContexts({});
    const offscreenDocument = existingContexts.find(
      (c) => c.contextType === 'OFFSCREEN_DOCUMENT'
    );

    if (!offscreenDocument) {
      console.log(`[BACKGROUND] Creating offscreen document`);
      await chrome.offscreen.createDocument({
        url: 'src/offscreen/offscreen.html',
        reasons: ['USER_MEDIA'],
        justification: 'Recording tab audio and video'
      });
    } else {
      console.log(`[BACKGROUND] Offscreen document already exists`);
    }

    console.log(`[BACKGROUND] Getting media stream ID for tab ${tabId}`);
    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });
    console.log(`[BACKGROUND] Stream ID obtained: ${streamId}`);

    activeRecordings.set(tabId, {
      streamId,
      startTime: Date.now(),
      customFilename: customFilename || null,
      useBackend: useBackend
    });
    console.log(`[BACKGROUND] Recording state saved for tab ${tabId}`);

    console.log(`[BACKGROUND] Sending set-backend-mode message: ${useBackend}`);
    await chrome.runtime.sendMessage({
      type: 'set-backend-mode',
      target: 'offscreen',
      useBackend: useBackend
    });

    console.log(`[BACKGROUND] Sending start-recording message to offscreen`);
    await chrome.runtime.sendMessage({
      type: 'start-recording',
      target: 'offscreen',
      tabId: tabId,
      streamId: streamId,
      name: customFilename || `recording-${tabId}`
    });

    if (countdownSeconds && countdownSeconds > 0) {
      console.log(`[BACKGROUND] Starting countdown: ${countdownSeconds} seconds`);
      startCountdown(tabId, countdownSeconds);
    }

    console.log(`[BACKGROUND] Sending recording-started notification`);
    chrome.runtime.sendMessage({
      type: 'recording-started',
      tabId: tabId
    }).catch((error) => {
      console.error('[BACKGROUND] Failed to send recording-started notification:', error);
    });
    
    console.log(`[BACKGROUND] ✅ Recording started successfully for tab ${tabId}`);
    sendResponse({ success: true });
  } catch (error) {
    console.error(`[BACKGROUND] ❌ Error starting recording:`, error);
    activeRecordings.delete(tabId);
    stopCountdown(tabId);
    sendRecordingError(tabId, error.message);
    sendResponse({ error: error.message });
  }
}

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
    activeRecordings.delete(tabId);
    stopCountdown(tabId);
    sendRecordingError(tabId, error.message);
    sendResponse({ error: error.message });
  }
}

async function handleSaveRecording(tabId, dataUrl, filename) {
  try {
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    });

    activeRecordings.delete(tabId);
    stopCountdown(tabId);
    
    chrome.runtime.sendMessage({
      type: 'recording-stopped',
      tabId: tabId
    }).catch((error) => {
      console.error('Failed to send recording-stopped notification:', error);
    });
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