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
const portInput = document.getElementById('portInput');
const checkStatusBtn = document.getElementById('checkStatusBtn');
const connectionStatus = document.getElementById('connectionStatus');
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
let lastCheckedPort = '';
let isConnected = false;

function announce(msg) {
  if (ariaLive) ariaLive.textContent = msg;
}

function showToast(msg) {
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

function isValidPort(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

function setInlineConnectionStatus(connected) {
  isConnected = connected;
  connectionStatus.textContent = connected ? 'Connected' : 'Not connected';
  connectionStatus.classList.toggle('ok', connected);
  announce(connected ? 'Connected' : 'Not connected');
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


async function checkHealth() {
  const port = String(portInput.value || '').trim();
  if (!isValidPort(port)) {
    showToast('Backend not connected.');
    return;
  }
  abortHealthIfAny();
  checkStatusBtn.disabled = true;
  const controller = new AbortController();
  healthController = controller;
  healthTimeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    const res = await fetch(`http://localhost:${port}/api/health`, { method: 'GET', signal: controller.signal });
    if (res.ok) {
      setInlineConnectionStatus(true);
      lastCheckedPort = port;
    } else {
      showToast('Backend not connected.');
    }
  } catch {
    showToast('Backend not connected.');
  } finally {
    if (healthTimeoutId) clearTimeout(healthTimeoutId);
    healthTimeoutId = null;
    healthController = null;
    checkStatusBtn.disabled = false;
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

const debouncedPortChanged = debounce(() => {
  abortHealthIfAny();
  setInlineConnectionStatus(false);
}, DEBOUNCE_DELAY_MS);

portInput.addEventListener('input', () => {
  debouncedPortChanged();
});

checkStatusBtn.addEventListener('click', () => {
  if (healthController) abortHealthIfAny();
  checkHealth();
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