let _gisReady=false, _tokenClient=null, _syncTimer=null, _driveFolderId=null;
// Guard: prevent initGIS running twice (once from load event, once from main.js)
let _gisInitDone = false;

function _getToken(){return Date.now()<parseInt(ls.str(K.DEXP)||'0')?ls.str(K.DTOKEN):null;}
function _isConnected(){return !!_getToken();}

// CSS colour variables --cd/--ch/--cr are not defined in style.css so we use
// explicit hex values here to make the Drive button actually change colour.
const _DRIVE_COLORS = {
  connected: '#4ade80',   // green
  syncing:   '#fb923c',   // orange
  pending:   '#fb923c',   // orange
  error:     '#fb7185',   // red
  off:       '',          // default text colour
};

function _updateDriveBtn(state){
  const btn=document.getElementById('drive-btn');if(!btn)return;
  const map={
    connected: ['✓','Drive'],
    syncing:   ['↻','Sync…'],
    pending:   ['…','Drive'],
    error:     ['✗','Error'],
    off:       ['☁','Drive'],
  };
  const s = state || (_isConnected()?'connected':'off');
  const [ico,txt] = map[s] || map.off;
  const spans=btn.querySelectorAll('span');
  if(spans[0])spans[0].textContent=ico;
  const txtSpan=btn.querySelector('.drive-status-txt');
  if(txtSpan)txtSpan.textContent=txt;
  btn.style.color = _DRIVE_COLORS[s] || '';
  btn.title = s==='connected' ? 'Drive synced — click to disconnect'
            : s==='syncing'   ? 'Syncing…'
            : s==='error'     ? 'Sync error — click to retry'
            : 'Connect to Google Drive';
}

const _WORKER = 'https://aether-codex-ai.nadeempubgmobile2-0.workers.dev';
const K_REFRESH   = 'ac_v4_refresh';
const _MAL_OAUTH_NONCE_KEY = 'ac_mal_oauth_nonce';
const _MAL_CODE_VERIFIER_KEY = 'ac_mal_code_verifier';
const _MAL_STATE_PREFIX = 'mal:';
// Use sessionStorage for the CSRF nonce — it survives the redirect on all
// browsers (unlike localStorage which iOS Safari may wipe during cross-origin
// navigation).
const _OAUTH_NONCE_KEY = 'ac_oauth_nonce';

// ── Generate a short random nonce ──
function _genNonce(){
  return Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2);
}

// ══════════════════════════════════════════════════════════════════
//  AUTHORIZATION CODE FLOW
//  Browser  → full-page redirect to Google, code returned in ?code=
//  Electron → popup window via preload bridge, no page reload needed
// ══════════════════════════════════════════════════════════════════
function _startOAuthFlow() {
  // redirectUri must match exactly what is registered in Google Cloud Console
  const redirectUri = _getRedirectUri();

  // Store the section to return to and a nonce for CSRF protection.
  // We embed both in the `state` param as "nonce:section".
  const section = localStorage.getItem('ac_last_section') || 'home';
  const nonce   = _genNonce();
  // sessionStorage survives the redirect; localStorage may not on iOS Safari
  try { sessionStorage.setItem(_OAUTH_NONCE_KEY, nonce); } catch(e){}
  // Fallback: also try localStorage
  try { localStorage.setItem(_OAUTH_NONCE_KEY, nonce); } catch(e){}

  const stateParam = nonce + ':' + section;

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
    // ── Electron path — popup handled by main process via IPC ──
    _updateDriveBtn('syncing');
    window.electronBridge.openOAuth(oauthUrl).then(async (result) => {
      if (result.error) {
        if (result.error !== 'popup_closed') toast('Drive auth failed: ' + result.error, '#fb7185');
        _updateDriveBtn('off');
        return;
      }
      await _exchangeCode(result.code, redirectUri, result.state || stateParam, /*skipNonceCheck=*/true);
    });
  } else {
    // ── Browser path — full-page redirect ──
    // Show a brief "Redirecting…" UI so the user knows something is happening
    _showRedirectingOverlay();
    // Small delay so the overlay renders before navigation
    setTimeout(() => { location.href = oauthUrl; }, 80);
  }
}

// Returns the redirect URI that Google should send the user back to.
// For GitHub Pages this is the root of the app (no hash, no query string).
function _getRedirectUri() {
  return location.origin + location.pathname.replace(/\/+$/, '/');
}

// Brief full-screen overlay so the user sees feedback during the redirect.
function _showRedirectingOverlay() {
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
    <div style="font-family:Cinzel,serif;font-size:22px;font-weight:700;color:#34d399">
      The Aether Codex
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <div style="width:18px;height:18px;border:2px solid #1e3329;border-top-color:#34d399;border-radius:50%;animation:_spin .7s linear infinite"></div>
      Redirecting to Google…
    </div>
    <style>@keyframes _spin{to{transform:rotate(360deg)}}</style>`;
  document.body.appendChild(d);
}

// ── Exchange an authorization code for tokens via the Cloudflare Worker ──
// skipNonceCheck: set true for Electron popup flow (nonce already validated
// by the popup's URL interception — no need to re-check sessionStorage).
async function _exchangeCode(code, redirectUri, stateParam, skipNonceCheck=false) {
  // Validate nonce to prevent CSRF (browser flow only)
  if (!skipNonceCheck) {
    const storedNonce = _getStoredNonce();
    const returnedNonce = (stateParam || '').split(':')[0];
    if (!storedNonce || storedNonce !== returnedNonce) {
      // Nonce mismatch — could be a replay or storage was wiped.
      // Don't hard-fail; just warn and proceed. The code is single-use anyway.
      console.warn('[OAuth] Nonce mismatch — storage may have been cleared by browser.');
    }
    _clearStoredNonce();
  }

  _updateDriveBtn('syncing');
  try {
    const res = await fetch(_WORKER, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Action': 'exchange_code' },
      body:    JSON.stringify({ code, redirect_uri: redirectUri }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Worker ${res.status}: ${txt.slice(0,200)}`);
    }
    const data = await res.json();
    // Worker may return { error, error_description } on failure
    if (data.error) throw new Error(data.error_description || data.error);
    // Validate we actually got a token back
    if (!data.access_token) throw new Error('No access token received from worker');

    ls.setStr(K.DTOKEN,  data.access_token);
    ls.setStr(K.DEXP,    String(Date.now() + (data.expires_in - 60) * 1000));
    if (data.refresh_token) ls.setStr(K_REFRESH, data.refresh_token);

    _updateDriveBtn('syncing');
    await _driveInit();

    // Navigate to the section the user was on before the redirect
    const section = (stateParam || '').split(':')[1] || 'home';
    if (section && typeof nav === 'function') nav(section);
    return true;
  } catch(e) {
    console.error('[OAuth] exchange_code failed:', e);
    toast('Drive auth failed: ' + e.message, '#fb7185');
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
  try { localStorage.removeItem(_OAUTH_NONCE_KEY); } catch(e){}
}

// ══════════════════════════════════════════════════════════════════
//  HANDLE THE RETURN REDIRECT (browser only)
//  Called early in initGIS(). Returns true if a code was found and
//  exchange was attempted (successfully or not).
// ══════════════════════════════════════════════════════════════════
async function _handleOAuthRedirect() {
  // Electron handles auth via popup — never touches the URL
  if (window.electronBridge) return false;

  const params = new URLSearchParams(location.search);
  const code   = params.get('code');
  const state  = params.get('state');  // "nonce:section"
  const error  = params.get('error');  // e.g. "access_denied"

  // Nothing in the URL that looks like an OAuth return
  if (!code && !error) return false;

  // FIX: Capture redirectUri BEFORE we mutate the URL with replaceState.
  // _getRedirectUri() reads location.origin + location.pathname — after
  // replaceState the pathname is unchanged but capturing it early is safer
  // and makes the intent clear.
  const redirectUri = _getRedirectUri();

  // Clean the URL immediately so a page refresh doesn't re-try the exchange
  try {
    const section = (state || '').split(':')[1] || 'home';
    history.replaceState({}, '', location.pathname + '#/' + section);
  } catch(e){}

  // Remove the redirecting overlay if it somehow survived a navigation
  const ov = document.getElementById('_oauth_overlay');
  if (ov) ov.remove();

  if (error) {
    // Delay toast slightly so the DOM / toast function is guaranteed ready
    setTimeout(() => toast('Google sign-in cancelled or denied: ' + error, '#fb7185'), 100);
    _updateDriveBtn('off');
    return true;  // handled (with error)
  }

  // Show a subtle "Completing sign-in…" indicator while we hit the Worker
  _showSigningInBanner();

  // Use the pre-captured redirectUri (before URL was mutated above)
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
    <div style="width:16px;height:16px;border:2px solid #1e3329;border-top-color:#34d399;border-radius:50%;animation:_spin .7s linear infinite;flex-shrink:0"></div>
    Completing Google sign-in…`;
  document.body.prepend(d);
}

function _hideSigningInBanner() {
  const d = document.getElementById('_oauth_banner');
  if (d) d.remove();
}

function _getMALStoredValue(key) {
  try { const v = sessionStorage.getItem(key); if (v) return v; } catch (e) {}
  try { return localStorage.getItem(key); } catch (e) { return null; }
}

function _setMALStoredValue(key, value) {
  try { sessionStorage.setItem(key, value); } catch (e) {}
  try { localStorage.setItem(key, value); } catch (e) {}
}

function _clearMALStoredValues() {
  try { sessionStorage.removeItem(_MAL_OAUTH_NONCE_KEY); } catch (e) {}
  try { localStorage.removeItem(_MAL_OAUTH_NONCE_KEY); } catch (e) {}
  try { sessionStorage.removeItem(_MAL_CODE_VERIFIER_KEY); } catch (e) {}
  try { localStorage.removeItem(_MAL_CODE_VERIFIER_KEY); } catch (e) {}
}

function _base64UrlEncode(bytes) {
  let str = '';
  bytes.forEach(byte => { str += String.fromCharCode(byte); });
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
  const redirectUri = _getRedirectUri();
  const section = localStorage.getItem('ac_last_section') || 'settings';
  const nonce = _genNonce();
  const state = _MAL_STATE_PREFIX + nonce + ':' + section;
  const codeVerifier = _generatePKCEVerifier();
  const codeChallenge = await _sha256(codeVerifier);
  _setMALStoredValue(_MAL_OAUTH_NONCE_KEY, state);
  _setMALStoredValue(_MAL_CODE_VERIFIER_KEY, codeVerifier);

  const res = await fetch(_WORKER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Action': 'mal_authorize_url' },
    body: JSON.stringify({ redirect_uri: redirectUri, code_challenge: codeChallenge, state }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MAL auth failed: ${body}`);
  }
  const data = await res.json();
  const oauthUrl = data.url;

  if (window.electronBridge) {
    _showRedirectingOverlay();
    window.electronBridge.openOAuth(oauthUrl).then(async (result) => {
      if (result.error) {
        if (result.error !== 'popup_closed') toast('MAL auth failed: ' + result.error, '#fb7185');
        return;
      }
      await _exchangeMALCode(result.code, redirectUri, result.state || state, true);
    });
  } else {
    _showRedirectingOverlay();
    setTimeout(() => { location.href = oauthUrl; }, 80);
  }
}

async function _exchangeMALCode(code, redirectUri, stateParam, skipNonceCheck = false) {
  const codeVerifier = _getMALStoredValue(_MAL_CODE_VERIFIER_KEY);
  if (!skipNonceCheck) {
    const storedState = _getMALStoredValue(_MAL_OAUTH_NONCE_KEY);
    if (!storedState || storedState !== stateParam) {
      console.warn('[MAL OAuth] State mismatch or missing stored state.');
    }
    _clearMALStoredValues();
  }

  _showSigningInBanner();
  try {
    const res = await fetch(_WORKER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Action': 'mal_exchange_code' },
      body: JSON.stringify({ code, code_verifier: codeVerifier, redirect_uri: redirectUri }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`MAL token exchange failed: ${body}`);
    }
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error || 'MAL token exchange failed');
    SETTINGS.malAccessToken = data.access_token || null;
    SETTINGS.malRefreshToken = data.refresh_token || SETTINGS.malRefreshToken || null;
    SETTINGS.malTokenExpiry = data.expires_in ? String(Date.now() + (data.expires_in - 60) * 1000) : SETTINGS.malTokenExpiry || null;
    saveSettings(SETTINGS);
    toast('✓ MAL account connected', 'var(--cd)');
    if (typeof renderSettingsBody === 'function' && CURRENT === 'settings') renderSettingsBody();
    return true;
  } catch (e) {
    toast('MAL auth failed: ' + e.message, '#fb7185');
    console.error('[MAL OAuth] exchange failed:', e);
    return false;
  } finally {
    _hideSigningInBanner();
  }
}

async function _refreshMALAccessToken() {
  const refreshToken = SETTINGS?.malRefreshToken;
  if (!refreshToken) return false;
  try {
    const res = await fetch(_WORKER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Action': 'mal_refresh_token' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
    SETTINGS.malAccessToken = data.access_token;
    SETTINGS.malTokenExpiry = data.expires_in ? String(Date.now() + (data.expires_in - 60) * 1000) : SETTINGS.malTokenExpiry;
    if (data.refresh_token) SETTINGS.malRefreshToken = data.refresh_token;
    saveSettings(SETTINGS);
    return true;
  } catch (e) {
    console.warn('[MAL OAuth] Token refresh failed:', e.message);
    return false;
  }
}

async function _handleMALRedirect() {
  if (window.electronBridge) return false;
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  if (!code && !error) return false;
  if (!state || !state.startsWith(_MAL_STATE_PREFIX)) return false;
  const redirectUri = _getRedirectUri();
  try {
    const section = (state || '').split(':')[2] || 'settings';
    history.replaceState({}, '', location.pathname + '#/' + section);
  } catch (e) {}
  const ov = document.getElementById('_oauth_overlay');
  if (ov) ov.remove();
  if (error) {
    setTimeout(() => toast('MAL sign-in cancelled or denied: ' + error, '#fb7185'), 100);
    return true;
  }
  _showSigningInBanner();
  await _exchangeMALCode(code, redirectUri, state || '', false);
  _hideSigningInBanner();
  return true;
}

// ══════════════════════════════════════════════════════════════════
//  TOKEN REFRESH
// ══════════════════════════════════════════════════════════════════
async function _refreshAccessToken() {
  const refreshToken = ls.str(K_REFRESH);
  if (!refreshToken) return false;
  try {
    const res = await fetch(_WORKER, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'X-Action': 'refresh_token' },
      body:    JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error_description || data.error);
    ls.setStr(K.DTOKEN, data.access_token);
    ls.setStr(K.DEXP,   String(Date.now() + (data.expires_in - 60) * 1000));
    return true;
  } catch(e) {
    console.warn('[OAuth] Token refresh failed:', e.message);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════════
//  BOOTSTRAP — called once on page load
// ══════════════════════════════════════════════════════════════════
async function initGIS() {
  // FIX: Guard against being called twice (e.g. from both js/main.js and the
  // window 'load' listener below). The second call would be a no-op here but
  // could still trigger an unnecessary _driveInit round-trip.
  if (_gisInitDone) return;
  _gisInitDone = true;

  // 1. Check if we're returning from an OAuth redirect
  const handledMAL = await _handleMALRedirect();
  if (handledMAL) return;
  const handled = await _handleOAuthRedirect();
  if (handled) return;

  _gisReady = true;

  if (_isConnected()) {
    _updateDriveBtn('syncing');
    _driveInit();
  } else if (ls.str(K_REFRESH)) {
    _updateDriveBtn('syncing');
    const ok = await _refreshAccessToken();
    if (ok) _driveInit();
    else    _updateDriveBtn('off');
  } else {
    _updateDriveBtn('off');
  }
}

function _saveToken(resp){
  ls.setStr(K.DTOKEN,resp.access_token);
  ls.setStr(K.DEXP,String(Date.now()+(resp.expires_in-60)*1000));
  _updateDriveBtn('syncing');
  _driveInit();
}

function _showDriveHint(){
  setTimeout(()=>{
    const el=document.getElementById('drive-hint-inner');
    if(el && DATA.length===0 && !_isConnected()) el.style.display='flex';
  }, 300);
}

// ── Drive button click ──
function driveAction(){
  if(_isConnected() || ls.str(K_REFRESH)){
    showConfirm('Your data will stay in localStorage. You can reconnect anytime.',()=>{
      ls.del(K.DTOKEN);ls.del(K.DEXP);ls.del(K.DFILE);ls.del(K.DSYNC);ls.del(K_REFRESH);
      _driveFolderId=null;_updateDriveBtn('off');toast('Disconnected from Drive');
    },{title:'Disconnect Drive?',okLabel:'Disconnect',danger:false});
  } else {
    _startOAuthFlow();
  }
}

// ══════════════════════════════════════════════════════════════════
//  AUTHENTICATED FETCH WRAPPER
// ══════════════════════════════════════════════════════════════════
async function _req(url,opts={}){
  let token=_getToken();
  if(!token){
    if(ls.str(K_REFRESH)){
      const ok=await _refreshAccessToken();
      if(ok) token=_getToken();
    }
    if(!token){_updateDriveBtn('off');return null;}
  }
  try{
    const r=await fetch(url,{...opts,headers:{Authorization:`Bearer ${token}`,... (opts.headers||{})}});
    if(r.status===401){
      if(ls.str(K_REFRESH)){
        const ok=await _refreshAccessToken();
        if(ok){
          const t2=_getToken();
          if(t2) return fetch(url,{...opts,headers:{Authorization:`Bearer ${t2}`,... (opts.headers||{})}});
        }
      }
      ls.del(K.DTOKEN);ls.del(K.DEXP);_updateDriveBtn('off');return null;
    }
    return r;
  }catch{return null;}
}

// ══════════════════════════════════════════════════════════════════
//  DRIVE FILE / FOLDER HELPERS
// ══════════════════════════════════════════════════════════════════
async function _getOrCreateFolder(){
  if(_driveFolderId)return _driveFolderId;
  const r=await _req(`https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FOLDER}'+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id)`);
  if(!r)return null;
  const d=await r.json();
  if(d.files?.length){_driveFolderId=d.files[0].id;return _driveFolderId;}
  const cr=await _req('https://www.googleapis.com/drive/v3/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:DRIVE_FOLDER,mimeType:'application/vnd.google-apps.folder'})});
  if(!cr)return null;
  const cf=await cr.json();_driveFolderId=cf.id;return _driveFolderId;
}

async function _getOrCreateFile(){
  const cached=ls.str(K.DFILE);if(cached)return cached;
  const folderId=await _getOrCreateFolder();if(!folderId)return null;
  const r=await _req(`https://www.googleapis.com/drive/v3/files?q=name='${DRIVE_FILE}'+and+'${folderId}'+in+parents+and+trashed=false&fields=files(id,modifiedTime)`);
  if(!r)return null;
  const d=await r.json();
  if(d.files?.length){ls.setStr(K.DFILE,d.files[0].id);return d.files[0].id;}
  const cr=await _req('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',{
    method:'POST',
    headers:{'Content-Type':'multipart/related; boundary=boundary'},
    body:`--boundary\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({name:DRIVE_FILE,parents:[folderId]})}\r\n--boundary\r\nContent-Type: application/json\r\n\r\n{}\r\n--boundary--`
  });
  if(!cr)return null;
  const cf=await cr.json();ls.setStr(K.DFILE,cf.id);return cf.id;
}

// ══════════════════════════════════════════════════════════════════
//  PUSH / PULL / MERGE
// ══════════════════════════════════════════════════════════════════
async function _pushToDrive(){
  _updateDriveBtn('syncing');
  try{
    const fileId=await _getOrCreateFile();if(!fileId)throw new Error('No file');
    const vaultEnc    = ls.get(VAULT_ENC_KEY)    || null;
    const vaultPublic = ls.get(VAULT_PUBLIC_KEY) || null;
    const notesEnc    = (typeof NOTES_ENC_KEY!=='undefined'&&ls.get(NOTES_ENC_KEY)) || null;
    const notesData   = (typeof NDATA!=='undefined'&&NDATA) || [];
    const payload=JSON.stringify({version:DATA_VERSION,savedAt:parseInt(ls.str(K.SAVED)||'0'),data:DATA,genres:GENRES,games:GDATA,music:MDATA,playlists:MPLAYLISTS,books:BDATA,vault_enc:vaultEnc,vault_public:vaultPublic,log:LDATA,notes:notesData,notes_enc:notesEnc});
    const r=await _req(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:payload});
    if(!r||!r.ok)throw new Error('Upload failed');
    ls.setStr(K.DSYNC,String(Date.now()));
    _updateDriveBtn('connected');
  }catch(e){_updateDriveBtn('error');toast('Drive sync failed: '+e.message,'#fb7185');}
}

async function _pullFromDrive(){
  try{
    const fileId=await _getOrCreateFile();if(!fileId)return null;
    const r=await _req(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    if(!r||!r.ok)return null;
    return await r.json();
  }catch{return null;}
}

function _mergeData(local,remote){
  const map=new Map();
  local.forEach(e=>map.set(e.id,e));
  remote.forEach(e=>{
    const l=map.get(e.id);
    if(!l||(e.updatedAt||0)>(l.updatedAt||0))map.set(e.id,e);
  });
  return Array.from(map.values()).sort((a,b)=>a.title.localeCompare(b.title));
}

async function _driveInit(){
  _updateDriveBtn('syncing');
  const remote=await _pullFromDrive();
  if(!remote){await _pushToDrive();return;}
  const localSaved=parseInt(ls.str(K.SAVED)||'0');
  const remoteSaved=remote.savedAt||0;
  if(remoteSaved>localSaved){
    DATA=_mergeData(DATA,remote.data||[]);
    if(remote.genres){
      const gids=new Set(GENRES.map(g=>g.id));
      (remote.genres||[]).filter(g=>!gids.has(g.id)).forEach(g=>GENRES.push(g));
      saveGenres(GENRES);
    }
    if(remote.games&&Array.isArray(remote.games)){
      GDATA=_mergeData(GDATA,remote.games);
      saveGames(GDATA);
    }
    if(remote.music&&Array.isArray(remote.music)){
      MDATA=_mergeData(MDATA,remote.music);
      saveMusic(MDATA);
    }
    if(remote.playlists&&Array.isArray(remote.playlists)){
      MPLAYLISTS=remote.playlists;
      savePlaylists(MPLAYLISTS);
    }
    if(remote.books&&Array.isArray(remote.books)){
      BDATA=_mergeData(BDATA,remote.books);
      saveBooks(BDATA);
    }
    if(remote.vault_enc){
      ls.set(VAULT_ENC_KEY, remote.vault_enc);
    }
    if(remote.vault_public){
      const local = ls.get(VAULT_PUBLIC_KEY) || [];
      const remIds = new Set(local.map(l=>l.id));
      const merged = [...local, ...(remote.vault_public||[]).filter(l=>!remIds.has(l.id))];
      ls.set(VAULT_PUBLIC_KEY, merged);
      if(typeof VDATA_PUBLIC !== 'undefined') VDATA_PUBLIC = merged;
    }
    if(remote.log&&Array.isArray(remote.log)){
      LDATA=remote.log;
      saveLog(LDATA);
    }
    if(remote.notes&&Array.isArray(remote.notes)&&typeof NDATA!=='undefined'){
      NDATA=_mergeData(NDATA,remote.notes);
      saveNotes(NDATA);
    }
    if(remote.notes_enc&&typeof NOTES_ENC_KEY!=='undefined'){
      ls.set(NOTES_ENC_KEY, remote.notes_enc);
    }
    saveData(DATA);render();
    toast('✓ Synced from Drive','#4ade80');
  } else if(localSaved>remoteSaved){
    await _pushToDrive();
  } else {
    _updateDriveBtn('connected');
  }
}

function scheduleDriveSync(){
  if(!_isConnected())return;
  clearTimeout(_syncTimer);
  _updateDriveBtn('pending');
  _syncTimer=setTimeout(_pushToDrive,3000);
}

// ══════════════════════════════════════════════════════════════════
//  MOBILE SIDEBAR
// ══════════════════════════════════════════════════════════════════
function openMob(){document.getElementById('mob-ov').classList.add('show');document.getElementById('mob-sb').classList.add('open')}
function closeMob(){document.getElementById('mob-ov').classList.remove('show');document.getElementById('mob-sb').classList.remove('open')}

// ══════════════════════════════════════════════════════════════════
//  BOOTSTRAP
//  FIX: initGIS() was defined but never called. The function name
//  suggests it was once a Google Identity Services callback that got
//  removed when the flow was migrated to the custom code flow.
//  We now hook it onto the window 'load' event, which fires after ALL
//  deferred scripts have executed — guaranteeing that nav(), toast(),
//  render(), etc. are all available when _handleOAuthRedirect() runs.
//  The _gisInitDone guard means calling initGIS() from js/main.js as
//  well is safe — the second call is a no-op.
// ══════════════════════════════════════════════════════════════════
window.addEventListener('load', async function _driveBootstrap() {
  // ── NEW: run schema migration first, before any render ──
  try {
    const result = await runMigrationV1();
    if (result.ran) {
      toast(
        `✓ Schema updated: ${result.entriesAfter} flat entries ` +
        `(${result.groups} group${result.groups !== 1 ? 's' : ''} expanded)`,
        '#34d399'
      );
      render(); // re-render with the new flat DATA
    }
  } catch (e) {
    console.error('[Migration V1] Fatal error:', e);
  }

  // ── existing Drive boot ──
  initGIS().catch(function(e) { console.error('[Drive] initGIS error:', e); });
});
