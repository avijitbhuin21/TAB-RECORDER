function getApiBase() {
    try {
        const { protocol, hostname, port } = window.location;
        return `${protocol}//${hostname}:${port}/api`;
    } catch {
        return 'http://localhost:8080/api';
    }
}

const API_BASE = getApiBase();

const INTERVALS = {
    HEALTH_CHECK: 5000,
    RECORDING_UPDATE: 1000,
    STATS_UPDATE: 2000,
    UPTIME_UPDATE: 1000
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

function renderRecordingItem(name, tabId, duration, size, startTime) {
    return `
        <div class="item" role="listitem">
          <div class="item__head">
            <div class="item__title">
              <i data-lucide="video" class="icon"></i>
              <span>${escapeHtml(name)}</span>
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
              <div class="k">Data Transferred</div>
              <div class="v">${formatFileSize(size)}</div>
            </div>
            <div class="kv">
              <div class="k">Started</div>
              <div class="v">${startTime}</div>
            </div>
          </div>
        </div>
    `;
}

async function fetchStats() {
    try {
        const res = await fetch(`${API_BASE}/stats`, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        
        const activeCount = data.activeRecordings || 0;
        const totalSizeMB = data.totalSizeMB || 0;
        const totalSessions = data.totalSessions || 0;
        const sessions = data.sessions || [];
        
        document.getElementById('active-count').textContent = activeCount;
        document.getElementById('active-sessions').textContent = activeCount;
        document.getElementById('total-recordings').textContent = totalSessions;
        
        state.totalSizeBytes = totalSizeMB * 1024 * 1024;
        document.getElementById('total-size').textContent = formatFileSize(state.totalSizeBytes);
        
        const container = document.getElementById('recordings-list');
        
        if (activeCount === 0) {
            container.innerHTML = '<div class="empty">No active recordings</div>';
            return;
        }
        
        const items = sessions.map(session => renderRecordingItem(
            session.name,
            session.tabId,
            session.durationSec * 1000,
            session.bytesWritten,
            escapeHtml(session.startTime)
        ));
        
        container.innerHTML = items.join('');
        lucide.createIcons();
    } catch (err) {
        console.debug('Failed to fetch stats:', err?.message || err);
    }
}

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
        items.push(renderRecordingItem(
            rec.name,
            tabId,
            duration,
            rec.size,
            new Date(rec.startTime).toLocaleTimeString()
        ));
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

function initEvents() {
    document.getElementById('change-dir-btn').addEventListener('click', handleDirectorySelection);
}

function init() {
    lucide.createIcons();
    initTheme();
    initEvents();
    checkHealth();
    loadServerInfo();
    renderStats();
    renderUptime();
    fetchStats();

    setInterval(checkHealth, INTERVALS.HEALTH_CHECK);
    setInterval(fetchStats, INTERVALS.STATS_UPDATE);
    setInterval(renderUptime, INTERVALS.UPTIME_UPDATE);
}

document.addEventListener('DOMContentLoaded', init);