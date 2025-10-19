# Extension-Backend Integration Plan

## 🎯 Objective

Integrate the Chrome Extension with the Go Backend server to enable streaming recording data directly to the backend, eliminating memory bottlenecks and enabling centralized recording management.

---

## 📋 Current State vs Target State

### Current (Broken) Architecture
```
Extension → MediaRecorder → Local Memory Arrays → Chrome Downloads API → Local File
Backend → (Running but receives nothing)
```

### Target (Correct) Architecture
```
Extension → MediaRecorder → Chunks → Base64 Encode → POST to Backend API
Backend → Decode → FileWriter Service → Incremental Disk Write → .webm File
```

---

## 🔧 Required Changes

### 1. **File: `src/offscreen/offscreen.js`** (CRITICAL - Complete Rewrite)

#### Current Issues:
- Lines 1-4: Local storage of chunks (defeats purpose of backend)
- Lines 60-67: `ondataavailable` stores chunks in memory
- Lines 69-107: `onstop` creates blob and downloads locally

#### Required Changes:

**Step 1.1: Add Backend Configuration**
```javascript
let backendPort = '8080';
let backendBaseUrl = `http://localhost:${backendPort}/api`;

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === 'set-backend-port') {
    backendPort = message.port;
    backendBaseUrl = `http://localhost:${backendPort}/api`;
    return;
  }
  // ... rest of message handling
});
```

**Step 1.2: Remove Local Storage Maps**
```javascript
// DELETE THESE LINES (1-4):
// const activeRecorders = new Map();
// const activeStreams = new Map();
// const recordedChunksMap = new Map();
// const customFilenames = new Map();

// REPLACE WITH:
const activeRecorders = new Map();
const activeStreams = new Map();
const recordingMetadata = new Map();
```

**Step 1.3: Implement Chunk Streaming Function**
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

**Step 1.4: Rewrite `ondataavailable` Handler**
```javascript
mediaRecorder.ondataavailable = async (event) => {
  if (event.data.size > 0) {
    const metadata = recordingMetadata.get(tabId);
    if (!metadata) return;
    
    try {
      await sendChunkToBackend(
        tabId,
        metadata.name,
        metadata.timestamp,
        event.data
      );
    } catch (error) {
      mediaRecorder.stop();
    }
  }
};
```

**Step 1.5: Rewrite `onstop` Handler**
```javascript
mediaRecorder.onstop = async () => {
  try {
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

    const stream = activeStreams.get(tabId);
    cleanupStream(stream);
    activeStreams.delete(tabId);
    recordingMetadata.delete(tabId);
    activeRecorders.delete(tabId);

    chrome.runtime.sendMessage({
      type: 'recording-complete',
      tabId: tabId
    }).catch(err => console.error('Failed to notify completion:', err));

  } catch (error) {
    sendRecordingError(tabId, `Failed to finalize recording: ${error.message}`);
  }
};
```

**Step 1.6: Update Start Recording Logic**
```javascript
if (message.type === 'start-recording') {
  const tabId = message.tabId;
  const name = message.name || `recording-${tabId}`;
  const timestamp = Date.now();
  
  try {
    // ... (stream acquisition code stays same)
    
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

    // ... (add ondataavailable, onstop, onerror handlers as above)

    mediaRecorder.start(1000);

  } catch (error) {
    sendRecordingError(tabId, error.message);
  }
}
```

**Step 1.7: Update Stop Recording Logic**
```javascript
else if (message.type === 'stop-recording') {
  const tabId = message.tabId;
  
  if (message.customFilename) {
    const metadata = recordingMetadata.get(tabId);
    if (metadata) {
      metadata.name = message.customFilename;
      recordingMetadata.set(tabId, metadata);
    }
  }
  
  const mediaRecorder = activeRecorders.get(tabId);
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}
```

---

### 2. **File: `src/background/background.js`** (Remove Local Download Logic)

#### Required Changes:

**Step 2.1: Remove `handleSaveRecording` Function**
```javascript
// DELETE ENTIRE FUNCTION (lines 174-195):
// async function handleSaveRecording(tabId, dataUrl, filename) { ... }
```

**Step 2.2: Remove `save-recording` Message Handler**
```javascript
// DELETE FROM chrome.runtime.onMessage.addListener (lines 23-25):
// else if (message.type === 'save-recording') {
//   handleSaveRecording(message.tabId, message.data, message.filename);
//   return true;
// }
```

**Step 2.3: Add New Message Handler for Recording Complete**
```javascript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ... existing handlers ...
  
  else if (message.type === 'recording-complete') {
    if (message.tabId) {
      activeRecordings.delete(message.tabId);
      stopCountdown(message.tabId);
      
      chrome.runtime.sendMessage({
        type: 'recording-stopped',
        tabId: message.tabId
      }).catch((error) => {
        console.error('Failed to send recording-stopped notification:', error);
      });
    }
    return true;
  }
  
  // ... rest of handlers
});
```

---

### 3. **File: `src/popup/popup.js`** (Backend Port Management)

#### Required Changes:

**Step 3.1: Load and Save Backend Port**
```javascript
async function loadBackendPort() {
  const result = await getFromStorage('backendPort', '8080');
  portInput.value = result;
  return result;
}

async function saveBackendPort(port) {
  await setToStorage('backendPort', port);
  chrome.runtime.sendMessage({
    type: 'set-backend-port',
    target: 'offscreen',
    port: port
  }).catch(() => {});
}
```

**Step 3.2: Update `initializePopup` Function**
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
  
  const port = await loadBackendPort();
  
  checkHealth();

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

**Step 3.3: Update `startRecording` Function**
```javascript
async function startRecording() {
  if (!isConnected) {
    showToast('Backend not connected. Please check connection.');
    return;
  }
  
  try {
    startBtn.disabled = true;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const customFilename = filenameInput.value.trim();
    const quality = qualitySelect.value;
    const countdownSeconds = countdownTotalSecondsFromInputs();
    
    const port = portInput.value.trim();
    await saveBackendPort(port);
    
    const response = await chrome.runtime.sendMessage({
      type: 'start-recording',
      tabId: tab.id,
      customFilename,
      quality,
      countdownSeconds
    });
    if (response && response.error) {
      showToast(String(response.error));
      startBtn.disabled = false;
    } else {
      countHours.disabled = true;
      countMinutes.disabled = true;
      countSeconds.disabled = true;
    }
  } catch (e) {
    showToast('Failed to start');
    startBtn.disabled = false;
  }
}
```

**Step 3.4: Add Port Input Listener**
```javascript
portInput.addEventListener('change', async () => {
  const port = portInput.value.trim();
  if (isValidPort(port)) {
    await saveBackendPort(port);
  }
});
```

---

### 4. **File: `src/background/background.js`** (Pass Port to Offscreen)

#### Required Changes:

**Step 4.1: Update `handleStartRecording` Function**
```javascript
async function handleStartRecording(tabId, customFilename, countdownSeconds, sendResponse) {
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

    const port = await chrome.storage.local.get(['backendPort']);
    const backendPort = port.backendPort || '8080';
    
    await chrome.runtime.sendMessage({
      type: 'set-backend-port',
      target: 'offscreen',
      port: backendPort
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

---

## 📊 Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ EXTENSION (Chrome Browser)                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Popup.js                                                    │
│    ↓ (1) User clicks Start                                  │
│    ↓ (2) Sends message to Background.js                     │
│                                                              │
│  Background.js                                               │
│    ↓ (3) Creates offscreen document                         │
│    ↓ (4) Gets stream ID from tabCapture                     │
│    ↓ (5) Sends start message to Offscreen.js                │
│                                                              │
│  Offscreen.js                                                │
│    ↓ (6) Gets media stream                                  │
│    ↓ (7) Creates MediaRecorder                              │
│    ↓ (8) On each data chunk (every 1 second):               │
│         ↓ Convert to base64                                 │
│         ↓ POST to Backend /api/recordings                   │
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
│    ↓ (9) Receives JSON: {name, tabId, timestamp, data, status} │
│    ↓ (10) Decodes base64 data                               │
│    ↓ (11) Calls RecorderService.HandleRecording()           │
│                                                              │
│  RecorderService                                             │
│    ↓ (12) Routes to FileWriterService.WriteChunk()          │
│                                                              │
│  FileWriterService                                           │
│    ↓ (13) Gets/creates file handle (lazy)                   │
│    ↓ (14) Writes chunk to buffered writer                   │
│    ↓ (15) Flushes to disk                                   │
│                                                              │
│  📁 ./recordings/recording-name_123_1234567890.webm         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## ✅ Testing Checklist

### Pre-Testing Setup
- [ ] Backend server is running (`cd Backend; go run main.go`)
- [ ] Backend UI confirms server on port 8080
- [ ] Extension loaded in Chrome (`chrome://extensions`, Developer mode, Load unpacked)

### Integration Testing

#### Test 1: Basic Recording
- [ ] Open Extension popup
- [ ] Enter port `8080` and click "Check Status"
- [ ] Verify "Connected" status shows
- [ ] Enter filename "test-recording"
- [ ] Click "Start Recording"
- [ ] Wait 5 seconds
- [ ] Click "Stop Recording"
- [ ] Check Backend console logs for:
  - "Started recording: ./recordings/test-recording_XXX_YYY.webm"
  - Multiple chunk write logs
  - "Recording stopped for tab XXX"
- [ ] Verify file exists in `Backend/recordings/` folder
- [ ] Open .webm file and verify it plays

#### Test 2: Multi-Tab Recording
- [ ] Open 3 different tabs
- [ ] Start recording in Tab 1 (filename: "tab1")
- [ ] Switch to Tab 2, start recording (filename: "tab2")
- [ ] Switch to Tab 3, start recording (filename: "tab3")
- [ ] Backend should show 3 active recordings in logs
- [ ] Stop all recordings in any order
- [ ] Verify 3 separate .webm files exist
- [ ] Verify all files play correctly

#### Test 3: Backend Disconnect Handling
- [ ] Start a recording
- [ ] Stop Backend server (Ctrl+C in terminal)
- [ ] Verify Extension shows error toast
- [ ] Verify Extension gracefully handles failure
- [ ] Restart Backend
- [ ] Verify can start new recording after reconnect

#### Test 4: Long Recording (Memory Test)
- [ ] Start recording
- [ ] Let run for 2+ minutes
- [ ] Monitor Chrome Task Manager (Shift+Esc)
- [ ] Verify Extension memory stays stable (not increasing)
- [ ] Stop recording
- [ ] Verify file is complete and plays

#### Test 5: Countdown Timer
- [ ] Set countdown to 00:00:30
- [ ] Start recording
- [ ] Verify recording auto-stops after 30 seconds
- [ ] Verify file was created correctly

#### Test 6: Custom Filename
- [ ] Enter filename with special chars "my-test_recording-2024"
- [ ] Start and stop recording
- [ ] Verify filename in recordings folder matches (with timestamp suffix)

### Error Scenarios
- [ ] Test with invalid port (e.g., "99999")
- [ ] Test with Backend not running
- [ ] Test stopping before any chunks sent
- [ ] Test closing tab during recording
- [ ] Test refreshing tab during recording

---

## 🚨 Common Issues & Solutions

### Issue 1: "Failed to send recording data"
**Cause**: Backend not running or wrong port
**Solution**: 
1. Verify Backend is running: `cd Backend; go run main.go`
2. Check Backend logs show "Server starting on http://localhost:8080"
3. In Extension popup, verify port is 8080 and "Connected" shows

### Issue 2: Recording file is 0 bytes
**Cause**: MediaRecorder not starting or chunks not being generated
**Solution**:
1. Check browser console (F12) for MediaRecorder errors
2. Verify tab has audio/video content (not chrome:// pages)
3. Check codec support in offscreen.js logs

### Issue 3: CORS errors in console
**Cause**: Backend CORS middleware not working
**Solution**:
1. Verify `handlers.CORSMiddleware()` is wrapping endpoints in main.go
2. Check Backend logs for incoming OPTIONS requests
3. Verify response headers include `Access-Control-Allow-Origin: *`

### Issue 4: Extension popup shows "Backend not connected"
**Cause**: Health check failing
**Solution**:
1. Test Backend directly: `curl http://localhost:8080/api/health`
2. Should return: `{"status":"ok","time":"..."}`
3. If curl works but Extension doesn't, check Extension console for errors

---

## 📝 Implementation Timeline

| Phase | Task | Estimated Time | Dependencies |
|-------|------|----------------|--------------|
| 1 | Update offscreen.js chunk streaming | 1 hour | None |
| 2 | Remove local download from background.js | 15 minutes | Phase 1 |
| 3 | Update popup.js port management | 30 minutes | None |
| 4 | Add port passing to offscreen | 15 minutes | Phase 3 |
| 5 | Basic integration testing | 1 hour | Phases 1-4 |
| 6 | Multi-tab testing | 30 minutes | Phase 5 |
| 7 | Error handling testing | 30 minutes | Phase 5 |

**Total Estimated Time**: 4 hours

---

## 🎯 Success Criteria

The integration is complete and successful when:

✅ Extension sends recording chunks to Backend via HTTP POST
✅ Backend receives and writes chunks to disk incrementally
✅ No local memory accumulation in Extension
✅ Multiple tabs can record simultaneously
✅ Recordings are saved as .webm files that play correctly
✅ Error handling works for Backend disconnection
✅ Extension popup shows Backend connection status
✅ All existing features (countdown, custom filename, quality) still work

---

## 🔄 Post-Integration Enhancements (Future)

After basic integration works, consider:
- [ ] Add progress bar showing bytes sent to Backend
- [ ] Display active recordings from Backend in Extension popup
- [ ] Add retry logic for failed chunk uploads (with exponential backoff)
- [ ] Implement chunk buffering (send every N seconds instead of every chunk)
- [ ] Add recording preview/playback in Backend UI
- [ ] Implement session recovery (resume recording after disconnect)
- [ ] Add metadata (tab title, URL) to Backend recordings
- [ ] Implement recording quality/bitrate control
- [ ] Add pause/resume recording capability

---

## 📚 Related Files

### Extension Files (Need Modification)
- `src/offscreen/offscreen.js` - Main recording logic
- `src/background/background.js` - Message routing and coordination
- `src/popup/popup.js` - User interface and Backend connection

### Backend Files (No Changes Needed)
- `Backend/main.go` - Server setup (port 8080, CORS enabled)
- `Backend/handlers/recordings.go` - /api/recordings endpoint
- `Backend/handlers/middleware.go` - CORS middleware
- `Backend/services/filewriter.go` - Disk writing logic
- `Backend/services/recorder.go` - Recording state management
- `Backend/models/recording.go` - Data structures

---

## 🎬 Getting Started

To implement this integration:

1. **Backup Current Extension** (just in case):
   ```powershell
   Copy-Item Extension Extension_backup -Recurse
   ```

2. **Make changes in this order**:
   - Start with offscreen.js (most critical)
   - Then background.js (remove old logic)
   - Then popup.js (port management)
   - Then background.js again (port passing)

3. **Test after each file change**:
   - Reload Extension in Chrome after each change
   - Test basic recording after each phase
   - Don't move to next file until current works

4. **Use Backend logs for debugging**:
   - Backend will log all received chunks
   - Check Backend console for errors
   - Backend logs will show file creation/closing

5. **Use Chrome DevTools**:
   - Check Extension console (popup.html)
   - Check Background page console (chrome://extensions → Inspect views: service worker)
   - Check offscreen document console (will appear when recording)

---

**Good luck! This is the final integration step. Once these changes are complete, the system should work end-to-end.**