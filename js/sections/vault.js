
// ═══════════════════════════════════════════════════════
//  VAULT ENCRYPTION — Web Crypto API (AES-GCM + PBKDF2)
//  Only PRIVATE (locked) links are encrypted.
//  Public links live in plain localStorage and are always visible.
// ═══════════════════════════════════════════════════════
const VAULT_ENC_KEY  = 'ac_v4_vault_enc';  // encrypted store — private links only
const VAULT_SALT_KEY = 'ac_v4_vault_salt'; // (legacy — kept for compat)
let   VAULT_CRYPTO_KEY  = null;            // in-memory CryptoKey, cleared on lock
let   VAULT_CRYPTO_SALT = null;            // Uint8Array salt for current key

// ── Helpers ──
function _b64(buf)  { return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function _unb64(s)  { return Uint8Array.from(atob(s), c => c.charCodeAt(0)); }

async function _deriveKey(password, salt) {
  const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:310000, hash:'SHA-256' },
    km,
    { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']
  );
}

async function vaultEncrypt(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await _deriveKey(password, salt);
  const buf  = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(data)));
  return { salt:_b64(salt), iv:_b64(iv), data:_b64(buf), v:1 };
}

async function vaultDecrypt(stored, password) {
  const key    = await _deriveKey(password, _unb64(stored.salt));
  const plainBuf = await crypto.subtle.decrypt({ name:'AES-GCM', iv:_unb64(stored.iv) }, key, _unb64(stored.data));
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

// ── Persist encrypted private-links array ──
async function saveVaultEncrypted(data) {
  if (!VAULT_CRYPTO_KEY || !VAULT_CRYPTO_SALT) { console.warn('Vault not unlocked — cannot save encrypted'); return; }
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, VAULT_CRYPTO_KEY, new TextEncoder().encode(JSON.stringify(data)));
  ls.set(VAULT_ENC_KEY, { salt:_b64(VAULT_CRYPTO_SALT), iv:_b64(iv), data:_b64(buf), v:1 });
  ls.setStr(K.SAVED, String(Date.now()));
  window.scheduleDriveSync();
}


// ═══════════════════════════════════════════════════════
//  PASSWORD MODALS
// ═══════════════════════════════════════════════════════

function showVaultPasswordSetup(onSuccess) {
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal-box" style="max-width:420px">
      <div class="modal-title">🔐 Create Vault Password</div>
      <div class="modal-msg" style="margin-bottom:14px">
        Private links will be encrypted with this password.<br>
        <strong style="color:#fb7185">⚠ If you forget this password, private links cannot be recovered.</strong>
      </div>
      <input type="password" id="vp-new" placeholder="Create password..." class="fin" style="margin-bottom:8px;width:100%;box-sizing:border-box">
      <input type="password" id="vp-confirm" placeholder="Confirm password..." class="fin" style="width:100%;box-sizing:border-box">
      <div id="vp-err" style="color:#fb7185;font-size:12px;margin-top:6px;min-height:16px"></div>
      <div class="modal-btns">
        <button class="modal-btn cancel" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="modal-btn confirm" onclick="handleVaultPasswordSetup(this)">Create</button>
      </div>
    </div>`;
  el.querySelector('.modal-btn.confirm')._cb = onSuccess;
  document.body.appendChild(el);
  setTimeout(() => el.querySelector('#vp-new')?.focus(), 50);
}

async function handleVaultPasswordSetup(btn) {
  const overlay = btn.closest('.modal-overlay');
  const pw1    = document.getElementById('vp-new')?.value;
  const pw2    = document.getElementById('vp-confirm')?.value;
  const errEl  = document.getElementById('vp-err');
  if (!pw1 || pw1.length < 4) { errEl.textContent = 'Password must be at least 4 characters'; return; }
  if (pw1 !== pw2) { errEl.textContent = 'Passwords do not match'; return; }
  btn.textContent = 'Encrypting...'; btn.disabled = true;
  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    VAULT_CRYPTO_KEY  = await _deriveKey(pw1, salt);
    VAULT_CRYPTO_SALT = salt;
    // Encrypt whatever is already in VDATA_PRIVATE (may include a pending link)
    await saveVaultEncrypted(VDATA_PRIVATE);
    ls.setStr('ac_vault_pw_set', '1');
    localStorage.removeItem('ac_v4_vault');
    localStorage.removeItem(VAULT_KEY);
    overlay.remove();
    VAULT_UNLOCKED = true;
    startVaultIdleTimer();
    toast('🔐 Vault password created — private section unlocked', 'var(--cd)');
    if (typeof renderVaultBody === 'function') renderVaultBody();
    const cb = btn._cb; if (cb) cb();
  } catch(e) {
    errEl.textContent = 'Error: ' + e.message;
    btn.textContent = 'Create'; btn.disabled = false;
    VAULT_CRYPTO_KEY = null; VAULT_CRYPTO_SALT = null;
  }
}

function showVaultPasswordUnlock(onSuccess) {
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal-box" style="max-width:380px">
      <div class="modal-title">🔐 Unlock Private Links</div>
      <div class="modal-msg" style="margin-bottom:12px">Enter your vault password to decrypt private links.</div>
      <input type="password" id="vp-unlock" placeholder="Vault password..." class="fin" style="width:100%;box-sizing:border-box"
        onkeydown="if(event.key==='Enter')document.getElementById('vp-unlock-btn').click()">
      <div id="vp-unlock-err" style="color:#fb7185;font-size:12px;margin-top:6px;min-height:16px"></div>
      <div class="modal-btns">
        <button class="modal-btn cancel" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="modal-btn confirm" id="vp-unlock-btn" onclick="handleVaultUnlock(this)">Unlock</button>
      </div>
    </div>`;
  el._cb = onSuccess;
  document.body.appendChild(el);
  setTimeout(() => el.querySelector('#vp-unlock')?.focus(), 50);
}

async function handleVaultUnlock(btn) {
  const overlay = btn.closest('.modal-overlay');
  const pw    = document.getElementById('vp-unlock')?.value;
  const errEl = document.getElementById('vp-unlock-err');
  if (!pw) { errEl.textContent = 'Please enter your password'; return; }
  btn.textContent = 'Decrypting...'; btn.disabled = true;
  try {
    const stored = ls.get(VAULT_ENC_KEY);
    if (!stored?.data) throw new Error('No encrypted data found.');
    const salt     = _unb64(stored.salt);
    const key      = await _deriveKey(pw, salt);
    const plainBuf = await crypto.subtle.decrypt({ name:'AES-GCM', iv:_unb64(stored.iv) }, key, _unb64(stored.data));
    const decrypted = JSON.parse(new TextDecoder().decode(plainBuf));

    // ── One-time migration: older vaults stored ALL links encrypted (no locked field).
    //    Separate non-private ones → public store; keep locked:true ones → private. ──
    const toPublic  = decrypted.filter(l => l.locked !== true);
    const toPrivate = decrypted.filter(l => l.locked === true);

    VAULT_CRYPTO_KEY  = key;
    VAULT_CRYPTO_SALT = salt;

    if (toPublic.length > 0) {
      const existingIds = new Set(VDATA_PUBLIC.map(l => l.id));
      const fresh = toPublic.map(l => ({...l, locked:false})).filter(l => !existingIds.has(l.id));
      if (fresh.length) {
        VDATA_PUBLIC = [...VDATA_PUBLIC, ...fresh];
        saveVaultPublic(VDATA_PUBLIC);
      }
      // Trim enc store to private-only
      await saveVaultEncrypted(toPrivate);
    }

    VDATA_PRIVATE  = toPrivate;
    VAULT_UNLOCKED = true;
    ls.del(VAULT_KEY);
    ls.del('ac_v4_vault');
    startVaultIdleTimer();
    overlay.remove();
    if (typeof renderVaultBody === 'function') renderVaultBody();
    const cb = overlay._cb; if (cb) cb();
  } catch(e) {
    errEl.textContent = '✗ Wrong password or corrupted data';
    btn.textContent = 'Unlock'; btn.disabled = false;
    VAULT_CRYPTO_KEY = null; VAULT_CRYPTO_SALT = null;
  }
}

// ── Lock private section only — public links stay visible ──
function lockVaultCrypto() {
  VAULT_UNLOCKED    = false;
  VAULT_CRYPTO_KEY  = null;
  VAULT_CRYPTO_SALT = null;
  VDATA_PRIVATE     = [];      // wipe private data from memory
  clearTimeout(VAULT_IDLE_TIMER);
  if (typeof renderVaultBody === 'function') renderVaultBody();
}


// ═══════════════════════════════════════════════════════
//  LINK VAULT DATA & STATE
// ═══════════════════════════════════════════════════════
const VAULT_KEY        = 'ac_v4_vault';         // legacy plain store (migrated away)
const VAULT_PUBLIC_KEY = 'ac_v4_vault_public';  // non-private links (plain, always visible)

function loadVaultPublic()  { return ls.get(VAULT_PUBLIC_KEY) || []; }
function saveVaultPublic(d) { ls.set(VAULT_PUBLIC_KEY, d); ls.setStr(K.SAVED, String(Date.now())); window.scheduleDriveSync(); }
function loadVault()  { return []; }   // kept for call-site compat
function saveVault(d) { /* disabled — use saveVaultPublic or saveVaultEncrypted */ }

// ── Auto-migrate legacy VAULT_KEY plain data → public store on first load ──
(function _migrateOldVault() {
  const old = ls.get(VAULT_KEY) || [];
  if (!old.length) return;
  const existing    = ls.get(VAULT_PUBLIC_KEY) || [];
  const existingIds = new Set(existing.map(l => l.id));
  const fresh = old.filter(l => !existingIds.has(l.id)).map(l => ({...l, locked:false}));
  if (fresh.length) ls.set(VAULT_PUBLIC_KEY, [...existing, ...fresh]);
  localStorage.removeItem(VAULT_KEY);
  ls.setStr('ac_vault_pw_set', '1');
})();

let VDATA_PUBLIC   = loadVaultPublic(); // always accessible, no password needed
let VDATA_PRIVATE  = [];                // decrypted private links (password required)
let VSEARCH        = '';
let VAULT_UNLOCKED = false;
let VAULT_IDLE_TIMER = null;
let VEDIT_ID       = null;

// ── Auto-lock private section when navigating away ──
function lockVaultOnNav() {
  if (VAULT_UNLOCKED) lockVaultCrypto();
}

function startVaultIdleTimer() {
  clearTimeout(VAULT_IDLE_TIMER);
  const mins = window.SETTINGS?.idleTimeout || 5;
  VAULT_IDLE_TIMER = setTimeout(() => {
    VAULT_UNLOCKED    = false;
    VAULT_CRYPTO_KEY  = null;
    VAULT_CRYPTO_SALT = null;
    VDATA_PRIVATE     = [];
    if (CURRENT === 'vault') renderVaultBody();
  }, mins * 60 * 1000);
}

function unlockVault() {
  const hasEncData = !!ls.get(VAULT_ENC_KEY);
  const pwSet      = ls.str('ac_vault_pw_set');
  if (hasEncData && pwSet) showVaultPasswordUnlock(() => {});
  else showVaultPasswordSetup(() => {});
}

function lockVault() { lockVaultCrypto(); }

// ── Favicon helper ──
function faviconUrl(url) {
  try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`; }
  catch { return ''; }
}


// ═══════════════════════════════════════════════════════
//  VAULT RENDER
// ═══════════════════════════════════════════════════════

function checkVaultMigration() {
  // Handled automatically in the IIFE above — kept for call-site compat.
}

function renderVault(c) {
  c.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div class="sub-tabs"><button class="stab active">Links</button></div>
        <span style="font-size:10px;color:#4ade80;background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.2);border-radius:4px;padding:2px 7px">🔐 Private Encrypted</span>
        <button id="vault-lock-btn" style="display:none;height:28px;border-radius:5px;background:rgba(251,113,133,.1);border:1px solid rgba(251,113,133,.25);color:#fb7185;font-size:11px;font-weight:600;padding:0 10px;cursor:pointer" onclick="lockVault()">🔓 Lock Private</button>
      </div>
      <button class="nb-btn ac" onclick="openAddLink()">+ Add Link</button>
    </div>
    <div id="vault-body"></div>`;
  renderVaultBody();
}

function renderVaultBody() {
  const el = document.getElementById('vault-body'); if (!el) return;
  const hasEncData = !!ls.get(VAULT_ENC_KEY);
  const pwSet      = ls.str('ac_vault_pw_set');

  // Lock button visible only when private section is open
  const lockBtn = document.getElementById('vault-lock-btn');
  if (lockBtn) lockBtn.style.display = VAULT_UNLOCKED ? 'block' : 'none';

  const q = VSEARCH.toLowerCase();

  // ── Public links (always visible) ──
  const filteredPublic = q
    ? VDATA_PUBLIC.filter(l => l.desc?.toLowerCase().includes(q) || l.url?.toLowerCase().includes(q))
    : [...VDATA_PUBLIC];
  filteredPublic.sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0) || b.addedAt-a.addedAt);

  let html = '';

  if (filteredPublic.length > 0) {
    html += `<div style="display:flex;flex-direction:column;gap:6px">${filteredPublic.map(l => vaultCardHtml(l)).join('')}</div>`;
  }

  // ── Private section ──
  const hasAnyPrivate = hasEncData || VDATA_PRIVATE.length > 0;
  if (hasAnyPrivate) {
    const dividerStyle = filteredPublic.length
      ? 'margin-top:20px;padding-top:16px;border-top:1px solid var(--brd);'
      : '';
    html += `
      <div style="${dividerStyle}display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#fb7185">🔒 Private Links</span>
        <div style="flex:1;height:1px;background:rgba(251,113,133,.2)"></div>
        ${VAULT_UNLOCKED ? `<span style="font-size:10px;font-weight:700;color:#4ade80;padding:1px 7px;background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);border-radius:3px">Unlocked</span>` : ''}
      </div>`;

    if (VAULT_UNLOCKED) {
      const filteredPrivate = q
        ? VDATA_PRIVATE.filter(l => l.desc?.toLowerCase().includes(q) || l.url?.toLowerCase().includes(q))
        : [...VDATA_PRIVATE];
      filteredPrivate.sort((a,b) => b.addedAt - a.addedAt);
      html += filteredPrivate.length
        ? `<div style="display:flex;flex-direction:column;gap:6px">${filteredPrivate.map(l => vaultCardHtml(l)).join('')}</div>`
        : `<div style="text-align:center;padding:16px;color:var(--mu);font-size:13px;background:rgba(251,113,133,.03);border:1px dashed rgba(251,113,133,.15);border-radius:7px">No private links yet — check 🔒 Private when adding a link</div>`;
    } else {
      html += `
        <div style="text-align:center;padding:22px 16px;background:rgba(251,113,133,.03);border:1px solid rgba(251,113,133,.15);border-radius:8px">
          <div style="font-size:24px;margin-bottom:8px">🔒</div>
          <div style="font-size:13px;font-weight:600;color:var(--tx);margin-bottom:4px">Private links are locked</div>
          <div style="font-size:12px;color:var(--mu);margin-bottom:14px">Enter your vault password to view encrypted links</div>
          <button onclick="unlockVault()" style="background:rgba(251,113,133,.12);color:#fb7185;border:1px solid rgba(251,113,133,.3);border-radius:6px;padding:7px 20px;font-size:12px;font-weight:700;cursor:pointer">🔐 Unlock Private</button>
        </div>`;
    }
  }

  // ── Empty state ──
  if (!filteredPublic.length && !hasAnyPrivate) {
    html = `<div class="empty">
      <div class="empty-ico">🔗</div>
      <p>No links yet — add your first one!</p>
      <div style="font-size:12px;color:var(--mu);margin-top:4px;margin-bottom:14px">
        Public links are always visible without a password.<br>
        Toggle 🔒 Private to encrypt sensitive links.
      </div>
      <button onclick="openAddLink()" style="background:var(--ac);color:#000;border:none;border-radius:6px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer">+ Add First Link</button>
    </div>`;
  }

  el.innerHTML = html;
}

function vaultCardHtml(l) {
  const fav      = faviconUrl(l.url||'');
  const date     = l.addedAt ? new Date(l.addedAt).toLocaleDateString() : '';
  const shortUrl = (() => { try { return new URL(l.url).hostname; } catch { return l.url||''; } })();
  const isPrivate = l.locked === true;

  return `<div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);padding:12px 14px;display:flex;align-items:center;gap:12px;transition:border-color .15s" id="vcard-${l.id}"
    onmouseover="this.style.borderColor='var(--brd2)'" onmouseout="this.style.borderColor='var(--brd)'">
    ${fav ? `<img src="${esc(fav)}" width="20" height="20" style="flex-shrink:0;border-radius:4px" onerror="this.style.display='none'">` : `<div style="width:20px;height:20px;background:var(--surf2);border-radius:4px;flex-shrink:0"></div>`}
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${l.pinned ? '<span style="color:#fbbf24;margin-right:3px">📌</span>' : ''}${isPrivate ? '<span style="font-size:10px;margin-right:3px;opacity:.7">🔒</span>' : ''}${esc(l.desc||'Untitled')}
      </div>
      <div style="font-size:11px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${esc(shortUrl)}</div>
      ${date ? `<div style="font-size:10px;color:var(--mu);margin-top:1px">${date}</div>` : ''}
    </div>
    <div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
      <button onclick="copyVaultLink('${esc(l.url)}')" title="Copy URL"
        style="width:28px;height:28px;border-radius:5px;background:var(--surf2);border:1px solid var(--brd);color:var(--tx2);font-size:12px;cursor:pointer">📋</button>
      <button onclick="window.open('${esc(l.url)}','_blank')" title="Open"
        style="width:28px;height:28px;border-radius:5px;background:var(--surf2);border:1px solid var(--brd);color:var(--tx2);font-size:12px;cursor:pointer">↗</button>
      <button onclick="openEditLink('${l.id}')" title="Edit"
        style="width:28px;height:28px;border-radius:5px;background:var(--surf2);border:1px solid var(--brd);color:var(--tx2);font-size:12px;cursor:pointer">✏</button>
      <button onclick="askDelLink('${l.id}')" title="Delete"
        style="width:28px;height:28px;border-radius:5px;background:rgba(251,113,133,.08);border:1px solid rgba(251,113,133,.2);color:#fb7185;font-size:12px;cursor:pointer">✕</button>
    </div>
  </div>`;
}

function copyVaultLink(url) {
  navigator.clipboard?.writeText(url).then(() => toast('✓ URL copied')).catch(() => toast('Copy failed', 'var(--cr)'));
}

function openPrivateTab(url) {
  navigator.clipboard?.writeText(url)
    .then(() => showAlert(
      `URL copied!<br><br><b>Chrome/Edge:</b> Ctrl+Shift+N &nbsp;<b>Firefox:</b> Ctrl+Shift+P<br><br>Open a private window and paste the URL.`,
      { title:'🕶 Open in Private' }
    ))
    .catch(() => showAlert(
      `Copy this URL and paste it in a private window:<br><br><span style="word-break:break-all;color:var(--ac);font-size:12px">${esc(url)}</span>`,
      { title:'🕶 Open in Private' }
    ));
}


// ═══════════════════════════════════════════════════════
//  ADD / EDIT FORM
// ═══════════════════════════════════════════════════════

// Always opens form — no unlock required.
// If user marks link as Private while vault is locked, we prompt for
// the password at save time (after all fields are already filled in).
function openAddLink() {
  VEDIT_ID = null;
  renderVaultForm(null);
}

function openEditLink(id) {
  VEDIT_ID = id;
  renderVaultForm(VDATA_PUBLIC.find(l => l.id === id) || VDATA_PRIVATE.find(l => l.id === id) || null);
}

function renderVaultForm(l) {
  document.getElementById('rpanel').classList.add('open');
  document.getElementById('poverlay').classList.add('show');
  document.getElementById('content').classList.add('pushed');

  document.getElementById('panel-inner').innerHTML = `
    <div class="ph">
      <div class="ph-title">${l ? 'Edit Link' : 'Add New Link'}</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="form-wrap">
      <div class="fg">
        <label class="flbl">Description *</label>
        <input class="fin" id="vf-desc" placeholder="e.g. My favourite anime site" value="${esc(l?l.desc||'':'')}">
      </div>
      <div class="fg">
        <label class="flbl">URL *</label>
        <input class="fin" type="url" id="vf-url" placeholder="https://..." value="${esc(l?l.url||'':'')}">
      </div>
      <div style="display:flex;gap:16px;padding-top:4px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="vf-pin" ${l?.pinned?'checked':''} style="width:14px;height:14px;cursor:pointer;accent-color:var(--ac)">
          <label for="vf-pin" class="flbl" style="margin:0;cursor:pointer">📌 Pinned</label>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="vf-lock" ${l?.locked?'checked':''} style="width:14px;height:14px;cursor:pointer;accent-color:#fb7185">
          <label for="vf-lock" class="flbl" style="margin:0;cursor:pointer;color:#fb7185">🔒 Private (encrypted)</label>
        </div>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--mu);line-height:1.5;padding:8px 10px;background:var(--surf2);border-radius:5px;border:1px solid var(--brd)">
        <b style="color:var(--tx2)">Public</b> links are always visible.<br>
        <b style="color:#fb7185">Private</b> links are encrypted and hidden until you unlock the vault.
      </div>
    </div>
    <div class="panel-actions">
      ${l ? `<button class="btn-del" onclick="askDelLink('${l.id}')">Delete</button>` : ''}
      <button class="btn-cancel" onclick="closePanel()">Cancel</button>
      <button class="btn-save" onclick="saveVaultLink()">Save</button>
    </div>`;
}

// saveVaultLink: reads form, routes to right store.
// If saving Private while vault is locked → prompt unlock first,
// then call _commitSaveVaultLink with already-captured values.
function saveVaultLink() {
  const desc      = document.getElementById('vf-desc')?.value?.trim();
  const url       = document.getElementById('vf-url')?.value?.trim();
  const isPrivate = document.getElementById('vf-lock')?.checked || false;
  const isPinned  = document.getElementById('vf-pin')?.checked  || false;

  if (!desc) { showAlert('Please enter a description', {title:'Missing Description'}); return; }
  if (!url)  { showAlert('Please enter a URL', {title:'Missing URL'}); return; }

  if (isPrivate && !VAULT_UNLOCKED) {
    // Capture values now (before async modal) then proceed after unlock/setup
    const proceed = () => _commitSaveVaultLink(desc, url, true, isPinned);
    const hasEncData = !!ls.get(VAULT_ENC_KEY);
    const pwSet      = ls.str('ac_vault_pw_set');
    if (hasEncData && pwSet) showVaultPasswordUnlock(proceed);
    else showVaultPasswordSetup(proceed);
    return;
  }

  _commitSaveVaultLink(desc, url, isPrivate, isPinned);
}

function _commitSaveVaultLink(desc, url, isPrivate, isPinned) {
  const inPublic  = VEDIT_ID ? VDATA_PUBLIC.find(l => l.id === VEDIT_ID)  : null;
  const inPrivate = VEDIT_ID ? VDATA_PRIVATE.find(l => l.id === VEDIT_ID) : null;
  const existing  = inPublic || inPrivate;

  const entry = {
    id:        VEDIT_ID || uid(),
    desc, url,
    pinned:    isPinned,
    locked:    isPrivate,
    addedAt:   existing ? existing.addedAt : Date.now(),
    updatedAt: Date.now(),
  };

  if (isPrivate) {
    // ── Private: save to encrypted store ──
    if (inPublic) {
      // Moving public → private
      VDATA_PUBLIC = VDATA_PUBLIC.filter(l => l.id !== VEDIT_ID);
      saveVaultPublic(VDATA_PUBLIC);
    }
    if (inPrivate) {
      VDATA_PRIVATE[VDATA_PRIVATE.findIndex(l => l.id === VEDIT_ID)] = entry;
    } else {
      VDATA_PRIVATE.unshift(entry);
    }
    saveVaultEncrypted(VDATA_PRIVATE); // async fire-and-forget
  } else {
    // ── Public: save to plain store ──
    if (inPrivate) {
      // Moving private → public
      VDATA_PRIVATE = VDATA_PRIVATE.filter(l => l.id !== VEDIT_ID);
      saveVaultEncrypted(VDATA_PRIVATE);
    }
    if (inPublic) {
      VDATA_PUBLIC[VDATA_PUBLIC.findIndex(l => l.id === VEDIT_ID)] = entry;
    } else {
      VDATA_PUBLIC.unshift(entry);
    }
    saveVaultPublic(VDATA_PUBLIC);
  }

  addLog('vault', VEDIT_ID ? 'Updated link' : 'Added link', desc, url);
  PANEL = null;
  document.getElementById('rpanel').classList.remove('open');
  document.getElementById('poverlay').classList.remove('show');
  document.getElementById('content').classList.remove('pushed');
  renderVaultBody();
  toast('✓ Link saved');
}

function askDelLink(id) {
  showConfirm('Delete this link?', () => {
    const fromPublic  = VDATA_PUBLIC.find(l => l.id === id);
    const fromPrivate = VDATA_PRIVATE.find(l => l.id === id);
    const _vdel = fromPublic || fromPrivate;

    if (fromPublic) {
      VDATA_PUBLIC = VDATA_PUBLIC.filter(l => l.id !== id);
      saveVaultPublic(VDATA_PUBLIC);
    } else if (fromPrivate) {
      VDATA_PRIVATE = VDATA_PRIVATE.filter(l => l.id !== id);
      if (VAULT_CRYPTO_KEY) saveVaultEncrypted(VDATA_PRIVATE);
    }

    document.getElementById('rpanel').classList.remove('open');
    document.getElementById('poverlay').classList.remove('show');
    document.getElementById('content').classList.remove('pushed');
    renderVaultBody();

    if (_vdel) toastWithUndo(_vdel.desc || 'Link', () => {
      if (fromPublic) {
        VDATA_PUBLIC.push(_vdel);
        saveVaultPublic(VDATA_PUBLIC);
      } else {
        VDATA_PRIVATE.push(_vdel);
        if (VAULT_CRYPTO_KEY) saveVaultEncrypted(VDATA_PRIVATE);
      }
      renderVaultBody();
    });
  }, {title:'Delete Link?', okLabel:'Delete'});
}


// ═══════════════════════════════════════════════════════
//  UTILITY
// ═══════════════════════════════════════════════════════

// Force re-encrypt the private store (recovery tool)
async function forceReEncryptVault() {
  if (!VAULT_UNLOCKED || !VAULT_CRYPTO_KEY) {
    showAlert('Please unlock the private section first.', {title:'Unlock First'});
    return;
  }
  await saveVaultEncrypted(VDATA_PRIVATE);
  toast('✓ Private vault re-encrypted — ' + VDATA_PRIVATE.length + ' link' + (VDATA_PRIVATE.length!==1?'s':'') + ' secured', 'var(--cd)');
  renderVaultBody();
}

// Change vault password (requires current password via unlock first)
function resetVaultEncryption() {
  if (!VAULT_UNLOCKED) {
    showAlert('Please unlock the private section first.', {title:'Unlock First'});
    return;
  }
  showConfirm(
    'Reset your vault password? Private links will stay in memory until you create a new password.',
    () => {
      ls.del(VAULT_ENC_KEY);
      ls.del('ac_vault_pw_set');
      VAULT_CRYPTO_KEY  = null;
      VAULT_CRYPTO_SALT = null;
      VAULT_UNLOCKED    = false;
      // Re-open setup (VDATA_PRIVATE still in memory, will be re-encrypted)
      showVaultPasswordSetup(() => {});
    },
    {title:'Reset Vault Password?', okLabel:'Reset', danger:false}
  );
}


// ── Register all vault functions as globals ───────────────────────────────
Object.assign(window, {
  renderVault, renderVaultBody,
  vaultCardHtml, copyVaultLink, openPrivateTab,
  openAddLink, openEditLink, renderVaultForm, saveVaultLink,
  askDelLink,
  unlockVault, lockVault, lockVaultOnNav, startVaultIdleTimer,
  showVaultPasswordSetup, handleVaultPasswordSetup,
  showVaultPasswordUnlock, handleVaultUnlock,
  forceReEncryptVault, resetVaultEncryption,
  checkVaultMigration, faviconUrl,
});
