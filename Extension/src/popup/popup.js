/**
Popup logic for two-color UI, health check with abort, countdown control, quality selector, and recording controls.
*/

// Timing constants
const TOAST_DISPLAY_DURATION_MS = 2400;
const HEALTH_CHECK_TIMEOUT_MS = 4500;
const DEBOUNCE_DELAY_MS = 300;
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const filenameInput = document.getElementById('filenameInput');
const recordingIndicator = document.getElementById('recordingIndicator');
const elapsedTimer = document.getElementById('elapsedTimer');
const ariaLive = document.getElementById('ariaLive');
const toast = document.getElementById('toast');
const checkStatusBtn = document.getElementById('checkStatusBtn');
const downloadExeBtn = document.getElementById('downloadExeBtn');
const qualitySelect = document.getElementById('qualitySelect');
const countHours = document.getElementById('countHours');
const countMinutes = document.getElementById('countMinutes');
const countSeconds = document.getElementById('countSeconds');
const countStartBtn = document.getElementById('countStartBtn');
const countPauseBtn = document.getElementById('countPauseBtn');
const countResetBtn = document.getElementById('countResetBtn');
const countdownDisplay = document.getElementById('countdownDisplay');

let currentTabId = null;
let isRecording = false;
let recordingStartTime = null;
let elapsedInterval = null;

let healthController = null;
let healthTimeoutId = null;
let isConnected = false;
let statsInterval = null;
const BACKEND_PORT = '8080';
const BACKEND_BASE_URL = `http://localhost:${BACKEND_PORT}/api`;
const BACKEND_HEALTH_URL = `http://localhost:${BACKEND_PORT}/api/health`;
const BACKEND_STATS_URL = `http://localhost:${BACKEND_PORT}/api/stats`;
const EXECUTABLE_DOWNLOAD_URL = `http://localhost:${BACKEND_PORT}/download/backend.exe`;

function announce(msg) {
  if (ariaLive) ariaLive.textContent = msg;
}

function showToast(msg, type = 'info') {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
    toast.textContent = '';
  }, TOAST_DISPLAY_DURATION_MS);
}

function formatHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function startElapsedTimer() {
  recordingStartTime = Date.now();
  if (elapsedInterval) clearInterval(elapsedInterval);
  elapsedInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
    elapsedTimer.textContent = formatHMS(elapsed);
  }, 1000);
}

function stopElapsedTimer() {
  if (elapsedInterval) clearInterval(elapsedInterval);
  elapsedInterval = null;
  recordingStartTime = null;
  elapsedTimer.textContent = '00:00:00';
}

function updateRecordingUI(recording) {
  isRecording = recording;
  startBtn.disabled = recording;
  stopBtn.disabled = !recording;
  filenameInput.disabled = recording;
  qualitySelect.disabled = recording;
  if (recording) {
    recordingIndicator.classList.add('active');
  } else {
    recordingIndicator.classList.remove('active');
  }
}

function updateConnectionUI(connected, checking = false) {
  const titleDot = document.getElementById('titleStatusDot');
  const statusBtn = document.getElementById('checkStatusBtn');
  const statusBtnText = document.getElementById('statusBtnText');
  
  statusBtn.classList.remove('connected', 'disconnected', 'checking');
  titleDot.classList.remove('connected', 'disconnected');
  
  if (checking) {
    statusBtn.classList.add('checking');
    statusBtnText.textContent = 'Checking...';
  } else if (connected) {
    titleDot.classList.add('connected');
    statusBtn.classList.add('connected');
    statusBtnText.textContent = 'Connected';
  } else {
    titleDot.classList.add('disconnected');
    statusBtn.classList.add('disconnected');
    statusBtnText.textContent = 'Disconnected';
  }
}

function abortHealthIfAny() {
  if (healthController) {
    healthController.abort();
    healthController = null;
  }
  if (healthTimeoutId) {
    clearTimeout(healthTimeoutId);
    healthTimeoutId = null;
  }
}

function debounce(fn, delay) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}
// Storage utility functions
async function getFromStorage(key, defaultValue = null) {
  return new Promise((resolve) => {
    chrome.storage.local.get([key], (result) => {
      if (chrome.runtime.lastError) {
        resolve(defaultValue);
        return;
      }
      resolve(result[key] !== undefined ? result[key] : defaultValue);
    });
  });
}

async function setToStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, () => resolve());
  });
}


async function loadSavedFilename(tabId) {
  return await getFromStorage(`recordingFilename_${tabId}`, '');
}

async function saveFilename(tabId, filename) {
  return await setToStorage(`recordingFilename_${tabId}`, filename);
}

async function loadSavedCountdown(tabId) {
  return await getFromStorage(`countdown_${tabId}`, { hours: 0, minutes: 0, seconds: 0 });
}

// UI helper function for countdown inputs
function setCountdownInputsDisabled(disabled) {
  countHours.disabled = disabled;
  countMinutes.disabled = disabled;
  countSeconds.disabled = disabled;
}
async function saveCountdown(tabId, hours, minutes, seconds) {
  return await setToStorage(`countdown_${tabId}`, { hours, minutes, seconds });
}

async function loadQualities() {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'get-recording-qualities' });
    const list = Array.isArray(resp) ? resp : (resp && Array.isArray(resp.qualities) ? resp.qualities : null);
    if (list && list.length) return list.map(String);
  } catch {}
  try {
    const result = await new Promise((resolve) => chrome.storage.local.get(['recordingQualities'], resolve));
    if (Array.isArray(result.recordingQualities) && result.recordingQualities.length) {
      return result.recordingQualities.map(String);
    }
  } catch {}
  return ['480p', '720p', '1080p', '4K'];
}

async function saveSelectedQuality(value) {
  return new Promise((resolve) => chrome.storage.local.set({ selectedRecordingQuality: value }, () => resolve()));
}

async function loadSelectedQuality() {
  return new Promise((resolve) => chrome.storage.local.get(['selectedRecordingQuality'], (r) => resolve(r.selectedRecordingQuality || '')));
}

async function populateQualities() {
  const qualities = await loadQualities();
  qualitySelect.innerHTML = '';
  for (const q of qualities) {
    const opt = document.createElement('option');
    opt.value = q;
    opt.textContent = q;
    qualitySelect.appendChild(opt);
  }
  const saved = await loadSelectedQuality();
  if (saved && qualities.includes(saved)) {
    qualitySelect.value = saved;
  } else {
    qualitySelect.value = qualities[0];
  }
}

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

async function startRecording() {
  console.log(`[POPUP] Starting recording`);
  console.log(`[POPUP] Backend connected: ${isConnected}`);
  
  try {
    startBtn.disabled = true;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const customFilename = filenameInput.value.trim();
    const quality = qualitySelect.value;
    const countdownSeconds = countdownTotalSecondsFromInputs();
    
    console.log(`[POPUP] Tab ID: ${tab.id}`);
    console.log(`[POPUP] Filename: ${customFilename || 'default'}`);
    console.log(`[POPUP] Quality: ${quality}`);
    console.log(`[POPUP] Countdown: ${countdownSeconds} seconds`);
    console.log(`[POPUP] Mode: ${isConnected ? 'Backend' : 'Standalone'}`);
    
    const response = await chrome.runtime.sendMessage({
      type: 'start-recording',
      tabId: tab.id,
      customFilename,
      quality,
      countdownSeconds,
      useBackend: isConnected
    });
    
    console.log(`[POPUP] Response from background:`, response);
    
    if (response && response.error) {
      console.error(`[POPUP] Error starting recording:`, response.error);
      showToast(String(response.error), 'error');
      startBtn.disabled = false;
    } else {
      const mode = isConnected ? 'Backend' : 'Standalone';
      console.log(`[POPUP] ✅ Recording started in ${mode} mode`);
      showToast(`Recording started in ${mode} mode`);
      countHours.disabled = true;
      countMinutes.disabled = true;
      countSeconds.disabled = true;
    }
  } catch (e) {
    console.error(`[POPUP] Exception starting recording:`, e);
    showToast('Failed to start recording', 'error');
    startBtn.disabled = false;
  }
}

async function stopRecording() {
  try {
    stopBtn.disabled = true;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.runtime.sendMessage({ type: 'stop-recording', tabId: tab.id });
    if (response && response.error) {
      showToast(String(response.error));
      stopBtn.disabled = false;
      updateRecordingUI(false);
    }
    setCountdownInputsDisabled(false);
  } catch (e) {
    showToast('Failed to stop');
    stopBtn.disabled = false;
    updateRecordingUI(false);
    setCountdownInputsDisabled(false);
  }
}

function countdownTotalSecondsFromInputs() {
  const h = Math.max(0, parseInt(countHours.value || '0', 10) || 0);
  const m = Math.max(0, Math.min(59, parseInt(countMinutes.value || '0', 10) || 0));
  const s = Math.max(0, Math.min(59, parseInt(countSeconds.value || '0', 10) || 0));
  return h * 3600 + m * 60 + s;
}

function updateCountdownPreview() {
  const total = countdownTotalSecondsFromInputs();
  countdownDisplay.textContent = formatHMS(total);
}


async function fetchStats() {
  if (!isConnected) return;
  
  try {
    const response = await fetch(BACKEND_STATS_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const stats = await response.json();
      document.getElementById('activeSessions').textContent = stats.activeRecordings || 0;
      document.getElementById('totalRecorded').textContent = (stats.totalSizeMB || 0).toFixed(2) + ' MB';
    }
  } catch (error) {
    console.error('[POPUP] Failed to fetch stats:', error);
  }
}

function startStatsPolling() {
  if (statsInterval) {
    clearInterval(statsInterval);
  }
  fetchStats();
  statsInterval = setInterval(fetchStats, 2000);
}

function stopStatsPolling() {
  if (statsInterval) {
    clearInterval(statsInterval);
    statsInterval = null;
  }
}

async function checkHealth(showMessages = false) {
  console.log(`[POPUP] Checking backend health at ${BACKEND_HEALTH_URL}`);
  
  try {
    updateConnectionUI(false, true);
    
    const response = await fetch(BACKEND_HEALTH_URL, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log(`[POPUP] Health check response: ${response.status} ${response.statusText}`);
    
    if (response.ok && response.status === 200) {
      const data = await response.json();
      console.log(`[POPUP] Health check data:`, data);
      
      if (data.status && data.status === 'ok') {
        isConnected = true;
        updateConnectionUI(true);
        document.getElementById('statsSection').style.display = 'block';
        startStatsPolling();
        console.log(`[POPUP] ✅ Backend connected successfully`);
        if (showMessages) showToast('Backend connected successfully');
        return true;
      }
    }
    
    isConnected = false;
    updateConnectionUI(false);
    document.getElementById('statsSection').style.display = 'none';
    stopStatsPolling();
    console.log(`[POPUP] ❌ Backend not responding`);
    if (showMessages) showToast('Backend not responding', 'error');
    return false;
    
  } catch (error) {
    console.error('[POPUP] Health check failed:', error);
    isConnected = false;
    updateConnectionUI(false);
    document.getElementById('statsSection').style.display = 'none';
    stopStatsPolling();
    return false;
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (!message.tabId || message.tabId === currentTabId) {
    if (message.type === 'recording-started') {
      updateRecordingUI(true);
      startElapsedTimer();
      announce('Recording started');
      countHours.disabled = true;
      countMinutes.disabled = true;
      countSeconds.disabled = true;
    } else if (message.type === 'recording-stopped') {
      updateRecordingUI(false);
      stopElapsedTimer();
      announce('Recording stopped');
      updateCountdownPreview();
      setCountdownInputsDisabled(false);
    } else if (message.type === 'recording-error') {
      updateRecordingUI(false);
      stopElapsedTimer();
      showToast(String(message.error || 'Recording error'));
      updateCountdownPreview();
      setCountdownInputsDisabled(false);
    } else if (message.type === 'countdown-tick') {
      countdownDisplay.textContent = formatHMS(Math.floor(message.remainingMs / 1000));
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('popup');
  if (root) {
    requestAnimationFrame(() => root.classList.add('enter'));
  }
});

filenameInput.addEventListener('input', async () => {
  const name = filenameInput.value.trim();
  await saveFilename(currentTabId, name);
});

qualitySelect.addEventListener('change', async () => {
  await saveSelectedQuality(qualitySelect.value);
});

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);

checkStatusBtn.addEventListener('click', async () => {
  const btn = document.getElementById('checkStatusBtn');
  btn.disabled = true;
  
  await checkHealth(true);
  
  btn.disabled = false;
});

downloadExeBtn.addEventListener('click', () => {
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

[countHours, countMinutes, countSeconds].forEach((el) => {
  el.addEventListener('input', async () => {
    updateCountdownPreview();
    const h = parseInt(countHours.value || '0', 10) || 0;
    const m = parseInt(countMinutes.value || '0', 10) || 0;
    const s = parseInt(countSeconds.value || '0', 10) || 0;
    await saveCountdown(currentTabId, h, m, s);
  });
});

initializePopup();