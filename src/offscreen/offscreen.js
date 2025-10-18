let mediaRecorder = null;
let recordedChunks = [];
let stream = null;

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'start-recording') {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
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

      const output = new AudioContext();
      const source = output.createMediaStreamSource(stream);
      source.connect(output.destination);

      const options = { mimeType: 'video/webm; codecs=vp8,opus' };
      
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm';
      }

      mediaRecorder = new MediaRecorder(stream, options);
      recordedChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `tab-recording-${timestamp}.webm`;

        try {
          const reader = new FileReader();
          reader.onloadend = () => {
            chrome.runtime.sendMessage({
              type: 'save-recording',
              data: reader.result,
              filename: filename
            }).catch(() => {});
          };
          reader.readAsDataURL(blob);

          if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
          }
        } catch (error) {
          chrome.runtime.sendMessage({
            type: 'recording-error',
            error: error.message
          }).catch(() => {});
        } finally {
          recordedChunks = [];
        }
      };

      mediaRecorder.onerror = (event) => {
        chrome.runtime.sendMessage({ 
          type: 'recording-error', 
          error: event.error.message 
        }).catch(() => {});
      };

      mediaRecorder.start();
    } catch (error) {
      chrome.runtime.sendMessage({ 
        type: 'recording-error', 
        error: error.message 
      }).catch(() => {});
    }
  } else if (message.type === 'stop-recording') {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }
});