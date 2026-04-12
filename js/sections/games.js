// ═══════════════════════════════════════════════════════
//  GAMES DATA
// ═══════════════════════════════════════════════════════
const GAMES_KEY = 'ac_v4_games';
const GAMES_VER = '1.0';

function loadGames()  { return ls.get(GAMES_KEY) || []; }
function saveGames(d) { GDATA = d; window.GDATA = d; ls.set(GAMES_KEY, d); ls.setStr(K.SAVED, String(Date.now())); window.scheduleDriveSync(); }

let GDATA       = loadGames();
window.GDATA = GDATA;
let GAMES_PAGE  = 'library';
let GSEARCH     = '';
let GPANEL      = null;
let GPEDIT      = null;
let GFORM_TL    = [];
let GCOLLAPSED  = {};
let GAMES_UNLOCKED = false;
let GAMES_IDLE_TIMER = null;

// PIN storage key
const PIN_KEY = 'ac_vault_pin';
function getPin()     { return ls.str(PIN_KEY) || null; }
function setPin(p)    { ls.setStr(PIN_KEY, p); }
let PIN_FAILS = 0;
let PIN_LOCKOUT_UNTIL = 0;

// ── PLATFORM ICONS ──
const PLAT_ICON = { pc:'🖥', mobile:'📱', both:'🖥📱' };
const PLAT_LABEL = { pc:'PC', mobile:'Mobile', both:'PC + Mobile' };

// ── GAME STATUSES ──
const GS_LABEL = { playing:'▶ Playing', completed:'✓ Completed', wishlist:'◎ Wishlist', on_hold:'⏸ On Hold', dropped:'✗ Dropped' };
const GS_COLOR = { playing:'#38bdf8', completed:'#4ade80', wishlist:'#a78bfa', on_hold:'#fbbf24', dropped:'#fb7185' };
const GS_ORDER = ['playing','wishlist','on_hold','completed','dropped'];
const GS_SECTION = {
  playing:   ['#38bdf8','PLAYING'],
  wishlist:  ['#a78bfa','WISHLIST'],
  on_hold:   ['#fbbf24','ON HOLD'],
  completed: ['#4ade80','COMPLETED'],
  dropped:   ['#fb7185','DROPPED'],
};

function gstag(s) {
  return `<span class="stag" style="background:${GS_COLOR[s]}1a;color:${GS_COLOR[s]}">${GS_LABEL[s]||s}</span>`;
}

// ═══════════════════════════════════════════════════════
//  PIN SYSTEM
// ═══════════════════════════════════════════════════════
function showPinModal(onSuccess, context='unlock') {
  const pin = getPin();
  const isSetup = !pin;

  // If locked out
  if (!isSetup && Date.now() < PIN_LOCKOUT_UNTIL) {
    const secs = Math.ceil((PIN_LOCKOUT_UNTIL - Date.now()) / 1000);
    toast(`Too many attempts. Try again in ${secs}s`, 'var(--err)');
    return;
  }

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9000;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:10px;padding:28px 32px;min-width:300px;text-align:center">
      <div style="font-family:var(--fd);font-size:18px;font-weight:700;color:var(--ac);margin-bottom:6px">
        ${isSetup ? '🔐 Set a PIN' : context==='unlock' ? '🔒 Enter PIN' : '🔐 Set New PIN'}
      </div>
      <div style="font-size:13px;color:var(--tx2);margin-bottom:20px">
        ${isSetup ? 'This PIN protects your 18+ games and private vault links' : context==='unlock' ? 'Enter your PIN to unlock' : 'Enter a new PIN'}
      </div>
      <input id="pin-input" type="password" maxlength="20" placeholder="${isSetup?'Choose a PIN':'Enter PIN'}"
        style="width:100%;background:var(--surf2);border:1px solid var(--brd);border-radius:6px;padding:10px 14px;font-size:16px;color:var(--tx);outline:none;text-align:center;letter-spacing:4px;margin-bottom:8px"
        autofocus>
      ${isSetup ? `<input id="pin-confirm" type="password" maxlength="20" placeholder="Confirm PIN"
        style="width:100%;background:var(--surf2);border:1px solid var(--brd);border-radius:6px;padding:10px 14px;font-size:16px;color:var(--tx);outline:none;text-align:center;letter-spacing:4px;margin-bottom:8px">` : ''}
      <div id="pin-error" style="color:var(--err);font-size:12px;min-height:18px;margin-bottom:8px"></div>
      <div style="display:flex;gap:8px;justify-content:center">
        <button onclick="this.closest('div[style]').remove()" style="background:var(--surf2);color:var(--tx2);border:1px solid var(--brd);border-radius:5px;padding:8px 18px;font-size:13px;cursor:pointer">Cancel</button>
        <button id="pin-submit" style="background:var(--ac);color:#000;border:none;border-radius:5px;padding:8px 20px;font-size:13px;font-weight:700;cursor:pointer">
          ${isSetup ? 'Set PIN' : 'Unlock'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const inp = overlay.querySelector('#pin-input');
  const err = overlay.querySelector('#pin-error');
  inp.focus();

  const submit = () => {
    const val = inp.value.trim();
    if (!val) { err.textContent = 'Please enter a PIN'; return; }

    if (isSetup || context === 'change') {
      const conf = overlay.querySelector('#pin-confirm');
      if (conf && conf.value !== val) { err.textContent = 'PINs do not match'; return; }
      setPin(val); overlay.remove();
      toast('✓ PIN set successfully', 'var(--cd)');
      onSuccess && onSuccess();
    } else {
      if (val === pin) {
        PIN_FAILS = 0; overlay.remove();
        onSuccess && onSuccess();
      } else {
        PIN_FAILS++;
        if (PIN_FAILS >= 3) {
          PIN_LOCKOUT_UNTIL = Date.now() + 30000;
          overlay.remove();
          toast('3 failed attempts — locked for 30 seconds', 'var(--err)');
        } else {
          err.textContent = `Wrong PIN (${3 - PIN_FAILS} attempt${3-PIN_FAILS!==1?'s':''} left)`;
          inp.value = '';
        }
      }
    }
  };

  overlay.querySelector('#pin-submit').onclick = submit;
  inp.addEventListener('keydown', e => { if(e.key==='Enter') submit(); });
}

// ═══════════════════════════════════════════════════════
//  GAMES RENDER
// ═══════════════════════════════════════════════════════
function renderGames(c) {
  // Only reset lock state if navigating TO games from elsewhere
  // (auto-lock on nav away is handled in nav() already)
  const tabs = ['Library','Dashboard','Upcoming'];
  const tabsHtml = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <div class="sub-tabs">
          ${tabs.map((t,i)=>`<button class="stab${GAMES_PAGE===['library','dashboard','upcoming'][i]?' active':''}" onclick="setGamesPage('${['library','dashboard','upcoming'][i]}')">${t}</button>`).join('')}
        </div>
        <button id="games-lock-btn" onclick="toggleGamesLock()" style="display:${GAMES_UNLOCKED?'block':'none'};height:28px;border-radius:5px;background:var(--surf2);border:1px solid var(--brd);color:var(--tx2);font-size:11px;font-weight:600;padding:0 10px;cursor:pointer">🔓 Lock</button>
      </div>
      <div style="display:flex;gap:6px">
        <button class="nb-btn ac" onclick="openAddGame()">+ Add Game</button>
      </div>
    </div>
    <div id="games-body"></div>`;

  c.innerHTML = tabsHtml;
  renderGamesBody();
}

function setGamesPage(p) {
  GAMES_PAGE = p; GSEARCH = '';
  document.getElementById('srch').value = '';
  renderGamesBody();
}

function renderGamesBody() {
  const el = document.getElementById('games-body'); if(!el) return;
  if (GAMES_PAGE === 'library')   renderGamesLibrary(el);
  else if (GAMES_PAGE === 'dashboard') renderGamesDash(el);
  else if (GAMES_PAGE === 'upcoming')  renderGamesUpcoming(el);
  document.querySelectorAll('.stab').forEach((t,i) => {
    t.classList.toggle('active', ['library','dashboard','upcoming'][i] === GAMES_PAGE);
  });
  // Show/hide lock button
  const lb = document.getElementById('games-lock-btn');
  if (lb) lb.style.display = GAMES_UNLOCKED ? 'block' : 'none';
}

// ── LIBRARY ──
function filteredGames() {
  let d = GDATA;
  if (GSEARCH) d = d.filter(g => g.title.toLowerCase().includes(GSEARCH));
  const fst = document.getElementById('fstatus')?.value || '';
  if (fst) d = d.filter(g => g.status === fst);
  return { data: d, fst };
}

function renderGamesLibrary(c) {
  const { data, fst } = filteredGames();
  const publicGames = data.filter(g => !g.adult18);
  const adultGames  = data.filter(g => g.adult18);

  if (!data.length) {
    c.innerHTML = `<div class="empty"><div class="empty-ico">◈</div><p>No games yet — add your first one!</p></div>`;
    return;
  }

  const byStatus = {};
  GS_ORDER.forEach(s => { byStatus[s] = publicGames.filter(g => g.status === s); });

  let html = '';
  GS_ORDER.forEach(s => {
    const rows = byStatus[s]; if(!rows?.length) return;
    const [col, lbl] = GS_SECTION[s];
    const coll = GCOLLAPSED['g_'+s];
    html += `<div class="ss-section">
      <div class="ss-head" onclick="toggleGColl('${s}')">
        <span class="ss-lbl" style="color:${col}">${lbl}</span>
        <span class="ss-cnt">${rows.length}</span>
        <span class="ss-line" style="background:${col}22"></span>
        <span class="ss-arr${coll?' coll':''}">▾</span>
      </div>
      <div class="ss-rows${coll?' coll':''}">
        ${rows.map(g => gameRowHtml(g)).join('')}
      </div>
    </div>`;
  });

  // 18+ section
  if (adultGames.length) {
    html += `<div class="ss-section" style="margin-top:16px">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0 8px;border-top:1px solid var(--brd)">
        <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#fb7185">🔞 Adult Games</span>
        <div style="flex:1;height:1px;background:rgba(251,113,133,.2)"></div>
        ${!GAMES_UNLOCKED ? `<button onclick="unlockGames()" style="background:rgba(251,113,133,.1);color:#fb7185;border:1px solid rgba(251,113,133,.25);border-radius:4px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer">🔒 Unlock</button>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;${!GAMES_UNLOCKED?'filter:blur(6px);pointer-events:none;user-select:none':''}">
        ${adultGames.map(g => gameRowHtml(g)).join('')}
      </div>
    </div>`;
  }

  c.innerHTML = html;
}

function gameRowHtml(g) {
  const isActive = GPANEL && GPEDIT === g.id;
  const col = GS_COLOR[g.status] || 'var(--ac)';
  const platIcon = PLAT_ICON[g.platform] || '🖥';
  const pt = g.series || g.playthroughs || [];
  const activePart = pt.find(p => p.status === 'playing') || pt.find(p=>p.status==='on_hold') || pt[pt.length-1];
  const hours = g.totalHours || 0;

  return `<div class="row${isActive?' active-row':''}" id="grow-${g.id}" onclick="openGameDetail('${g.id}')">
    <div class="row-bar" style="background:${col}"></div>
    <div class="row-info">
      <div class="row-title" style="display:flex;align-items:center;gap:6px">
        <span style="font-size:11px">${platIcon}</span>
        ${esc(g.title)}
      </div>
      <div class="row-meta">
        ${gstag(g.status)}
        ${g.difficulty?`<span style="font-size:10px;color:var(--mu)">⚔ ${esc(g.difficulty)}</span>`:''}
        ${hours?`<span style="font-size:10px;color:var(--mu)">⏱ ${hours}h</span>`:''}
        ${g.completionPct?`<span style="font-size:10px;color:var(--mu)">${g.completionPct}%</span>`:''}
      </div>
    </div>
    <div class="row-r">
      ${g.completionPct?`<div class="row-prog">
        <div class="prog-bar"><div class="prog-fill" style="width:${g.completionPct}%;background:${col}"></div></div>
        <span class="prog-txt">${g.completionPct}%</span>
      </div>`:''}
      <div class="row-btns" onclick="event.stopPropagation()">
        ${g.watchUrl&&g.status==='playing'?`<button class="rbt" onclick="window.open('${g.watchUrl}','_blank')" title="Open" style="color:var(--ac);border-color:rgba(var(--ac-rgb),.3)">▶</button>`:''}
        <button class="rbt" onclick="openEditGame('${g.id}')">✏</button>
        <button class="rbt del" onclick="askDelGame('${g.id}')">✕</button>
      </div>
    </div>
  </div>`;
}

function toggleGColl(s) { GCOLLAPSED['g_'+s] = !GCOLLAPSED['g_'+s]; renderGamesBody(); }

// ── UNLOCK ──
function unlockGames() {
  if (!getPin()) {
    showPinModal(() => { GAMES_UNLOCKED = true; startGamesIdleTimer(); renderGamesBody(); });
  } else {
    showPinModal(() => { GAMES_UNLOCKED = true; startGamesIdleTimer(); renderGamesBody(); }, 'unlock');
  }
}

function toggleGamesLock() {
  GAMES_UNLOCKED = false;
  clearTimeout(GAMES_IDLE_TIMER);
  renderGamesBody();
}

function startGamesIdleTimer() {
  clearTimeout(GAMES_IDLE_TIMER);
  // Auto-lock after 5 minutes idle
  GAMES_IDLE_TIMER = setTimeout(() => {
    GAMES_UNLOCKED = false;
    if (CURRENT === 'games') renderGamesBody();
  }, 5 * 60 * 1000);
}

// ── DETAIL PANEL ──
function openGameDetail(id) {
  GPANEL = 'detail'; GPEDIT = id;
  document.getElementById('rpanel').classList.add('open');
  document.getElementById('poverlay').classList.add('show');
  document.getElementById('content').classList.add('pushed');
  const g = GDATA.find(x => x.id === id); if(g) renderGameDetailPanel(g);
}

function renderGameDetailPanel(g) {
  const pt = g.series || g.playthroughs || [];
  const platIcon = PLAT_ICON[g.platform] || '🖥';
  const ptHtml = pt.length ? pt.map((p,i) => `
    <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:10px 12px;margin-bottom:5px">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px">
        <span style="font-size:13px;font-weight:600">${esc(p.name||`Playthrough ${i+1}`)}</span>
        <span class="stag" style="background:${GS_COLOR[p.status]||'var(--mu)'}1a;color:${GS_COLOR[p.status]||'var(--mu)'};font-size:10px">${GS_LABEL[p.status]||p.status}</span>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--tx2)">
        ${p.difficulty?`<span>⚔ ${esc(p.difficulty)}</span>`:''}
        ${p.hours?`<span>⏱ ${p.hours}h</span>`:''}
        ${p.completionPct?`<span>✓ ${p.completionPct}%</span>`:''}
        ${p.startDate?`<span>📅 ${fmtDate(p.startDate)}</span>`:''}
        ${p.endDate?`<span>🏁 ${fmtDate(p.endDate)}</span>`:''}
      </div>
      ${p.notes?`<div style="font-size:12px;color:var(--mu);margin-top:5px;font-style:italic">${esc(p.notes)}</div>`:''}
    </div>`).join('') : `<div style="color:var(--mu);font-size:13px;padding:8px 0">No playthroughs recorded</div>`;

  document.getElementById('panel-inner').innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title" style="font-family:var(--fd)">${esc(g.title)}</div>
        <div class="pbadges" style="margin-top:5px">
          <span style="font-size:12px">${platIcon} ${PLAT_LABEL[g.platform]||''}</span>
          ${gstag(g.status)}
          ${g.favorite?'<span style="color:#fbbf24">★</span>':''}
          ${g.adult18?'<span style="font-size:11px">🔞</span>':''}
        </div>
      </div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="pstats">
      <div class="pstat"><div class="pstat-v">${g.totalHours||'—'}</div><div class="pstat-l">Hours</div></div>
      <div class="pstat"><div class="pstat-v">${g.completionPct||'—'}${g.completionPct?'%':''}</div><div class="pstat-l">Complete</div></div>
      <div class="pstat"><div class="pstat-v">${(g.playthroughs||[]).length||'—'}</div><div class="pstat-l">Runs</div></div>
      <div class="pstat"><div class="pstat-v">${g.rating||'—'}</div><div class="pstat-l">Rating</div></div>
    </div>
    <div style="padding:10px 16px;border-bottom:1px solid var(--brd);font-size:12px;color:var(--tx2);display:flex;gap:14px;flex-wrap:wrap">
      ${g.difficulty?`<span>⚔ <b style="color:var(--tx)">${esc(g.difficulty)}</b></span>`:''}
      ${g.startDate?`<span>📅 <b style="color:var(--tx)">${fmtDate(g.startDate)}</b></span>`:''}
      ${g.endDate?`<span>🏁 <b style="color:var(--tx)">${fmtDate(g.endDate)}</b></span>`:''}
    </div>
    <div class="sec-div"><span class="sec-div-lbl">Playthroughs</span><div class="sec-div-line"></div></div>
    <div style="padding:0 16px 8px">${ptHtml}</div>
    ${g.notes?`<div class="sec-div"><span class="sec-div-lbl">Notes</span><div class="sec-div-line"></div></div>
    <div class="pnotes"><div class="pnotes-box">${esc(g.notes)}</div></div>`:''}
    ${g.saveFileId?`<div style="padding:8px 16px;border-top:1px solid var(--brd)">
      <div style="font-size:11px;color:var(--mu);margin-bottom:4px">SAVE FILE</div>
      <div style="font-size:13px;color:var(--cd)">✓ Save file uploaded to Drive</div>
    </div>`:''}
    <div class="panel-actions">
      <button class="btn-del" onclick="askDelGame('${g.id}')">Delete</button>
      <button class="btn-cancel" onclick="openEditGame('${g.id}')">Edit</button>
    </div>`;
}

// ── FORM ──
function openAddGame()    { GPANEL='add';  GPEDIT=null; openGameForm(null); }
function openEditGame(id) { GPANEL='edit'; GPEDIT=id;   openGameForm(GDATA.find(x=>x.id===id)); }

function openGameForm(g) {
  document.getElementById('rpanel').classList.add('open');
  document.getElementById('poverlay').classList.add('show');
  document.getElementById('content').classList.add('pushed');
  GFORM_TL = g ? JSON.parse(JSON.stringify(g.series||g.playthroughs||[])) : [];
  if (!g && GFORM_TL.length === 0) {
    GFORM_TL = [{ id: uid(), type:'part', name: 'Part 1', status: 'playing', difficulty: '', hours: '', completionPct: '', rating:'', startDate: '', endDate: '', notes: '', playthroughs:[] }];
  }
  renderGameFormPanel(g);
}

function renderGameFormPanel(g) {
  const isEdit = !!g;
  const status = g ? g.status : 'playing';
  const platform = g ? g.platform : 'pc';

  document.getElementById('panel-inner').innerHTML = `
    <div class="ph">
      <div class="ph-title" style="font-family:var(--fd)">${isEdit?'Edit Game':'Add New Game'}</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="form-wrap">
      <div class="fg">
        <label class="flbl">Title *</label>
        <input class="fin" id="gf-title" placeholder="e.g. Elden Ring" value="${esc(g?g.title:'')}">
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Platform</label>
          <select class="fin" id="gf-platform">
            <option value="pc"     ${platform==='pc'?'selected':''}>🖥 PC</option>
            <option value="mobile" ${platform==='mobile'?'selected':''}>📱 Mobile</option>
            <option value="both"   ${platform==='both'?'selected':''}>🖥📱 Both</option>
          </select>
        </div>
        <div class="fg"><label class="flbl">Status</label>
          <select class="fin" id="gf-status">
            <option value="playing"   ${status==='playing'?'selected':''}>▶ Playing</option>
            <option value="completed" ${status==='completed'?'selected':''}>✓ Completed</option>
            <option value="wishlist"  ${status==='wishlist'?'selected':''}>◎ Wishlist</option>
            <option value="on_hold"   ${status==='on_hold'?'selected':''}>⏸ On Hold</option>
            <option value="dropped"   ${status==='dropped'?'selected':''}>✗ Dropped</option>
          </select>
        </div>
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Total Hours</label>
          <input class="fin" type="number" id="gf-hours" min="0" step="0.5" placeholder="e.g. 120" value="${g&&g.totalHours?g.totalHours:''}">
        </div>
        <div class="fg"><label class="flbl">Completion %</label>
          <input class="fin" type="number" id="gf-pct" min="0" max="100" placeholder="0-100" value="${g&&g.completionPct?g.completionPct:''}">
        </div>
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Start Date</label>
          <input class="fin" type="date" id="gf-start" value="${g&&g.startDate?g.startDate:''}">
        </div>
        <div class="fg"><label class="flbl">Finish Date</label>
          <input class="fin" type="date" id="gf-end" value="${g&&g.endDate?g.endDate:''}">
        </div>
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Rating (0-10)</label>
          <input class="fin" type="number" id="gf-rating" min="0" max="10" step="0.5" placeholder="—" value="${g&&g.rating?g.rating:''}">
        </div>
        <div class="fg"><label class="flbl">Difficulty</label>
          <input class="fin" id="gf-diff" placeholder="e.g. Hard" value="${g&&g.difficulty?g.difficulty:''}">
        </div>
      </div>
      <div class="fg"><label class="flbl">URL (optional)</label>
        <input class="fin" type="url" id="gf-url" placeholder="https://store.steampowered.com/..." value="${g&&g.watchUrl?g.watchUrl:''}">
      </div>
      <div class="fg"><label class="flbl">Notes</label>
        <textarea class="fin" id="gf-notes" placeholder="Your thoughts...">${esc(g?g.notes||'':'')}</textarea>
      </div>
      <div class="fg-row" style="align-items:center;padding-top:4px">
        <div class="fg" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="gf-fav" ${g&&g.favorite?'checked':''} style="width:14px;height:14px;cursor:pointer;accent-color:var(--ac)">
          <label for="gf-fav" class="flbl" style="margin:0;cursor:pointer">★ Favorite</label>
        </div>
        <div class="fg" style="display:flex;align-items:center;gap:8px">
          <input type="checkbox" id="gf-adult" ${g&&g.adult18?'checked':''} style="width:14px;height:14px;cursor:pointer;accent-color:#fb7185">
          <label for="gf-adult" class="flbl" style="margin:0;cursor:pointer;color:#fb7185">🔞 18+</label>
        </div>
      </div>

      <div class="f-sec">Series / Parts</div>
      <div style="font-size:11px;color:var(--mu);margin-bottom:8px">Add each game in the series (e.g. God of War 1, God of War 2). Each part has its own playthroughs.</div>
      <div id="gftl-list">${GFORM_TL.map((p,i) => gamePartHtml(p,i)).join('')}</div>
      <div class="ftl-add-row">
        <button class="ftl-add" onclick="addGamePart()">+ Add Part</button>
      </div>

      <div class="f-sec">Save Folder</div>
      <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:12px">
        ${g&&g.saveFileId
          ? `<div style="font-size:12px;color:var(--cd);margin-bottom:8px">✓ Save folder on Drive</div>`
          : `<div style="font-size:12px;color:var(--mu);margin-bottom:8px">No save folder uploaded</div>`}
        <input type="file" id="gf-save" webkitdirectory mozdirectory multiple style="font-size:12px;color:var(--tx2)">
        <div style="font-size:11px;color:var(--mu);margin-top:4px">Select your save game folder → uploads to Drive</div>
      </div>
    </div>
    <div class="panel-actions">
      ${isEdit?`<button class="btn-del" onclick="askDelGame('${g.id}')">Delete</button>`:''}
      <button class="btn-cancel" onclick="closePanel()">Cancel</button>
      <button class="btn-save" onclick="saveGame('${g?g.id:''}')">Save</button>
    </div>`;
}

function gamePartHtml(p, i) {
  const pts = p.playthroughs||[];
  return `<div class="ftl-item" data-idx="${i}" data-pid="${p.id||''}">
    <button class="ftl-rm" onclick="removeGamePart(${i})">✕</button>
    <div class="ftl-head">
      <span class="ftl-drag">⠿</span>
      <span class="tl-type-pill tp-s">Part ${i+1}</span>
    </div>
    <div class="fg-row" style="margin-bottom:7px">
      <div class="fg"><label class="flbl">Part Name</label>
        <input class="fin" data-fi="name" value="${esc(p.name||'')}" placeholder="e.g. God of War 1"></div>
      <div class="fg"><label class="flbl">Status</label>
        <select class="fin" data-fi="status">
          <option value="playing"   ${p.status==='playing'?'selected':''}>▶ Playing</option>
          <option value="completed" ${p.status==='completed'?'selected':''}>✓ Completed</option>
          <option value="wishlist"  ${p.status==='wishlist'?'selected':''}>◎ Wishlist</option>
          <option value="on_hold"   ${p.status==='on_hold'?'selected':''}>⏸ On Hold</option>
          <option value="dropped"   ${p.status==='dropped'?'selected':''}>✗ Dropped</option>
        </select>
      </div>
    </div>
    <div class="fg-row" style="margin-bottom:7px">
      <div class="fg"><label class="flbl">Hours</label>
        <input class="fin" type="number" data-fi="hours" value="${p.hours||''}" placeholder="0" min="0" step="0.5"></div>
      <div class="fg"><label class="flbl">Completion %</label>
        <input class="fin" type="number" data-fi="completionPct" value="${p.completionPct||''}" placeholder="0" min="0" max="100"></div>
    </div>
    <div class="fg-row" style="margin-bottom:7px">
      <div class="fg"><label class="flbl">Difficulty</label>
        <input class="fin" data-fi="difficulty" value="${esc(p.difficulty||'')}" placeholder="e.g. Hard"></div>
      <div class="fg"><label class="flbl">Rating</label>
        <input class="fin" type="number" data-fi="rating" value="${p.rating||''}" placeholder="—" min="0" max="10" step="0.5"></div>
    </div>
    <div class="fg-row" style="margin-bottom:7px">
      <div class="fg"><label class="flbl">Start Date</label>
        <input class="fin" type="date" data-fi="startDate" value="${p.startDate||''}"></div>
      <div class="fg"><label class="flbl">End Date</label>
        <input class="fin" type="date" data-fi="endDate" value="${p.endDate||''}"></div>
    </div>
    <div class="fg"><label class="flbl">Notes</label>
      <textarea class="fin" data-fi="notes" style="min-height:40px" placeholder="Notes for this part...">${esc(p.notes||'')}</textarea>
    </div>
    <div style="margin-top:8px;padding:8px;background:var(--surf3);border-radius:5px">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--mu);margin-bottom:6px">Playthroughs</div>
      <div id="gpt-list-${i}">${pts.map((pt,j) => gamePtInnerHtml(pt,i,j)).join('')}</div>
      <button onclick="addGamePtInner(${i})" style="font-size:11px;color:var(--ac);background:none;border:none;cursor:pointer;padding:4px 0">+ Add Playthrough</button>
    </div>
  </div>`;
}

function gamePtInnerHtml(pt, partIdx, ptIdx) {
  return `<div class="ftl-item" style="margin-bottom:6px;padding:8px" data-part="${partIdx}" data-ptidx="${ptIdx}" data-ptid="${pt.id||''}">
    <button class="ftl-rm" onclick="removeGamePtInner(${partIdx},${ptIdx})" style="top:4px;right:4px">✕</button>
    <div style="font-size:10px;font-weight:700;color:var(--mu);margin-bottom:5px">RUN ${ptIdx+1}</div>
    <div class="fg-row" style="margin-bottom:5px">
      <div class="fg"><label class="flbl">Name</label>
        <input class="fin" data-ptfi="name" value="${esc(pt.name||'')}" placeholder="e.g. New Game+"></div>
      <div class="fg"><label class="flbl">Status</label>
        <select class="fin" data-ptfi="status">
          <option value="playing"   ${pt.status==='playing'?'selected':''}>▶ Playing</option>
          <option value="completed" ${pt.status==='completed'?'selected':''}>✓ Done</option>
          <option value="dropped"   ${pt.status==='dropped'?'selected':''}>✗ Dropped</option>
        </select>
      </div>
    </div>
    <div class="fg-row">
      <div class="fg"><label class="flbl">Difficulty</label>
        <input class="fin" data-ptfi="difficulty" value="${esc(pt.difficulty||'')}" placeholder="Hard"></div>
      <div class="fg"><label class="flbl">Hours</label>
        <input class="fin" type="number" data-ptfi="hours" value="${pt.hours||''}" placeholder="0" min="0" step="0.5"></div>
    </div>
  </div>`;
}

function addGamePart() {
  const cur = collectGameParts();
  cur.push({ id:uid(), type:'part', name:`Part ${cur.length+1}`, status:'wishlist', hours:'', completionPct:'', difficulty:'', rating:'', startDate:'', endDate:'', notes:'', playthroughs:[] });
  GFORM_TL = cur; refreshGFtl();
}

function removeGamePart(i) { const c = collectGameParts(); c.splice(i,1); GFORM_TL=c; refreshGFtl(); }
function refreshGFtl() { document.getElementById('gftl-list').innerHTML = GFORM_TL.map((p,i) => gamePartHtml(p,i)).join(''); }

function addGamePtInner(partIdx) {
  const parts = collectGameParts();
  if (!parts[partIdx].playthroughs) parts[partIdx].playthroughs = [];
  parts[partIdx].playthroughs.push({ id:uid(), name:'New Playthrough', status:'playing', difficulty:'', hours:'' });
  GFORM_TL = parts; refreshGFtl();
}

function removeGamePtInner(partIdx, ptIdx) {
  const parts = collectGameParts();
  parts[partIdx].playthroughs.splice(ptIdx, 1);
  GFORM_TL = parts; refreshGFtl();
}

function collectGamePtInner(partEl, partIdx) {
  const pts = [];
  partEl.querySelectorAll(`[data-part="${partIdx}"]`).forEach((el, j) => {
    const get = fi => { const x=el.querySelector(`[data-ptfi="${fi}"]`); return x?x.value:''; };
    pts.push({ id: el.dataset.ptid||uid(), name:get('name')||`Run ${j+1}`, status:get('status')||'playing', difficulty:get('difficulty')||null, hours:get('hours')||null });
  });
  return pts;
}

function collectGameParts() {
  const items = [];
  document.querySelectorAll('#gftl-list > .ftl-item').forEach((el, i) => {
    const get = fi => { const x=el.querySelector(`[data-fi="${fi}"]`); return x?x.value:''; };
    items.push({ id: el.dataset.pid||uid(), type:'part', name:get('name'), status:get('status')||'wishlist',
      hours:get('hours')||null, completionPct:get('completionPct')||null,
      difficulty:get('difficulty')||null, rating:get('rating')||null,
      startDate:get('startDate')||null, endDate:get('endDate')||null, notes:get('notes')||null,
      playthroughs: collectGamePtInner(el, i) });
  });
  return items;
}

async function saveGame(eid) {
  const title = document.getElementById('gf-title').value.trim();
  if (!title) { showAlert('Please enter a game title',{title:'Missing Title'}); return; }
  const existing = eid ? GDATA.find(x=>x.id===eid) : null;
  const pts = collectGameParts();

  // Calculate totals from playthroughs
  const totalHours = pts.reduce((a,p) => a + (parseFloat(p.hours)||0), 0) || (parseFloat(document.getElementById('gf-hours')?.value)||null);
  const pct = parseInt(document.getElementById('gf-pct')?.value) || null;

  const entry = {
    id: eid||uid(), title,
    platform:      document.getElementById('gf-platform')?.value||'pc',
    status:        document.getElementById('gf-status')?.value||'playing',
    totalHours:    totalHours||null,
    completionPct: pct,
    difficulty:    document.getElementById('gf-diff')?.value?.trim()||null,
    rating:        document.getElementById('gf-rating')?.value||null,
    startDate:     document.getElementById('gf-start')?.value||null,
    endDate:       document.getElementById('gf-end')?.value||null,
    watchUrl:      document.getElementById('gf-url')?.value?.trim()||null,
    notes:         document.getElementById('gf-notes')?.value?.trim()||null,
    favorite:      document.getElementById('gf-fav')?.checked||false,
    adult18:       document.getElementById('gf-adult')?.checked||false,
    series:        pts,
    saveFileId:    existing?.saveFileId||null,
    addedAt:       existing ? existing.addedAt : Date.now(),
    updatedAt:     Date.now(),
  };

  // Handle save file upload
  const saveFileInp = document.getElementById('gf-save');
  if (saveFileInp?.files?.length && _isConnected()) {
    const files = Array.from(saveFileInp.files);
    const total = files.length;
    let done = 0, lastId = null;

    // Show progress in panel
    const statusEl = document.createElement('div');
    statusEl.id = 'upload-status';
    statusEl.style.cssText = 'padding:10px 16px;background:rgba(var(--ac-rgb),.06);border-top:1px solid var(--brd);font-size:12px;color:var(--tx2)';
    statusEl.innerHTML = `⬆ Uploading 0 / ${total} files...`;
    document.getElementById('panel-inner')?.appendChild(statusEl);

    for (const file of files) {
      lastId = await uploadSaveFile(entry.title, file);
      done++;
      const pct = Math.round(done/total*100);
      if (statusEl) statusEl.innerHTML = `
        <div style="margin-bottom:5px">⬆ Uploading ${done} / ${total} files... ${pct}%</div>
        <div style="height:4px;background:var(--surf3);border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:var(--ac);border-radius:2px;transition:width .2s"></div>
        </div>`;
    }

    if (lastId) {
      entry.saveFileId = lastId;
      if (statusEl) statusEl.innerHTML = `<span style="color:#4ade80">✓ ${total} file${total!==1?'s':''} uploaded to Drive</span>`;
      setTimeout(() => statusEl?.remove(), 2000);
    } else {
      if (statusEl) statusEl.innerHTML = `<span style="color:#fb7185">✗ Upload failed — check Drive connection</span>`;
      toast('Save folder upload failed', 'var(--err)');
    }
  }

  if (eid) { const i=GDATA.findIndex(x=>x.id===eid); GDATA[i]=entry; }
  else GDATA.unshift(entry);

  addLog('games', eid?'Updated':'Added', entry.title, entry.status);
  saveGames(GDATA);
  GPANEL=null; GPEDIT=null;
  document.getElementById('rpanel').classList.remove('open');
  document.getElementById('poverlay').classList.remove('show');
  document.getElementById('content').classList.remove('pushed');
  renderGamesBody();
  toast('✓ Game saved');
}

function askDelGame(id) {
  showConfirm('This game will be permanently deleted.',()=>{
  const _gdel=GDATA.find(x=>x.id===id);
  GDATA = GDATA.filter(x=>x.id!==id);
  if(_gdel) addLog('games','Deleted',_gdel.title);
  saveGames(GDATA);
  GPANEL=null; GPEDIT=null;
  document.getElementById('rpanel').classList.remove('open');
  document.getElementById('poverlay').classList.remove('show');
  document.getElementById('content').classList.remove('pushed');
  renderGamesBody();
  if(_gdel) toastWithUndo(_gdel.title,()=>{GDATA.push(_gdel);saveGames(GDATA);renderGamesBody();});
},{title:'Delete Game?',okLabel:'Delete'});
}

// ── SAVE FOLDER UPLOAD ──
const _driveFolderCache = {}; // cache folder id by path

async function _getOrCreateDriveFolder(name, parentId) {
  const cacheKey = `${parentId}/${name}`;
  if (_driveFolderCache[cacheKey]) return _driveFolderCache[cacheKey];
  // Check if exists
  const r = await _req(`https://www.googleapis.com/drive/v3/files?q=name='${encodeURIComponent(name)}'+and+'${parentId}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id)`);
  if (r) {
    const d = await r.json();
    if (d.files?.length) { _driveFolderCache[cacheKey] = d.files[0].id; return d.files[0].id; }
  }
  // Create
  const cr = await _req('https://www.googleapis.com/drive/v3/files', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({name, mimeType:'application/vnd.google-apps.folder', parents:[parentId]})
  });
  if (!cr) return null;
  const cf = await cr.json();
  _driveFolderCache[cacheKey] = cf.id;
  return cf.id;
}

async function uploadSaveFile(gameTitle, file) {
  try {
    const rootId = await _getOrCreateFolder(); if (!rootId) return null;
    // game-saves folder
    const savesId = await _getOrCreateDriveFolder('game-saves', rootId); if (!savesId) return null;

    // Use webkitRelativePath to preserve folder structure
    // e.g. "MySaveFolder/slot1/save.dat" → create each folder level
    const relPath = file.webkitRelativePath || file.name;
    const parts = relPath.split('/');
    const fileName = parts.pop(); // last part is the file name

    // Navigate/create folder hierarchy under game-saves
    let currentParent = savesId;
    for (const folderName of parts) {
      currentParent = await _getOrCreateDriveFolder(folderName, currentParent);
      if (!currentParent) return null;
    }

    // Upload file into the correct folder
    const formData = new FormData();
    formData.append('metadata', new Blob([JSON.stringify({name: fileName, parents:[currentParent]})], {type:'application/json'}));
    formData.append('file', file);
    const token = _getToken();
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method:'POST', headers:{Authorization:`Bearer ${token}`}, body:formData
    });
    if (!res.ok) return null;
    return (await res.json()).id;
  } catch { return null; }
}

// ── DASHBOARD ──
function renderGamesDash(c) {
  const cnt = {};
  GS_ORDER.forEach(s => cnt[s] = GDATA.filter(g=>g.status===s).length);
  const totalH = GDATA.reduce((a,g)=>a+(parseFloat(g.totalHours)||0),0);
  const completed = GDATA.filter(g=>g.status==='completed');
  const avgPct = completed.length ? Math.round(completed.reduce((a,g)=>a+(g.completionPct||0),0)/completed.length) : 0;

  const byPlatform = {
    pc:     GDATA.filter(g=>g.platform==='pc').length,
    mobile: GDATA.filter(g=>g.platform==='mobile').length,
    both:   GDATA.filter(g=>g.platform==='both').length,
  };

  c.innerHTML = `
    <div style="font-family:var(--fd);font-size:18px;font-weight:700;margin-bottom:16px;letter-spacing:2px;text-transform:uppercase;color:var(--ac)">◈ Game Dashboard</div>
    <div class="dash-grid" style="margin-bottom:20px">
      <div class="dc"><div class="dc-v">${GDATA.length}</div><div class="dc-l">Total</div></div>
      <div class="dc"><div class="dc-v">${cnt.playing||0}</div><div class="dc-l">Playing</div></div>
      <div class="dc"><div class="dc-v">${cnt.completed||0}</div><div class="dc-l">Completed</div></div>
      <div class="dc"><div class="dc-v">${cnt.wishlist||0}</div><div class="dc-l">Wishlist</div></div>
      <div class="dc"><div class="dc-v">${totalH.toFixed(0)}h</div><div class="dc-l">Hours Played</div></div>
      <div class="dc"><div class="dc-v">${avgPct}%</div><div class="dc-l">Avg Complete</div></div>
    </div>
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);padding:16px;max-width:400px">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--mu);margin-bottom:12px">By Platform</div>
      ${Object.entries(byPlatform).filter(([,v])=>v>0).map(([k,v])=>`
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--brd)">
          <span style="font-size:16px">${PLAT_ICON[k]}</span>
          <span style="flex:1;font-size:13px">${PLAT_LABEL[k]}</span>
          <span style="font-size:14px;font-weight:700;color:var(--ac)">${v}</span>
        </div>`).join('')}
    </div>`;
}

// ── UPCOMING ──
function renderGamesUpcoming(c) {
  const now = new Date(); now.setHours(0,0,0,0);
  const items = GDATA.filter(g=>g.upcomingDate).map(g=>({...g, date:g.upcomingDate}));
  items.sort((a,b)=>new Date(a.date)-new Date(b.date));
  const rows = items.map(g => {
    const d = new Date(g.date+'T00:00:00');
    const diff = Math.ceil((d-now)/86400000);
    const mon = d.toLocaleString('default',{month:'short'}).toUpperCase();
    let cls='up-far',lbl=`${diff}d`;
    if(diff<=0){cls='up-past';lbl='Released';}
    else if(diff<=3){cls='up-soon';lbl=`${diff}d left`;}
    else if(diff<=14){cls='up-near';lbl=`${diff}d`;}
    return `<div class="up-card" onclick="openGameDetail('${g.id}')">
      <div class="up-date-box"><div class="up-mon">${mon}</div><div class="up-day">${d.getDate()}</div></div>
      <div class="up-info"><div class="up-title">${esc(g.title)}</div><div class="up-sub">${PLAT_LABEL[g.platform]||''}</div></div>
      <div class="up-pill ${cls}">${lbl}</div>
    </div>`;
  }).join('');
  c.innerHTML = `<div style="font-family:var(--fd);font-size:18px;font-weight:700;margin-bottom:16px;letter-spacing:2px;text-transform:uppercase;color:var(--ac)">🗓 Upcoming Games</div>
    ${rows||`<div class="empty"><div class="empty-ico">📅</div><p>No upcoming games</p></div>`}`;
}


// ── Register all games functions + constants as globals ───────────────────
Object.assign(window, {
  // Constants needed by settings.js
  GAMES_KEY,

  // PIN (shared with vault/settings)
  getPin, setPin,

  // Core render
  renderGames, renderGamesBody, setGamesPage,
  filteredGames, renderGamesLibrary, renderGamesDash, renderGamesUpcoming,
  gameRowHtml, toggleGColl,

  // Lock
  showPinModal, unlockGames, toggleGamesLock, startGamesIdleTimer,

  // Panel
  openGameDetail, renderGameDetailPanel,
  openAddGame, openEditGame, openGameForm, renderGameFormPanel,
  saveGame, askDelGame,

  // Form helpers
  gamePartHtml, gamePtInnerHtml,
  addGamePart, removeGamePart, refreshGFtl,
  addGamePtInner, removeGamePtInner,
  collectGameParts,

  // Drive uploads
  uploadSaveFile,
});
