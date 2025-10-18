const activeRecorders = new Map();
const activeStreams = new Map();
const recordedChunksMap = new Map();
const customFilenames = new Map();

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

      const output = new AudioContext();
      const source = output.createMediaStreamSource(stream);
      source.connect(output.destination);

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
            }).catch(() => {});
          };
          reader.readAsDataURL(blob);

          const stream = activeStreams.get(tabId);
          if (stream) {
            stream.getTracks().forEach(track => track.stop());
            activeStreams.delete(tabId);
          }
        } catch (error) {
          chrome.runtime.sendMessage({
            type: 'recording-error',
            tabId: tabId,
            error: error.message
          }).catch(() => {});
        } finally {
          recordedChunksMap.delete(tabId);
          activeRecorders.delete(tabId);
          customFilenames.delete(tabId);
        }
      };

      mediaRecorder.onerror = (event) => {
        chrome.runtime.sendMessage({
          type: 'recording-error',
          tabId: tabId,
          error: event.error.message
        }).catch(() => {});
      };

      mediaRecorder.start();
    } catch (error) {
      chrome.runtime.sendMessage({
        type: 'recording-error',
        tabId: tabId,
        error: error.message
      }).catch(() => {});
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