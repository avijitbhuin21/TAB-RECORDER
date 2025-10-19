# Extension-Backend Integration Plan

## 🎯 Objective

Implement dual-mode functionality in the Chrome Extension to support both standalone operation and backend-integrated recording, enabling flexible deployment while maintaining full feature compatibility.

---

## 📋 Current State vs Target State

### Current Architecture
```
Extension → MediaRecorder → Local Memory Arrays → Chrome Downloads API → Local File
Backend → (Running independently but not integrated)
```

### Target Dual-Mode Architecture

#### Mode 1 - Standalone (Backend Disconnected)
```
Extension → MediaRecorder → Chunks → Local Memory → Blob → Chrome Downloads API → Local File
(Existing functionality preserved - immediate download on stop)
```

#### Mode 2 - Backend Connected (Backend Available)
```
Extension → MediaRecorder → Chunks → Base64 Encode → POST to Backend API
Backend → Decode → FileWriter Service → Incremental Disk Write → .webm File
(Streaming mode - no local memory accumulation)
```

### Mode Detection Flow
```
User Opens Extension Popup
    ↓
Automatic Health Check → GET localhost:8080/health
    ↓
Response Validation → Check for 200 OK + Valid JSON Structure: {"status": "ok", "time": "..."}
    ↓
Set Connection State → isConnected = true/false
    ↓
UI Update → Display connection status indicator
    ↓
User Clicks Start Recording
    ↓
Recording Mode Selection:
  - If isConnected = true → Use Backend Streaming (Mode 2)
  - If isConnected = false → Use Local Download (Mode 1)
```

---

## 🔧 Required Changes

### 1. **File: `src/popup/popup.html`** (UI Updates)

#### Required Changes:

**Step 1.1: Remove Port Input Field**
- Remove the port input field from the UI
- Port is hardcoded to 8080 (backend always runs on localhost:8080)
- No need for user configuration

**Step 1.2: Add Connection UI Section**
Add after the quality selector, before start button:

```html
<div class="connection-section">
  <button id="checkStatusBtn" class="status-btn">Check Server Status</button>
  <div id="connectionStatus" class="status-indicator">
    <span class="status-dot"></span>
    <span class="status-text">Not Connected</span>
  </div>
  <button id="downloadExeBtn" class="download-btn">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
      <polyline points="7 10 12 15 17 10"></polyline>
      <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
    Download Backend Executable
  </button>
</div>
```

---

### 2. **File: `src/assets/styles/popup.css`** (Styling for New Elements)

#### Required Changes:

**Step 2.1: Add Styles for Connection Section**

```css
.connection-section {
  margin: 12px 0;
  padding: 12px;
  background: #f5f5f5;
  border-radius: 6px;
}

.status-btn {
  width: 100%;
  padding: 10px 16px;
  background: #2196F3;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background 0.2s;
}

.status-btn:hover {
  background: #1976D2;
}

.status-btn:disabled {
  background: #90CAF9;
  cursor: not-allowed;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0;
  padding: 8px;
  background: white;
  border-radius: 4px;
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ccc;
  transition: background 0.3s;
}

.status-dot.connected {
  background: #4CAF50;
  box-shadow: 0 0 8px rgba(76, 175, 80, 0.5);
}

.status-dot.disconnected {
  background: #f44336;
}

.status-text {
  font-size: 13px;
  color: #333;
  font-weight: 500;
}

.download-btn {
  width: 100%;
  padding: 10px 16px;
  background: #4CAF50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background 0.2s;
}

.download-btn:hover {
  background: #388E3C;
}

.download-btn svg {
  flex-shrink: 0;
}
```

---

### 3. **File: `src/popup/popup.js`** (Connection Management & Dual-Mode Logic)

#### Required Changes:

**Step 3.1: Add Connection State Management**

Add at the top of the file:

```javascript
let isConnected = false;
const BACKEND_PORT = '8080';
const BACKEND_BASE_URL = `http://localhost:${BACKEND_PORT}/api`;
const BACKEND_HEALTH_URL = `http://localhost:${BACKEND_PORT}/health`;
const EXECUTABLE_DOWNLOAD_URL = 'https://via.placeholder.com/150';
```

**Step 3.2: Implement Health Check Function**

```javascript
async function checkHealth() {
  try {
    const response = await fetch(BACKEND_HEALTH_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok && response.status === 200) {
      const data = await response.json();
      
      if (data.status && data.status === 'ok') {
        isConnected = true;
        updateConnectionUI(true);
        showToast('Backend connected successfully');
        return true;
      }
    }
    
    isConnected = false;
    updateConnectionUI(false);
    showToast('Backend not responding', 'error');
    return false;
    
  } catch (error) {
    console.error('Health check failed:', error);
    isConnected = false;
    updateConnectionUI(false);
    return false;
  }
}

function updateConnectionUI(connected) {
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  
  if (connected) {
    statusDot.classList.add('connected');
    statusDot.classList.remove('disconnected');
    statusText.textContent = 'Connected - Backend Mode Active';
  } else {
    statusDot.classList.add('disconnected');
    statusDot.classList.remove('connected');
    statusText.textContent = 'Disconnected - Standalone Mode';
  }
}
```

**Step 3.3: Add Event Listeners for New Buttons**

Add in the initialization section:

```javascript
document.getElementById('checkStatusBtn').addEventListener('click', async () => {
  const btn = document.getElementById('checkStatusBtn');
  btn.disabled = true;
  btn.textContent = 'Checking...';
  
  await checkHealth();
  
  btn.disabled = false;
  btn.textContent = 'Check Server Status';
});

document.getElementById('downloadExeBtn').addEventListener('click', () => {
  chrome.downloads.download({
    url: EXECUTABLE_DOWNLOAD_URL,
    filename: 'chrome-recorder-backend.exe',
    saveAs: true
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      showToast('Download failed: ' + chrome.runtime.lastError.message, 'error');
    } else {
      showToast('Download started successfully');
    }
  });
});
```

**Step 3.4: Update initializePopup Function**

Modify to include automatic health check:

```javascript
async function initializePopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;

  const savedFilename = await loadSavedFilename(currentTabId);
  if (savedFilename) filenameInput.value = savedFilename;

  const savedCountdown = await loadSavedCountdown(currentTabId);
  countHours.value = savedCountdown.hours;
  countMinutes.value = savedCountdown.minutes;
  countSeconds.value = savedCountdown.seconds;
  updateCountdownPreview();

  await populateQualities();
  
  await checkHealth();

  try {
    chrome.runtime.sendMessage({ type: 'get-recording-state', tabId: currentTabId }, (response) => {
      if (response && response.isRecording) {
        updateRecordingUI(true);
        startElapsedTimer();
        setCountdownInputsDisabled(true);
        if (response.countdownEndAt) {
          const remainingMs = Math.max(0, response.countdownEndAt - Date.now());
          countdownDisplay.textContent = formatHMS(Math.floor(remainingMs / 1000));
        }
      }
    });
  } catch {}
}
```

**Step 3.5: Update startRecording Function**

Modify to pass connection state to background:

```javascript
async function startRecording() {
  try {
    startBtn.disabled = true;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const customFilename = filenameInput.value.trim();
    const quality = qualitySelect.value;
    const countdownSeconds = countdownTotalSecondsFromInputs();
    
    const response = await chrome.runtime.sendMessage({
      type: 'start-recording',
      tabId: tab.id,
      customFilename,
      quality,
      countdownSeconds,
      useBackend: isConnected
    });
    
    if (response && response.error) {
      showToast(String(response.error), 'error');
      startBtn.disabled = false;
    } else {
      const mode = isConnected ? 'Backend' : 'Standalone';
      showToast(`Recording started in ${mode} mode`);
      countHours.disabled = true;
      countMinutes.disabled = true;
      countSeconds.disabled = true;
    }
  } catch (e) {
    showToast('Failed to start recording', 'error');
    startBtn.disabled = false;
  }
}
```

---

### 4. **File: `src/background/background.js`** (Mode Coordination)

#### Required Changes:

**Step 4.1: Update handleStartRecording Function**

Modify to pass useBackend flag to offscreen:

```javascript
async function handleStartRecording(tabId, customFilename, countdownSeconds, useBackend, sendResponse) {
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

    chrome.runtime.sendMessage({
      type: 'recording-started',
      tabId: tabId
    }).catch((error) => {
      console.error('Failed to send recording-started notification:', error);
    });
    
    sendResponse({ success: true });
  } catch (error) {
    activeRecordings.delete(tabId);
    stopCountdown(tabId);
    sendRecordingError(tabId, error.message);
    sendResponse({ error: error.message });
  }
}
```

**Step 4.2: Update Message Listener**

Update the start-recording handler:

```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'start-recording') {
    handleStartRecording(
      message.tabId, 
      message.customFilename, 
      message.countdownSeconds,
      message.useBackend || false,
      sendResponse
    );
    return true;
  }
  
});
```

**Step 4.3: Keep handleSaveRecording for Standalone Mode**

DO NOT delete this function - it's needed for Mode 1:

```javascript
async function handleSaveRecording(tabId, dataUrl, filename) {
  try {
    const downloadId = await chrome.downloads.download({
      url: dataUrl,
      filename: filename,
      saveAs: false
    });
    console.log(`Recording saved: ${filename} (Download ID: ${downloadId})`);
  } catch (error) {
    console.error('Failed to save recording:', error);
    sendRecordingError(tabId, `Failed to save recording: ${error.message}`);
  }
}
```

---

### 5. **File: `src/offscreen/offscreen.js`** (Dual-Mode Recording Logic)

#### Required Changes:

**Step 5.1: Add Mode Detection Variables**

At the top of the file:

```javascript
let useBackendMode = false;
const backendPort = '8080';
const backendBaseUrl = `http://localhost:${backendPort}/api`;

const activeRecorders = new Map();
const activeStreams = new Map();
const recordingMetadata = new Map();
const recordedChunksMap = new Map();
```

**Step 5.2: Add Backend Mode Message Handler**

```javascript
chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === 'set-backend-mode') {
    useBackendMode = message.useBackend;
    console.log(`Recording mode set to: ${useBackendMode ? 'Backend' : 'Standalone'}`);
    return;
  }
  
});
```

**Step 5.3: Implement Backend Chunk Streaming Function**

```javascript
async function sendChunkToBackend(tabId, name, timestamp, chunk) {
  try {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onloadend = async () => {
        const base64data = reader.result.split(',')[1];
        
        try {
          const response = await fetch(`${backendBaseUrl}/recordings`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: name,
              tabId: tabId,
              timestamp: timestamp,
              data: base64data,
              status: 'stream'
            })
          });

          if (!response.ok) {
            throw new Error(`Backend responded with ${response.status}`);
          }
          
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(chunk);
    });
  } catch (error) {
    console.error(`Failed to send chunk for tab ${tabId}:`, error);
    sendRecordingError(tabId, `Failed to send recording data: ${error.message}`);
    throw error;
  }
}
```

**Step 5.4: Implement Dual-Mode ondataavailable Handler**

```javascript
mediaRecorder.ondataavailable = async (event) => {
  if (event.data.size > 0) {
    const metadata = recordingMetadata.get(tabId);
    if (!metadata) return;
    
    if (useBackendMode) {
      try {
        await sendChunkToBackend(
          tabId,
          metadata.name,
          metadata.timestamp,
          event.data
        );
      } catch (error) {
        console.error('Backend streaming failed, stopping recording:', error);
        mediaRecorder.stop();
      }
    } else {
      if (!recordedChunksMap.has(tabId)) {
        recordedChunksMap.set(tabId, []);
      }
      recordedChunksMap.get(tabId).push(event.data);
    }
  }
};
```

**Step 5.5: Implement Dual-Mode onstop Handler**

```javascript
mediaRecorder.onstop = async () => {
  try {
    if (useBackendMode) {
      const response = await fetch(`${backendBaseUrl}/recordings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: recordingMetadata.get(tabId)?.name || '',
          tabId: tabId,
          timestamp: recordingMetadata.get(tabId)?.timestamp || Date.now(),
          data: '',
          status: 'stopped'
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to stop recording: ${response.status}`);
      }

      chrome.runtime.sendMessage({
        type: 'recording-complete',
        tabId: tabId
      }).catch(err => console.error('Failed to notify completion:', err));
      
    } else {
      const chunks = recordedChunksMap.get(tabId) || [];
      if (chunks.length === 0) {
        throw new Error('No recorded data available');
      }

      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const filename = recordingMetadata.get(tabId)?.name || `recording-${tabId}-${Date.now()}.webm`;

      chrome.runtime.sendMessage({
        type: 'save-recording',
        tabId: tabId,
        data: url,
        filename: filename
      }).catch(err => console.error('Failed to save recording:', err));

      recordedChunksMap.delete(tabId);
    }

    const stream = activeStreams.get(tabId);
    cleanupStream(stream);
    activeStreams.delete(tabId);
    recordingMetadata.delete(tabId);
    activeRecorders.delete(tabId);

  } catch (error) {
    console.error('Failed to finalize recording:', error);
    sendRecordingError(tabId, `Failed to finalize recording: ${error.message}`);
  }
};
```

**Step 5.6: Update Start Recording Logic**

```javascript
if (message.type === 'start-recording') {
  const tabId = message.tabId;
  const name = message.name || `recording-${tabId}`;
  const timestamp = Date.now();
  
  try {
    
    activeStreams.set(tabId, stream);
    
    recordingMetadata.set(tabId, {
      name: name,
      timestamp: timestamp
    });

    const options = { mimeType: 'video/webm; codecs=vp8,opus' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'video/webm';
    }

    const mediaRecorder = new MediaRecorder(stream, options);
    activeRecorders.set(tabId, mediaRecorder);

    mediaRecorder.start(1000);

    console.log(`Recording started in ${useBackendMode ? 'Backend' : 'Standalone'} mode for tab ${tabId}`);

  } catch (error) {
    sendRecordingError(tabId, error.message);
  }
}
```

---

## 📊 Data Flow Diagrams

### Mode 1 - Standalone (Backend Disconnected)

```
┌─────────────────────────────────────────────────────────────┐
│ USER INTERACTION                                             │
├─────────────────────────────────────────────────────────────┤
│  Opens Popup → Automatic Health Check → Backend Not Found   │
│  Clicks Start → isConnected = false → Mode 1 Selected       │
└─────────────────────────────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────┐
│ EXTENSION (Chrome Browser)                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Popup.js                                                    │
│    ↓ Sends { useBackend: false }                            │
│                                                              │
│  Background.js                                               │
│    ↓ Creates offscreen document                             │
│    ↓ Gets stream ID from tabCapture                         │
│    ↓ Sends { useBackend: false } to Offscreen.js            │
│                                                              │
│  Offscreen.js                                                │
│    ↓ Sets useBackendMode = false                            │
│    ↓ Gets media stream                                      │
│    ↓ Creates MediaRecorder                                  │
│    ↓ On each data chunk (every 1 second):                   │
│         ↓ Store chunk in recordedChunksMap                  │
│    ↓ On stop:                                               │
│         ↓ Create Blob from all chunks                       │
│         ↓ Create Object URL                                 │
│         ↓ Send to Background.js                             │
│                                                              │
│  Background.js                                               │
│    ↓ Receives save-recording message                        │
│    ↓ Calls chrome.downloads.download()                      │
│    ↓ Triggers browser download dialog                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                             │
                             ↓
                    💾 Local Download File
```

### Mode 2 - Backend Connected

```
┌─────────────────────────────────────────────────────────────┐
│ USER INTERACTION                                             │
├─────────────────────────────────────────────────────────────┤
│  Opens Popup → Automatic Health Check → Backend Found       │
│  Clicks Start → isConnected = true → Mode 2 Selected        │
└─────────────────────────────────────────────────────────────┘
                             │
                             ↓
┌─────────────────────────────────────────────────────────────┐
│ EXTENSION (Chrome Browser)                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Popup.js                                                    │
│    ↓ Sends { useBackend: true }                             │
│                                                              │
│  Background.js                                               │
│    ↓ Creates offscreen document                             │
│    ↓ Gets stream ID from tabCapture                         │
│    ↓ Sends { useBackend: true } to Offscreen.js             │
│                                                              │
│  Offscreen.js                                                │
│    ↓ Sets useBackendMode = true                             │
│    ↓ Gets media stream                                      │
│    ↓ Creates MediaRecorder                                  │
│    ↓ On each data chunk (every 1 second):                   │
│         ↓ Convert to base64                                 │
│         ↓ POST to Backend /api/recordings                   │
│    ↓ On stop:                                               │
│         ↓ Send final POST with status: 'stopped'            │
│         ↓ No local storage of chunks                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                             │
                             ↓ HTTP POST
                             │
┌─────────────────────────────────────────────────────────────┐
│ BACKEND (Go Server - localhost:8080)                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  /api/recordings endpoint                                   │
│    ↓ Receives JSON: {name, tabId, timestamp, data, status}  │
│    ↓ Decodes base64 data                                    │
│    ↓ Calls RecorderService.HandleRecording()                │
│                                                              │
│  RecorderService                                             │
│    ↓ Routes to FileWriterService.WriteChunk()               │
│                                                              │
│  FileWriterService                                           │
│    ↓ Gets/creates file handle (lazy)                        │
│    ↓ Writes chunk to buffered writer                        │
│    ↓ Flushes to disk                                        │
│                                                              │
│  📁 ./recordings/recording-name_123_1234567890.webm         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ Testing Checklist

### Pre-Testing Setup
- [ ] Backend server is running (`cd Backend; go run main.go`)
- [ ] Backend confirms server on port 8080
- [ ] Extension loaded in Chrome (`chrome://extensions`, Developer mode, Load unpacked)

### Mode 1 Testing (Standalone - Backend Disconnected)

#### Test 1.1: Basic Standalone Recording
- [ ] Ensure Backend is NOT running
- [ ] Open Extension popup
- [ ] Verify connection status shows "Disconnected - Standalone Mode"
- [ ] Enter filename "standalone-test"
- [ ] Click "Start Recording"
- [ ] Verify toast shows "Recording started in Standalone mode"
- [ ] Wait 5 seconds
- [ ] Click "Stop Recording"
- [ ] Verify browser download dialog appears
- [ ] Verify file downloads to default downloads folder
- [ ] Open .webm file and verify it plays

#### Test 1.2: Standalone Mode with Countdown
- [ ] Backend still NOT running
- [ ] Set countdown to 00:00:10
- [ ] Start recording
- [ ] Verify recording auto-stops after 10 seconds
- [ ] Verify file downloads automatically

#### Test 1.3: Standalone Multi-Tab Recording
- [ ] Open 3 different tabs
- [ ] Start recording in each tab (different filenames)
- [ ] Verify all 3 recordings work independently
- [ ] Stop all recordings
- [ ] Verify 3 separate downloads

### Mode 2 Testing (Backend Connected)

#### Test 2.1: Backend Connection Check
- [ ] Start Backend server
- [ ] Open Extension popup
- [ ] Click "Check Server Status"
- [ ] Verify connection status changes to "Connected - Backend Mode Active"
- [ ] Verify green dot indicator appears

#### Test 2.2: Basic Backend Recording
- [ ] Backend running and connected
- [ ] Enter filename "backend-test"
- [ ] Click "Start Recording"
- [ ] Verify toast shows "Recording started in Backend mode"
- [ ] Wait 5 seconds
- [ ] Click "Stop Recording"
- [ ] Check Backend console logs for:
  - "Started recording: ./recordings/backend-test_XXX_YYY.webm"
  - Multiple chunk write logs
  - "Recording stopped for tab XXX"
- [ ] Verify file exists in `Backend/recordings/` folder
- [ ] Open .webm file and verify it plays
- [ ] Verify NO browser download occurred (Backend mode)

#### Test 2.3: Backend Multi-Tab Recording
- [ ] Backend running and connected
- [ ] Open 3 different tabs
- [ ] Start recording in Tab 1 (filename: "backend-tab1")
- [ ] Switch to Tab 2, start recording (filename: "backend-tab2")
- [ ] Switch to Tab 3, start recording (filename: "backend-tab3")
- [ ] Backend should show 3 active recordings in logs
- [ ] Stop all recordings in any order
- [ ] Verify 3 separate .webm files exist in `Backend/recordings/`
- [ ] Verify all files play correctly

#### Test 2.4: Backend Long Recording (Memory Test)
- [ ] Start recording in Backend mode
- [ ] Let run for 2+ minutes
- [ ] Monitor Chrome Task Manager (Shift+Esc)
- [ ] Verify Extension memory stays stable (not increasing)
- [ ] Stop recording
- [ ] Verify file is complete and plays

### Mode Switching Testing

#### Test 3.1: Disconnect During Recording
- [ ] Start Backend server
- [ ] Verify connection (Connected status)
- [ ] Start a recording in Backend mode
- [ ] Stop Backend server (Ctrl+C in terminal)
- [ ] Recording should fail gracefully
- [ ] Verify Extension shows error toast
- [ ] Click "Check Server Status"
- [ ] Verify status changes to Disconnected
- [ ] Start new recording (should work in Standalone mode)
- [ ] Verify local download works

#### Test 3.2: Reconnect Scenario
- [ ] Start with Backend NOT running
- [ ] Verify Disconnected status
- [ ] Start recording (Standalone mode)
- [ ] Complete recording successfully (local download)
- [ ] Start Backend server
- [ ] Click "Check Server Status"
- [ ] Verify Connected status
- [ ] Start new recording
- [ ] Verify it uses Backend mode (no download, file in Backend folder)

#### Test 3.3: Health Check Validation
- [ ] Backend running
- [ ] Click "Check Server Status"
- [ ] Verify response structure: `{"status": "ok", "time": "..."}`
- [ ] Verify 200 OK status code
- [ ] Stop Backend
- [ ] Click "Check Server Status"
- [ ] Verify connection fails (network error or non-200 response)

### UI Testing

#### Test 4.1: Download Executable Button
- [ ] Click "Download Backend Executable" button
- [ ] Verify download starts (placeholder URL currently)
- [ ] Verify toast shows "Download started successfully"
- [ ] Note: Actual executable URL needs to be updated later

#### Test 4.2: Port Configuration (Removed)
- [ ] Verify port input field is NOT visible in UI
- [ ] Confirm hardcoded port 8080 is used
- [ ] Backend should always run on localhost:8080

### Error Scenarios

#### Test 5.1: Invalid Backend Response
- [ ] Modify backend to return invalid health response
- [ ] Click "Check Server Status"
- [ ] Verify connection fails
- [ ] Verify Disconnected status

#### Test 5.2: Backend Returns Non-200 Status
- [ ] Configure backend to return 500 error
- [ ] Start recording
- [ ] Verify appropriate error handling

#### Test 5.3: Network Timeout
- [ ] Configure firewall to block localhost:8080
- [ ] Click "Check Server Status"
- [ ] Verify timeout is handled gracefully

---

## 🚨 Common Issues & Solutions

### Issue 1: "Connection status not updating"
**Cause**: Health check not being called
**Solution**: 
1. Check browser console for errors
2. Verify `checkHealth()` is called in `initializePopup()`
3. Verify BACKEND_HEALTH_URL is correct: `http://localhost:8080/health`

### Issue 2: "Recording starts in wrong mode"
**Cause**: `isConnected` flag not set correctly
**Solution**:
1. Add logging: `console.log('isConnected:', isConnected);` before starting recording
2. Verify health check sets `isConnected = true` on success
3. Check network tab for health endpoint response

### Issue 3: "Backend mode recording but getting local download"
**Cause**: `useBackendMode` not set in offscreen.js
**Solution**:
1. Check `set-backend-mode` message is being sent from background.js
2. Add logging in offscreen.js: `console.log('useBackendMode:', useBackendMode);`
3. Verify message listener in offscreen.js is receiving the flag

### Issue 4: "Standalone mode not downloading file"
**Cause**: `handleSaveRecording` was deleted or `save-recording` message not sent
**Solution**:
1. Verify `handleSaveRecording` function exists in background.js
2. Check offscreen.js sends `save-recording` message when `useBackendMode = false`
3. Check browser console for download API errors

### Issue 5: "Health check always fails even when Backend is running"
**Cause**: CORS or network connectivity issues
**Solution**:
1. Test Backend directly: `curl http://localhost:8080/health`
2. Should return: `{"status":"ok","time":"..."}`
3. Check Backend logs for CORS headers
4. Verify Backend CORS middleware allows Extension origin

---

## 📝 Implementation Timeline

| Phase | Task | Estimated Time | Dependencies |
|-------|------|----------------|--------------|
| 1 | Update popup HTML (add buttons, remove port input) | 30 minutes | None |
| 2 | Update popup CSS (connection UI styling) | 30 minutes | Phase 1 |
| 3 | Implement health check in popup.js | 45 minutes | Phase 1 |
| 4 | Update popup.js for dual-mode logic | 1 hour | Phase 3 |
| 5 | Update background.js to pass mode flag | 30 minutes | Phase 4 |
| 6 | Implement dual-mode logic in offscreen.js | 2 hours | Phase 5 |
| 7 | Basic Mode 1 (Standalone) testing | 30 minutes | Phase 6 |
| 8 | Basic Mode 2 (Backend) testing | 30 minutes | Phase 6 |
| 9 | Mode switching testing | 45 minutes | Phases 7-8 |
| 10 | Error handling testing | 45 minutes | Phase 9 |
| 11 | Multi-tab testing (both modes) | 1 hour | Phases 7-8 |

**Total Estimated Time**: 8.5 hours

---

## 🎯 Success Criteria

The dual-mode implementation is complete and successful when:

### Mode 1 (Standalone) Criteria
✅ Extension works without Backend running
✅ Recording saves chunks in local memory
✅ Stop triggers immediate browser download
✅ All existing features work (countdown, custom filename, quality)
✅ No errors when Backend is not available

### Mode 2 (Backend Connected) Criteria
✅ Health check correctly detects Backend availability
✅ Extension streams chunks to Backend via HTTP POST
✅ No local memory accumulation during recording
✅ Backend writes chunks incrementally to disk
✅ Recordings saved as .webm files in Backend recordings folder
✅ No browser download occurs (file stays on Backend)

### Mode Switching Criteria
✅ Automatic mode detection on popup open
✅ Manual status check button works correctly
✅ Connection UI updates properly
✅ Can switch from Standalone to Backend mode by starting Backend
✅ Graceful fallback to Standalone if Backend disconnects during operation

### UI Criteria
✅ Port input field removed from UI
✅ "Check Server Status" button functional
✅ Connection status indicator accurate (green dot = connected, red = disconnected)
✅ "Download Executable" button present (placeholder URL for now)
✅ Status text clearly indicates current mode

### Testing Criteria
✅ All 15+ test cases pass
✅ Multi-tab recording works in both modes
✅ Error scenarios handled gracefully
✅ Long recordings stable in both modes
✅ No memory leaks in either mode

---

## 🔄 Post-Implementation Enhancements (Future)

After basic dual-mode functionality works, consider:

### Phase 2 Enhancements
- [ ] Update EXECUTABLE_DOWNLOAD_URL with actual executable download link
- [ ] Add automatic backend detection on extension install
- [ ] Implement reconnection with exponential backoff
- [ ] Add "Mode" indicator on recording button
- [ ] Show bandwidth/transfer stats for Backend mode

### Phase 3 Enhancements
- [ ] Add progress bar showing bytes sent to Backend
- [ ] Display active recordings list from Backend in Extension popup
- [ ] Implement chunk buffering (batch send for efficiency)
- [ ] Add recording preview/playback in Extension
- [ ] Implement session recovery (resume recording after disconnect)

### Phase 4 Enhancements
- [ ] Add metadata (tab title, URL) to recordings
- [ ] Implement recording quality/bitrate control per mode
- [ ] Add pause/resume recording capability
- [ ] Implement local cache + sync for intermittent connectivity
- [ ] Add Backend authentication/API key support

---

## 📚 Related Files

### Extension Files (Need Modification)
- `src/popup/popup.html` - Add connection UI elements
- `src/assets/styles/popup.css` - Style connection section
- `src/popup/popup.js` - Implement health check and mode logic
- `src/background/background.js` - Pass mode flag, keep handleSaveRecording
- `src/offscreen/offscreen.js` - Implement dual-mode recording logic

### Backend Files (No Changes Needed)
- `Backend/main.go` - Server setup (port 8080, CORS enabled)
- `Backend/handlers/health.go` - Health check endpoint
- `Backend/handlers/recordings.go` - /api/recordings endpoint
- `Backend/handlers/middleware.go` - CORS middleware
- `Backend/services/filewriter.go` - Disk writing logic
- `Backend/services/recorder.go` - Recording state management
- `Backend/models/recording.go` - Data structures

---

## 🎬 Getting Started

To implement this dual-mode functionality:

1. **Backup Current Extension**:
   ```powershell
   Copy-Item Extension Extension_backup -Recurse
   ```

2. **Make changes in this order**:
   - Start with popup.html (UI changes)
   - Then popup.css (styling)
   - Then popup.js (health check and connection logic)
   - Then background.js (mode flag passing)
   - Finally offscreen.js (dual-mode recording logic)

3. **Test after each file change**:
   - Reload Extension in Chrome after each change
   - Test basic functionality after each phase
   - Don't move to next file until current works

4. **Use Browser DevTools**:
   - Check Extension console (popup.html)
   - Check Background page console (chrome://extensions → Inspect views: service worker)
   - Check offscreen document console (will appear when recording)
   - Monitor Network tab for health check and API calls

5. **Use Backend logs for Backend mode debugging**:
   - Backend will log all received chunks
   - Check Backend console for errors
   - Backend logs will show file creation/closing

---

## 🔍 Key Differences from Original Plan

### What Changed:
1. **Port Configuration**: Port is now hardcoded to 8080, removed user input field
2. **UI Updates**: Added "Check Server Status" button and connection indicator
3. **Download Button**: Added executable download button with placeholder URL
4. **Dual-Mode Support**: Extension now supports both Standalone and Backend modes
5. **Mode 1 Preservation**: Original local download functionality is preserved
6. **Automatic Detection**: Health check runs automatically on popup open
7. **Graceful Fallback**: System falls back to Standalone if Backend unavailable

### What Stayed the Same:
1. **Backend API**: No changes to Backend implementation
2. **Recording Quality**: All quality settings still work
3. **Countdown Timer**: Countdown feature works in both modes
4. **Multi-Tab Support**: Can record multiple tabs simultaneously
5. **File Format**: Still produces .webm files

---

**This plan provides complete dual-mode functionality while preserving existing features and ensuring graceful degradation when the Backend is unavailable.**