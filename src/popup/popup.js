const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const status = document.getElementById('status');
const recordingIndicator = document.getElementById('recordingIndicator');
const filenameInput = document.getElementById('filenameInput');
const timer = document.getElementById('timer');

let isRecording = false;
let currentTabId = null;
let timerInterval = null;
let recordingStartTime = null;

async function initializePopup() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTabId = tab.id;
  
  chrome.runtime.sendMessage({
    type: 'get-recording-state',
    tabId: currentTabId
  }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error getting state:', chrome.runtime.lastError);
      return;
    }
    
    if (response && response.isRecording) {
      updateUIForRecording(true);
      status.textContent = 'Recording in progress...';
    }
  });
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function startTimer() {
  recordingStartTime = Date.now();
  timer.classList.add('active');
  
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    timer.textContent = formatTime(elapsed);
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  timer.classList.remove('active');
  timer.textContent = '00:00:00';
  recordingStartTime = null;
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message.tabId || message.tabId === currentTabId) {
    if (message.type === 'recording-started') {
      updateUIForRecording(true);
      status.textContent = 'Recording in progress...';
      startTimer();
    } else if (message.type === 'recording-stopped') {
      updateUIForRecording(false);
      status.textContent = 'Recording saved to downloads';
      stopTimer();
      setTimeout(() => {
        status.textContent = 'Ready to record';
      }, 3000);
    } else if (message.type === 'recording-error') {
      updateUIForRecording(false);
      status.textContent = `Error: ${message.error}`;
      stopTimer();
      setTimeout(() => {
        status.textContent = 'Ready to record';
      }, 5000);
    }
  }
});

startBtn.addEventListener('click', async () => {
  try {
    status.textContent = 'Starting recording...';
    startBtn.disabled = true;
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const customFilename = filenameInput.value.trim();
    
    const response = await chrome.runtime.sendMessage({
      type: 'start-recording',
      tabId: tab.id,
      customFilename: customFilename
    });
    
    if (response && response.error) {
      status.textContent = `Error: ${response.error}`;
      startBtn.disabled = false;
    }
  } catch (error) {
    status.textContent = `Failed to start: ${error.message}`;
    startBtn.disabled = false;
  }
});

stopBtn.addEventListener('click', async () => {
  try {
    status.textContent = 'Stopping recording...';
    stopBtn.disabled = true;
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    const response = await chrome.runtime.sendMessage({
      type: 'stop-recording',
      tabId: tab.id
    });
    
    if (response && response.error) {
      status.textContent = `Error: ${response.error}`;
      stopBtn.disabled = false;
      updateUIForRecording(false);
    }
  } catch (error) {
    status.textContent = `Failed to stop: ${error.message}`;
    stopBtn.disabled = false;
    updateUIForRecording(false);
  }
});

function updateUIForRecording(recording) {
  isRecording = recording;
  startBtn.disabled = recording;
  stopBtn.disabled = !recording;
  filenameInput.disabled = recording;
  
  if (recording) {
    recordingIndicator.classList.add('active');
  } else {
    recordingIndicator.classList.remove('active');
  }
}

initializePopup();