import {
  K, DATA_VERSION, CLIENT_ID, DRIVE_SCOPE, YT_SCOPE_CONST, DRIVE_FOLDER, DRIVE_FILE,
  ls,
  DATA, setDATA,
  GENRES,
  CURRENT,
  saveData, saveGenres,
  patchScheduleDriveSync,
  pauseDriveSyncScheduling, resumeDriveSyncScheduling,
} from './utils.js';

import { render } from './routing.js';
import { nav, patchCloseMob } from './nav.js';

// ── Fallback storage-key constants ────────────────────────────────────────
// These are normally defined and set on window by their respective section
// files (vault.js, games.js, music.js, books.js, log.js, notes.js).
// The fallbacks here prevent ReferenceErrors if drive.js pushes before
// those sections have loaded, or if a section is disabled.
const VAULT_ENC_KEY    = window.VAULT_ENC_KEY    || 'ac_v4_vault_enc';
const VAULT_PUBLIC_KEY = window.VAULT_PUBLIC_KEY || 'ac_v4_vault_public';
const NOTES_ENC_KEY    = window.NOTES_ENC_KEY    || 'ac_v4_notes_enc';
// localStorage key constants — must be declared before the reader/save helpers.
const _GAMES_KEY    = 'ac_v4_games';
const _BOOKS_KEY    = 'ac_v4_books';
const _MUSIC_KEY    = 'ac_v4_music';
const _MUSIC_PL_KEY = 'ac_v4_music_playlists';
const _LOG_KEY      = 'ac_v4_log';
const _NOTES_KEY    = 'ac_v4_notes';

// Data readers: prefer the in-memory global (set by section modules), but fall back
// to localStorage so _buildSectionPayload never pushes empty arrays when a module
// hasn't lazy-loaded yet.
function _GDATA()       { return window.GDATA      || ls.get(_GAMES_KEY)    || []; }
function _MDATA()       { return window.MDATA      || ls.get(_MUSIC_KEY)    || []; }
function _MPLAYLISTS()  { return window.MPLAYLISTS || ls.get(_MUSIC_PL_KEY) || []; }
function _BDATA()       { return window.BDATA      || ls.get(_BOOKS_KEY)    || []; }
function _LDATA()       { return window.LDATA      || ls.get(_LOG_KEY)      || []; }
function _NDATA()       { return window.NDATA      || ls.get(_NOTES_KEY)    || []; }

// Save helpers: prefer the section's own save function (which updates the
// in-memory variable + localStorage), but ALWAYS fall back to a direct
// ls.set() so data is never silently dropped when a section hasn't lazy-loaded yet.
function _saveGames(d)     { if (typeof window.saveGames     === 'function') window.saveGames(d);     else { ls.set(_GAMES_KEY, d);    window.GDATA = d; } }
function _saveMusic(d)     { if (typeof window.saveMusic     === 'function') window.saveMusic(d);     else { ls.set(_MUSIC_KEY, d);    window.MDATA = d; } }
function _savePlaylists(d) { if (typeof window.savePlaylists === 'function') window.savePlaylists(d); else { ls.set(_MUSIC_PL_KEY, d); window.MPLAYLISTS = d; } }
function _saveBooks(d)     { if (typeof window.saveBooks     === 'function') window.saveBooks(d);     else { ls.set(_BOOKS_KEY, d);    window.BDATA = d; } }
function _saveLog(d)       { if (typeof window.saveLog       === 'function') window.saveLog(d);       else { ls.set(_LOG_KEY, d);      window.LDATA = d; } }
function _saveNotes(d)     { if (typeof window.saveNotes     === 'function') window.saveNotes(d);     else { ls.set(_NOTES_KEY, d);    window.NDATA = d; } }

// ═══════════════════════════════════════════════════════════════════
//  Wire up the lazy stubs declared in utils.js
// ═══════════════════════════════════════════════════════════════════
patchScheduleDriveSync(_scheduleDriveSyncImpl);
patchCloseMob(closeMob);   // nav.js needs closeMob; avoid circular import at parse time

// ── Safe toast wrapper ────────────────────────────────────────────────────
// window.toast is assigned from shared/ui.js in main.js before sections load.
// Use this instead of calling window.toast directly at module top level.
function _toast(msg, col) {
  if (typeof window.toast === 'function') window.toast(msg, col);
  else console.info('[Drive]', msg);
}


// ═══════════════════════════════════════════════════════════════════
//  MODULE-PRIVATE STATE
// ═══════════════════════════════════════════════════════════════════
let _gisReady      = false;
let _tokenClient   = null;
let _syncTimer     = null;
let _driveFolderId = null;
let _gisInitDone   = false;
let _driveInitPromise = null;
let _lastDriveInitTime = 0; // Cooldown tracker

// ═══════════════════════════════════════════════════════════════════
//  SECURE TOKEN STORAGE
// ═══════════════════════════════════════════════════════════════════
function _getToken() {
  try {
    const exp = sessionStorage.getItem(K.DEXP);
    const tok = sessionStorage.getItem(K.DTOKEN);
    return tok && Date.now() < parseInt(exp || '0') ? tok : null;
  } catch(e) { return null; }
}
function _setAccessToken(token, expMs) {
  try { sessionStorage.setItem(K.DTOKEN, token);        } catch(e) {}
  try { sessionStorage.setItem(K.DEXP,   String(expMs)); } catch(e) {}
}
function _clearAccessToken() {
  try { sessionStorage.removeItem(K.DTOKEN); } catch(e) {}
  try { sessionStorage.removeItem(K.DEXP);   } catch(e) {}
}

const _SK_KEY = 'ac_session_key';

async function _getOrCreateSessionKey() {
  try {
    const raw = sessionStorage.getItem(_SK_KEY);
    if (raw) {
      const keyBytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
      return await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt','decrypt']);
    }
  } catch(e) {}
  const key      = await crypto.subtle.generateKey({ name:'AES-GCM', length:256 }, true, ['encrypt','decrypt']);
  const exported = await crypto.subtle.exportKey('raw', key);
  const b64      = btoa(String.fromCharCode(...new Uint8Array(exported)));
  try { sessionStorage.setItem(_SK_KEY, b64); } catch(e) {}
  return key;
}

async function _encryptRefreshToken(token) {
  const key = await _getOrCreateSessionKey();
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const ct  = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(token));
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
  return b64(iv.buffer) + '.' + b64(ct);
}

async function _decryptRefreshToken(blob) {
  if (!blob) return null;
  try {
    const [ivB64, ctB64] = blob.split('.');
    if (!ivB64 || !ctB64) return null;
    const from64 = b => Uint8Array.from(atob(b), c => c.charCodeAt(0));
    const key    = await _getOrCreateSessionKey();
    const plain  = await crypto.subtle.decrypt({ name:'AES-GCM', iv:from64(ivB64) }, key, from64(ctB64));
    return new TextDecoder().decode(plain);
  } catch(e) {
    console.warn('[OAuth] Could not decrypt refresh token (new session or corrupt):', e.message);
    return null;
  }
}

async function _setRefreshToken(token) {
  const blob = await _encryptRefreshToken(token);
  try { localStorage.setItem(K_REFRESH, blob); } catch(e) {}
}

async function _getRefreshToken() {
  const blob = localStorage.getItem(K_REFRESH);
  return blob ? _decryptRefreshToken(blob) : null;
}

function _hasRefreshToken() { return !!localStorage.getItem(K_REFRESH); }

function _clearRefreshToken() {
  try { localStorage.removeItem(K_REFRESH); } catch(e) {}
}

function _isConnected() { return !!_getToken(); }

const _DRIVE_COLORS = {
  connected: '#4ade80',
  syncing:   'var(--ac)',
  pending:   'var(--ac)',
  error:     '#fb7185',
  off:       '',
};

function _updateDriveBtn(state) {
  const btn = document.getElementById('drive-btn'); if (!btn) return;
  const map = {
    connected: ['✓','Drive'],
    syncing:   ['↻','Sync…'],
    pending:   ['…','Drive'],
    error:     ['✗','Error'],
    off:       ['☁','Drive'],
  };
  const s         = state || (_isConnected() ? 'connected' : 'off');
  const [ico,txt] = map[s] || map.off;
  const spans     = btn.querySelectorAll('span');
  if (spans[0]) spans[0].textContent = ico;
  const txtSpan = btn.querySelector('.drive-status-txt');
  if (txtSpan) txtSpan.textContent = txt;
  btn.style.color = _DRIVE_COLORS[s] || '';
  btn.title = s === 'connected' ? 'Drive synced — click to disconnect'
            : s === 'syncing'   ? 'Syncing…'
            : s === 'error'     ? 'Sync error — click to retry'
            : 'Connect to Google Drive';
}

const _WORKER              = 'https://aether-codex-ai.nadeempubgmobile2-0.workers.dev';
const K_REFRESH            = 'ac_v4_refresh';
const _MAL_OAUTH_NONCE_KEY = 'ac_mal_oauth_nonce';
const _MAL_CODE_VERIFIER_KEY = 'ac_mal_code_verifier';
const _MAL_REDIRECT_URI_KEY  = 'ac_mal_redirect_uri';
const _MAL_STATE_PREFIX    = 'mal:';
const _OAUTH_NONCE_KEY     = 'ac_oauth_nonce';

function _genNonce() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

// ═══════════════════════════════════════════════════════════════════
//  AUTHORIZATION CODE FLOW
// ═══════════════════════════════════════════════════════════════════
function _startOAuthFlow() {
  const redirectUri  = _getRedirectUri();
  const section      = localStorage.getItem('ac_last_section') || 'home';
  const nonce        = _genNonce();
  try { sessionStorage.setItem(_OAUTH_NONCE_KEY, nonce); } catch(e){}
  try { localStorage.setItem(_OAUTH_NONCE_KEY, nonce);   } catch(e){}
  const stateParam   = nonce + ':' + section;

  const params = new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         DRIVE_SCOPE + ' ' + YT_SCOPE_CONST,
    access_type:   'offline',
    prompt:        'consent',
    state:         stateParam,
  });
  const oauthUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();

  if (window.electronBridge) {
    _updateDriveBtn('syncing');
    window.electronBridge.openOAuth(oauthUrl).then(async result => {
      if (result.error) {
        if (result.error !== 'popup_closed') _toast('Drive auth failed: ' + result.error, '#fb7185');
        _updateDriveBtn('off');
        return;
      }
      await _exchangeCode(result.code, redirectUri, result.state || stateParam, true);
    });
  } else {
    _showRedirectingOverlay();
    setTimeout(() => { location.href = oauthUrl; }, 80);
  }
}

/** Must match Google Cloud OAuth "Authorized redirect URIs" (e.g. https://YOUR-HOST/auth/callback — same origin as the app). */
const OAUTH_CALLBACK_PATH = '/auth/callback';

function _getRedirectUri() {
  return location.origin + OAUTH_CALLBACK_PATH;
}

function _replaceOAuthUrlWithHash(section) {
  const s = section || 'home';
  try {
    history.replaceState({}, '', '/#/' + s);
  } catch (e) {}
}

function _showRedirectingOverlay(service = 'Google') {
  if (document.getElementById('_oauth_overlay')) return;
  const d = document.createElement('div');
  d.id = '_oauth_overlay';
  d.style.cssText = [
    'position:fixed;inset:0;z-index:99999',
    'background:#070d0b',
    'display:flex;flex-direction:column;align-items:center;justify-content:center',
    'gap:16px;color:#7aab95;font-family:Outfit,sans-serif;font-size:14px',
  ].join(';');
  d.innerHTML = `
    <div style="font-family:'Outfit',sans-serif;font-size:22px;font-weight:700;color:#38bdf8">The Aether Codex</div>
    <div style="display:flex;align-items:center;gap:8px">
      <div style="width:18px;height:18px;border:2px solid rgba(255,255,255,.1);border-top-color:#38bdf8;border-radius:50%;animation:_spin .7s linear infinite"></div>
      Redirecting to ${service}…
    </div>
    <style>@keyframes _spin{to{transform:rotate(360deg)}}</style>`;
  document.body.appendChild(d);
}

async function _exchangeCode(code, redirectUri, stateParam, skipNonceCheck = false) {
  if (!skipNonceCheck) {
    const storedNonce   = _getStoredNonce();
    const returnedNonce = (stateParam || '').split(':')[0];
    if (!storedNonce || storedNonce !== returnedNonce) {
      console.warn('[OAuth] Nonce mismatch — storage may have been cleared by browser.');
    }
    _clearStoredNonce();
  }

  _updateDriveBtn('syncing');
  try {
    const res = await fetch(_WORKER, {
      method:  'POST',
      headers: { 'Content-Type':'application/json', 'X-Action':'exchange_code' },
      body:    JSON.stringify({ code, redirect_uri: redirectUri }),
    });
    if (!res.ok) { const txt = await res.text(); throw new Error(`Worker ${res.status}: ${txt.slice(0,200)}`); }
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
    if (!data.access_token) throw new Error('No access token received from worker');

    _setAccessToken(data.access_token, Date.now() + (data.expires_in - 60) * 1000);
    if (data.refresh_token) await _setRefreshToken(data.refresh_token);

    _updateDriveBtn('syncing');
    await _driveInit();

    const section = (stateParam || '').split(':')[1] || 'home';
    if (section) nav(section);
    return true;
  } catch(e) {
    console.error('[OAuth] exchange_code failed:', e);
    _toast('Drive auth failed: ' + e.message, '#fb7185');
    _updateDriveBtn('error');
    return false;
  }
}

function _getStoredNonce() {
  try { const v = sessionStorage.getItem(_OAUTH_NONCE_KEY); if (v) return v; } catch(e){}
  try { return localStorage.getItem(_OAUTH_NONCE_KEY); } catch(e){ return null; }
}

function _clearStoredNonce() {
  try { sessionStorage.removeItem(_OAUTH_NONCE_KEY); } catch(e){}
  try { localStorage.removeItem(_OAUTH_NONCE_KEY);   } catch(e){}
}

async function _handleOAuthRedirect() {
  if (window.electronBridge) return false;
  const params = new URLSearchParams(location.search);
  const code   = params.get('code');
  const state  = params.get('state');
  const error  = params.get('error');
  if (!code && !error) return false;

  const redirectUri = _getRedirectUri();
  try {
    const section = (state || '').split(':')[1] || 'home';
    _replaceOAuthUrlWithHash(section);
  } catch(e){}

  const ov = document.getElementById('_oauth_overlay');
  if (ov) ov.remove();

  if (error) {
    setTimeout(() => _toast('Google sign-in cancelled or denied: ' + error, '#fb7185'), 100);
    _updateDriveBtn('off');
    return true;
  }

  _showSigningInBanner();
  await _exchangeCode(code, redirectUri, state || '');
  _hideSigningInBanner();
  return true;
}

function _showSigningInBanner() {
  if (document.getElementById('_oauth_banner')) return;
  const d = document.createElement('div');
  d.id = '_oauth_banner';
  d.style.cssText = [
    'position:fixed;top:0;left:0;right:0;z-index:99999',
    'background:#0d1512;border-bottom:1px solid #1e3329',
    'padding:10px 16px;display:flex;align-items:center;gap:10px',
    'font-family:Outfit,sans-serif;font-size:13px;color:#7aab95',
  ].join(';');
  d.innerHTML = `
    <div style="width:16px;height:16px;border:2px solid rgba(255,255,255,.1);border-top-color:#38bdf8;border-radius:50%;animation:_spin .7s linear infinite;flex-shrink:0"></div>
    Completing Google sign-in…`;
  document.body.prepend(d);
}

function _hideSigningInBanner() {
  const d = document.getElementById('_oauth_banner');
  if (d) d.remove();
}

function _getMALStoredValue(key) {
  try { const v = sessionStorage.getItem(key); if (v) return v; } catch(e){}
  try { return localStorage.getItem(key); } catch(e){ return null; }
}

function _setMALStoredValue(key, value) {
  try { sessionStorage.setItem(key, value); } catch(e){}
  try { localStorage.setItem(key, value);   } catch(e){}
}

function _clearMALStoredValues() {
  [_MAL_OAUTH_NONCE_KEY, _MAL_CODE_VERIFIER_KEY, _MAL_REDIRECT_URI_KEY].forEach(k => {
    try { sessionStorage.removeItem(k); } catch(e){}
    try { localStorage.removeItem(k);   } catch(e){}
  });
}

function _base64UrlEncode(bytes) {
  let str = '';
  bytes.forEach(byte => { str += String.fromCharCode(byte); });
  return btoa(str).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function _sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return _base64UrlEncode(new Uint8Array(hash));
}

function _generatePKCEVerifier() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => ('0' + b.toString(16)).slice(-2)).join('');
}

async function _startMALAuth() {
  const redirectUri   = _getRedirectUri();
  const section       = localStorage.getItem('ac_last_section') || 'settings';
  const nonce         = _genNonce();
  const state         = _MAL_STATE_PREFIX + nonce + ':' + section;
  const codeVerifier  = _generatePKCEVerifier();
  const codeChallenge = codeVerifier;
  _setMALStoredValue(_MAL_OAUTH_NONCE_KEY,    state);
  _setMALStoredValue(_MAL_CODE_VERIFIER_KEY,  codeVerifier);
  _setMALStoredValue(_MAL_REDIRECT_URI_KEY,   redirectUri);

  const res = await fetch(_WORKER, {
    method:  'POST',
    headers: { 'Content-Type':'application/json', 'X-Action':'mal_authorize_url' },
    body:    JSON.stringify({ redirect_uri:redirectUri, code_challenge:codeChallenge, state }),
  });
  if (!res.ok) { const body = await res.text(); throw new Error(`MAL auth failed: ${body}`); }
  const data      = await res.json();
  const oauthUrl  = data.url;

  console.log('[MAL OAuth] authorize URL', oauthUrl);
  if (window.electronBridge) {
    _showRedirectingOverlay('MyAnimeList');
    window.electronBridge.openOAuth(oauthUrl).then(async result => {
      if (result.error) {
        if (result.error !== 'popup_closed') _toast('MAL auth failed: ' + result.error, '#fb7185');
        return;
      }
      await _exchangeMALCode(result.code, redirectUri, result.state || state, true);
    });
  } else {
    _showRedirectingOverlay('MyAnimeList');
    setTimeout(() => { location.href = oauthUrl; }, 80);
  }
}

async function _exchangeMALCode(code, redirectUri, stateParam, skipNonceCheck = false) {
  const codeVerifier = _getMALStoredValue(_MAL_CODE_VERIFIER_KEY);
  if (!codeVerifier) throw new Error('MAL PKCE verifier is missing. Please retry the connection flow.');
  if (!skipNonceCheck) {
    const storedState = _getMALStoredValue(_MAL_OAUTH_NONCE_KEY);
    if (!storedState || storedState !== stateParam) {
      console.warn('[MAL OAuth] State mismatch or missing stored state.');
    }
    _clearMALStoredValues();
  }

  _showSigningInBanner();
  try {
    const payload = { code, code_verifier:codeVerifier, redirect_uri:redirectUri };
    const res = await fetch(_WORKER, {
      method:  'POST',
      headers: { 'Content-Type':'application/json', 'X-Action':'mal_exchange_code' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) { const body = await res.text(); _toast(`MAL token exchange failed: ${body}`, '#fb7185'); throw new Error(`MAL token exchange failed: ${body}`); }
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error || 'MAL token exchange failed');
    window.SETTINGS.malAccessToken  = data.access_token  || null;
    window.SETTINGS.malRefreshToken = data.refresh_token || window.SETTINGS.malRefreshToken || null;
    window.SETTINGS.malTokenExpiry  = data.expires_in ? String(Date.now() + (data.expires_in - 60) * 1000) : window.SETTINGS.malTokenExpiry || null;
    window.saveSettings(window.SETTINGS);
    _toast('✓ MAL account connected', 'var(--cd)');
    if (typeof window.renderSettingsBody === 'function' && CURRENT === 'settings') window.renderSettingsBody();
    return true;
  } catch(e) {
    _toast('MAL auth failed: ' + e.message, '#fb7185');
    console.error('[MAL OAuth] exchange failed:', e);
    return false;
  } finally {
    _hideSigningInBanner();
  }
}

async function _refreshMALAccessToken() {
  const refreshToken = window.SETTINGS?.malRefreshToken;
  if (!refreshToken) return false;
  try {
    const res = await fetch(_WORKER, {
      method:  'POST',
      headers: { 'Content-Type':'application/json', 'X-Action':'mal_refresh_token' },
      body:    JSON.stringify({ refresh_token:refreshToken }),
    });
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
    window.SETTINGS.malAccessToken  = data.access_token;
    window.SETTINGS.malTokenExpiry  = data.expires_in ? String(Date.now() + (data.expires_in - 60) * 1000) : window.SETTINGS.malTokenExpiry;
    if (data.refresh_token) window.SETTINGS.malRefreshToken = data.refresh_token;
    window.saveSettings(window.SETTINGS);
    return true;
  } catch(e) {
    console.warn('[MAL OAuth] Token refresh failed:', e.message);
    return false;
  }
}

async function _handleMALRedirect() {
  if (window.electronBridge) return false;
  const params = new URLSearchParams(location.search);
  const code   = params.get('code');
  const state  = params.get('state');
  const error  = params.get('error');
  if (!code && !error) return false;
  if (!state || !state.startsWith(_MAL_STATE_PREFIX)) return false;

  const redirectUri = _getMALStoredValue(_MAL_REDIRECT_URI_KEY) || _getRedirectUri();
  try {
    const parts   = (state || '').split(':');
    const section = parts.slice(2).join(':') || 'settings';
    _replaceOAuthUrlWithHash(section);
  } catch(e) {}

  const ov = document.getElementById('_oauth_overlay');
  if (ov) ov.remove();

  if (error) {
    setTimeout(() => _toast('MAL sign-in cancelled or denied: ' + error, '#fb7185'), 100);
    return true;
  }
  _showSigningInBanner();
  await _exchangeMALCode(code, redirectUri, state || '', false);
  _hideSigningInBanner();
  return true;
}

// ═══════════════════════════════════════════════════════════════════
//  TOKEN REFRESH
// ═══════════════════════════════════════════════════════════════════
async function _refreshAccessToken() {
  const refreshToken = await _getRefreshToken();
  if (!refreshToken) return false;
  try {
    const res = await fetch(_WORKER, {
      method:  'POST',
      headers: { 'Content-Type':'application/json', 'X-Action':'refresh_token' },
      body:    JSON.stringify({ refresh_token:refreshToken }),
    });
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
    _setAccessToken(data.access_token, Date.now() + (data.expires_in - 60) * 1000);
    return true;
  } catch(e) {
    console.warn('[OAuth] Token refresh failed:', e.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════════════
export async function initGIS() {
  if (_gisInitDone) return;
  _gisInitDone = true;

  const handledMAL = await _handleMALRedirect();
  if (handledMAL) return;
  const handled = await _handleOAuthRedirect();
  if (handled) return;

  _gisReady = true;

  if (_isConnected()) {
    _updateDriveBtn('syncing');
    _driveInit();
  } else if (_hasRefreshToken()) {
    _updateDriveBtn('syncing');
    const ok = await _refreshAccessToken();
    if (ok) _driveInit();
    else    _updateDriveBtn('off');
  } else {
    _updateDriveBtn('off');
  }
}

function _saveToken(resp) {
  _setAccessToken(resp.access_token, Date.now() + (resp.expires_in - 60) * 1000);
  _updateDriveBtn('syncing');
  _driveInit();
}

function _showDriveHint() {
  setTimeout(() => {
    const el = document.getElementById('drive-hint-inner');
    if (el && DATA.length === 0 && !_isConnected()) el.style.display = 'flex';
  }, 300);
}

// ── Drive button click ──
export function driveAction() {
  if (_isConnected() || _hasRefreshToken()) {
    showConfirm('Your data will stay in localStorage. You can reconnect anytime.', () => {
      _clearAccessToken();
      _clearRefreshToken();
      ls.del(K.DFILE); ls.del(K.DSYNC);
      ALL_SECTIONS.forEach(s => ls.del(_sectionFileKey(s)));
      _driveFolderId = null; _updateDriveBtn('off'); _toast('Disconnected from Drive');
    }, { title:'Disconnect Drive?', okLabel:'Disconnect', danger:false });
  } else {
    _startOAuthFlow();
  }
}

// ═══════════════════════════════════════════════════════════════════
//  AUTHENTICATED FETCH WRAPPER
// ═══════════════════════════════════════════════════════════════════
async function _req(url, opts = {}) {
  let token = _getToken();
  if (!token) {
    if (_hasRefreshToken()) {
      const ok = await _refreshAccessToken();
      if (ok) token = _getToken();
    }
    if (!token) { _updateDriveBtn('off'); return null; }
  }
  try {
    const r = await fetch(url, { ...opts, headers:{ Authorization:`Bearer ${token}`, ...(opts.headers||{}) } });
    if (r.status === 401) {
      if (_hasRefreshToken()) {
        const ok = await _refreshAccessToken();
        if (ok) {
          const t2 = _getToken();
          if (t2) return fetch(url, { ...opts, headers:{ Authorization:`Bearer ${t2}`, ...(opts.headers||{}) } });
        }
      }
      _clearAccessToken(); _clearRefreshToken(); _updateDriveBtn('off'); return null;
    }
    return r;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════
//  SECTION FILE MAP — one JSON per section on Drive
// ═══════════════════════════════════════════════════════════════════
const SECTION_FILES = {
  media:    'ac_media.json',
  games:    'ac_games.json',
  books:    'ac_books.json',
  music:    'ac_music.json',
  notes:    'ac_notes.json',
  vault:    'ac_vault.json',
  log:      'ac_log.json',
  settings: 'ac_settings.json',
};
const ALL_SECTIONS = Object.keys(SECTION_FILES);

/** localStorage key for cached Drive file ID per section. */
function _sectionFileKey(section) { return `ac_v4_dfile_${section}`; }

/** Build the JSON payload for one section from current in-memory state. */
function _buildSectionPayload(section) {
  const savedAt = parseInt(ls.str(K.SAVED) || '0');
  switch (section) {
    case 'media':
      return { version: DATA_VERSION, savedAt, data: DATA, genres: GENRES };
    case 'games':
      return { version: DATA_VERSION, savedAt, games: _GDATA() };
    case 'books':
      return { version: DATA_VERSION, savedAt, books: _BDATA() };
    case 'music':
      return { version: DATA_VERSION, savedAt, music: _MDATA(), playlists: _MPLAYLISTS() };
    case 'notes':
      return { version: DATA_VERSION, savedAt, notes: _NDATA(), notes_enc: ls.get(NOTES_ENC_KEY) || null };
    case 'vault':
      return { version: DATA_VERSION, savedAt, vault_enc: ls.get(VAULT_ENC_KEY) || null, vault_public: ls.get(VAULT_PUBLIC_KEY) || null };
    case 'log':
      return { version: DATA_VERSION, savedAt, log: _LDATA() };
    case 'settings':
      return { version: DATA_VERSION, savedAt, settings: window.SETTINGS || {} };
    default:
      return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  DRIVE FILE / FOLDER HELPERS
// ═══════════════════════════════════════════════════════════════════
async function _getOrCreateFolder() {
  if (_driveFolderId) return _driveFolderId;
  const r = await _req(`https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FOLDER}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id)`);
  if (!r) return null;
  const d = await r.json();
  if (d.files?.length) { _driveFolderId = d.files[0].id; return _driveFolderId; }
  const cr = await _req('https://www.googleapis.com/drive/v3/files', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ name:DRIVE_FOLDER, mimeType:'application/vnd.google-apps.folder' }),
  });
  if (!cr) return null;
  const cf = await cr.json(); _driveFolderId = cf.id; return _driveFolderId;
}

/**
 * Resolve (or create) the Drive file for a single section.
 * Caches the file ID in localStorage per section.
 */
async function _getOrCreateSectionFile(section) {
  const cacheKey = _sectionFileKey(section);
  const cached = ls.str(cacheKey); if (cached) return cached;
  const folderId = await _getOrCreateFolder(); if (!folderId) return null;
  const fileName = SECTION_FILES[section];
  const r = await _req(`https://www.googleapis.com/drive/v3/files?q=name='${fileName}'+and+'${folderId}'+in+parents+and+trashed=false&fields=files(id,modifiedTime)`);
  if (!r) return null;
  const d = await r.json();
  if (d.files?.length) { ls.setStr(cacheKey, d.files[0].id); return d.files[0].id; }
  const cr = await _req('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method:'POST',
    headers:{'Content-Type':'multipart/related; boundary=boundary'},
    body:`--boundary\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({name:fileName,parents:[folderId]})}\r\n--boundary\r\nContent-Type: application/json\r\n\r\n{}\r\n--boundary--`,
  });
  if (!cr) return null;
  const cf = await cr.json(); ls.setStr(cacheKey, cf.id); return cf.id;
}

/** Legacy single-file lookup — used only for migration. */
async function _getLegacySingleFile() {
  const cached = ls.str(K.DFILE); if (cached) return cached;
  const folderId = await _getOrCreateFolder(); if (!folderId) return null;
  const r = await _req(`https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FILE}'+and+'${folderId}'+in+parents+and+trashed=false&fields=files(id,modifiedTime)`);
  if (!r) return null;
  const d = await r.json();
  if (d.files?.length) { ls.setStr(K.DFILE, d.files[0].id); return d.files[0].id; }
  return null;
}



// ═══════════════════════════════════════════════════════════════════
//  PUSH / PULL / MERGE
// ═══════════════════════════════════════════════════════════════════

/**
 * Push one or more sections to Drive.
 * @param {Object} opts
 * @param {string[]} [opts.sections] — keys to push; defaults to ALL_SECTIONS
 * @param {boolean}  [opts.silentToast]
 */
async function _pushToDrive(opts = {}) {
  const silentToast = !!opts.silentToast;
  const sections = opts.sections || ALL_SECTIONS;
  _updateDriveBtn('syncing');
  try {
    const results = await Promise.all(sections.map(async section => {
      const fileId = await _getOrCreateSectionFile(section); if (!fileId) throw new Error(`No file for ${section}`);
      const payload = _buildSectionPayload(section);
      if (!payload) return;
      const r = await _req(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload),
      });
      if (!r || !r.ok) throw new Error(`Upload failed for ${section}`);
    }));
    ls.setStr(K.DSYNC, String(Date.now()));
    _updateDriveBtn('connected');
    if (!silentToast) _toast('✓ Saved to Google Drive', '#4ade80');
    if (typeof window.refreshDriveSyncIfVisible === 'function') window.refreshDriveSyncIfVisible();
  } catch(e) {
    _updateDriveBtn('error');
    _toast('Drive sync failed: ' + e.message, '#fb7185');
    throw e;
  }
}

/**
 * Pull all section files from Drive and return a merged remote object.
 * Also handles backward-compat migration from the old single-file format.
 */
async function _pullFromDrive() {
  try {
    // ── Check for legacy single-file & migrate if present ──
    const legacyId = await _getLegacySingleFile();
    if (legacyId) {
      const lr = await _req(`https://www.googleapis.com/drive/v3/files/${legacyId}?alt=media`);
      if (lr && lr.ok) {
        const legacyData = await lr.json();
        if (legacyData && legacyData.version != null) {
          console.info('[Drive] Found legacy single-file format — migrating to split files…');
          // Write each section file from the legacy blob
          await _migrateLegacyToSplit(legacyData);
          // Trash the old file so migration doesn't repeat
          await _req(`https://www.googleapis.com/drive/v3/files/${legacyId}`, {
            method:'PATCH', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ trashed: true }),
          });
          ls.del(K.DFILE);
          _toast('✓ Drive data migrated to split files', '#4ade80');
          return legacyData; // Return the legacy data for the current merge cycle
        }
      }
    }

    // ── Fetch all section files in parallel ──
    const remoteChunks = await Promise.all(ALL_SECTIONS.map(async section => {
      const fileId = await _getOrCreateSectionFile(section); if (!fileId) return null;
      const r = await _req(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
      if (!r || !r.ok) return null;
      try { return await r.json(); } catch { return null; }
    }));

    // Merge into a single "remote" object the same shape as the old single-file
    const remote = {};
    ALL_SECTIONS.forEach((section, i) => {
      const chunk = remoteChunks[i];
      if (!chunk || chunk.version == null) return;
      Object.assign(remote, chunk);
    });
    // Only return if we got at least one valid section
    if (Object.keys(remote).length === 0) return null;
    if (!remote.version) remote.version = DATA_VERSION;
    return remote;
  } catch { return null; }
}

/**
 * Write the legacy single-file blob into the per-section split files.
 */
async function _migrateLegacyToSplit(legacy) {
  const savedAt = legacy.savedAt || 0;
  const sectionPayloads = {
    media:    { version: DATA_VERSION, savedAt, data: legacy.data || [], genres: legacy.genres || [] },
    games:    { version: DATA_VERSION, savedAt, games: legacy.games || [] },
    books:    { version: DATA_VERSION, savedAt, books: legacy.books || [] },
    music:    { version: DATA_VERSION, savedAt, music: legacy.music || [], playlists: legacy.playlists || [] },
    notes:    { version: DATA_VERSION, savedAt, notes: legacy.notes || [], notes_enc: legacy.notes_enc || null },
    vault:    { version: DATA_VERSION, savedAt, vault_enc: legacy.vault_enc || null, vault_public: legacy.vault_public || null },
    log:      { version: DATA_VERSION, savedAt, log: legacy.log || [] },
    settings: { version: DATA_VERSION, savedAt, settings: {} },
  };
  await Promise.all(ALL_SECTIONS.map(async section => {
    const fileId = await _getOrCreateSectionFile(section); if (!fileId) return;
    const r = await _req(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(sectionPayloads[section]),
    });
    if (!r || !r.ok) console.warn(`[Drive] Migration: failed to write ${section}`);
  }));
}

function _mergeData(local, remote) {
  const map = new Map();
  local.forEach(e  => map.set(e.id, e));
  remote.forEach(e => {
    const l = map.get(e.id);
    if (!l || (e.updatedAt || 0) > (l.updatedAt || 0)) map.set(e.id, e);
  });
  return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
}

/** Merge rows with id; keep the copy with the higher score (e.g. updatedAt, ts, lastSync). */
function _mergeRowsById(local, remote, scoreFn) {
  const map = new Map();
  (local || []).forEach(e => { if (e && e.id != null) map.set(e.id, e); });
  (remote || []).forEach(e => {
    if (!e || e.id == null) return;
    const l = map.get(e.id);
    if (!l || scoreFn(e) >= scoreFn(l)) map.set(e.id, e);
  });
  return Array.from(map.values());
}

function _mergePlaylists(local, remote) {
  const sc = p => (p.updatedAt || p.lastSync || 0);
  return _mergeRowsById(local, remote, sc);
}

function _mergeLogEntries(local, remote) {
  const sc = e => (e.ts || 0);
  const merged = _mergeRowsById(local, remote, sc);
  return merged.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

/**
 * Merge a valid remote backup into local state (per-entry / per-id newer wins).
 * Does not persist alone — caller runs saveData / _save* and _pushToDrive.
 */
function _mergeRemoteIntoLocal(remote, localSavedBefore) {
  const remoteSaved = remote.savedAt || 0;

  setDATA(_mergeData(DATA, remote.data || []));

  if (remote.genres && Array.isArray(remote.genres)) {
    const gids = new Set(GENRES.map(g => g.id));
    remote.genres.filter(g => g && g.id && !gids.has(g.id)).forEach(g => GENRES.push(g));
    saveGenres(GENRES);
  }

  if (remote.games && Array.isArray(remote.games)) {
    const d = _mergeData(_GDATA(), remote.games);
    window.GDATA = d;
    _saveGames(d);
  }
  if (remote.music && Array.isArray(remote.music)) {
    const d = _mergeData(_MDATA(), remote.music);
    window.MDATA = d;
    _saveMusic(d);
  }
  if (remote.playlists && Array.isArray(remote.playlists)) {
    const d = _mergePlaylists(_MPLAYLISTS(), remote.playlists);
    window.MPLAYLISTS = d;
    _savePlaylists(d);
  }
  if (remote.books && Array.isArray(remote.books)) {
    const d = _mergeData(_BDATA(), remote.books);
    window.BDATA = d;
    _saveBooks(d);
  }

  if (remote.vault_enc) {
    ls.set(VAULT_ENC_KEY, remote.vault_enc);
  }
  if (remote.vault_public && Array.isArray(remote.vault_public)) {
    const merged = _mergeRowsById(ls.get(VAULT_PUBLIC_KEY) || [], remote.vault_public, e => e.updatedAt || e.addedAt || 0);
    ls.set(VAULT_PUBLIC_KEY, merged);
    if (typeof window.reloadVaultPublicFromStorage === 'function') window.reloadVaultPublicFromStorage();
  }

  if (remote.log && Array.isArray(remote.log)) {
    const d = _mergeLogEntries(_LDATA(), remote.log);
    window.LDATA = d;
    _saveLog(d);
  }
  if (remote.notes && Array.isArray(remote.notes)) {
    const d = _mergeData(_NDATA(), remote.notes);
    window.NDATA = d;
    _saveNotes(d);
  }
  if (remote.notes_enc) {
    ls.set(NOTES_ENC_KEY, remote.notes_enc);
  }
}

/**
 * Pull / merge / push. Use `force: true` for “Sync Now” so it never joins a stale in-flight run as a no-op.
 * Concurrent auto-sync calls share one in-flight promise instead of overlapping GET/PATCH storms.
 */
async function _driveInit(opts = {}) {
  const force = opts.force === true;

  // Rate-limit consecutive runs to prevent XHR request loops (GET/PATCH storms)
  // unless explicitly forced by a user action like 'Sync Now'.
  const now = Date.now();
  if (!force && now - _lastDriveInitTime < 5000) {
    console.log('[Drive] Debounced _driveInit auto-call (too soon).');
    return _driveInitPromise || Promise.resolve();
  }
  _lastDriveInitTime = now;

  if (_driveInitPromise) {
    if (force) {
      try { await _driveInitPromise; } catch (e) { /* ignore; fresh run below */ }
    } else {
      return _driveInitPromise;
    }
  }
  const p = _runDriveInit();
  _driveInitPromise = p.finally(() => {
    if (_driveInitPromise === p) _driveInitPromise = null;
  });
  return p;
}

async function _runDriveInit() {
  clearTimeout(_syncTimer);
  _syncTimer = null;
  pauseDriveSyncScheduling();
  _updateDriveBtn('syncing');
  const localSavedBefore = parseInt(ls.str(K.SAVED) || '0', 10) || 0;
  try {
    const remote = await _pullFromDrive();
    // New or empty Drive file parses as {} — truthy but has no version; must upload or first sync never runs.
    if (!remote || remote.version == null) {
      await _pushToDrive();
      _toast('✓ Pushed local data to Google Drive', '#4ade80');
      return;
    }
    // Always merge remote into local (per-entry newer wins). File-level savedAt alone is wrong because any
    // local edit bumps K.SAVED and would skip pulling rows that exist only on Drive.
    _mergeRemoteIntoLocal(remote, localSavedBefore);
    saveData(DATA);
    try {
      render(); // Wrap in try-catch to prevent external extensions (e.g. index.js: cssRules) from crashing the promise
    } catch (renderErr) {
      console.warn('[Drive] UI Render encountered an error after merging:', renderErr);
    }
    await _pushToDrive({ silentToast: true });
    _toast('✓ Synced with Google Drive', '#4ade80');
  } finally {
    resumeDriveSyncScheduling();
    if (typeof window.refreshDriveSyncIfVisible === 'function') window.refreshDriveSyncIfVisible();
  }
}

/**
 * Debounced upload only (PATCH). Does not pull from Drive — avoids GET+PATCH loops from saveData/saveGames
 * each scheduling a full reconcile. Pull+merge runs on connect (initGIS), OAuth, and “Sync Now”.
 */
let _dirtySections = new Set();

function _scheduleDriveSyncImpl(sectionKey) {
  if (!_isConnected()) return;
  if (sectionKey) _dirtySections.add(sectionKey);
  else ALL_SECTIONS.forEach(s => _dirtySections.add(s));
  clearTimeout(_syncTimer);
  _updateDriveBtn('pending');
  _syncTimer = setTimeout(async () => {
    _syncTimer = null;
    if (!_isConnected()) return;
    if (_driveInitPromise) {
      try { await _driveInitPromise; } catch (e) { /* reconcile failed; still try push */ }
    }
    if (!_isConnected()) return;
    const toPush = [..._dirtySections];
    _dirtySections.clear();
    // Log entries are created alongside most section saves; piggyback them
    if (!toPush.includes('log')) toPush.push('log');
    try {
      await _pushToDrive({ sections: toPush, silentToast: true });
    } catch (e) {
      console.error('[Drive] auto-push:', e);
    }
  }, 3000);
}

// Exported so utils.js can wire it up via patchScheduleDriveSync().
export { _scheduleDriveSyncImpl as scheduleDriveSync };

// ═══════════════════════════════════════════════════════════════════
//  MOBILE SIDEBAR
// ═══════════════════════════════════════════════════════════════════
export function openMob() {
  document.getElementById('mob-ov').classList.add('show');
  document.getElementById('mob-sb').classList.add('open');
}
export function closeMob() {
  document.getElementById('mob-ov').classList.remove('show');
  document.getElementById('mob-sb').classList.remove('open');
}

// ═══════════════════════════════════════════════════════════════════
//  BOOTSTRAP — fired by main.js after all modules are loaded
// ═══════════════════════════════════════════════════════════════════
export async function driveBootstrap() {
  try {
    const result = typeof window.runMigrationV1 === 'function' ? await window.runMigrationV1() : { ran: false };
    if (result.ran) {
      _toast(
        `✓ Schema updated: ${result.entriesAfter} flat entries ` +
        `(${result.groups} group${result.groups !== 1 ? 's' : ''} expanded)`,
        'var(--ac)'
      );
      render();
    }
  } catch(e) {
    console.error('[Migration V1] Fatal error:', e);
  }
  initGIS().catch(e => console.error('[Drive] initGIS error:', e));
}

// Expose internals needed by settings.js and other sections
window._isConnected = _isConnected;
window._pushToDrive = _pushToDrive;
window._startMALAuth = _startMALAuth;
window._WORKER = _WORKER;

/** Full bidirectional sync — also assigned on window from main.js for inline onclick. */
export async function syncDrive() {
  try {
    await _driveInit({ force: true });
  } catch (e) {
    console.error('[Drive] syncDrive', e);
  }
}
