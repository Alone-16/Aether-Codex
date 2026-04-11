// ═══════════════════════════════════════════════════════
//  SETTINGS STATE
// ═══════════════════════════════════════════════════════
const SETTINGS_KEY = 'ac_v4_settings';

function loadSettings() {
  const defaults = {
    sectionOrder: ['home','media','games','books','music','vault','log','tools','notes'],
    sectionEnabled: { home:true, media:true, games:true, books:true, music:true, vault:true, log:true, tools:true, notes:true },
    density: 'comfortable',
    fontSize: 'medium',
    autoBackupDays: 10,
    idleTimeout: 5,
    theme: 'dark',
    malAccessToken: null,
    malRefreshToken: null,
    malTokenExpiry: null,
  };
  const saved = ls.get(SETTINGS_KEY);
  if (!saved) return defaults;
  // Ensure new sections are always added if missing
  const allSections = ['home','media','games','books','music','vault','log','tools','notes'];
  allSections.forEach(s => {
    if (!saved.sectionOrder.includes(s)) saved.sectionOrder.push(s);
    if (saved.sectionEnabled[s] === undefined) saved.sectionEnabled[s] = true;
  });
  if (saved.malAccessToken === undefined) saved.malAccessToken = null;
  if (saved.malRefreshToken === undefined) saved.malRefreshToken = null;
  if (saved.malTokenExpiry === undefined) saved.malTokenExpiry = null;
  return { ...defaults, ...saved };
}
function saveSettings(s) { ls.set(SETTINGS_KEY, s); }

let SETTINGS = loadSettings();
let SETTINGS_DRAG_IDX = null;
let SETTINGS_TAB = 'sections';

// Apply settings on load
function applySettings() {
  const s = SETTINGS;
  // Font size via CSS variable
  const sizeMap = { small:'12px', medium:'14px', large:'16px' };
  document.documentElement.style.setProperty('--base-font', sizeMap[s.fontSize||'medium']);
  // Density via data attribute
  document.documentElement.setAttribute('data-density', s.density||'comfortable');
  // Rebuild sidebar order
  rebuildSidebar();
}

function rebuildSidebar() {
  const order = SETTINGS.sectionOrder || ['home','media','games','books','music'];
  const enabled = SETTINGS.sectionEnabled || {};
  const sidebarMeta = {
    home:  { icon:'⌂', label:'Home' },
    media: { icon:'◉', label:'Media' },
    games: { icon:'◈', label:'Games' },
    books: { icon:'◎', label:'Books' },
    music: { icon:'♪', label:'Music' },
    vault: { icon:'◈', label:'Vault' },
    tools: { icon:'⬇', label:'Tools' },
    log:   { icon:'◎', label:'Log' },
    notes: { icon:'✎', label:'Notes' },
  };
  // Desktop sidebar
  const sb = document.getElementById('sidebar');
  if (!sb) return;
  // Keep logo and sep, rebuild nav items
  const logo = sb.querySelector('.sb-logo');
  const sep  = sb.querySelector('.sb-sep');
  const bot  = sb.querySelector('.sb-bot');
  // Remove existing nav items
  sb.querySelectorAll('.ni:not(.sb-bot .ni)').forEach(el => el.remove());
  // Re-insert in order
  const frag = document.createDocumentFragment();
  order.filter(id => enabled[id] !== false).forEach(id => {
    const m = sidebarMeta[id]; if (!m) return;
    const el = document.createElement('div');
    el.className = 'ni' + (CURRENT === id ? ' active' : '');
    el.dataset.r = id;
    el.dataset.tip = m.label;
    el.innerHTML = `<span class="ni-ico">${m.icon}</span><span class="ni-lbl">${m.label}</span>`;
    el.onclick = () => nav(id);
    if (CURRENT === id) {
      el.classList.add('active');
      el.style.setProperty('--ac-active', 'var(--ac)');
    }
    frag.appendChild(el);
  });
  // Insert before .sb-bot
  sb.insertBefore(frag, bot);
  // Also rebuild mobile sidebar
  const mobSb = document.getElementById('mob-sb');
  if (mobSb) {
    const mobLogo = mobSb.querySelector('.mob-logo');
    const mobSep  = mobSb.querySelector('.mob-sep');
    mobSb.querySelectorAll('.mob-ni').forEach(el => el.remove());
    const mobFrag = document.createDocumentFragment();
    order.filter(id => enabled[id] !== false).forEach(id => {
      const m = sidebarMeta[id]; if (!m) return;
      const el = document.createElement('div');
      el.className = 'mob-ni' + (CURRENT === id ? ' active' : '');
      el.dataset.r = id;
      el.innerHTML = `<span>${m.icon}</span>${m.label}`;
      el.onclick = () => nav(id);
      mobFrag.appendChild(el);
    });
    // Insert sep then settings
    mobSb.appendChild(mobFrag);
    if (mobSep) mobSb.appendChild(mobSep.cloneNode());
    const settingsEl = document.createElement('div');
    settingsEl.className = 'mob-ni' + (CURRENT === 'settings' ? ' active' : '');
    settingsEl.innerHTML = '<span>⚙</span>Settings';
    settingsEl.onclick = () => nav('settings');
    mobSb.appendChild(settingsEl);
  }
}

// ─── SETTINGS RENDER ───
function renderSettings(c) {
  const isElectron = !!(window.electronBridge);
  const tabs       = ['sections','drive','storage','ai','security','share', ...(isElectron ? ['desktop'] : [])];
  const tabLabels  = ['Sections','Drive','Storage','AI Assistant','Security','Public Share', ...(isElectron ? ['Desktop App'] : [])];

  c.innerHTML = `
    <div style="font-family:var(--fd);font-size:20px;font-weight:700;margin-bottom:20px;color:var(--tx)">⚙ Settings</div>
    <div style="display:flex;gap:4px;margin-bottom:20px;flex-wrap:wrap">
      ${tabs.map((t,i) => `<button class="stab${SETTINGS_TAB===t?' active':''}" onclick="setSettingsTab('${t}')">${tabLabels[i]}</button>`).join('')}
    </div>
    <div id="settings-body" style="max-width:560px"></div>`;
  renderSettingsBody();
}

function setSettingsTab(t) { SETTINGS_TAB = t; renderSettingsBody(); }

function renderSettingsBody() {
  const el = document.getElementById('settings-body'); if (!el) return;
  if      (SETTINGS_TAB === 'sections')   renderSettingsSections(el);
  else if (SETTINGS_TAB === 'drive')      renderSettingsDrive(el);
  else if (SETTINGS_TAB === 'storage')    renderSettingsStorage(el);
  else if (SETTINGS_TAB === 'ai')         renderSettingsAI(el);
  else if (SETTINGS_TAB === 'share')       renderSettingsPublicShare(el);
  else if (SETTINGS_TAB === 'security')   renderSettingsSecurity(el);
  else if (SETTINGS_TAB === 'desktop')    renderSettingsDesktop(el);
  // Update active tab
  document.querySelectorAll('.stab').forEach(t => {
    const tabs = ['sections','drive','storage','appearance','security'];
    t.classList.toggle('active', t.textContent.toLowerCase() === (tabs.find(x => x === SETTINGS_TAB) || ''));
  });
}

// ── SECTIONS TAB ──
function renderSettingsSections(el) {
  const order   = [...(SETTINGS.sectionOrder || ['home','media','games','books','music'])];
  const enabled = SETTINGS.sectionEnabled || {};
  const meta = {
    home:  { icon:'⌂', color:'#34d399', desc:'Master dashboard' },
    media: { icon:'◉', color:'#e879a0', desc:'Anime, K-Drama, Manhwa & more' },
    games: { icon:'◈', color:'#f59e0b', desc:'PC & Mobile game tracker' },
    books: { icon:'◎', color:'#a78bfa', desc:'Novels, Audiobooks & Manga' },
    music: { icon:'♪', color:'#fb923c', desc:'Music library & YouTube sync' },
    vault: { icon:'🔗', color:'#a78bfa', desc:'Save and manage links privately' },
    tools: { icon:'⬇', color:'#f43f5e', desc:'Instagram downloader & utilities' },
    notes: { icon:'✎', color:'#14532d', desc:'Personal notes, checklists & ideas' },
  };

  el.innerHTML = `
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);overflow:hidden;margin-bottom:14px">
      <div style="padding:14px 16px;border-bottom:1px solid var(--brd)">
        <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:2px">Section Order</div>
        <div style="font-size:12px;color:var(--mu)">Drag to reorder · toggle to show/hide · click Save to apply</div>
      </div>
      <div id="section-order-list" style="padding:8px">
        ${order.map((id, i) => {
          const m = meta[id]; if (!m) return '';
          const isEnabled = enabled[id] !== false;
          const isHome = id === 'home';
          return `<div class="settings-section-row" draggable="${!isHome}" data-id="${id}" data-idx="${i}"
            ondragstart="ssDragStart(event,${i})" ondragover="ssDragOver(event,${i})" ondrop="ssDrop(event,${i})"
            ondragleave="this.classList.remove('ss-drag-over')"
            style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--surf2);border:1px solid var(--brd);border-radius:7px;margin-bottom:4px;transition:all .15s;${!isHome?'cursor:grab':''}">
            <span style="font-size:12px;color:var(--mu);cursor:grab;user-select:none">${isHome?'📌':'⠿'}</span>
            <span style="font-size:18px">${m.icon}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--tx)">${id.charAt(0).toUpperCase()+id.slice(1)}</div>
              <div style="font-size:11px;color:var(--mu)">${m.desc}</div>
            </div>
            ${!isHome ? `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--tx2)">
              <input type="checkbox" ${isEnabled?'checked':''} onchange="toggleSection('${id}',this.checked)"
                style="width:14px;height:14px;accent-color:var(--ac);cursor:pointer">
              ${isEnabled?'Enabled':'Hidden'}
            </label>` : `<span style="font-size:11px;color:var(--mu);padding:2px 8px;background:var(--surf3);border-radius:4px">Always on</span>`}
          </div>`;
        }).join('')}
      </div>
      <div style="padding:10px 16px;border-top:1px solid var(--brd);display:flex;justify-content:flex-end">
        <button onclick="saveSectionOrder()" style="background:var(--ac);color:#000;border:none;border-radius:5px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer">Save Order</button>
      </div>
    </div>`;

  // Add drag-over style
  if (!document.getElementById('settings-drag-style')) {
    const style = document.createElement('style');
    style.id = 'settings-drag-style';
    style.textContent = `.ss-drag-over{border-color:var(--ac)!important;background:rgba(var(--ac-rgb),.08)!important}`;
    document.head.appendChild(style);
  }
}

let SS_DRAG_IDX = null;
let SS_DRAG_ORDER = null;

function ssDragStart(e, i) {
  SS_DRAG_IDX = i;
  SS_DRAG_ORDER = [...(SETTINGS.sectionOrder || ['home','media','games','books','music'])];
  e.currentTarget.style.opacity = '.4';
}
function ssDragOver(e, i) {
  e.preventDefault();
  if (SS_DRAG_IDX === i || SS_DRAG_IDX === null) return;
  document.querySelectorAll('.settings-section-row').forEach(r => r.classList.remove('ss-drag-over'));
  e.currentTarget.classList.add('ss-drag-over');
}
function ssDrop(e, i) {
  e.preventDefault();
  document.querySelectorAll('.settings-section-row').forEach(r => {
    r.classList.remove('ss-drag-over');
    r.style.opacity = '1';
  });
  if (SS_DRAG_IDX === null || SS_DRAG_IDX === i) return;
  const order = [...(SETTINGS.sectionOrder || ['home','media','games','books','music'])];
  // Never move home from position 0
  if (order[SS_DRAG_IDX] === 'home' || order[i] === 'home') return;
  const item = order.splice(SS_DRAG_IDX, 1)[0];
  order.splice(i, 0, item);
  SETTINGS.sectionOrder = order;
  SS_DRAG_IDX = null;
  renderSettingsSections(document.getElementById('settings-body'));
}

function toggleSection(id, enabled) {
  if (!SETTINGS.sectionEnabled) SETTINGS.sectionEnabled = {};
  SETTINGS.sectionEnabled[id] = enabled;
  renderSettingsSections(document.getElementById('settings-body'));
}

function saveSectionOrder() {
  saveSettings(SETTINGS);
  rebuildSidebar();
  toast('✓ Section order saved', 'var(--cd)');
}

// ── DRIVE TAB ──
function renderSettingsDrive(el) {
  const connected = _isConnected();
  const lastSync  = ls.str(K.DSYNC) ? new Date(parseInt(ls.str(K.DSYNC))).toLocaleString() : 'Never';
  const lastSaved = ls.str(K.SAVED) ? new Date(parseInt(ls.str(K.SAVED))).toLocaleString() : 'Never';

  el.innerHTML = `
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);overflow:hidden;margin-bottom:12px">
      <div style="padding:14px 16px;border-bottom:1px solid var(--brd)">
        <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:2px">Google Drive</div>
      </div>
      <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--tx)">Status</div>
            <div style="font-size:12px;color:${connected?'#4ade80':'#fb7185'};margin-top:2px">${connected?'✓ Connected':'✗ Not connected'}</div>
          </div>
          <button onclick="driveAction()" style="background:${connected?'rgba(251,113,133,.1)':'rgba(var(--ac-rgb),.12)'};color:${connected?'#fb7185':'var(--ac)'};border:1px solid ${connected?'rgba(251,113,133,.25)':'rgba(var(--ac-rgb),.3)'};border-radius:5px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">
            ${connected?'Disconnect':'Connect'}
          </button>
        </div>
        <div style="height:1px;background:var(--brd)"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:12px">
          <div><div style="color:var(--mu);margin-bottom:2px">Last Synced</div><div style="color:var(--tx2)">${lastSync}</div></div>
          <div><div style="color:var(--mu);margin-bottom:2px">Last Changed</div><div style="color:var(--tx2)">${lastSaved}</div></div>
        </div>
        ${connected?`<button onclick="_pushToDrive().then(()=>toast('✓ Synced now','var(--cd)'))" style="background:rgba(var(--ac-rgb),.12);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3);border-radius:5px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer;align-self:flex-start">↻ Sync Now</button>`:''}
      </div>
    </div>
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--brd)">
        <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:2px">Auto Backup</div>
        <div style="font-size:12px;color:var(--mu)">Automatically export a backup to Drive every N days</div>
      </div>
      <div style="padding:14px 16px;display:flex;align-items:center;gap:10px">
        <input type="number" id="backup-days" min="1" max="365" value="${SETTINGS.autoBackupDays||10}"
          style="width:70px;background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:6px 10px;font-size:13px;color:var(--tx);outline:none">
        <span style="font-size:13px;color:var(--tx2)">days</span>
        <button onclick="saveBackupDays()" style="background:var(--ac);color:#000;border:none;border-radius:5px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">Save</button>
      </div>
    </div>`;
}

function saveBackupDays() {
  const v = parseInt(document.getElementById('backup-days')?.value);
  if (v > 0) { SETTINGS.autoBackupDays = v; saveSettings(SETTINGS); toast('✓ Saved'); }
}

async function connectMALAccount() {
  if (typeof _startMALAuth !== 'function') {
    toast('MAL auth is unavailable', '#fb7185');
    return;
  }
  try {
    await _startMALAuth();
  } catch (err) {
    console.error('[MAL Auth]', err);
    toast('MAL auth failed: ' + (err.message || 'Unknown error'), '#fb7185');
  }
}

function disconnectMALAccount() {
  showConfirm('Disconnect your MyAnimeList account from this device?', () => {
    SETTINGS.malAccessToken = null;
    SETTINGS.malRefreshToken = null;
    SETTINGS.malTokenExpiry = null;
    saveSettings(SETTINGS);
    renderSettingsSecurity(document.getElementById('settings-body'));
    toast('✓ MAL disconnected', 'var(--cd)');
  }, { title:'Disconnect MAL?', okLabel:'Disconnect', danger:false });
}

// ── STORAGE TAB ──
function renderSettingsStorage(el) {
  const keys = [
    { label:'Media',     key:K.DATA,      color:'#e879a0' },
    { label:'Games',     key:GAMES_KEY,   color:'#f59e0b' },
    { label:'Books',     key:BOOKS_KEY,   color:'#a78bfa' },
    { label:'Music',     key:MUSIC_KEY,   color:'#fb923c' },
    { label:'Playlists', key:MUSIC_PL_KEY,color:'#fb923c' },
    { label:'Genres',    key:K.GENRES,    color:'#8888aa' },
    { label:'Settings',  key:SETTINGS_KEY,color:'#8888aa' },
  ];

  let totalBytes = 0;
  const rows = keys.map(k => {
    const val = localStorage.getItem(k.key) || '';
    const bytes = new Blob([val]).size;
    totalBytes += bytes;
    return { ...k, bytes };
  });

  const maxBytes = Math.max(...rows.map(r => r.bytes), 1);
  const fmtBytes = b => b > 1024*1024 ? `${(b/1024/1024).toFixed(2)} MB` : b > 1024 ? `${(b/1024).toFixed(1)} KB` : `${b} B`;
  const totalKB = (totalBytes/1024).toFixed(1);
  const lsLimit = 5120; // ~5MB typical limit
  const pct = Math.min(Math.round(totalBytes/1024/lsLimit*100), 100);

  el.innerHTML = `
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);overflow:hidden;margin-bottom:12px">
      <div style="padding:14px 16px;border-bottom:1px solid var(--brd)">
        <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:2px">localStorage Usage</div>
        <div style="font-size:12px;color:var(--mu)">${fmtBytes(totalBytes)} used of ~5 MB</div>
      </div>
      <div style="padding:14px 16px">
        <div style="height:6px;background:var(--surf3);border-radius:3px;overflow:hidden;margin-bottom:14px">
          <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--ac),var(--ac2));border-radius:3px;transition:width .4s"></div>
        </div>
        ${rows.map(r => `
          <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--brd)">
            <div style="width:8px;height:8px;border-radius:50%;background:${r.color};flex-shrink:0"></div>
            <span style="flex:1;font-size:13px;color:var(--tx)">${r.label}</span>
            <div style="width:100px;height:3px;background:var(--surf3);border-radius:2px;overflow:hidden">
              <div style="height:100%;width:${Math.round(r.bytes/maxBytes*100)}%;background:${r.color};border-radius:2px"></div>
            </div>
            <span style="font-size:12px;color:var(--tx2);min-width:60px;text-align:right">${fmtBytes(r.bytes)}</span>
          </div>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button onclick="exportData()" style="background:var(--surf2);color:var(--tx2);border:1px solid var(--brd);border-radius:5px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer">⬇ Export Backup</button>
      <button onclick="importFile()" style="background:var(--surf2);color:var(--tx2);border:1px solid var(--brd);border-radius:5px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer">⬆ Import Backup</button>
    </div>`;
}

// ── APPEARANCE TAB ──
function renderSettingsAI(el) {
  const hasKey = !!getAIKey();
  el.innerHTML = `
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);overflow:hidden;margin-bottom:12px">
      <div style="padding:14px 16px;border-bottom:1px solid var(--brd)">
        <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:2px">✦ Gemini API Key</div>
        <div style="font-size:12px;color:var(--mu)">Your key is stored locally on this device only — never sent to GitHub</div>
      </div>
      <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:13px;color:${hasKey?'#4ade80':'var(--tx2)'}">
          ${hasKey?'✓ API key is set on this device':'No API key set'}
        </div>
        <div style="display:flex;gap:8px">
          <input type="password" id="ai-key-setting" placeholder="AIzaSy..." value="${hasKey?'••••••••••••••••':''}"
            style="flex:1;background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:8px 10px;font-size:13px;color:var(--tx);outline:none"
            onfocus="if(this.value==='••••••••••••••••')this.value=''">
          <button onclick="saveAIKeySetting()" style="background:var(--ac);color:#000;border:none;border-radius:5px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer">Save</button>
        </div>
        ${hasKey?`<button onclick="clearAIKey()" style="background:rgba(251,113,133,.08);color:#fb7185;border:1px solid rgba(251,113,133,.2);border-radius:5px;padding:7px 14px;font-size:12px;font-weight:600;cursor:pointer;align-self:flex-start">Remove Key</button>`:''}
        <div style="font-size:12px;color:var(--mu);line-height:1.6">
          Get a free API key at <a href="https://aistudio.google.com" target="_blank" style="color:var(--ac)">aistudio.google.com</a> → Get API Key → Create API key.<br>
          You'll need to paste it once per device.
        </div>
      </div>
    </div>`;
}

function saveAIKeySetting() {
  const val = document.getElementById('ai-key-setting')?.value?.trim();
  if (!val) { toast('Please enter an API key', 'var(--cr)'); return; }
  setAIKey(val); toast('✓ API key saved', 'var(--cd)');
  renderSettingsAI(document.getElementById('settings-body'));
}

function clearAIKey() {
  showConfirm('Remove your Gemini API key from this device?', () => {
    ls.del(AI_KEY_STORAGE); AI_HISTORY = [];
    renderSettingsAI(document.getElementById('settings-body'));
    toast('API key removed');
  }, { title:'Remove API Key?', okLabel:'Remove', danger:false });
}

function setFontSize(v) {
  SETTINGS.fontSize = v; saveSettings(SETTINGS);
  document.documentElement.style.setProperty('--base-font', {small:'12px',medium:'14px',large:'16px'}[v]||'14px');
  renderSettingsBody();
  toast('✓ Font size updated');
}

function setDensity(v) {
  SETTINGS.density = v; saveSettings(SETTINGS);
  document.documentElement.setAttribute('data-density', v);
  renderSettingsBody();
  toast('✓ Density updated');
}

// ── SECURITY TAB ──
function renderSettingsSecurity(el) {
  const hasPin = !!getPin();
  const malConnected     = !!SETTINGS.malRefreshToken;
  const malTokenValid    = malConnected && SETTINGS.malAccessToken && Date.now() < (parseInt(SETTINGS.malTokenExpiry) || 0);
  const malTotalCount    = (typeof DATA !== 'undefined') ? DATA.length : 0;
  const malLinkedCount   = (typeof DATA !== 'undefined') ? DATA.filter(e => e.malId).length : 0;
  const malUnlinkedCount = malTotalCount - malLinkedCount;
  const lastSyncRaw      = ls.str('ac_mal_last_sync');
  const lastSyncTime     = lastSyncRaw ? new Date(parseInt(lastSyncRaw)).toLocaleString() : null;
  const lastSyncTitle    = ls.str('ac_mal_last_sync_title') || '';
  const malDesc = malTokenValid
    ? 'Connected and ready. Episode changes, status and ratings sync automatically.'
    : malConnected
      ? 'Refresh token is saved but access token may be expired. Try syncing — it will auto-refresh. If it fails, reconnect.'
      : 'Connect your MAL account to auto-sync anime status, episode progress and ratings to MyAnimeList.';
  const malLabel  = malConnected ? 'Disconnect MAL Account' : 'Connect MAL Account';
  const malAction = malConnected ? 'disconnectMALAccount()' : 'connectMALAccount()';
  el.innerHTML = `
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);overflow:hidden;margin-bottom:12px">
      <div style="padding:14px 16px;border-bottom:1px solid var(--brd)">
        <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:2px">Vault PIN</div>
        <div style="font-size:12px;color:var(--mu)">Protects 18+ Games and private Link Vault links</div>
      </div>
      <div style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:13px;color:var(--tx)">${hasPin?'PIN is set':'No PIN set'}</div>
          <div style="font-size:11px;color:var(--mu);margin-top:2px">${hasPin?'Click to change your PIN':'Set a PIN to protect adult content'}</div>
        </div>
        <button onclick="showPinModal(()=>renderSettingsSecurity(document.getElementById('settings-body')),'${hasPin?'change':'setup'}')"
          style="background:rgba(var(--ac-rgb),.12);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3);border-radius:5px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">
          ${hasPin?'Change PIN':'Set PIN'}
        </button>
      </div>
      ${hasPin?`<div style="padding:0 16px 14px">
        <button onclick="clearPin()" style="background:rgba(251,113,133,.08);color:#fb7185;border:1px solid rgba(251,113,133,.2);border-radius:5px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer">Remove PIN</button>
      </div>`:''}
    </div>
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--brd)">
        <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:2px">Auto-Lock Timeout</div>
        <div style="font-size:12px;color:var(--mu)">Minutes of inactivity before 18+ content re-locks</div>
      </div>
      <div style="padding:14px 16px;display:flex;align-items:center;gap:10px">
        <input type="number" id="idle-timeout" min="1" max="60" value="${SETTINGS.idleTimeout||5}"
          style="width:70px;background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:6px 10px;font-size:13px;color:var(--tx);outline:none">
        <span style="font-size:13px;color:var(--tx2)">minutes</span>
        <button onclick="saveIdleTimeout()" style="background:var(--ac);color:#000;border:none;border-radius:5px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">Save</button>
      </div>
    </div>
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);overflow:hidden;margin-top:12px">
      <div style="padding:14px 16px;border-bottom:1px solid var(--brd)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px;flex-wrap:wrap">
          <div style="font-size:13px;font-weight:700;color:var(--tx)">MyAnimeList Sync</div>
          <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;${
            malConnected && malTokenValid
              ? 'background:rgba(74,222,128,.1);color:#4ade80'
              : malConnected
                ? 'background:rgba(251,191,36,.1);color:#fbbf24'
                : 'background:rgba(251,113,133,.1);color:#fb7185'
          }">
            ${malConnected && malTokenValid ? '● Connected' : malConnected ? '● Needs Refresh' : '○ Not Connected'}
          </span>
        </div>
        <div style="font-size:12px;color:var(--mu)">
          <span style="color:${malLinkedCount>0?'#4ade80':'var(--mu)'}">✓ ${malLinkedCount} linked</span>
          ${malUnlinkedCount > 0 ? `<span style="color:var(--mu)"> · ${malUnlinkedCount} unlinked</span>` : ''}
          <span style="color:var(--mu)"> · ${malTotalCount} total entries</span>
        </div>
        ${lastSyncTime ? `<div style="font-size:11px;color:#00e5ff;margin-top:3px">✓ Last sync: ${lastSyncTime}${lastSyncTitle ? ' · ' + lastSyncTitle : ''}</div>` : ''}
      </div>
      <div style="padding:14px 16px;display:flex;flex-direction:column;gap:10px">
        <div style="font-size:12px;color:var(--tx2);line-height:1.6">${malDesc}</div>
        <div id="mal-bulk-progress" style="display:none;background:var(--surf2);border:1px solid var(--brd);border-radius:6px;padding:10px 12px"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <button onclick="${malAction}"
            style="background:${malConnected?'rgba(251,113,133,.1)':'rgba(var(--ac-rgb),.12)'};color:${malConnected?'#fb7185':'var(--ac)'};border:1px solid ${malConnected?'rgba(251,113,133,.25)':'rgba(var(--ac-rgb),.3)'};border-radius:5px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">
            ${malLabel}
          </button>
          ${malConnected && malLinkedCount > 0 ? `
            <button onclick="startMALBulkSync()"
              style="background:rgba(0,229,255,.08);color:#00e5ff;border:1px solid rgba(0,229,255,.25);border-radius:5px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">
              ↻ Sync ${malLinkedCount} Linked to MAL
            </button>` : ''}
          ${malConnected && malUnlinkedCount > 0 ? `
            <button onclick="openMALBulkLinkModal()"
              style="background:rgba(251,191,36,.08);color:#fbbf24;border:1px solid rgba(251,191,36,.25);border-radius:5px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">
              🔗 Auto-Link ${malUnlinkedCount} Unlinked
            </button>` : ''}
          ${!malConnected ? `
            <span style="font-size:12px;color:var(--mu)">Connect MAL account above to enable sync</span>` : ''}
        </div>
      </div>
    </div>`;
}

// ── DESKTOP APP TAB — shortcut key customisation ──
// Only visible when running inside Electron (window.electronBridge present).
// Ctrl+Alt is fixed; the user picks the final letter/digit for each action.
function renderSettingsDesktop(el) {
  if (!window.electronBridge) {
    el.innerHTML = `<div style="color:var(--mu);font-size:13px;padding:20px 0">Not running in the desktop app.</div>`;
    return;
  }

  el.innerHTML = `<div style="color:var(--mu);font-size:13px;padding:20px 0">Loading shortcuts…</div>`;

  window.electronBridge.getShortcuts().then(({ mainKey, miniKey }) => {
    el.innerHTML = `
      <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);overflow:hidden;margin-bottom:12px">
        <div style="padding:14px 16px;border-bottom:1px solid var(--brd)">
          <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:2px">⌨ Global Shortcuts</div>
          <div style="font-size:12px;color:var(--mu)"><b>Ctrl + Alt</b> is fixed. Pick the last key for each action (letter or digit).</div>
        </div>
        <div style="padding:14px 16px;display:flex;flex-direction:column;gap:16px">

          <!-- Open App -->
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--tx)">Open App</div>
              <div style="font-size:11px;color:var(--mu);margin-top:2px">Toggle the main Aether Codex window</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:12px;color:var(--tx2);white-space:nowrap">Ctrl + Alt +</span>
              <input id="shortcut-main-key" type="text" maxlength="1" value="${mainKey}"
                style="width:42px;text-align:center;text-transform:uppercase;background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:7px 6px;font-size:15px;font-weight:700;color:var(--tx);outline:none;letter-spacing:1px"
                oninput="this.value=this.value.replace(/[^a-zA-Z0-9]/g,'').toUpperCase().slice(-1)"
                onkeydown="if(event.key==='Enter')saveDesktopShortcut('main')">
              <button onclick="saveDesktopShortcut('main')"
                style="background:var(--ac);color:#000;border:none;border-radius:5px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">Save</button>
            </div>
          </div>

          <div style="height:1px;background:var(--brd)"></div>

          <!-- Quick Clipboard -->
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:var(--tx)">Quick Clipboard</div>
              <div style="font-size:11px;color:var(--mu);margin-top:2px">Toggle the mini clipboard scratchpad</div>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:12px;color:var(--tx2);white-space:nowrap">Ctrl + Alt +</span>
              <input id="shortcut-mini-key" type="text" maxlength="1" value="${miniKey}"
                style="width:42px;text-align:center;text-transform:uppercase;background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:7px 6px;font-size:15px;font-weight:700;color:var(--tx);outline:none;letter-spacing:1px"
                oninput="this.value=this.value.replace(/[^a-zA-Z0-9]/g,'').toUpperCase().slice(-1)"
                onkeydown="if(event.key==='Enter')saveDesktopShortcut('mini')">
              <button onclick="saveDesktopShortcut('mini')"
                style="background:var(--ac);color:#000;border:none;border-radius:5px;padding:7px 14px;font-size:12px;font-weight:700;cursor:pointer">Save</button>
            </div>
          </div>

        </div>
        <div style="padding:10px 16px;border-top:1px solid var(--brd);background:rgba(var(--ac-rgb),.04)">
          <div style="font-size:11px;color:var(--mu);line-height:1.6">
            ⚠ Avoid keys claimed by Windows (e.g. <b>Space</b> conflicts with IME). Letters <b>A–Z</b> and digits <b>0–9</b> work reliably. Changes take effect immediately — no restart needed.
          </div>
        </div>
      </div>`;
  }).catch(() => {
    el.innerHTML = `<div style="color:#fb7185;font-size:13px;padding:20px 0">Could not load shortcuts from the main process.</div>`;
  });
}

async function saveDesktopShortcut(type) {
  if (!window.electronBridge) return;
  const key = document.getElementById(type === 'main' ? 'shortcut-main-key' : 'shortcut-mini-key')?.value?.trim().toUpperCase();
  if (!key) { toast('Please enter a key (A–Z or 0–9)', 'var(--cr)'); return; }
  const result = await window.electronBridge.setShortcut(type, key);
  if (result.success) {
    toast(`✓ Shortcut set: Ctrl+Alt+${key}`, 'var(--cd)');
    renderSettingsDesktop(document.getElementById('settings-body'));
  } else {
    toast(`✗ ${result.error}`, '#fb7185');
  }
}

// ═══════════════════════════════════════════════════════
//  MAL BULK AUTO-LINK MODAL
// ═══════════════════════════════════════════════════════
let _malLinkResults = {}; // { entryId: { malId, title, image, confirmed } }
let _malLinkAbort   = false;

function openMALBulkLinkModal() {
  const unlinked = (typeof DATA !== 'undefined') ? DATA.filter(e => !e.malId) : [];
  if (!unlinked.length) { toast('All entries already linked to MAL', '#4ade80'); return; }

  const modal = document.createElement('div');
  modal.id = 'mal-bulk-link-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9800;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)';
  modal.innerHTML = `
    <div style="background:#111118;border:1px solid #2a2a3a;border-radius:12px;width:100%;max-width:660px;max-height:92vh;display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid #2a2a3a;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-family:'Cinzel',serif;font-size:16px;font-weight:700;color:#00e5ff">🔗 Auto-Link to MAL</div>
          <div style="font-size:12px;color:#8888aa;margin-top:2px">${unlinked.length} unlinked entries — searches MAL by title and proposes matches</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-shrink:0">
          <button id="mal-link-start-btn" onclick="startMALAutoLink()"
            style="background:rgba(0,229,255,.12);color:#00e5ff;border:1px solid rgba(0,229,255,.3);border-radius:6px;padding:7px 16px;font-size:12px;font-weight:700;cursor:pointer">
            ▶ Start Auto-Search
          </button>
          <button onclick="_malLinkAbort=true;document.getElementById('mal-bulk-link-modal').remove()"
            style="width:28px;height:28px;border-radius:50%;background:#18181f;border:1px solid #2a2a3a;color:#8888aa;font-size:14px;cursor:pointer;flex-shrink:0">✕</button>
        </div>
      </div>
      <div style="padding:10px 16px;border-bottom:1px solid #2a2a3a;flex-shrink:0;display:flex;align-items:center;gap:12px">
        <div id="mal-link-progress-wrap" style="flex:1;height:4px;background:#2a2a3a;border-radius:2px;overflow:hidden;display:none">
          <div id="mal-link-progress-bar" style="height:100%;width:0%;background:#00e5ff;transition:width .3s;border-radius:2px"></div>
        </div>
        <div id="mal-link-status" style="font-size:12px;color:#8888aa;flex-shrink:0">
          Click "Start Auto-Search" to begin. ✓ exact · ~ similar · ✗ not found
        </div>
      </div>
      <div id="mal-link-list" style="overflow-y:auto;flex:1;padding:10px 14px;display:flex;flex-direction:column;gap:5px">
        ${unlinked.map(e => `
          <div id="mlr-${e.id}" style="display:flex;align-items:center;gap:10px;background:#18181f;border:1px solid #2a2a3a;border-radius:8px;padding:10px 12px;transition:border-color .2s">
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:#eeedf8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.title)}</div>
              <div style="font-size:10px;color:#8888aa;margin-top:2px">${esc(gbyid(e.genreId).name)} · ${e.status}</div>
            </div>
            <div id="mlr-result-${e.id}" style="font-size:12px;color:#8888aa;flex-shrink:0;text-align:right">—</div>
          </div>`).join('')}
      </div>
      <div style="padding:12px 16px;border-top:1px solid #2a2a3a;display:flex;gap:8px;justify-content:space-between;align-items:center;flex-shrink:0;flex-wrap:wrap">
        <div id="mal-link-summary" style="font-size:12px;color:#8888aa"></div>
        <div style="display:flex;gap:8px">
          <button onclick="_malLinkAbort=true;document.getElementById('mal-bulk-link-modal').remove()"
            style="background:#18181f;color:#8888aa;border:1px solid #2a2a3a;border-radius:6px;padding:7px 16px;font-size:12px;font-weight:600;cursor:pointer">Close</button>
          <button id="mal-link-save-btn" onclick="saveMALBulkLinks()"
            style="background:#00e5ff;color:#000;border:none;border-radius:6px;padding:7px 20px;font-size:12px;font-weight:700;cursor:pointer;display:none">
            💾 Save Matches
          </button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);
  _malLinkResults = {};
  _malLinkAbort   = false;
}

async function startMALAutoLink() {
  const btn = document.getElementById('mal-link-start-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Searching…'; }
  _malLinkAbort   = false;
  _malLinkResults = {};

  const unlinked   = (typeof DATA !== 'undefined') ? DATA.filter(e => !e.malId) : [];
  const progressBar  = document.getElementById('mal-link-progress-bar');
  const progressWrap = document.getElementById('mal-link-progress-wrap');
  const statusEl     = document.getElementById('mal-link-status');
  const summaryEl    = document.getElementById('mal-link-summary');
  if (progressWrap) progressWrap.style.display = 'block';

  let done = 0, matched = 0, notFound = 0;

  for (const entry of unlinked) {
    if (_malLinkAbort) break;
    const rowEl = document.getElementById(`mlr-result-${entry.id}`);
    const rowCard = document.getElementById(`mlr-${entry.id}`);
    if (rowEl) rowEl.innerHTML = '<span style="color:#fb923c;font-size:11px">Searching…</span>';

    try {
      const res  = await fetch(
        `https://aether-codex-ai.nadeempubgmobile2-0.workers.dev/mal/search?q=${encodeURIComponent(entry.title)}`
      );
      const data = await res.json();
      const top  = (data.results || [])[0];

      if (top) {
        const displayTitle = top.title_en || top.title;
        const isExact = displayTitle.toLowerCase() === entry.title.toLowerCase()
                     || top.title.toLowerCase() === entry.title.toLowerCase();
        _malLinkResults[entry.id] = { malId: top.id, title: displayTitle, image: top.image, confirmed: true };
        matched++;
        const col   = isExact ? '#4ade80' : '#fbbf24';
        const label = isExact ? '✓ Exact'  : '~ Similar';
        if (rowCard) rowCard.style.borderColor = isExact ? 'rgba(74,222,128,.3)' : 'rgba(251,191,36,.3)';
        if (rowEl) rowEl.innerHTML = `
          <div>
            <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end;margin-bottom:4px">
              ${top.image ? `<img src="${esc(top.image)}" style="width:24px;height:34px;object-fit:cover;border-radius:2px;flex-shrink:0" onerror="this.style.display='none'">` : ''}
              <div style="text-align:right">
                <div style="font-size:10px;font-weight:700;color:${col}">${label}</div>
                <div style="font-size:11px;color:#eee;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(displayTitle)}">${esc(displayTitle)}</div>
                ${top.title_en && top.title_en !== top.title ? `<div style="font-size:10px;color:#666;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(top.title)}</div>` : ''}
              </div>
            </div>
            <label style="display:flex;align-items:center;gap:4px;justify-content:flex-end;cursor:pointer;font-size:11px;color:#8888aa">
              <input type="checkbox" checked data-entry="${entry.id}" data-malid="${top.id}"
                style="accent-color:#00e5ff;cursor:pointer;width:13px;height:13px" onchange="_malLinkToggle(this)">
              Link this
            </label>
          </div>`;
      } else {
        notFound++;
        if (rowCard) rowCard.style.borderColor = 'rgba(251,113,133,.2)';
        if (rowEl) rowEl.innerHTML = '<span style="color:#fb7185;font-size:11px">✗ Not found</span>';
      }
    } catch (_e) {
      if (rowEl) rowEl.innerHTML = '<span style="color:#fb7185;font-size:11px">Error</span>';
    }

    done++;
    const pct = Math.round(done / unlinked.length * 100);
    if (progressBar) progressBar.style.width = pct + '%';
    if (statusEl) statusEl.textContent = `${done} / ${unlinked.length} searched…`;

    // Respect MAL rate limit (~3 req/s safe)
    await new Promise(r => setTimeout(r, 350));
  }

  if (!_malLinkAbort) {
    if (statusEl) statusEl.textContent = `Done — ${matched} found, ${notFound} not found.`;
    if (summaryEl) summaryEl.textContent = `${matched} matches ready to save (uncheck any you want to skip)`;
    if (btn) { btn.disabled = false; btn.textContent = '↻ Re-Search'; }
    if (matched > 0) {
      const saveBtn = document.getElementById('mal-link-save-btn');
      if (saveBtn) saveBtn.style.display = 'block';
    }
  }
}

function _malLinkToggle(cb) {
  const id = cb.dataset.entry;
  if (_malLinkResults[id]) _malLinkResults[id].confirmed = cb.checked;
}

function saveMALBulkLinks() {
  let saved = 0;
  for (const [entryId, match] of Object.entries(_malLinkResults)) {
    if (!match.confirmed) continue;
    const entry = (typeof DATA !== 'undefined') ? DATA.find(e => e.id === entryId) : null;
    if (!entry) continue;
    entry.malId     = String(match.malId);
    entry.updatedAt = Date.now();
    saved++;
  }
  if (saved > 0) {
    saveData(DATA);
    toast(`✓ Linked ${saved} entries to MAL — now run "Sync Linked" to push to MAL`, '#4ade80');
    document.getElementById('mal-bulk-link-modal')?.remove();
    renderSettingsSecurity(document.getElementById('settings-body'));
  } else {
    toast('No matches selected to save', '#fbbf24');
  }
}

// ── MAL Bulk Sync ──
async function startMALBulkSync() {
  if (!SETTINGS?.malRefreshToken) { toast('MAL not connected', '#fb7185'); return; }
  const entries = (typeof DATA !== 'undefined') ? DATA.filter(e => e.malId) : [];
  if (!entries.length) { toast('No entries linked to MAL', '#fb7185'); return; }

  const progressEl = document.getElementById('mal-bulk-progress');
  if (progressEl) {
    progressEl.style.display = 'block';
    progressEl.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
        <div style="width:14px;height:14px;border:2px solid var(--brd);border-top-color:#00e5ff;border-radius:50%;animation:_spin .6s linear infinite;flex-shrink:0"></div>
        <span style="font-size:12px;color:var(--tx2)">Starting sync of ${entries.length} entries…</span>
      </div>
      <div style="height:4px;background:var(--surf3);border-radius:2px;overflow:hidden">
        <div id="mal-bulk-bar" style="height:100%;width:0%;background:#00e5ff;border-radius:2px;transition:width .4s"></div>
      </div>`;
  }

  // Disable the button while running
  document.querySelectorAll('button[onclick="startMALBulkSync()"]').forEach(b => { b.disabled = true; b.style.opacity = '.5'; });

  const result = await malBulkSyncAll((done, total) => {
    const pct = Math.round(done / total * 100);
    const bar = document.getElementById('mal-bulk-bar');
    if (bar) bar.style.width = pct + '%';
    if (progressEl) {
      const span = progressEl.querySelector('span');
      if (span) span.textContent = `Syncing ${done} of ${total} entries…`;
    }
  });

  document.querySelectorAll('button[onclick="startMALBulkSync()"]').forEach(b => { b.disabled = false; b.style.opacity = '1'; });

  if (progressEl) progressEl.style.display = 'none';

  if (result.error === 'not_connected') {
    toast('MAL not connected', '#fb7185');
    return;
  }

  const { total, success, failed } = result;
  if (failed > 0) {
    toast(`MAL sync done: ${success}/${total} updated, ${failed} failed`, '#fbbf24');
  } else {
    toast(`✓ MAL bulk sync complete: ${success} entries updated`, '#4ade80');
  }

  // Re-render to update the "Last sync" line
  renderSettingsSecurity(document.getElementById('settings-body'));
}

function clearPin() {
  showConfirm('Remove your PIN? 18+ content will no longer be locked.', () => {
    ls.del(PIN_KEY); renderSettingsSecurity(document.getElementById('settings-body'));
    toast('PIN removed');
  }, { title:'Remove PIN?', okLabel:'Remove', danger:false });
}

function saveIdleTimeout() {
  const v = parseInt(document.getElementById('idle-timeout')?.value);
  if (v > 0) { SETTINGS.idleTimeout = v; saveSettings(SETTINGS); toast('✓ Saved'); }
}

// ═══════════════════════════════
//  SEARCH
// ═══════════════════════════════
function onSearch(v){SEARCH=v.toLowerCase();if(CURRENT==='media')renderMediaBody();}

// ═══════════════════════════════
//  EXPORT / IMPORT
// ═══════════════════════════════
function exportData(){
  const payload={version:DATA_VERSION,exported:new Date().toISOString(),data:DATA,genres:GENRES};
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  a.download='AetherCodex_backup_'+new Date().toISOString().slice(0,10)+'.json';
  a.click();URL.revokeObjectURL(a.href);toast('✓ Backup exported');
}

function importFile(){
  const inp=document.createElement('input');inp.type='file';inp.accept='.json';
  inp.onchange=e=>{const file=e.target.files[0];if(!file)return;
    const r=new FileReader();
    r.onload=ev=>{try{
      const p=JSON.parse(ev.target.result);
      if(!p.data||!Array.isArray(p.data))throw new Error('Invalid file');
      showConfirm(`Import ${p.data.length} entries? This will merge with your current data.`,()=>{
        const ids=new Set(DATA.map(x=>x.id));
        const fresh=p.data.filter(x=>!ids.has(x.id));
        DATA=DATA.concat(fresh);saveData(DATA);
        if(p.genres){const gids=new Set(GENRES.map(g=>g.id));p.genres.filter(g=>!gids.has(g.id)).forEach(g=>GENRES.push(g));saveGenres(GENRES);}
        render();toast(`✓ Imported ${fresh.length} new entries`);
      },{title:'Import Data?',okLabel:'Import',danger:false});
    }catch(err){toast('✗ '+err.message);}};
    r.readAsText(file);
  };inp.click();
}

// ═══════════════════════════════
//  TOAST
// ═══════════════════════════════
// ═══ CUSTOM MODALS ═══
function showConfirm(msg, onOk, opts={}) {
  const isDanger = opts.danger !== false;
  const title    = opts.title || (isDanger ? '⚠ Confirm' : 'Confirm');
  const okLabel  = opts.okLabel || (isDanger ? 'Delete' : 'OK');
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">${title}</div>
      <div class="modal-msg">${msg}</div>
      <div class="modal-btns">
        <button class="modal-btn cancel" id="modal-cancel">Cancel</button>
        <button class="modal-btn ${isDanger?'danger':'confirm'}" id="modal-ok">${okLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#modal-cancel').onclick = () => el.remove();
  el.querySelector('#modal-ok').onclick     = () => { el.remove(); onOk(); };
  el.addEventListener('click', e => { if(e.target===el) el.remove(); });
  setTimeout(() => el.querySelector('#modal-ok').focus(), 50);
}

function showAlert(msg, opts={}) {
  const title = opts.title || 'Notice';
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">${title}</div>
      <div class="modal-msg">${msg}</div>
      <div class="modal-btns">
        <button class="modal-btn confirm" id="modal-ok">OK</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#modal-ok').onclick = () => el.remove();
  el.addEventListener('click', e => { if(e.target===el) el.remove(); });
  setTimeout(() => el.querySelector('#modal-ok').focus(), 50);
}

function toast(msg,col){
  const el=document.createElement('div');el.className='toast-el';
  if(col)el.style.borderLeftColor=col;el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>{el.style.opacity='0';setTimeout(()=>el.remove(),300)},2200);
}


// ── Register all functions as globals so inline onclick="" handlers work ──
Object.assign(window, {
  // Settings core
  renderSettings,
  setSettingsTab,
  renderSettingsBody,
  applySettings,
  rebuildSidebar,

  // Sections tab
  renderSettingsSections,
  ssDragStart,
  ssDragOver,
  ssDrop,
  toggleSection,
  saveSectionOrder,

  // Drive tab
  renderSettingsDrive,
  saveBackupDays,

  // Storage tab
  renderSettingsStorage,

  // AI tab
  renderSettingsAI,
  saveAIKeySetting,
  clearAIKey,

  // Appearance
  setFontSize,
  setDensity,

  // Security / MAL tab
  renderSettingsSecurity,
  openMALBulkLinkModal,
  _malLinkToggle,
  saveMALBulkLinks,
  startMALBulkSync,
  disconnectMALAccount,
  clearPin,
  saveIdleTimeout,

  // Desktop tab
  renderSettingsDesktop,

  // Shared utilities (used across sections)
  onSearch,
  exportData,
  importFile,
  showConfirm,
  showAlert,
  toast,
});
