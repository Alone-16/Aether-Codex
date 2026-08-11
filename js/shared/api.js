// ═══════════════════════════════════════════════════════════════════
//  api.js — Client API Engine, Session Manager & Retries
// ═══════════════════════════════════════════════════════════════════

import { showErrorBanner, hideErrorBanner } from './error_banner.js';

export const API_BASE = (function() {
  if (typeof window !== 'undefined' && window.ENV && window.ENV.API_URL) {
    return window.ENV.API_URL;
  }
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    if (window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')) {
      return 'http://127.0.0.1:8787';
    }
    return window.location.origin;
  }
  return 'https://aether-codex.nadeempubgmobile2-0.workers.dev';
})();

// ── SYNC STATUS STATE ──────────────────────────────────────────────
let currentSyncState = 'saved'; // 'saved', 'saving', 'offline', 'error', 'uploading'
const syncListeners = new Set();

export function onSyncStatusChange(fn) {
  syncListeners.add(fn);
  fn(currentSyncState);
}

export function setSyncStatus(state) {
  currentSyncState = state;
  syncListeners.forEach(fn => fn(state));
}

// ── DEBOUNCED PATCH QUEUE ──────────────────────────────────────────
const debounceTimers = new Map();

export function debounce(key, fn, delay = 800) {
  if (debounceTimers.has(key)) {
    clearTimeout(debounceTimers.get(key));
  }
  setSyncStatus('saving');
  debounceTimers.set(key, setTimeout(async () => {
    debounceTimers.delete(key);
    try {
      await fn();
      if (debounceTimers.size === 0) setSyncStatus('saved');
    } catch (e) {
      setSyncStatus('error');
    }
  }, delay));
}

// ── ABORT CONTROLLER SEARCH ────────────────────────────────────────
let searchAbortController = null;

// ── AUTH TOKEN STORAGE ─────────────────────────────────────────────
const K_ACCESS = 'ac_v5_access_token';
const K_REFRESH = 'ac_v5_refresh_token';

export function getAccessToken() { return sessionStorage.getItem(K_ACCESS) || localStorage.getItem(K_ACCESS); }
export function getRefreshToken() { return localStorage.getItem(K_REFRESH); }

export function setTokens(access, refresh) {
  if (access) {
    sessionStorage.setItem(K_ACCESS, access);
    localStorage.setItem(K_ACCESS, access);
  }
  if (refresh) localStorage.setItem(K_REFRESH, refresh);
}

export function clearTokens() {
  sessionStorage.removeItem(K_ACCESS);
  localStorage.removeItem(K_ACCESS);
  localStorage.removeItem(K_REFRESH);
}

// ── HEALTH CHECK ───────────────────────────────────────────────────
export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/v1/health`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || json;
  } catch (e) {
    return null;
  }
}

// ── FETCH WRAPPER WITH 3X EXPONENTIAL BACKOFF RETRY & REFRESH ──────
export async function apiReq(endpoint, opts = {}, retries = 3, backoffMs = 500) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    setSyncStatus('offline');
    showErrorBanner('⚠ Network connection offline. Waiting to reconnect...');
    throw new Error('Network offline');
  }

  let token = getAccessToken();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      let res = await fetch(`${API_BASE}${endpoint}`, { ...opts, headers });

      // Handle 401 token refresh on first attempt
      if (res.status === 401 && attempt === 1 && getRefreshToken()) {
        const refreshed = await refreshAuth();
        if (refreshed) {
          token = getAccessToken();
          headers['Authorization'] = `Bearer ${token}`;
          res = await fetch(`${API_BASE}${endpoint}`, { ...opts, headers });
        }
      }

      let json = {};
      try { json = await res.json(); } catch (e) {}

      if (!res.ok || json.success === false) {
        const msg = json.error?.message || `HTTP ${res.status}`;
        if (res.status >= 500 && attempt < retries) {
          showErrorBanner(`⚠ Cloud API temporarily unavailable (${res.status}). Retrying (${attempt}/${retries})...`);
          await new Promise(r => setTimeout(r, backoffMs * Math.pow(2, attempt - 1)));
          continue;
        }
        setSyncStatus('error');
        throw new Error(msg);
      }

      hideErrorBanner();
      if (currentSyncState === 'error' || currentSyncState === 'offline') {
        setSyncStatus('saved');
      }

      return json.data !== undefined ? json.data : json;
    } catch (err) {
      lastError = err;
      if (attempt < retries && err.name !== 'AbortError' && err.message !== 'Network offline') {
        showErrorBanner(`⚠ Request failed. Retrying (${attempt}/${retries})...`);
        await new Promise(r => setTimeout(r, backoffMs * Math.pow(2, attempt - 1)));
      }
    }
  }

  setSyncStatus('error');
  const errText = lastError?.message || '';
  if (errText && !errText.includes('Authentication required') && !errText.includes('401')) {
    showErrorBanner(`⚠ Unable to connect to Cloud API. ${errText}`);
  }
  throw lastError || new Error('Request failed after retries');
}

// ── AUTH APIS ──────────────────────────────────────────────────────
export async function loginServerAuth(email, name, deviceName) {
  const data = await apiReq('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, name, device_name: deviceName }),
  });
  if (data.access_token) setTokens(data.access_token, data.refresh_token);
  return data.user;
}

export async function loginCFAccess(email, name, deviceName) {
  const data = await apiReq('/v1/auth/cf-access', {
    method: 'POST',
    body: JSON.stringify({ email, name, device_name: deviceName }),
  });
  if (data.access_token) setTokens(data.access_token, data.refresh_token);
  return data.user;
}

export async function refreshAuth() {
  const refresh = getRefreshToken();
  if (!refresh) return false;
  try {
    const data = await apiReq('/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (data.access_token) {
      setTokens(data.access_token, null);
      return true;
    }
  } catch (e) { clearTokens(); }
  return false;
}

export async function logout() {
  const refresh = getRefreshToken();
  if (refresh) {
    try { await apiReq('/v1/auth/logout', { method: 'POST', body: JSON.stringify({ refresh_token: refresh }) }); } catch (e) {}
  }
  clearTokens();
}

export async function logoutAllSessions() {
  try {
    await apiReq('/v1/auth/sessions', { method: 'DELETE' });
  } catch (e) {}
  clearTokens();
}

export async function getSessions() {
  return await apiReq('/v1/auth/sessions');
}

// ── MEDIA RESOURCE APIS ────────────────────────────────────────────
export const mediaApi = {
  getAll: () => apiReq('/v1/media'),
  create: item => apiReq('/v1/media', { method: 'POST', body: JSON.stringify(item) }),
  patch: (id, changes) => apiReq(`/v1/media/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  delete: id => apiReq(`/v1/media/${id}`, { method: 'DELETE' }),
};

// ── GAMES RESOURCE APIS ────────────────────────────────────────────
export const gamesApi = {
  getAll: () => apiReq('/v1/games'),
  create: item => apiReq('/v1/games', { method: 'POST', body: JSON.stringify(item) }),
  patch: (id, changes) => apiReq(`/v1/games/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  delete: id => apiReq(`/v1/games/${id}`, { method: 'DELETE' }),
};

// ── BOOKS RESOURCE APIS ────────────────────────────────────────────
export const booksApi = {
  getAll: () => apiReq('/v1/books'),
  create: item => apiReq('/v1/books', { method: 'POST', body: JSON.stringify(item) }),
  patch: (id, changes) => apiReq(`/v1/books/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  delete: id => apiReq(`/v1/books/${id}`, { method: 'DELETE' }),
};

// ── MUSIC RESOURCE APIS ────────────────────────────────────────────
export const musicApi = {
  getAll: () => apiReq('/v1/music'),
  create: item => apiReq('/v1/music', { method: 'POST', body: JSON.stringify(item) }),
  patch: (id, changes) => apiReq(`/v1/music/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  delete: id => apiReq(`/v1/music/${id}`, { method: 'DELETE' }),
  putPlaylists: playlists => apiReq('/v1/playlists', { method: 'PUT', body: JSON.stringify({ playlists }) }),
  syncPlaylist: (playlistUrl, syncIntervalDays = 7) => apiReq('/v1/music/sync-playlist', { method: 'POST', body: JSON.stringify({ playlist_url: playlistUrl, sync_interval_days: syncIntervalDays }) }),
  syncDuePlaylists: () => apiReq('/v1/music/sync-due', { method: 'POST' }),
};

// ── NOTES RESOURCE APIS ────────────────────────────────────────────
export const notesApi = {
  getAll: () => apiReq('/v1/notes'),
  create: item => apiReq('/v1/notes', { method: 'POST', body: JSON.stringify(item) }),
  patch: (id, changes) => apiReq(`/v1/notes/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  delete: id => apiReq(`/v1/notes/${id}`, { method: 'DELETE' }),
};

// ── VAULT RESOURCE APIS ────────────────────────────────────────────
export const vaultApi = {
  getAll: () => apiReq('/v1/vault'),
  create: item => apiReq('/v1/vault', { method: 'POST', body: JSON.stringify(item) }),
  patch: (id, changes) => apiReq(`/v1/vault/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  delete: id => apiReq(`/v1/vault/${id}`, { method: 'DELETE' }),
};

// ── LOGS RESOURCE APIS ─────────────────────────────────────────────
export const logsApi = {
  getAll: () => apiReq('/v1/logs'),
  create: item => apiReq('/v1/logs', { method: 'POST', body: JSON.stringify(item) }),
};

// ── SETTINGS RESOURCE APIS ─────────────────────────────────────────
export const settingsApi = {
  get: () => apiReq('/v1/settings'),
  put: (settings, genres) => apiReq('/v1/settings', { method: 'PUT', body: JSON.stringify({ settings, genres }) }),
};

// ── FTS5 SEARCH API (WITH ABORT CONTROLLER) ──────────────────────
export async function searchFTS(query) {
  if (searchAbortController) searchAbortController.abort();
  searchAbortController = new AbortController();
  try {
    return await apiReq(`/v1/search?q=${encodeURIComponent(query)}`, { signal: searchAbortController.signal });
  } catch (e) {
    if (e.name === 'AbortError') return [];
    throw e;
  }
}

// ── R2 FILE / GAME SAVE FOLDER UPLOAD API ──────────────────────────
export async function uploadSaveFile(gameTitle, file, relativePath) {
  setSyncStatus('uploading');
  const token = getAccessToken();
  const headers = {
    'Authorization': `Bearer ${token}`,
    'X-Game-Title': gameTitle,
    'X-Filename': file.name,
    'X-Relative-Path': relativePath || file.webkitRelativePath || file.name,
    'Content-Type': 'application/octet-stream',
  };

  const res = await fetch(`${API_BASE}/v1/files/upload`, {
    method: 'POST',
    headers,
    body: file,
  });

  const json = await res.json();
  if (!res.ok || json.success === false) {
    setSyncStatus('error');
    throw new Error(json.error?.message || 'File upload failed');
  }

  setSyncStatus('saved');
  return json.data;
}
