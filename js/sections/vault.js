
// ═══════════════════════════════════════════════════════
//  VAULT ENCRYPTION — Web Crypto API (AES-GCM + PBKDF2)
// ═══════════════════════════════════════════════════════
const VAULT_ENC_KEY  = 'ac_v4_vault_enc';  // stores {salt, iv, ciphertext} — all base64
const VAULT_SALT_KEY = 'ac_v4_vault_salt'; // persistent salt for this device
let   VAULT_CRYPTO_KEY = null;             // in-memory only, cleared on lock
let   VAULT_CRYPTO_SALT = null;            // salt used to derive current key

// ── Helpers ──
function _b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function _unb64(str) {
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

async function _deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt, iterations:310000, hash:'SHA-256' },
    keyMat,
    { name:'AES-GCM', length:256 },
    false,
    ['encrypt','decrypt']
  );
}

async function vaultEncrypt(data, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await _deriveKey(password, salt);
  const enc  = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt(
    { name:'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(data))
  );
  return {
    salt: _b64(salt),
    iv:   _b64(iv),
    data: _b64(cipherBuf),
    v:    1
  };
}

async function vaultDecrypt(stored, password) {
  const salt      = _unb64(stored.salt);
  const iv        = _unb64(stored.iv);
  const cipher    = _unb64(stored.data);
  const key       = await _deriveKey(password, salt);
  const plainBuf  = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, cipher);
  const dec       = new TextDecoder();
  return JSON.parse(dec.decode(plainBuf));
}

// ── Save encrypted vault ──
async function saveVaultEncrypted(data) {
  if (!VAULT_CRYPTO_KEY || !VAULT_CRYPTO_SALT) { console.warn('Vault not unlocked'); return; }
  // Always use the salt from memory — it matches the derived VAULT_CRYPTO_KEY
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt(
    { name:'AES-GCM', iv },
    VAULT_CRYPTO_KEY,
    enc.encode(JSON.stringify(data))
  );
  const stored = {
    salt: _b64(VAULT_CRYPTO_SALT),
    iv:   _b64(iv),
    data: _b64(cipherBuf),
    v:    1
  };
  ls.set(VAULT_ENC_KEY, stored);
  ls.setStr(K.SAVED, String(Date.now()));
  scheduleDriveSync();
}

// ── Setup vault password ──
function showVaultPasswordSetup(onSuccess) {
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal-box" style="max-width:420px">
      <div class="modal-title">🔐 Create Vault Password</div>
      <div class="modal-msg" style="margin-bottom:14px">
        Your vault data will be encrypted using this password.<br>
        <strong style="color:#fb7185">⚠ If you forget this password, your vault data cannot be recovered.</strong>
      </div>
      <input type="password" id="vp-new" placeholder="Create password..." class="fin" style="margin-bottom:8px;width:100%;box-sizing:border-box">
      <input type="password" id="vp-confirm" placeholder="Confirm password..." class="fin" style="width:100%;box-sizing:border-box">
      <div id="vp-err" style="color:#fb7185;font-size:12px;margin-top:6px;min-height:16px"></div>
      <div class="modal-btns">
        <button class="modal-btn cancel" onclick="this.closest('.modal-overlay').remove()">Cancel</button>
        <button class="modal-btn confirm" onclick="handleVaultPasswordSetup(this, onSuccessCallback)">Create</button>
      </div>
    </div>`;
  // Store callback
  el.querySelector('.modal-btn.confirm')._cb = onSuccess;
  el.querySelector('.modal-btn.confirm').onclick = function() {
    handleVaultPasswordSetup(this);
  };
  document.body.appendChild(el);
  setTimeout(() => el.querySelector('#vp-new')?.focus(), 50);
}

async function handleVaultPasswordSetup(btn) {
  const overlay = btn.closest('.modal-overlay');
  const pw1 = document.getElementById('vp-new')?.value;
  const pw2 = document.getElementById('vp-confirm')?.value;
  const errEl = document.getElementById('vp-err');
  if (!pw1 || pw1.length < 4) { errEl.textContent = 'Password must be at least 4 characters'; return; }
  if (pw1 !== pw2) { errEl.textContent = 'Passwords do not match'; return; }
  btn.textContent = 'Encrypting...';
  btn.disabled = true;
  try {
    // Try every possible source of plain data
    const src1 = JSON.parse(localStorage.getItem('ac_v4_vault') || '[]');
    const src2 = JSON.parse(localStorage.getItem(VAULT_KEY) || '[]');
    const src3 = Array.isArray(VDATA) ? VDATA : [];
    // Use whichever has the most entries
    const allSources = [src1, src2, src3].filter(Array.isArray);
    const bestSource = allSources.reduce((a,b) => b.length > a.length ? b : a, []);
    if (bestSource.length > 0) {
      VDATA = bestSource;
    }
    // Derive key
    const salt = crypto.getRandomValues(new Uint8Array(16));
    VAULT_CRYPTO_KEY = await _deriveKey(pw1, salt);
    // Encrypt VDATA (contains migrated plain data)
    await saveVaultEncrypted(VDATA);
    // Delete ALL plain text copies permanently
    localStorage.removeItem('ac_v4_vault');
    localStorage.removeItem(VAULT_KEY);
    ls.setStr('ac_vault_pw_set', '1');
    overlay.remove();
    VAULT_UNLOCKED = true;
    startVaultIdleTimer();
    const migMsg = VDATA.length ? ' — ' + VDATA.length + ' links migrated' : '';
    toast('🔐 Vault encrypted' + migMsg + ' & unlocked', 'var(--cd)');
    if (typeof renderVaultBody === 'function') renderVaultBody();
  } catch(e) {
    errEl.textContent = 'Error: ' + e.message;
    btn.textContent = 'Create';
    btn.disabled = false;
  }
}

// ── Unlock vault with password ──
function showVaultPasswordUnlock(onSuccess) {
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal-box" style="max-width:380px">
      <div class="modal-title">🔐 Unlock Vault</div>
      <div class="modal-msg" style="margin-bottom:12px">Enter your vault password to decrypt your links.</div>
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
  const pw = document.getElementById('vp-unlock')?.value;
  const errEl = document.getElementById('vp-unlock-err');
  if (!pw) { errEl.textContent = 'Please enter your password'; return; }
  btn.textContent = 'Decrypting...';
  btn.disabled = true;
  try {
    const stored = ls.get(VAULT_ENC_KEY);
    if (!stored?.data) throw new Error('No encrypted data found. Please set up vault encryption first.');
    // Derive key using stored salt
    const salt = _unb64(stored.salt);
    const key  = await _deriveKey(pw, salt);
    // Try decrypting — will throw DOMException if wrong password
    const iv      = _unb64(stored.iv);
    const cipher  = _unb64(stored.data);
    const plainBuf = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, cipher);
    const dec = new TextDecoder();
    VDATA = JSON.parse(dec.decode(plainBuf));
    VAULT_CRYPTO_KEY = key;
    VAULT_UNLOCKED = true;
    ls.del(VAULT_KEY);      // Always delete plain text on unlock
    ls.del('ac_v4_vault');  // Belt and suspenders
    startVaultIdleTimer();
    overlay.remove();
    if (typeof renderVaultBody === 'function') renderVaultBody();
  } catch(e) {
    errEl.textContent = '✗ Wrong password or corrupted data';
    btn.textContent = 'Unlock';
    btn.disabled = false;
    VAULT_CRYPTO_KEY = null;
  }
}

// ── Override lockVault to clear memory ──
function lockVaultCrypto() {
  VAULT_UNLOCKED = false;
  VAULT_CRYPTO_KEY  = null;
  VAULT_CRYPTO_SALT = null; // Clear salt from memory
  VDATA = []; // Clear decrypted data from memory
  clearTimeout(VAULT_IDLE_TIMER);
  if (typeof renderVaultBody === 'function') renderVaultBody();
}


// ═══════════════════════════════════════════════════════
//  LINK VAULT DATA & STATE
// ═══════════════════════════════════════════════════════
const VAULT_KEY = 'ac_v4_vault';

function loadVault()  { return []; } // Always empty - real data comes from encrypted store
function saveVault(d) { /* disabled - use saveVaultEncrypted instead */ }

// Auto-migrate: if plain data exists and no encryption set up yet, prompt setup
function checkVaultMigration() {
  const plainData = ls.get(VAULT_KEY);
  const pwSet     = ls.str('ac_vault_pw_set');
  const hasEnc    = !!ls.get(VAULT_ENC_KEY);

  if (plainData?.length && !hasEnc) {
    // Has plain unencrypted data — must encrypt it now
    showAlert(
      '🔐 Your Vault needs to be encrypted.<br><br>Set a password to protect your ' +
      plainData.length + ' saved link' + (plainData.length!==1?'s':'') +
      '.<br>Your existing links will be migrated automatically.',
      { title: 'Vault Encryption Required' }
    );
    setTimeout(() => showVaultPasswordSetup(() => {}), 300);
  }
}

// Read any existing plain data for migration BEFORE clearing
const _PLAIN_VAULT_MIGRATE = ls.get(VAULT_KEY) || [];
let VDATA = []; // Always starts empty — populated after password decrypt
let VSEARCH        = '';
let VAULT_UNLOCKED = false;
let VAULT_IDLE_TIMER = null;
let VEDIT_ID       = null;

// ── Auto-lock on navigate away ──
function lockVaultOnNav() {
  if (VAULT_UNLOCKED) {
    VAULT_UNLOCKED = false;
    clearTimeout(VAULT_IDLE_TIMER);
  }
}

function startVaultIdleTimer() {
  clearTimeout(VAULT_IDLE_TIMER);
  const mins = SETTINGS.idleTimeout || 5;
  VAULT_IDLE_TIMER = setTimeout(() => {
    VAULT_UNLOCKED = false;
    if (CURRENT === 'vault') renderVaultBody();
  }, mins * 60 * 1000);
}

function unlockVault() {
  const hasEncrypted = !!ls.get(VAULT_ENC_KEY);
  const pwSet        = ls.str('ac_vault_pw_set');
  const hasPlain     = !!(ls.get(VAULT_KEY)?.length);

  if (hasEncrypted && pwSet) {
    // Normal flow - ask for password
    showVaultPasswordUnlock(() => {});
  } else if (hasPlain || !hasEncrypted) {
    // Has plain data or first time - setup password + migrate
    showVaultPasswordSetup(() => {});
  } else {
    showVaultPasswordSetup(() => {});
  }
}

function lockVault() { lockVaultCrypto(); }

// ── Favicon helper ──
function faviconUrl(url) {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  } catch { return ''; }
}

// ═══════════════════════════════════════════════════════
//  VAULT RENDER
// ═══════════════════════════════════════════════════════
// ── Reset vault encryption (for re-migration) ──
function resetVaultEncryption() {
  showConfirm(
    'This will clear your current vault password and re-run encryption setup. Your links will be re-migrated. Continue?',
    () => {
      // Restore plain data temporarily so migration can pick it up
      const enc = ls.get(VAULT_ENC_KEY);
      localStorage.removeItem('ac_vault_pw_set');
      VAULT_UNLOCKED = false;
      VAULT_CRYPTO_KEY = null;
      VDATA = [];
      // If we have encrypted data, we need password to decrypt first
      if (enc) {
        showAlert('To re-encrypt, first unlock your vault with your current password, then go to Settings → Security → Reset Vault Password.', {title:'Unlock First'});
        return;
      }
      // No encrypted data - straight to setup
      showVaultPasswordSetup(() => {});
    },
    {title:'Reset Vault Encryption?', okLabel:'Reset', danger:false}
  );
}

// ── Force re-encrypt with current key (for recovery after failed migration) ──
async function forceReEncryptVault() {
  if (!VAULT_UNLOCKED || !VAULT_CRYPTO_KEY) {
    showAlert('Please unlock your vault first, then run re-encryption.', {title:'Unlock First'});
    return;
  }
  // Check for any remaining plain data
  const plain = JSON.parse(localStorage.getItem('ac_v4_vault') || '[]');
  if (plain.length > 0) {
    // Merge plain data into current VDATA
    const existingIds = new Set(VDATA.map(l => l.id));
    const newLinks = plain.filter(l => !existingIds.has(l.id));
    VDATA = [...VDATA, ...newLinks];
    toast('↻ Found ' + newLinks.length + ' unencrypted links, merging...', 'var(--ch)');
  }
  await saveVaultEncrypted(VDATA);
  localStorage.removeItem('ac_v4_vault');
  localStorage.removeItem(VAULT_KEY);
  toast('✓ Vault re-encrypted — ' + VDATA.length + ' links secured', 'var(--cd)');
  renderVaultBody();
}

function renderVault(c) {
  checkVaultMigration();
  c.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div class="sub-tabs">
          <button class="stab active">Links</button>
        </div>
        <span style="font-size:10px;color:#4ade80;background:rgba(74,222,128,.1);border:1px solid rgba(74,222,128,.2);border-radius:4px;padding:2px 7px">🔐 Encrypted</span>
        <button id="vault-lock-btn" style="display:none;height:28px;border-radius:5px;background:rgba(251,113,133,.1);border:1px solid rgba(251,113,133,.25);color:#fb7185;font-size:11px;font-weight:600;padding:0 10px;cursor:pointer" onclick="lockVault()">🔓 Lock</button>
      </div>
      <button class="nb-btn ac" onclick="openAddLink()">+ Add Link</button>
    </div>
    <div id="vault-body"></div>`;
  renderVaultBody();
}

function renderVaultBody() {
  const el = document.getElementById('vault-body'); if (!el) return;
  const hasEncData = !!ls.get(VAULT_ENC_KEY);

  // Show/hide lock button
  const lockBtn = document.getElementById('vault-lock-btn');
  if (lockBtn) lockBtn.style.display = VAULT_UNLOCKED ? 'block' : 'none';

  // If locked and has encrypted data — show unlock prompt, don't render content
  if (!VAULT_UNLOCKED && hasEncData) {
    el.innerHTML = `<div style="text-align:center;padding:40px 20px">
      <div style="font-size:32px;margin-bottom:12px">🔐</div>
      <div style="font-size:14px;font-weight:600;color:var(--tx);margin-bottom:6px">Vault is Locked</div>
      <div style="font-size:12px;color:var(--mu);margin-bottom:16px">Your links are encrypted. Enter your password to view them.</div>
      <button onclick="unlockVault()" style="background:var(--ac);color:#000;border:none;border-radius:6px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer">🔐 Unlock Vault</button>
    </div>`;
    return;
  }

  // If locked and has plain unencrypted data — show migration prompt
  if (!VAULT_UNLOCKED) {
    const plainData = ls.get(VAULT_KEY);
    if (plainData?.length) {
      el.innerHTML = `<div style="text-align:center;padding:30px 20px">
        <div style="font-size:32px;margin-bottom:12px">🔐</div>
        <div style="font-size:14px;font-weight:600;color:var(--tx);margin-bottom:6px">Encrypt Your Vault</div>
        <div style="font-size:12px;color:var(--mu);margin-bottom:16px">You have ${plainData.length} unencrypted link${plainData.length!==1?'s':''}. Set a password to encrypt them.</div>
        <button onclick="showVaultPasswordSetup(()=>{})" style="background:var(--ac);color:#000;border:none;border-radius:6px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer">🔐 Encrypt Now</button>
      </div>`;
      return;
    }
    // No data at all
    el.innerHTML = `<div class="empty"><div class="empty-ico">🔗</div><p>No links yet — add your first one!</p></div>`;
    return;
  }

  const all = VDATA;
  const q = VSEARCH.toLowerCase();
  const filtered = q ? all.filter(l => l.desc?.toLowerCase().includes(q) || l.url?.toLowerCase().includes(q)) : all;

  // Sort: pinned first, then by date desc
  const pub    = filtered.filter(l => !l.locked).sort((a,b) => (b.pinned?1:0)-(a.pinned?1:0) || b.addedAt-a.addedAt);
  const priv   = filtered.filter(l => l.locked).sort((a,b) => b.addedAt-a.addedAt);

  if (!pub.length && !priv.length) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">🔗</div><p>No links yet — add your first one!</p></div>`;
    return;
  }

  const pubHtml  = pub.map(l => vaultCardHtml(l, false)).join('');
  const privHtml = priv.length ? `
    <div style="display:flex;align-items:center;gap:10px;margin:16px 0 8px;padding-top:12px;border-top:1px solid var(--brd)">
      <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#fb7185">🔒 Private Links</span>
      <div style="flex:1;height:1px;background:rgba(251,113,133,.2)"></div>
      <span style="font-size:11px;color:var(--mu)">${priv.length} link${priv.length!==1?'s':''}</span>
      ${!VAULT_UNLOCKED ? `<button onclick="unlockVault()" style="background:rgba(251,113,133,.1);color:#fb7185;border:1px solid rgba(251,113,133,.25);border-radius:4px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer">🔒 Unlock</button>` : ''}
    </div>
    ${!VAULT_UNLOCKED
      ? `<div style="background:rgba(251,113,133,.04);border:1px dashed rgba(251,113,133,.2);border-radius:8px;padding:20px;text-align:center">
           <div style="font-size:24px;margin-bottom:8px">🔐</div>
           <div style="font-size:13px;color:#fb7185;font-weight:600">${priv.length} encrypted link${priv.length!==1?'s':''}</div>
           <div style="font-size:11px;color:var(--mu);margin-top:4px">Unlock to view — content is not in the DOM</div>
         </div>`
      : `<div style="display:flex;flex-direction:column;gap:6px">${priv.map(l => vaultCardHtml(l, true)).join('')}</div>`
    }` : '';

  el.innerHTML = `<div style="display:flex;flex-direction:column;gap:6px">${pubHtml}</div>${privHtml}`;
}

function vaultCardHtml(l, isPrivate) {
  const fav  = faviconUrl(l.url||'');
  const date = l.addedAt ? new Date(l.addedAt).toLocaleDateString() : '';
  const shortUrl = (() => { try { return new URL(l.url).hostname; } catch { return l.url||''; } })();

  return `<div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);padding:12px 14px;display:flex;align-items:center;gap:12px;transition:border-color .15s" id="vcard-${l.id}"
    onmouseover="this.style.borderColor='var(--brd2)'" onmouseout="this.style.borderColor='var(--brd)'">
    ${fav ? `<img src="${esc(fav)}" width="20" height="20" style="flex-shrink:0;border-radius:4px" onerror="this.style.display='none'">` : `<div style="width:20px;height:20px;background:var(--surf2);border-radius:4px;flex-shrink:0"></div>`}
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
        ${l.pinned ? '<span style="color:#fbbf24;margin-right:4px">📌</span>' : ''}${esc(l.desc||'Untitled')}
      </div>
      <div style="font-size:11px;color:var(--mu);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px">${esc(shortUrl)}</div>
      ${date ? `<div style="font-size:10px;color:var(--mu);margin-top:1px">${date}</div>` : ''}
    </div>
    <div style="display:flex;gap:4px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
      <button onclick="copyVaultLink('${esc(l.url)}')" title="Copy URL"
        style="width:28px;height:28px;border-radius:5px;background:var(--surf2);border:1px solid var(--brd);color:var(--tx2);font-size:12px;cursor:pointer">📋</button>
      <button onclick="window.open('${esc(l.url)}','_blank')" title="Open in new tab"
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
    .then(() => {
      showAlert(
        `URL copied to clipboard!<br><br>Now open a private/incognito window manually:<br>
        <b>Chrome/Edge:</b> Ctrl+Shift+N<br>
        <b>Firefox:</b> Ctrl+Shift+P<br>
        <b>Then paste</b> the URL there.`,
        { title: '🕶 Open in Private' }
      );
    })
    .catch(() => {
      showAlert(
        `Copy this URL manually and paste it in a private window:<br><br>
        <span style="word-break:break-all;color:var(--ac);font-size:12px">${esc(url)}</span>`,
        { title: '🕶 Open in Private' }
      );
    });
}

// ── ADD / EDIT FORM ──
function openAddLink() {
  VEDIT_ID = null;
  renderVaultForm(null);
}

function openEditLink(id) {
  VEDIT_ID = id;
  renderVaultForm(VDATA.find(l => l.id === id));
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
      <div style="display:flex;gap:16px;padding-top:4px">
        <div style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="vf-pin" ${l?.pinned?'checked':''} style="width:14px;height:14px;cursor:pointer;accent-color:var(--ac)">
          <label for="vf-pin" class="flbl" style="margin:0;cursor:pointer">📌 Pinned</label>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="vf-lock" ${l?.locked?'checked':''} style="width:14px;height:14px;cursor:pointer;accent-color:#fb7185">
          <label for="vf-lock" class="flbl" style="margin:0;cursor:pointer;color:#fb7185">🔒 Private</label>
        </div>
      </div>
    </div>
    <div class="panel-actions">
      ${l ? `<button class="btn-del" onclick="askDelLink('${l.id}')">Delete</button>` : ''}
      <button class="btn-cancel" onclick="closePanel()">Cancel</button>
      <button class="btn-save" onclick="saveVaultLink()">Save</button>
    </div>`;
}

function saveVaultLink() {
  const desc = document.getElementById('vf-desc')?.value?.trim();
  const url  = document.getElementById('vf-url')?.value?.trim();
  if (!desc) { showAlert('Please enter a description', {title:'Missing Description'}); return; }
  if (!url)  { showAlert('Please enter a URL', {title:'Missing URL'}); return; }

  const existing = VEDIT_ID ? VDATA.find(l => l.id === VEDIT_ID) : null;
  const entry = {
    id:      VEDIT_ID || uid(),
    desc, url,
    pinned:  document.getElementById('vf-pin')?.checked  || false,
    locked:  document.getElementById('vf-lock')?.checked || false,
    addedAt: existing ? existing.addedAt : Date.now(),
    updatedAt: Date.now(),
  };

  if (existing) { const i=VDATA.findIndex(l=>l.id===VEDIT_ID); VDATA[i]=entry; }
  else VDATA.unshift(entry);

  addLog('vault', existing?'Updated link':'Added link', entry.desc, entry.url);
  if (VAULT_CRYPTO_KEY) saveVaultEncrypted(VDATA);
  PANEL=null;
  document.getElementById('rpanel').classList.remove('open');
  document.getElementById('poverlay').classList.remove('show');
  document.getElementById('content').classList.remove('pushed');
  renderVaultBody();
  toast('✓ Link saved');
}

function askDelLink(id) {
  showConfirm('Delete this link?', () => {
    const _vdel=VDATA.find(l=>l.id===id);
    VDATA = VDATA.filter(l => l.id !== id);
    if (VAULT_CRYPTO_KEY) saveVaultEncrypted(VDATA);
    document.getElementById('rpanel').classList.remove('open');
    document.getElementById('poverlay').classList.remove('show');
    document.getElementById('content').classList.remove('pushed');
    renderVaultBody();
    if(_vdel) toastWithUndo(_vdel.desc||'Link',()=>{VDATA.push(_vdel);if(VAULT_CRYPTO_KEY)saveVaultEncrypted(VDATA);renderVaultBody();});
  }, {title:'Delete Link?', okLabel:'Delete'});
}
