import {
  K, DATA_VERSION, CLIENT_ID, DRIVE_SCOPE, YT_SCOPE_CONST, DRIVE_FOLDER, DRIVE_FILE,
  ls,
  DATA, setDATA,
  GENRES,
  CURRENT,
  saveData, saveGenres,
  patchScheduleDriveSync,
} from './utils.js';

import { render } from './routing.js';
import { nav, patchCloseMob } from './nav.js';

// ── Fallback storage-key constants ────────────────────────────────────────
// These are normally defined and set on window by their respective section
// files (vault.js, games.js, music.js, books.js, log.js, notes.js).
// The fallbacks here prevent ReferenceErrors if drive.js pushes before
// those sections have loaded, or if a section is disabled.
const VAULT_ENC_KEY    = window.VAULT_ENC_KEY    || 'ac_v4_vault_enc';
const VAULT_PUBLIC_KEY = window.VAULT_PUBLIC_KEY || 'ac_v4_vault_pub';
const NOTES_ENC_KEY    = window.NOTES_ENC_KEY    || 'ac_v4_notes_enc';
function _GDATA()       { return window.GDATA      || []; }
function _MDATA()       { return window.MDATA      || []; }
function _MPLAYLISTS()  { return window.MPLAYLISTS || []; }
function _BDATA()       { return window.BDATA      || []; }
function _LDATA()       { return window.LDATA      || []; }
function _NDATA()       { return window.NDATA      || []; }
function _saveGames(d)      { if (typeof window.saveGames      === 'function') window.saveGames(d);      }
function _saveMusic(d)      { if (typeof window.saveMusic      === 'function') window.saveMusic(d);      }
function _savePlaylists(d)  { if (typeof window.savePlaylists  === 'function') window.savePlaylists(d);  }
function _saveBooks(d)      { if (typeof window.saveBooks      === 'function') window.saveBooks(d);      }
function _saveLog(d)        { if (typeof window.saveLog        === 'function') window.saveLog(d);        }
function _saveNotes(d)      { if (typeof window.saveNotes      === 'function') window.saveNotes(d);      }

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

/** Must match Google Cloud OAuth "Authorized redirect URIs" (e.g. https://aether-codex.pages.dev/auth/callback). */
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

async function _getOrCreateFile() {
  const cached = ls.str(K.DFILE); if (cached) return cached;
  const folderId = await _getOrCreateFolder(); if (!folderId) return null;
  const r = await _req(`https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FILE}'+and+'${folderId}'+in+parents+and+trashed=false&fields=files(id,modifiedTime)`);
  if (!r) return null;
  const d = await r.json();
  if (d.files?.length) { ls.setStr(K.DFILE, d.files[0].id); return d.files[0].id; }
  const cr = await _req('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method:'POST',
    headers:{'Content-Type':'multipart/related; boundary=boundary'},
    body:`--boundary\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({name:DRIVE_FILE,parents:[folderId]})}\r\n--boundary\r\nContent-Type: application/json\r\n\r\n{}\r\n--boundary--`,
  });
  if (!cr) return null;
  const cf = await cr.json(); ls.setStr(K.DFILE, cf.id); return cf.id;
}

// ═══════════════════════════════════════════════════════════════════
//  PUSH / PULL / MERGE
// ═══════════════════════════════════════════════════════════════════
async function _pushToDrive() {
  _updateDriveBtn('syncing');
  try {
    const fileId      = await _getOrCreateFile(); if (!fileId) throw new Error('No file');
    const vaultEnc    = ls.get(VAULT_ENC_KEY)    || null;
    const vaultPublic = ls.get(VAULT_PUBLIC_KEY) || null;
    const notesEnc    = ls.get(NOTES_ENC_KEY)    || null;
    const notesData   = _NDATA();
    const payload     = JSON.stringify({
      version:DATA_VERSION, savedAt:parseInt(ls.str(K.SAVED)||'0'),
      data:DATA, genres:GENRES, games:_GDATA(), music:_MDATA(), playlists:_MPLAYLISTS(),
      books:_BDATA(), vault_enc:vaultEnc, vault_public:vaultPublic,
      log:_LDATA(), notes:notesData, notes_enc:notesEnc,
    });
    const r = await _req(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
      method:'PATCH', headers:{'Content-Type':'application/json'}, body:payload,
    });
    if (!r || !r.ok) throw new Error('Upload failed');
    ls.setStr(K.DSYNC, String(Date.now()));
    _updateDriveBtn('connected');
  } catch(e) { _updateDriveBtn('error'); _toast('Drive sync failed: ' + e.message, '#fb7185'); }
}

async function _pullFromDrive() {
  try {
    const fileId = await _getOrCreateFile(); if (!fileId) return null;
    const r = await _req(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    if (!r || !r.ok) return null;
    return await r.json();
  } catch { return null; }
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

async function _driveInit() {
  _updateDriveBtn('syncing');
  const remote = await _pullFromDrive();
  if (!remote) { await _pushToDrive(); return; }
  const localSaved  = parseInt(ls.str(K.SAVED) || '0');
  const remoteSaved = remote.savedAt || 0;
  if (remoteSaved > localSaved) {
    setDATA(_mergeData(DATA, remote.data || []));
    if (remote.genres) {
      const gids = new Set(GENRES.map(g => g.id));
      (remote.genres || []).filter(g => !gids.has(g.id)).forEach(g => GENRES.push(g));
      saveGenres(GENRES);
    }
    if (remote.games     && Array.isArray(remote.games))     { const d = _mergeData(_GDATA(), remote.games);  window.GDATA = d; _saveGames(d); }
    if (remote.music     && Array.isArray(remote.music))     { const d = _mergeData(_MDATA(), remote.music);  window.MDATA = d; _saveMusic(d); }
    if (remote.playlists && Array.isArray(remote.playlists)) { window.MPLAYLISTS = remote.playlists;             _savePlaylists(remote.playlists); }
    if (remote.books     && Array.isArray(remote.books))     { const d = _mergeData(_BDATA(), remote.books);  window.BDATA = d; _saveBooks(d); }
    if (remote.vault_enc)    ls.set(VAULT_ENC_KEY, remote.vault_enc);
    if (remote.vault_public) {
      const local  = ls.get(VAULT_PUBLIC_KEY) || [];
      const remIds = new Set(local.map(l => l.id));
      const merged = [...local, ...(remote.vault_public || []).filter(l => !remIds.has(l.id))];
      ls.set(VAULT_PUBLIC_KEY, merged);
      if (typeof window.VDATA_PUBLIC !== 'undefined') window.VDATA_PUBLIC = merged;
    }
    if (remote.log   && Array.isArray(remote.log))   { window.LDATA = remote.log; _saveLog(remote.log); }
    if (remote.notes && Array.isArray(remote.notes)) {
      const d = _mergeData(_NDATA(), remote.notes); window.NDATA = d; _saveNotes(d);
    }
    if (remote.notes_enc) ls.set(NOTES_ENC_KEY, remote.notes_enc);
    saveData(DATA); render();
    _toast('✓ Synced from Drive', '#4ade80');
  } else if (localSaved > remoteSaved) {
    await _pushToDrive();
  } else {
    _updateDriveBtn('connected');
  }
}

function _scheduleDriveSyncImpl() {
  if (!_isConnected()) return;
  clearTimeout(_syncTimer);
  _updateDriveBtn('pending');
  _syncTimer = setTimeout(_pushToDrive, 3000);
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
