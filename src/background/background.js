let isRecording = false;
let recordingTabId = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'start-recording') {
    handleStartRecording(message.tabId, sendResponse);
    return true;
  } else if (message.type === 'stop-recording') {
    handleStopRecording(sendResponse);
    return true;
  } else if (message.type === 'get-recording-state') {
    sendResponse({ isRecording, recordingTabId });
    return true;
  } else if (message.type === 'save-recording') {
    handleSaveRecording(message.data, message.filename);
    return true;
  } else if (message.type === 'recording-error') {
    isRecording = false;
    recordingTabId = null;
    chrome.runtime.sendMessage({
      type: 'recording-error',
      error: message.error
    }).catch(() => {});
    return true;
  }
});

async function handleStartRecording(tabId, sendResponse) {
  try {
    if (isRecording) {
      sendResponse({ error: 'Already recording' });
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

    isRecording = true;
    recordingTabId = tabId;

    await chrome.runtime.sendMessage({
      type: 'start-recording',
      target: 'offscreen',
      streamId: streamId
    });

    chrome.runtime.sendMessage({ type: 'recording-started' }).catch(() => {});
    
    sendResponse({ success: true });
  } catch (error) {
    isRecording = false;
    recordingTabId = null;
    chrome.runtime.sendMessage({ 
      type: 'recording-error', 
      error: error.message 
    }).catch(() => {});
    sendResponse({ error: error.message });
  }
}

async function handleStopRecording(sendResponse) {
  try {
    if (!isRecording) {
      sendResponse({ error: 'Not recording' });
      return;
    }

    await chrome.runtime.sendMessage({
      type: 'stop-recording',
      target: 'offscreen'
    });

    sendResponse({ success: true });
  } catch (error) {
    isRecording = false;
    recordingTabId = null;
    chrome.runtime.sendMessage({
      type: 'recording-error',
      error: error.message
    }).catch(() => {});
    sendResponse({ error: error.message });
  }
}

async function handleSaveRecording(dataUrl, filename) {
  try {
    await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    });

    isRecording = false;
    recordingTabId = null;
    
    chrome.runtime.sendMessage({ type: 'recording-stopped' }).catch(() => {});
  } catch (error) {
    isRecording = false;
    recordingTabId = null;
    chrome.runtime.sendMessage({
      type: 'recording-error',
      error: error.message
    }).catch(() => {});
  }
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === recordingTabId && isRecording) {
    handleStopRecording(() => {});
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === recordingTabId && isRecording && changeInfo.url) {
    handleStopRecording(() => {});
  }
});