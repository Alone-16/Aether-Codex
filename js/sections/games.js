// ═══════════════════════════════════════════════════════
//  GAMES DATA
// ═══════════════════════════════════════════════════════
const GAMES_KEY = 'ac_v4_games';
const GAMES_VER = '1.0';

function loadGames()  { return ls.get(GAMES_KEY) || []; }
function saveGames(d) { GDATA = d; window.GDATA = d; ls.set(GAMES_KEY, d); ls.setStr(K.SAVED, String(Date.now())); window.scheduleDriveSync('games'); }

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
let GAMES_BG_ANIM = null;

function initGamesBg() {
  const canvas = document.getElementById('games-anim-bg');
  if (!canvas || canvas.dataset.init) return;
  canvas.dataset.init = '1';
  setTimeout(() => { if(canvas) canvas.style.opacity = '0.5'; }, 100);

  const ctx = canvas.getContext('2d');
  let w, h;
  const resize = () => {
    if(!document.getElementById('games-anim-bg')) return;
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
  };
  window.addEventListener('resize', resize);
  resize();

  const particles = [];
  const colors = ['#38bdf8', '#a78bfa', '#fbbf24', '#fb7185', '#4ade80'];
  const shapes = ['cross', 'circle', 'triangle', 'square'];

  for(let i=0; i<35; i++) {
    particles.push({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4,
      size: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: shapes[Math.floor(Math.random() * shapes.length)],
      rot: Math.random() * Math.PI * 2,
      vrot: (Math.random() - 0.5) * 0.02
    });
  }

  let mx = w/2, my = h/2;
  const mm = e => { mx = e.clientX; my = e.clientY; };
  window.addEventListener('mousemove', mm);

  function render() {
    if(!document.getElementById('games-anim-bg')) {
      window.removeEventListener('mousemove', mm);
      window.removeEventListener('resize', resize);
      return;
    }
    ctx.clearRect(0,0,w,h);
    
    // Draw premium mouse glow
    let radgrad = ctx.createRadialGradient(mx, my, 0, mx, my, 400);
    radgrad.addColorStop(0, 'rgba(167, 139, 250, 0.12)');
    radgrad.addColorStop(0.5, 'rgba(56, 189, 248, 0.05)');
    radgrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = radgrad;
    ctx.fillRect(0, 0, w, h);

    const connectDist = 140;

    particles.forEach((p, index) => {
      let dx = mx - p.x; let dy = my - p.y;
      let dist = Math.sqrt(dx*dx + dy*dy);
      
      // Mouse interaction
      if (dist < 220) {
        ctx.beginPath();
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = (1 - dist/220) * 0.5;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(mx, my);
        ctx.stroke();
        // Gentle attraction
        p.x += dx * 0.005; p.y += dy * 0.005;
      }

      // Constellation connections
      for (let j = index + 1; j < particles.length; j++) {
        let p2 = particles[j];
        let pdx = p2.x - p.x;
        let pdy = p2.y - p.y;
        let pdist = Math.sqrt(pdx*pdx + pdy*pdy);
        if (pdist < connectDist) {
          ctx.beginPath();
          // Create gradient line between particles
          let lgrad = ctx.createLinearGradient(p.x, p.y, p2.x, p2.y);
          lgrad.addColorStop(0, p.color);
          lgrad.addColorStop(1, p2.color);
          ctx.strokeStyle = lgrad;
          ctx.globalAlpha = (1 - pdist/connectDist) * 0.25;
          ctx.lineWidth = 1;
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }

      p.x += p.vx; p.y += p.vy; p.rot += p.vrot;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;

      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6 + (Math.sin(Date.now()*0.0015 + p.x)*0.4);
      ctx.beginPath();
      let s = p.size;
      if (p.shape === 'circle') ctx.arc(0,0,s,0,Math.PI*2);
      else if (p.shape === 'square') ctx.rect(-s,-s,s*2,s*2);
      else if (p.shape === 'triangle') { ctx.moveTo(0,-s); ctx.lineTo(s,s); ctx.lineTo(-s,s); ctx.closePath(); }
      else if (p.shape === 'cross') { ctx.moveTo(-s,-s); ctx.lineTo(s,s); ctx.moveTo(s,-s); ctx.lineTo(-s,s); }
      
      ctx.shadowBlur = 12; ctx.shadowColor = p.color;
      ctx.stroke();
      ctx.restore();
    });

    GAMES_BG_ANIM = requestAnimationFrame(render);
  }
  if(GAMES_BG_ANIM) cancelAnimationFrame(GAMES_BG_ANIM);
  render();
}

function renderGames(c) {
  // Only reset lock state if navigating TO games from elsewhere
  // (auto-lock on nav away is handled in nav() already)
  const tabs = ['Library','Dashboard','Upcoming'];
  const tabsHtml = `
    <!-- Premium Gaming UI Aesthetics -->
    <style>
      #games-body {
        position: relative;
        min-height: 400px;
        display: grid;
        grid-template-columns: 100%;
      }
      #games-body .row {
        background: linear-gradient(145deg, rgba(30, 30, 40, 0.45) 0%, rgba(20, 20, 28, 0.55) 100%);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        border: 1px solid rgba(255,255,255,0.05);
        border-top: 1px solid rgba(255,255,255,0.1);
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        box-shadow: 0 6px 20px rgba(0,0,0,0.15);
        border-radius: 12px;
        overflow: hidden;
        margin-bottom: 8px;
        position: relative;
      }
      #games-body .row:hover {
        transform: translateY(-4px) scale(1.01);
        background: linear-gradient(145deg, rgba(40, 40, 55, 0.65) 0%, rgba(25, 25, 35, 0.75) 100%);
        border: 1px solid rgba(255,255,255,0.2);
        box-shadow: 0 15px 35px rgba(0,0,0,0.4), 0 0 20px rgba(var(--ac-rgb), 0.15);
        z-index: 2;
      }
      #games-body .row-bar {
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        opacity: 0.9;
        width: 4px;
      }
      #games-body .row:hover .row-bar {
        width: 8px;
        opacity: 1;
        box-shadow: 0 0 15px currentColor;
      }
      #games-body .row-title {
        font-weight: 700;
        letter-spacing: 0.5px;
        color: #fff;
        text-shadow: 0 2px 4px rgba(0,0,0,0.5);
      }
      #games-body .ss-head {
        background: linear-gradient(90deg, rgba(255,255,255,0.05) 0%, transparent 100%);
        border-left: 3px solid currentColor;
        border-bottom: none;
        padding: 14px 16px;
        margin: 16px 0 12px;
        transition: all 0.3s ease;
        border-radius: 0 8px 8px 0;
        box-shadow: inset 1px 0 0 rgba(255,255,255,0.1);
        cursor: pointer;
      }
      #games-body .ss-head:hover {
        background: linear-gradient(90deg, rgba(255,255,255,0.08) 0%, transparent 100%);
        padding-left: 20px;
      }
      #games-body .ss-lbl {
        text-shadow: 0 0 15px currentColor;
        font-weight: 800;
        letter-spacing: 2px;
      }
      .sub-tabs {
        display: inline-flex;
        gap: 6px;
        background: rgba(20, 20, 28, 0.4);
        backdrop-filter: blur(24px);
        -webkit-backdrop-filter: blur(24px);
        padding: 6px;
        border-radius: 14px;
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 8px 32px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05);
      }
      .sub-tabs .stab {
        transition: all 0.4s cubic-bezier(0.16,1,0.3,1);
        position: relative;
        font-weight: 700;
        font-size: 13px;
        letter-spacing: 0.5px;
        padding: 8px 24px;
        border-radius: 10px;
        background: transparent;
        border: none;
        color: rgba(255,255,255,0.45);
        cursor: pointer;
        z-index: 1;
      }
      .sub-tabs .stab:hover {
        color: rgba(255,255,255,0.9);
        background: rgba(255,255,255,0.05);
      }
      .sub-tabs .stab.active {
        color: #fff;
        text-shadow: 0 2px 4px rgba(0,0,0,0.5);
      }
      .sub-tabs .stab::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 10px;
        background: linear-gradient(135deg, rgba(var(--ac-rgb), 0.4) 0%, rgba(var(--ac-rgb), 0.1) 100%);
        box-shadow: 0 4px 15px rgba(var(--ac-rgb), 0.3), inset 0 1px 1px rgba(255,255,255,0.2);
        border: 1px solid rgba(var(--ac-rgb), 0.5);
        opacity: 0;
        transform: scale(0.9) translateY(5px);
        transition: all 0.4s cubic-bezier(0.16,1,0.3,1);
        z-index: -1;
      }
      .sub-tabs .stab.active::before {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
      .sub-tabs .stab::after {
        content: '';
        position: absolute;
        bottom: 0; left: 50%; width: 0; height: 3px;
        background: var(--ac);
        box-shadow: 0 0 10px var(--ac);
        border-radius: 3px 3px 0 0;
        transform: translateX(-50%);
        opacity: 0;
        transition: all 0.4s cubic-bezier(0.16,1,0.3,1);
      }
      .sub-tabs .stab.active::after {
        width: 24px;
        opacity: 1;
      }
      .dash-grid .dc {
        background: linear-gradient(135deg, rgba(30,30,40,0.5) 0%, rgba(20,20,30,0.6) 100%);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255,255,255,0.08);
        border-top: 1px solid rgba(255,255,255,0.15);
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        border-radius: 16px;
        position: relative;
        overflow: hidden;
      }
      .dash-grid .dc::before {
        content: ''; position: absolute; inset: 0;
        background: radial-gradient(circle at top right, rgba(255,255,255,0.1), transparent 50%);
        pointer-events: none;
      }
      .dash-grid .dc:hover {
        transform: translateY(-6px) scale(1.02);
        box-shadow: 0 15px 35px rgba(0,0,0,0.4), 0 0 20px rgba(var(--ac-rgb), 0.15);
        border-color: rgba(var(--ac-rgb), 0.5);
      }
      .up-card {
        background: linear-gradient(145deg, rgba(30, 30, 40, 0.45) 0%, rgba(20, 20, 28, 0.55) 100%);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255,255,255,0.08);
        border-top: 1px solid rgba(255,255,255,0.15);
        transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        border-radius: 16px;
        margin-bottom: 12px;
      }
      .up-card:hover {
        transform: translateY(-5px) scale(1.01);
        box-shadow: 0 15px 35px rgba(0,0,0,0.4), 0 0 20px rgba(var(--ac-rgb), 0.1);
        border-color: rgba(255,255,255,0.25);
        z-index: 2;
        position: relative;
      }
      .m-chip {
        transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .m-chip:hover {
        transform: translateY(-2px);
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        border-color: rgba(255,255,255,0.3);
      }
      @keyframes gameCardEnter {
        0% { opacity: 0; transform: translateY(20px) scale(0.96); filter: blur(4px); }
        100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
      }
      @keyframes progFillEnter {
        0% { transform: scaleX(0); opacity: 0; }
        100% { transform: scaleX(1); opacity: 1; }
      }
      #games-body .row, .up-card, .dash-grid .dc {
        animation: gameCardEnter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      .prog-fill {
        transform-origin: left;
        animation: progFillEnter 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      }
      #games-body .row {
        display: flex; align-items: center; justify-content: space-between;
        min-height: 52px; padding: 4px 12px 4px 0;
      }
      .action-btn {
        width: 28px; height: 28px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        color: rgba(255,255,255,0.7);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
        font-size: 12px;
        backdrop-filter: blur(8px);
      }
      .action-btn:hover {
        background: rgba(var(--ac-rgb), 0.15);
        border-color: rgba(var(--ac-rgb), 0.4);
        color: #fff;
        transform: translateY(-2px) scale(1.05);
        box-shadow: 0 4px 12px rgba(var(--ac-rgb), 0.25);
      }
      .action-btn.del:hover {
        background: rgba(251,113,133,0.15);
        border-color: rgba(251,113,133,0.4);
        color: #fb7185;
        box-shadow: 0 4px 12px rgba(251,113,133,0.25);
      }
      .dash-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
        gap: 16px;
      }
      .dash-grid .dc {
        padding: 24px 16px;
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;
        text-align: center;
      }
      .dash-grid .dc-v {
        font-size: 28px; font-weight: 800; color: #fff;
        text-shadow: 0 2px 10px rgba(0,0,0,0.4); line-height: 1;
      }
      .dash-grid .dc-l {
        font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.5);
        text-transform: uppercase; letter-spacing: 1px;
      }
      #g-ctx-overlay { position: fixed; inset: 0; z-index: 99998; }
      #g-ctx-menu {
        position: fixed; z-index: 99999; background: rgba(30,30,40,0.95);
        backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px; padding: 6px; min-width: 180px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.6);
        transform-origin: top left; animation: gCtxMenuEnter 0.2s cubic-bezier(0.16,1,0.3,1);
      }
      .g-ctx-header {
        padding: 8px 12px; font-size: 12px; font-weight: 800; color: rgba(255,255,255,0.5);
        border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 4px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .g-ctx-item {
        padding: 10px 12px; font-size: 13px; font-weight: 600; color: #fff;
        border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 10px;
        transition: background 0.2s;
      }
      .g-ctx-item:hover { background: rgba(255,255,255,0.1); }
      .g-ctx-item.danger:hover { background: rgba(251,113,133,0.15); color: #fb7185; }
      .g-ctx-sep { height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0; }
      @keyframes gCtxMenuEnter { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
    </style>
    <canvas id="games-anim-bg" style="position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;opacity:0;transition:opacity 1.5s ease;"></canvas>

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
  setTimeout(initGamesBg, 0);
}

let _G_STATUS_CHIP = null;

function setGamesPage(p) {
  GAMES_PAGE = p; GSEARCH = ''; _G_STATUS_CHIP = null;
  document.getElementById('srch').value = '';
  renderGamesBody();
}

function _gamesListStatusFilter() {
  if (_G_STATUS_CHIP === null || _G_STATUS_CHIP === undefined) {
    return document.getElementById('fstatus')?.value || '';
  }
  return _G_STATUS_CHIP;
}

function _renderGamesFilterChips() {
  const chips = [
    { val:'',          lbl:'All',       col:'rgba(255,255,255,.45)' },
    { val:'playing',   lbl:'Playing',   col:'#38bdf8' },
    { val:'completed', lbl:'Completed', col:'#4ade80' },
    { val:'wishlist',  lbl:'Wishlist',  col:'#a78bfa' },
    { val:'on_hold',   lbl:'On Hold',   col:'#fbbf24' },
    { val:'dropped',   lbl:'Dropped',   col:'#fb7185' },
  ];
  const fstEff = _gamesListStatusFilter();
  return chips.map((c) => {
    const active = c.val === fstEff;
    const onClick = c.val === '' ? `setGamesChip('all')` : `setGamesChip('${c.val}')`;
    return `<button type="button" class="m-chip${active ? ' active' : ''}" style="--chip-c:${c.col}" onclick="${onClick}">
      <span class="m-chip-dot" aria-hidden="true"></span>${c.lbl}
    </button>`;
  }).join('');
}

function setGamesChip(val) {
  const v = val === 'all' ? '' : val;
  _G_STATUS_CHIP = v;
  const fstEl = document.getElementById('fstatus');
  if (fstEl) fstEl.value = v;
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
  const fst = _gamesListStatusFilter();
  if (fst) d = d.filter(g => g.status === fst);
  return { data: d, fst };
}

function renderGamesLibrary(c) {
  const { data, fst } = filteredGames();
  const publicGames = data.filter(g => !g.adult18);
  const adultGames  = data.filter(g => g.adult18);

  let html = `
    <div class="m-filter-row" style="margin-bottom:14px; display:flex; gap:8px; flex-wrap:wrap;">
      <div class="m-filter-chips" style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">${_renderGamesFilterChips()}</div>
    </div>`;

  if (!data.length) {
    html += `<div class="empty"><div class="empty-ico">◈</div><p>No games yet — add your first one!</p></div>`;
    c.innerHTML = html;
    return;
  }

  const byStatus = {};
  GS_ORDER.forEach(s => { 
    byStatus[s] = publicGames.filter(g => g.status === s).sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0)); 
  });
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
        ${rows.map((g, i) => gameRowHtml(g, i)).join('')}
      </div>
    </div>`;
  });

  // 18+ section
  if (adultGames.length) {
    const sortedAdults = adultGames.sort((a,b) => (b.pinned?1:0) - (a.pinned?1:0));
    html += `<div class="ss-section" style="margin-top:16px">
      <div style="display:flex;align-items:center;gap:10px;padding:10px 0 8px;border-top:1px solid var(--brd)">
        <span style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px;color:#fb7185">🔞 Adult Games</span>
        <div style="flex:1;height:1px;background:rgba(251,113,133,.2)"></div>
        ${!GAMES_UNLOCKED ? `<button onclick="unlockGames()" style="background:rgba(251,113,133,.1);color:#fb7185;border:1px solid rgba(251,113,133,.25);border-radius:4px;padding:3px 10px;font-size:11px;font-weight:700;cursor:pointer">🔒 Unlock</button>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;gap:2px;${!GAMES_UNLOCKED?'filter:blur(6px);pointer-events:none;user-select:none':''}">
        ${sortedAdults.map((g, i) => gameRowHtml(g, i)).join('')}
      </div>
    </div>`;
  }

  c.innerHTML = html;
}

function gameRowHtml(g, idx = 0) {
  const isActive = GPANEL && GPEDIT === g.id;
  const col = GS_COLOR[g.status] || 'var(--ac)';
  const platIcon = PLAT_ICON[g.platform] || '🖥';
  const pt = g.series || g.playthroughs || [];
  const activePart = pt.find(p => p.status === 'playing') || pt.find(p=>p.status==='on_hold') || pt[pt.length-1];
  const hours = g.totalHours || 0;

  return `<div class="row${isActive?' active-row':''}${g.pinned?' m-card-pinned':''}" id="grow-${g.id}" style="animation-delay:${idx * 0.04}s" 
    onclick="if(window._G_HOLD_FIRED){window._G_HOLD_FIRED=false;return;}openGameDetail('${g.id}')"
    onmousedown="startGamesHold('${g.id}',event)"
    onmouseup="cancelGamesHold()"
    onmouseleave="cancelGamesHold()"
    ontouchstart="startGamesHold('${g.id}',event)"
    ontouchend="cancelGamesHold()"
    ontouchmove="cancelGamesHold()">
    <div class="row-bar" style="background:${col}; height:100%; position:absolute; left:0; top:0;"></div>
    <div class="row-info" style="flex:1; padding-left:14px; display:flex; flex-direction:column; gap:4px;">
      <div class="row-title" style="display:flex;align-items:center;gap:8px;font-size:14px;">
        <div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;background:rgba(255,255,255,0.05);border-radius:6px;border:1px solid rgba(255,255,255,0.08);box-shadow:inset 0 1px 0 rgba(255,255,255,0.1)">
           <span style="font-size:11px">${platIcon}</span>
        </div>
        <span style="text-shadow:0 2px 4px rgba(0,0,0,0.5); font-weight:700; color:#fff; letter-spacing:0.3px">${g.pinned?'<span style="font-size:10px;margin-right:4px">📌</span>':''}${esc(g.title)}</span>
      </div>
      <div class="row-meta" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
        ${gstag(g.status)}
        ${g.difficulty?`<span style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.05);border-radius:4px;padding:2px 6px;font-size:9px;color:rgba(255,255,255,0.65);display:flex;align-items:center;gap:4px;font-weight:600"><span style="color:var(--ac)">⚔</span> ${esc(g.difficulty)}</span>`:''}
        ${hours?`<span style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.05);border-radius:4px;padding:2px 6px;font-size:9px;color:rgba(255,255,255,0.65);display:flex;align-items:center;gap:4px;font-weight:600">⏱ ${hours}h</span>`:''}
      </div>
    </div>
    <div class="row-r" style="display:flex;align-items:center;gap:20px;padding-right:12px">
      ${g.completionPct?`
      <div class="row-prog" style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;">
        <span class="prog-txt" style="font-size:11px;font-weight:800;color:${col};text-shadow:0 0 10px ${col}44">${g.completionPct}%</span>
        <div class="prog-bar" style="width:70px;height:4px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;box-shadow:inset 0 1px 2px rgba(0,0,0,0.3)">
           <div class="prog-fill" style="width:${g.completionPct}%;background:${col};height:100%;border-radius:2px;box-shadow:0 0 10px ${col}"></div>
        </div>
      </div>`:''}
      <div class="row-btns" style="display:flex;gap:6px;" onclick="event.stopPropagation()">
        ${g.watchUrl&&g.status==='playing'?`<button class="action-btn" onclick="window.open('${g.watchUrl}','_blank')" title="Open">▶</button>`:''}
        <button class="action-btn" onclick="openEditGame('${g.id}')">✏️</button>
        <button class="action-btn del" onclick="askDelGame('${g.id}')">✕</button>
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
  const col = GS_COLOR[g.status] || 'var(--ac)';
  
  const ptHtml = pt.length ? pt.map((p,i) => {
    const pCol = GS_COLOR[p.status] || 'var(--mu)';
    return `
    <div class="g-det-run" style="--run-c: ${pCol}; --run-c-1a: ${pCol}1a;">
      <div class="g-det-run-head">
        <div class="g-det-run-title">${esc(p.name||`Playthrough ${i+1}`)}</div>
        <div class="g-det-run-stat">${GS_LABEL[p.status]||p.status}</div>
      </div>
      <div class="g-det-run-stats">
        ${p.difficulty?`<span><i>⚔</i> ${esc(p.difficulty)}</span>`:''}
        ${p.hours?`<span><i>⏱</i> ${p.hours}h</span>`:''}
        ${p.completionPct?`<span><i>✓</i> ${p.completionPct}%</span>`:''}
        ${p.startDate?`<span><i>📅</i> ${fmtDate(p.startDate)}</span>`:''}
        ${p.endDate?`<span><i>🏁</i> ${fmtDate(p.endDate)}</span>`:''}
      </div>
      ${p.notes?`<div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:8px;font-style:italic;border-top:1px solid rgba(255,255,255,0.05);padding-top:8px">${esc(p.notes)}</div>`:''}
    </div>`
  }).join('') : `<div style="color:rgba(255,255,255,0.4);font-size:13px;padding:0 24px 10px;font-style:italic">No playthrough data found in system.</div>`;

  document.getElementById('panel-inner').innerHTML = `
    <style>
      /* Game Detail Panel - Premium Gamer UI */
      .g-det-container {
        display: flex; flex-direction: column; height: 100%;
        background: #0f0f13;
      }
      .g-det-hero {
        position: relative;
        padding: 40px 24px 30px;
        background: linear-gradient(180deg, ${col}22 0%, #0f0f13 100%);
        border-bottom: 1px solid rgba(255,255,255,0.03);
      }
      .g-det-hero::before {
        content: ''; position: absolute; inset: 0;
        background: radial-gradient(circle at top left, ${col}33 0%, transparent 60%);
        pointer-events: none;
      }
      .g-det-hero::after {
        content: ''; position: absolute; inset: 0;
        background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
        background-size: 20px 20px; opacity: 0.3; pointer-events: none;
      }
      .g-det-hero-content { position: relative; z-index: 2; }
      
      .g-det-title {
        font-family: var(--fd); font-size: 28px; font-weight: 900; color: #fff;
        line-height: 1.1; margin-bottom: 12px; letter-spacing: 0.5px;
        text-shadow: 0 4px 15px rgba(0,0,0,0.6), 0 0 30px ${col}66;
      }
      
      .g-det-badges { display: flex; gap: 8px; flex-wrap: wrap; }
      .g-det-badge {
        background: rgba(0,0,0,0.5); backdrop-filter: blur(8px);
        border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;
        padding: 4px 10px; font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.8);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.1); display: flex; align-items: center; gap: 6px;
      }
      .g-det-badge.status {
        background: ${col}1a; border-color: ${col}55; color: ${col};
        text-shadow: 0 0 10px ${col}66; box-shadow: 0 0 10px ${col}22, inset 0 1px 0 ${col}55;
      }
      
      .g-det-stats-wrap {
        padding: 0 24px; margin-top: -20px; position: relative; z-index: 5;
      }
      .g-det-stats {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
        background: rgba(20,20,28,0.7); backdrop-filter: blur(15px);
        border: 1px solid rgba(255,255,255,0.08); border-top: 1px solid rgba(255,255,255,0.15);
        border-radius: 12px; padding: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.4);
      }
      .g-det-stat {
        text-align: center; padding: 8px 4px; border-radius: 8px;
        transition: background 0.3s;
      }
      .g-det-stat:hover { background: rgba(255,255,255,0.05); }
      .g-det-stat-v {
        font-size: 20px; font-weight: 800; color: #fff; margin-bottom: 2px;
        text-shadow: 0 2px 5px rgba(0,0,0,0.5);
      }
      .g-det-stat-l {
        font-size: 9px; font-weight: 800; color: rgba(255,255,255,0.4);
        text-transform: uppercase; letter-spacing: 1px;
      }

      .g-det-body {
        flex: 1; overflow-y: auto; padding-top: 24px; padding-bottom: 24px;
      }
      .g-det-body::-webkit-scrollbar { width: 6px; }
      .g-det-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

      .g-det-meta {
        display: flex; flex-wrap: wrap; gap: 12px; padding: 0 24px 24px;
      }
      .g-det-meta-item {
        display: flex; align-items: center; gap: 8px; font-size: 12px;
        background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05);
        padding: 6px 12px; border-radius: 6px; color: rgba(255,255,255,0.6);
      }
      .g-det-meta-item i { color: ${col}; font-style: normal; font-size: 14px; }
      .g-det-meta-item b { color: #fff; font-weight: 600; }

      .g-det-section { margin-top: 10px; }
      .g-det-sh {
        display: flex; align-items: center; gap: 16px; padding: 0 24px; margin-bottom: 16px;
      }
      .g-det-sh-lbl {
        font-size: 12px; font-weight: 800; color: #fff; text-transform: uppercase;
        letter-spacing: 2px; text-shadow: 0 0 10px rgba(255,255,255,0.3);
      }
      .g-det-sh-line {
        flex: 1; height: 1px; background: linear-gradient(90deg, ${col}66 0%, transparent 100%);
        box-shadow: 0 0 8px ${col}44;
      }

      .g-det-run {
        margin: 0 24px 12px; background: linear-gradient(90deg, rgba(20,20,28,0.8) 0%, rgba(20,20,28,0.4) 100%);
        border: 1px solid rgba(255,255,255,0.05); border-left: 3px solid var(--run-c);
        border-radius: 8px; padding: 16px; position: relative; overflow: hidden;
        transition: all 0.3s cubic-bezier(0.16,1,0.3,1); box-shadow: 0 4px 15px rgba(0,0,0,0.2);
      }
      .g-det-run::after {
        content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 100px;
        background: linear-gradient(90deg, var(--run-c) 0%, transparent 100%); opacity: 0.05;
        pointer-events: none;
      }
      .g-det-run:hover {
        transform: translateX(4px); background: linear-gradient(90deg, rgba(30,30,40,0.8) 0%, rgba(20,20,28,0.6) 100%);
        border-color: rgba(255,255,255,0.1); box-shadow: 0 8px 25px rgba(0,0,0,0.4);
      }
      .g-det-run-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; position: relative; z-index: 2; }
      .g-det-run-title { font-size: 15px; font-weight: 700; color: #fff; letter-spacing: 0.3px; }
      .g-det-run-stat {
        font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px;
        padding: 4px 8px; border-radius: 4px; background: var(--run-c-1a); color: var(--run-c);
        box-shadow: inset 0 1px 0 var(--run-c-1a);
      }
      .g-det-run-stats { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; color: rgba(255,255,255,0.6); position: relative; z-index: 2; }
      .g-det-run-stats span { display: flex; align-items: center; gap: 6px; background: rgba(0,0,0,0.2); padding: 4px 8px; border-radius: 4px; }
      .g-det-run-stats i { color: #fff; font-style: normal; opacity: 0.8; }

      .g-det-notes {
        margin: 0 24px 24px; padding: 16px; background: rgba(0,0,0,0.3);
        border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;
        font-size: 13px; color: rgba(255,255,255,0.7); line-height: 1.6;
        box-shadow: inset 0 2px 10px rgba(0,0,0,0.5); white-space: pre-wrap;
      }

      .g-det-actions {
        display: flex; gap: 12px; padding: 20px 24px; border-top: 1px solid rgba(255,255,255,0.05);
        background: #0a0a0d;
      }
      .g-det-btn {
        flex: 1; padding: 12px; border-radius: 8px; font-size: 12px; font-weight: 800; cursor: pointer;
        transition: all 0.3s cubic-bezier(0.16,1,0.3,1); text-transform: uppercase; letter-spacing: 1px;
        display: flex; align-items: center; justify-content: center; gap: 8px;
      }
      .g-det-btn.edit { background: ${col}1a; color: ${col}; border: 1px solid ${col}44; }
      .g-det-btn.edit:hover { background: ${col}33; border-color: ${col}88; box-shadow: 0 5px 15px ${col}33; transform: translateY(-2px); }
      .g-det-btn.del { background: rgba(251,113,133,0.1); color: #fb7185; border: 1px solid rgba(251,113,133,0.2); }
      .g-det-btn.del:hover { background: rgba(251,113,133,0.15); border-color: rgba(251,113,133,0.5); box-shadow: 0 5px 15px rgba(251,113,133,0.2); transform: translateY(-2px); }

      .g-det-close {
        position: absolute; top: 16px; right: 16px; width: 32px; height: 32px;
        background: rgba(0,0,0,0.3); backdrop-filter: blur(5px);
        border: 1px solid rgba(255,255,255,0.1); border-radius: 50%;
        color: rgba(255,255,255,0.7); display: flex; align-items: center; justify-content: center;
        cursor: pointer; transition: all 0.3s; z-index: 10; font-size: 14px;
      }
      .g-det-close:hover { background: rgba(255,255,255,0.1); color: #fff; transform: rotate(90deg); border-color: rgba(255,255,255,0.3); }
    </style>

    <div class="g-det-container">
      <div class="g-det-hero">
        <button class="g-det-close" onclick="closePanel()">✕</button>
        <div class="g-det-hero-content">
          <div class="g-det-title">${esc(g.title)}</div>
          <div class="g-det-badges">
            <span class="g-det-badge">${platIcon} ${PLAT_LABEL[g.platform]||''}</span>
            <span class="g-det-badge status">${GS_LABEL[g.status]||g.status}</span>
            ${g.favorite?'<span class="g-det-badge" style="color:#fbbf24;border-color:rgba(251,191,36,0.3)">★ Favorite</span>':''}
            ${g.adult18?'<span class="g-det-badge" style="color:#fb7185;border-color:rgba(251,113,133,0.3)">🔞 Adult</span>':''}
          </div>
        </div>
      </div>

      <div class="g-det-stats-wrap">
        <div class="g-det-stats">
          <div class="g-det-stat"><div class="g-det-stat-v">${g.totalHours||'—'}</div><div class="g-det-stat-l">Hours</div></div>
          <div class="g-det-stat"><div class="g-det-stat-v">${g.completionPct||'—'}${g.completionPct?'%':''}</div><div class="g-det-stat-l">Complete</div></div>
          <div class="g-det-stat"><div class="g-det-stat-v">${(g.playthroughs||[]).length||'—'}</div><div class="g-det-stat-l">Runs</div></div>
          <div class="g-det-stat"><div class="g-det-stat-v">${g.rating||'—'}</div><div class="g-det-stat-l">Rating</div></div>
        </div>
      </div>

      <div class="g-det-body">
        ${(g.difficulty || g.startDate || g.endDate) ? `
        <div class="g-det-meta">
          ${g.difficulty?`<div class="g-det-meta-item"><i>⚔</i> <b>${esc(g.difficulty)}</b> Mode</div>`:''}
          ${g.startDate?`<div class="g-det-meta-item"><i>📅</i> Start: <b>${fmtDate(g.startDate)}</b></div>`:''}
          ${g.endDate?`<div class="g-det-meta-item"><i>🏁</i> End: <b>${fmtDate(g.endDate)}</b></div>`:''}
        </div>` : ''}

        <div class="g-det-section">
          <div class="g-det-sh"><span class="g-det-sh-lbl">Mission Logs</span><div class="g-det-sh-line"></div></div>
          ${ptHtml}
        </div>

        ${g.notes?`
        <div class="g-det-section">
          <div class="g-det-sh"><span class="g-det-sh-lbl">Archive Notes</span><div class="g-det-sh-line"></div></div>
          <div class="g-det-notes">${esc(g.notes)}</div>
        </div>` : ''}

        ${g.saveFileId?`
        <div class="g-det-section" style="padding: 0 24px 24px;">
          <div style="background:rgba(74, 222, 128, 0.1); border: 1px solid rgba(74, 222, 128, 0.2); border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; gap: 12px;">
            <div style="width: 32px; height: 32px; background: rgba(74, 222, 128, 0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #4ade80; font-size: 16px;">✓</div>
            <div>
              <div style="font-size: 10px; font-weight: 800; color: #4ade80; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px;">Cloud Save</div>
              <div style="font-size: 12px; color: rgba(255,255,255,0.7);">Save file successfully synced to Drive archive.</div>
            </div>
          </div>
        </div>` : ''}
      </div>

      <div class="g-det-actions">
        <button class="g-det-btn edit" onclick="openEditGame('${g.id}')"><span>✏️</span> Initialize Edit</button>
        <button class="g-det-btn del" onclick="askDelGame('${g.id}')"><span>✕</span> Purge Record</button>
      </div>
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
    saveFileId:    existing?.saveFileId||null,
    pinned:        existing ? !!existing.pinned : false,
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
    <div class="dash-grid" style="margin-bottom:24px">
      <div class="dc" style="animation-delay:0.04s"><div class="dc-v">${GDATA.length}</div><div class="dc-l">Total</div></div>
      <div class="dc" style="animation-delay:0.08s"><div class="dc-v">${cnt.playing||0}</div><div class="dc-l">Playing</div></div>
      <div class="dc" style="animation-delay:0.12s"><div class="dc-v">${cnt.completed||0}</div><div class="dc-l">Completed</div></div>
      <div class="dc" style="animation-delay:0.16s"><div class="dc-v">${cnt.wishlist||0}</div><div class="dc-l">Wishlist</div></div>
      <div class="dc" style="animation-delay:0.20s"><div class="dc-v">${totalH.toFixed(0)}<span style="font-size:16px;color:rgba(255,255,255,0.4)">h</span></div><div class="dc-l">Played</div></div>
      <div class="dc" style="animation-delay:0.24s"><div class="dc-v">${avgPct}<span style="font-size:16px;color:rgba(255,255,255,0.4)">%</span></div><div class="dc-l">Avg Complete</div></div>
    </div>
    <div style="background:linear-gradient(145deg, rgba(30, 30, 40, 0.45) 0%, rgba(20, 20, 28, 0.55) 100%);backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,0.08);border-top:1px solid rgba(255,255,255,0.15);border-radius:16px;padding:20px;max-width:400px;box-shadow:0 6px 20px rgba(0,0,0,0.15)">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--mu);margin-bottom:16px;display:flex;align-items:center;gap:8px">
        <span style="color:var(--ac)">❯</span> By Platform
      </div>
      ${Object.entries(byPlatform).filter(([,v])=>v>0).map(([k,v])=>`
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)">
          <div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;background:rgba(255,255,255,0.05);border-radius:8px;border:1px solid rgba(255,255,255,0.05)">
            <span style="font-size:16px">${PLAT_ICON[k]}</span>
          </div>
          <span style="flex:1;font-size:14px;font-weight:600;color:rgba(255,255,255,0.8)"><span style="color:#fff">${PLAT_LABEL[k]}</span> Devices</span>
          <span style="font-size:16px;font-weight:800;color:var(--ac);text-shadow:0 0 10px rgba(var(--ac-rgb),0.3)">${v}</span>
        </div>`).join('')}
    </div>`;
}

// ── UPCOMING ──
function renderGamesUpcoming(c) {
  const now = new Date(); now.setHours(0,0,0,0);
  const items = GDATA.filter(g=>g.upcomingDate).map(g=>({...g, date:g.upcomingDate}));
  items.sort((a,b)=>new Date(a.date)-new Date(b.date));
  const rows = items.map((g, i) => {
    const d = new Date(g.date+'T00:00:00');
    const diff = Math.ceil((d-now)/86400000);
    const mon = d.toLocaleString('default',{month:'short'}).toUpperCase();
    let cls='up-far',lbl=`${diff}d`;
    if(diff<=0){cls='up-past';lbl='Released';}
    else if(diff<=3){cls='up-soon';lbl=`${diff}d left`;}
    else if(diff<=14){cls='up-near';lbl=`${diff}d`;}
    return `<div class="up-card" style="animation-delay:${i * 0.04}s" onclick="openGameDetail('${g.id}')">
      <div class="up-date-box"><div class="up-mon">${mon}</div><div class="up-day">${d.getDate()}</div></div>
      <div class="up-info"><div class="up-title">${esc(g.title)}</div><div class="up-sub">${PLAT_LABEL[g.platform]||''}</div></div>
      <div class="up-pill ${cls}">${lbl}</div>
    </div>`;
  }).join('');
  c.innerHTML = `<div style="font-family:var(--fd);font-size:18px;font-weight:700;margin-bottom:16px;letter-spacing:2px;text-transform:uppercase;color:var(--ac)">🗓 Upcoming Games</div>
    ${rows||`<div class="empty"><div class="empty-ico">📅</div><p>No upcoming games</p></div>`}`;
}


// ── Register all games functions + constants as globals ───────────────────

let _G_HOLD_TIMER = null;
let _G_HOLD_FIRED = false;
let _G_CTX_ENTRY_ID = null;

function startGamesHold(id, ev) {
  cancelGamesHold();
  _G_HOLD_FIRED = false; window._G_HOLD_FIRED = false;
  const touch = ev.touches ? ev.touches[0] : ev;
  const cx = touch.clientX, cy = touch.clientY;
  _G_HOLD_TIMER = setTimeout(() => {
    _G_HOLD_TIMER = null;
    _G_HOLD_FIRED = true; window._G_HOLD_FIRED = true;
    showGamesCtxMenu(id, cx, cy);
  }, 500);
}

function cancelGamesHold() {
  if (_G_HOLD_TIMER) { clearTimeout(_G_HOLD_TIMER); _G_HOLD_TIMER = null; }
}

function hideGamesCtxMenu() {
  document.getElementById('g-ctx-overlay')?.remove();
  document.getElementById('g-ctx-menu')?.remove();
  _G_CTX_ENTRY_ID = null;
}

function showGamesCtxMenu(id, x, y) {
  hideGamesCtxMenu();
  _G_CTX_ENTRY_ID = id;
  const g = GDATA.find(d => d.id === id); if (!g) return;

  const ov = document.createElement('div');
  ov.id = 'g-ctx-overlay';
  ov.onclick = hideGamesCtxMenu;
  document.body.appendChild(ov);

  const menu = document.createElement('div');
  menu.id = 'g-ctx-menu';
  const isPinned = !!g.pinned;

  menu.innerHTML = `
    <div class="g-ctx-header">${esc(g.title)}</div>
    <div class="g-ctx-item" onclick="ctxGamesPin('${id}')">
      <span class="ctx-ico" style="font-size:16px">${isPinned ? '📌' : '📍'}</span>
      ${isPinned ? 'Unpin' : 'Pin to Top'}
    </div>
    <div class="g-ctx-item" onclick="hideGamesCtxMenu();openGameDetail('${id}')">
      <span class="ctx-ico" style="font-size:16px">👁</span>View Details
    </div>
    <div class="g-ctx-item" onclick="hideGamesCtxMenu();openEditGame('${id}')">
      <span class="ctx-ico" style="font-size:16px">✏️</span>Edit
    </div>
    <div class="g-ctx-sep"></div>
    <div class="g-ctx-item danger" onclick="hideGamesCtxMenu();askDelGame('${id}')">
      <span class="ctx-ico" style="font-size:16px">✕</span>Delete
    </div>`;

  document.body.appendChild(menu);

  const mw = menu.offsetWidth, mh = menu.offsetHeight;
  let px = x + 10, py = y + 10;
  if (px + mw > window.innerWidth) px = window.innerWidth - mw - 10;
  if (py + mh > window.innerHeight) py = window.innerHeight - mh - 10;
  menu.style.left = px + 'px';
  menu.style.top = py + 'px';
}

function ctxGamesPin(id) {
  hideGamesCtxMenu();
  const g = GDATA.find(d => d.id === id); if (!g) return;
  g.pinned = !g.pinned;
  g.updatedAt = Date.now();
  saveGames(GDATA);
  renderGamesBody();
}

Object.assign(window, {
  // Constants needed by settings.js
  GAMES_KEY,

  // PIN (shared with vault/settings)
  getPin, setPin,

  // Core render
  renderGames, renderGamesBody, setGamesPage, setGamesChip,
  filteredGames, renderGamesLibrary, renderGamesDash, renderGamesUpcoming,
  gameRowHtml, toggleGColl,

  // Lock
  showPinModal, unlockGames, toggleGamesLock, startGamesIdleTimer,

  // Panel
  openGameDetail, renderGameDetailPanel,
  openAddGame, openEditGame, openGameForm, renderGameFormPanel,
  saveGame, saveGames, askDelGame,

  // Form helpers
  gamePartHtml, gamePtInnerHtml,
  addGamePart, removeGamePart, refreshGFtl,
  addGamePtInner, removeGamePtInner,
  collectGameParts,

  // Drive uploads
  uploadSaveFile,
  
  // Context Menu
  startGamesHold, cancelGamesHold, showGamesCtxMenu, hideGamesCtxMenu, ctxGamesPin,
});
