const activeRecordings = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'start-recording') {
    handleStartRecording(message.tabId, message.customFilename, sendResponse);
    return true;
  } else if (message.type === 'stop-recording') {
    handleStopRecording(message.tabId, sendResponse);
    return true;
  } else if (message.type === 'get-recording-state') {
    const isRecording = activeRecordings.has(message.tabId);
    sendResponse({ isRecording, tabId: message.tabId });
    return true;
  } else if (message.type === 'save-recording') {
    handleSaveRecording(message.tabId, message.data, message.filename);
    return true;
  } else if (message.type === 'recording-error') {
    if (message.tabId) {
      activeRecordings.delete(message.tabId);
    }
    chrome.runtime.sendMessage({
      type: 'recording-error',
      tabId: message.tabId,
      error: message.error
    }).catch(() => {});
    return true;
  }
});

async function handleStartRecording(tabId, customFilename, sendResponse) {
  try {
    if (activeRecordings.has(tabId)) {
      sendResponse({ error: 'Already recording this tab' });
      return;
    }

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

    const streamId = await chrome.tabCapture.getMediaStreamId({
      targetTabId: tabId
    });

    activeRecordings.set(tabId, {
      streamId,
      startTime: Date.now(),
      customFilename: customFilename || null
    });

    await chrome.runtime.sendMessage({
      type: 'start-recording',
      target: 'offscreen',
      tabId: tabId,
      streamId: streamId
    });

    chrome.runtime.sendMessage({
      type: 'recording-started',
      tabId: tabId
    }).catch(() => {});
    
    sendResponse({ success: true });
  } catch (error) {
    activeRecordings.delete(tabId);
    chrome.runtime.sendMessage({
      type: 'recording-error',
      tabId: tabId,
      error: error.message
    }).catch(() => {});
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
    
    await chrome.runtime.sendMessage({
      type: 'stop-recording',
      target: 'offscreen',
      tabId: tabId,
      customFilename: recording.customFilename
    });

    sendResponse({ success: true });
  } catch (error) {
    activeRecordings.delete(tabId);
    chrome.runtime.sendMessage({
      type: 'recording-error',
      tabId: tabId,
      error: error.message
    }).catch(() => {});
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
    
    chrome.runtime.sendMessage({
      type: 'recording-stopped',
      tabId: tabId
    }).catch(() => {});
  } catch (error) {
    activeRecordings.delete(tabId);
    chrome.runtime.sendMessage({
      type: 'recording-error',
      tabId: tabId,
      error: error.message
    }).catch(() => {});
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeRecordings.has(tabId)) {
    handleStopRecording(tabId, () => {});
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (activeRecordings.has(tabId) && changeInfo.url) {
    handleStopRecording(tabId, () => {});
  }
});