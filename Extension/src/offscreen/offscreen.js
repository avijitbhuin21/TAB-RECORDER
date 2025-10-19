const activeRecorders = new Map();
const activeStreams = new Map();
const recordedChunksMap = new Map();
const customFilenames = new Map();
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



chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'start-recording') {
    const tabId = message.tabId;
    
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

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(audioContext.destination);

      const options = { mimeType: 'video/webm; codecs=vp8,opus' };
      
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm';
      }

      const mediaRecorder = new MediaRecorder(stream, options);
      activeRecorders.set(tabId, mediaRecorder);
      recordedChunksMap.set(tabId, []);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          const chunks = recordedChunksMap.get(tabId);
          if (chunks) {
            chunks.push(event.data);
          }
        }
      };

      mediaRecorder.onstop = async () => {
        const chunks = recordedChunksMap.get(tabId) || [];
        const blob = new Blob(chunks, { type: 'video/webm' });
        
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const customName = customFilenames.get(tabId);
        
        let filename;
        if (customName) {
          filename = `${customName}-${timestamp}.webm`;
        } else {
          filename = `tab-${tabId}-recording-${timestamp}.webm`;
        }

        try {
          const reader = new FileReader();
          reader.onloadend = () => {
            chrome.runtime.sendMessage({
              type: 'save-recording',
              tabId: tabId,
              data: reader.result,
              filename: filename
            }).catch((error) => {
              console.error('Failed to send save-recording message:', error);
            });
          };
          reader.readAsDataURL(blob);

          const stream = activeStreams.get(tabId);
          cleanupStream(stream);
          activeStreams.delete(tabId);
        } catch (error) {
          sendRecordingError(tabId, error.message);
        } finally {
          recordedChunksMap.delete(tabId);
          activeRecorders.delete(tabId);
          customFilenames.delete(tabId);
        }
      };

      mediaRecorder.onerror = (event) => {
        sendRecordingError(tabId, event.error.message);
      };

      mediaRecorder.start();
    } catch (error) {
      sendRecordingError(tabId, error.message);
    }
  } else if (message.type === 'stop-recording') {
    const tabId = message.tabId;
    
    if (message.customFilename) {
      customFilenames.set(tabId, message.customFilename);
    }
    
    const mediaRecorder = activeRecorders.get(tabId);
    
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }
});