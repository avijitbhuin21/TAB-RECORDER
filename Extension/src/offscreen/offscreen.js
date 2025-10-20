let useBackendMode = false;
const backendPort = '8080';
const backendBaseUrl = `http://localhost:${backendPort}/api`;

const activeRecorders = new Map();
const activeStreams = new Map();
const recordingMetadata = new Map();
const recordedChunksMap = new Map();

let pendingChunks = 0;
let stopRequested = false;
let stopResolve = null;

function sendRecordingError(tabId, message) {
  chrome.runtime.sendMessage({
    type: 'recording-error',
    tabId: tabId,
    error: message
  }).catch((error) => {
    console.error('Failed to send recording error notification:', error);
  });
}

function cleanupStream(stream) {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
}

async function sendChunkToBackend(tabId, name, timestamp, chunk) {
    if (stopRequested) {
        console.log(`[OFFSCREEN] ⚠️ Stop requested, ignoring chunk for tab ${tabId}`);
        return;
    }

    pendingChunks++;
    console.log(`[OFFSCREEN] Pending chunks: ${pendingChunks}`);
    
    try {
        console.log(`[OFFSCREEN] Converting chunk to base64 for tab ${tabId}, chunk size: ${chunk.size} bytes`);
        
        const arrayBuffer = await chunk.arrayBuffer();
        console.log(`[OFFSCREEN] ArrayBuffer size: ${arrayBuffer.byteLength} bytes`);
        
        const uint8Array = new Uint8Array(arrayBuffer);
        let binaryString = '';
        for (let i = 0; i < uint8Array.length; i++) {
            binaryString += String.fromCharCode(uint8Array[i]);
        }
        
        const base64data = btoa(binaryString);
        console.log(`[OFFSCREEN] Base64 data length: ${base64data.length} characters`);
    
        const payload = {
          name: name,
          tabId: tabId,
          timestamp: timestamp,
          data: base64data,
          status: 'stream'
        };
        
        console.log(`[OFFSCREEN] Sending POST to ${backendBaseUrl}/recordings`);
        console.log(`[OFFSCREEN] Payload: name=${name}, tabId=${tabId}, timestamp=${timestamp}, status=stream, dataLength=${base64data.length}`);
        
        const response = await fetch(`${backendBaseUrl}/recordings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        console.log(`[OFFSCREEN] Backend response: ${response.status} ${response.statusText}`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[OFFSCREEN] Backend error:`, errorText);
          throw new Error(`Backend responded with ${response.status}: ${errorText}`);
        }
        
        console.log(`[OFFSCREEN] ✅ Chunk sent successfully to backend`);
        
    } catch (error) {
        console.error(`[OFFSCREEN] ❌ Error sending chunk to backend:`, error);
        throw error;
    } finally {
        pendingChunks--;
        console.log(`[OFFSCREEN] Pending chunks after send: ${pendingChunks}`);
        
        if (stopRequested && pendingChunks === 0 && stopResolve) {
            console.log(`[OFFSCREEN] All chunks sent, resolving stop`);
            stopResolve();
        }
    }
}

async function waitForPendingChunks() {
    if (pendingChunks === 0) {
        console.log(`[OFFSCREEN] No pending chunks to wait for`);
        return Promise.resolve();
    }
    
    console.log(`[OFFSCREEN] Waiting for ${pendingChunks} pending chunks...`);
    return new Promise((resolve) => {
        stopResolve = resolve;
    });
}

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.type === 'set-backend-mode') {
    useBackendMode = message.useBackend;
    console.log(`[OFFSCREEN] Recording mode set to: ${useBackendMode ? 'Backend' : 'Standalone'}`);
    console.log(`[OFFSCREEN] Backend URL: ${backendBaseUrl}`);
    return;
  }
  
  if (message.target !== 'offscreen') return;

  if (message.type === 'start-recording') {
    const tabId = message.tabId;
    const name = message.name || `recording-${tabId}`;
    const timestamp = Date.now();
    
    stopRequested = false;
    pendingChunks = 0;
    stopResolve = null;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: message.streamId
          }
        },
        video: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: message.streamId
          }
        }
      });

      activeStreams.set(tabId, stream);
      
      recordingMetadata.set(tabId, {
        name: name,
        timestamp: timestamp
      });

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(audioContext.destination);

      const options = { mimeType: 'video/webm; codecs=vp8,opus' };
      
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm';
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      activeRecorders.set(tabId, mediaRecorder);

      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          const metadata = recordingMetadata.get(tabId);
          if (!metadata) {
            console.error(`[OFFSCREEN] No metadata found for tab ${tabId}`);
            return;
          }
          
          console.log(`[OFFSCREEN] Data available - Size: ${event.data.size} bytes, Mode: ${useBackendMode ? 'Backend' : 'Standalone'}`);
          
          if (event.data.size < 1000) {
            console.log(`[OFFSCREEN] ⚠️ Chunk too small (${event.data.size} bytes), skipping...`);
            return;
          }
          
          if (useBackendMode) {
            try {
              console.log(`[OFFSCREEN] Sending chunk to backend for tab ${tabId}`);
              await sendChunkToBackend(
                tabId,
                metadata.name,
                metadata.timestamp,
                event.data
              );
              console.log(`[OFFSCREEN] ✅ Chunk sent successfully`);
            } catch (error) {
              console.error('[OFFSCREEN] ❌ Backend streaming failed, stopping recording:', error);
              mediaRecorder.stop();
            }
          } else {
            if (!recordedChunksMap.has(tabId)) {
              recordedChunksMap.set(tabId, []);
            }
            recordedChunksMap.get(tabId).push(event.data);
            console.log(`[OFFSCREEN] Chunk stored locally. Total chunks: ${recordedChunksMap.get(tabId).length}`);
          }
        }
      };

      mediaRecorder.onstop = async () => {
        console.log(`[OFFSCREEN] Recording stopped for tab ${tabId}. Mode: ${useBackendMode ? 'Backend' : 'Standalone'}`);
        
        try {
          if (useBackendMode) {
            console.log(`[OFFSCREEN] Waiting for pending chunks before sending stop signal...`);
            await waitForPendingChunks();
            
            console.log(`[OFFSCREEN] Sending stop signal to backend`);
            const stopData = {
              name: recordingMetadata.get(tabId)?.name || '',
              tabId: tabId,
              timestamp: recordingMetadata.get(tabId)?.timestamp || Date.now(),
              data: '',
              status: 'stopped'
            };
            console.log(`[OFFSCREEN] Stop data:`, stopData);
            
            const response = await fetch(`${backendBaseUrl}/recordings`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(stopData)
            });

            console.log(`[OFFSCREEN] Backend response status: ${response.status}`);
            
            if (!response.ok) {
              const errorText = await response.text();
              console.error(`[OFFSCREEN] Backend error response:`, errorText);
              throw new Error(`Failed to stop recording: ${response.status}`);
            }

            console.log(`[OFFSCREEN] ✅ Recording completed successfully in backend mode`);
            chrome.runtime.sendMessage({
              type: 'recording-complete',
              tabId: tabId
            }).catch(err => console.error('[OFFSCREEN] Failed to notify completion:', err));
            
          } else {
            console.log(`[OFFSCREEN] Processing standalone mode recording`);
            const chunks = recordedChunksMap.get(tabId) || [];
            console.log(`[OFFSCREEN] Total chunks collected: ${chunks.length}`);
            
            if (chunks.length === 0) {
              throw new Error('No recorded data available');
            }

            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            let filename = recordingMetadata.get(tabId)?.name || `recording-${tabId}-${Date.now()}`;
            
            if (!filename.endsWith('.webm')) {
              filename += '.webm';
            }

            console.log(`[OFFSCREEN] Sending save-recording message. Filename: ${filename}`);
            chrome.runtime.sendMessage({
              type: 'save-recording',
              tabId: tabId,
              data: url,
              filename: filename
            }).catch(err => console.error('[OFFSCREEN] Failed to save recording:', err));

            recordedChunksMap.delete(tabId);
          }

          const stream = activeStreams.get(tabId);
          cleanupStream(stream);
          activeStreams.delete(tabId);
          recordingMetadata.delete(tabId);
          activeRecorders.delete(tabId);
          
          stopRequested = false;
          pendingChunks = 0;
          stopResolve = null;

        } catch (error) {
          console.error('Failed to finalize recording:', error);
          sendRecordingError(tabId, `Failed to finalize recording: ${error.message}`);
        }
      };

      mediaRecorder.onerror = (event) => {
        sendRecordingError(tabId, event.error.message);
      };

      mediaRecorder.start(1000);

      console.log(`[OFFSCREEN] ✅ Recording started successfully`);
      console.log(`[OFFSCREEN] Mode: ${useBackendMode ? 'Backend' : 'Standalone'}`);
      console.log(`[OFFSCREEN] Tab ID: ${tabId}`);
      console.log(`[OFFSCREEN] Recording name: ${name}`);
      console.log(`[OFFSCREEN] Timestamp: ${timestamp}`);

    } catch (error) {
      sendRecordingError(tabId, error.message);
    }
  } else if (message.type === 'stop-recording') {
    const tabId = message.tabId;
    
    console.log(`[OFFSCREEN] Stop recording requested for tab ${tabId}`);
    stopRequested = true;
    
    if (message.customFilename) {
      const metadata = recordingMetadata.get(tabId);
      if (metadata) {
        metadata.name = message.customFilename;
      }
    }
    
    const mediaRecorder = activeRecorders.get(tabId);
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      console.log(`[OFFSCREEN] Requesting final data chunk before stopping for tab ${tabId}`);
      mediaRecorder.requestData();
      
      console.log(`[OFFSCREEN] Stopping MediaRecorder for tab ${tabId}`);
      mediaRecorder.stop();
    }
  }
});