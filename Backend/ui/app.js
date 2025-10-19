// Configuration
const API_BASE = 'http://localhost:8080/api';

// Simulation configuration constants
const SIMULATION = {
    MIN_CHUNK_SIZE: 50000,   // Minimum random chunk size in bytes
    MAX_CHUNK_SIZE: 200000   // Maximum random chunk size in bytes
};

// Interval timing constants (in milliseconds)
const INTERVALS = {
    HEALTH_CHECK: 5000,      // Health check polling interval
    RECORDING_UPDATE: 1000,  // Active recordings update interval
    UPTIME_UPDATE: 1000      // Uptime display update interval
};

// State
const state = {
    activeRecordings: new Map(),
    totalRecordings: 0,
    totalSizeBytes: 0,
    serverStartTime: Date.now(),
    healthOK: false,
};

// Theme
function initTheme() {
    const saved = localStorage.getItem('theme');
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (sysDark ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
    renderThemeIcon(theme);

    // Only auto-switch if user hasn't chosen
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            const newTheme = e.matches ? 'dark' : 'light';
            document.documentElement.setAttribute('data-theme', newTheme);
            renderThemeIcon(newTheme);
        }
    });

    document.getElementById('theme-toggle').addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        renderThemeIcon(next);
    });
}
function renderThemeIcon(theme) {
    const el = document.getElementById('theme-icon');
    const iconName = theme === 'dark' ? 'sun' : 'moon';
    el.setAttribute('data-lucide', iconName);
    lucide.createIcons();
}

// Health
async function checkHealth() {
    const statusText = document.getElementById('status-text');
    const dot = document.getElementById('status-dot');
    try {
        const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const t = new Date(data.time || Date.now());
        statusText.textContent = `Server Running (${t.toLocaleTimeString()})`;
        state.healthOK = true;
        dot.style.opacity = '1';
    } catch (err) {
        state.healthOK = false;
        dot.style.opacity = '0.4';
        statusText.textContent = 'Server Unreachable';
        console.debug('Health check failed:', err?.message || err);
    }
}

// Port display
function getPortFromApiBase() {
    try {
        const url = new URL(API_BASE);
        return url.port || (url.protocol === 'https:' ? '443' : '80');
    } catch {
        return '8080';
    }
}
function setPortDisplay(port) {
    const el = document.getElementById('port-text');
    if (el) el.textContent = `Port ${port}`;
}

// Server info (optional native hooks)
async function loadServerInfo() {
    // Show a best-effort default immediately
    setPortDisplay(getPortFromApiBase());

    if (window.getServerStatus) {
        try {
            const info = await window.getServerStatus();
            if (info?.downloadDir) document.getElementById('downloadDir').textContent = info.downloadDir;
            if (info?.port) setPortDisplay(info.port);
        } catch (e) {
            console.debug('Failed to load server info:', e?.message || e);
        }
    }
}

// Directory selection (optional native hooks)
async function handleDirectorySelection() {
    if (!window.selectDirectory) {
        console.warn('Directory selection is not available in this environment.');
        return;
    }
    try {
        const dir = await window.selectDirectory();
        if (!dir) return;
        const resp = await fetch(`${API_BASE}/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: dir })
        });
        if (resp.ok) {
            document.getElementById('downloadDir').textContent = dir;
        } else {
            console.error('Failed to update directory');
        }
    } catch (e) {
        console.error('Error selecting directory:', e?.message || e);
    }
}

// Formatters
function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return [h, m, ss].map(v => String(v).padStart(2, '0')).join(':');
}
function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = (bytes / Math.pow(1024, i)).toFixed(2);
    return `${val} ${units[i]}`;
}

// Rendering
function renderActiveRecordings() {
    const container = document.getElementById('recordings-list');
    const activeCount = state.activeRecordings.size;

    document.getElementById('active-count').textContent = activeCount;
    document.getElementById('active-sessions').textContent = activeCount;

    if (activeCount === 0) {
        container.innerHTML = '<div class="empty">No active recordings</div>';
        return;
    }

    const now = Date.now();
    const items = [];
    state.activeRecordings.forEach((rec, tabId) => {
        const duration = now - rec.startTime;
        items.push(`
        <div class="item" role="listitem">
          <div class="item__head">
            <div class="item__title">
              <i data-lucide="video" class="icon"></i>
              <span>${escapeHtml(rec.name)}</span>
            </div>
            <span class="pill">
              <i data-lucide="monitor" class="icon"></i>
              Tab ${String(tabId)}
            </span>
          </div>
              <div class="details">
                <div class="kv">
                  <div class="k">Duration</div>
                  <div class="v">${formatDuration(duration)}</div>
                </div>
                <div class="kv">
                  <div class="k">File Size</div>
                  <div class="v">${formatFileSize(rec.size)}</div>
                </div>
                <div class="kv">
                  <div class="k">Started</div>
                  <div class="v">${new Date(rec.startTime).toLocaleTimeString()}</div>
                </div>
              </div>
            </div>
          `);
    });

    container.innerHTML = items.join('');
    lucide.createIcons();
}

function renderUptime() {
    const uptime = Date.now() - state.serverStartTime;
    document.getElementById('server-uptime').textContent = formatDuration(uptime);
}

function renderStats() {
    document.getElementById('total-recordings').textContent = String(state.totalRecordings);
    document.getElementById('total-size').textContent = formatFileSize(state.totalSizeBytes);
}

// Safe text
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Demo/External API hooks to add/remove recordings from outside
function addRecording(tabId, name) {
    if (!state.activeRecordings.has(tabId)) {
        state.activeRecordings.set(tabId, {
            name: name || `Session ${tabId}`,
            startTime: Date.now(),
            size: 0
        });
        state.totalRecordings += 1;
    }
    // Simulate growth
    const rec = state.activeRecordings.get(tabId);
    const delta = Math.floor(Math.random() * (SIMULATION.MAX_CHUNK_SIZE - SIMULATION.MIN_CHUNK_SIZE)) + SIMULATION.MIN_CHUNK_SIZE;
    rec.size += delta;
    state.totalSizeBytes += delta;

    renderActiveRecordings();
    renderStats();
}

function removeRecording(tabId) {
    if (!state.activeRecordings.has(tabId)) return;
    state.activeRecordings.delete(tabId);
    renderActiveRecordings();
}

// Expose hooks
window.addRecording = addRecording;
window.removeRecording = removeRecording;

// Events
function initEvents() {
    document.getElementById('change-dir-btn').addEventListener('click', handleDirectorySelection);
}

// Init
function init() {
    lucide.createIcons();
    initTheme();
    initEvents();
    checkHealth();
    loadServerInfo();
    renderStats();
    renderUptime();
    renderActiveRecordings();

    setInterval(checkHealth, INTERVALS.HEALTH_CHECK);
    setInterval(() => {
        if (state.activeRecordings.size > 0) renderActiveRecordings();
    }, INTERVALS.RECORDING_UPDATE);
    setInterval(renderUptime, INTERVALS.UPTIME_UPDATE);
}

document.addEventListener('DOMContentLoaded', init);