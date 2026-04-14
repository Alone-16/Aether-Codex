// ═══════════════════════════════════════════════════════
//  REWATCH MODE
// ═══════════════════════════════════════════════════════
function startRewatch(id) {
  const e = DATA.find(x => x.id === id); if (!e) return;
  showConfirm(`Start a rewatch of "${e.title}"? Your original data will be preserved.`, () => {
    // Open rewatch form
    document.getElementById('rpanel').classList.add('open');
    document.getElementById('poverlay').classList.add('show');
    document.getElementById('content').classList.add('pushed');
    document.getElementById('panel-inner').innerHTML = `
      <div class="ph">
        <div>
          <div class="ph-title">↺ Rewatch</div>
          <div style="font-size:12px;color:var(--tx2);margin-top:2px">${esc(e.title)}</div>
        </div>
        <button class="ph-close" onclick="closePanel()">✕</button>
      </div>
      <div class="form-wrap">
        <div style="background:rgba(var(--ac-rgb),.06);border:1px solid rgba(var(--ac-rgb),.15);border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:var(--tx2)">
          ✓ Original data preserved — this creates a new rewatch session
        </div>
        <div class="fg-row">
          <div class="fg"><label class="flbl">Episodes Watched</label>
            <input class="fin" type="number" id="rw-eps" min="0" placeholder="0"></div>
          <div class="fg"><label class="flbl">Rating (0-10)</label>
            <input class="fin" type="number" id="rw-rating" min="0" max="10" step="0.5" placeholder="—"></div>
        </div>
        <div class="fg-row">
          <div class="fg"><label class="flbl">Start Date</label>
            <input class="fin" type="date" id="rw-start"></div>
          <div class="fg"><label class="flbl">Finish Date</label>
            <input class="fin" type="date" id="rw-end"></div>
        </div>
        <div class="fg"><label class="flbl">Notes</label>
          <textarea class="fin" id="rw-notes" placeholder="Your thoughts on this rewatch..."></textarea>
        </div>
      </div>
      <div class="panel-actions">
        <button class="btn-cancel" onclick="closePanel()">Cancel</button>
        <button class="btn-save" onclick="saveRewatch('${id}')">Save Rewatch</button>
      </div>`;
  }, {title: 'Start Rewatch?', okLabel: 'Start', danger: false});
}

function saveRewatch(id) {
  const e = DATA.find(x => x.id === id); if (!e) return;
  const session = {
    id:        uid(),
    epWatched: document.getElementById('rw-eps')?.value || null,
    rating:    document.getElementById('rw-rating')?.value || null,
    startDate: document.getElementById('rw-start')?.value || null,
    endDate:   document.getElementById('rw-end')?.value || null,
    notes:     document.getElementById('rw-notes')?.value?.trim() || null,
    createdAt: Date.now(),
  };
  if (!e.rewatches) e.rewatches = [];
  e.rewatches.push(session);
  e.rewatchCount = e.rewatches.length;
  e.updatedAt = Date.now();
  saveData(DATA);
  addLog('media', 'Started rewatch of', e.title, `Rewatch #${e.rewatchCount}`);
  closePanel();
  renderMediaBody();
  toast(`↺ Rewatch #${e.rewatchCount} saved for "${e.title}"`);
}

function updateRewatchEp(id, idx, delta) {
  const e = DATA.find(x => x.id === id); if (!e) return;
  const r = e.rewatches?.[idx]; if (!r) return;
  const cur = parseInt(r.epWatched||0);
  const tot = entryStats(e).tot;
  r.epWatched = String(Math.max(0, tot ? Math.min(cur+delta, tot) : cur+delta));
  // Auto-complete when all eps watched
  if (tot && parseInt(r.epWatched) >= tot && !r.endDate) {
    r.endDate = today();
    toast('↺ Rewatch complete! 🎉', 'var(--cd)');
  }
  e.updatedAt = Date.now();
  saveData(DATA);
  const el = document.getElementById(`rw-ep-${id}-${idx}`);
  if (el) el.textContent = r.epWatched;
  // Re-render panel to show finish date
  if (tot && parseInt(r.epWatched) >= tot) renderDetailPanel(e);
}

function openEditRewatch(id, idx) {
  const e = DATA.find(x => x.id === id); if (!e) return;
  const r = e.rewatches?.[idx]; if (!r) return;
  document.getElementById('panel-inner').innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title">Edit Rewatch #${idx+1}</div>
        <div style="font-size:12px;color:var(--tx2);margin-top:2px">${esc(e.title)}</div>
      </div>
      <button class="ph-close" onclick="renderDetailPanel(DATA.find(x=>x.id==='${id}'))">✕</button>
    </div>
    <div class="form-wrap">
      <div class="fg-row">
        <div class="fg"><label class="flbl">Episodes Watched</label>
          <input class="fin" type="number" id="rw-eps" min="0" value="${r.epWatched||''}"></div>
        <div class="fg"><label class="flbl">Rating (0-10)</label>
          <input class="fin" type="number" id="rw-rating" min="0" max="10" step="0.5" value="${r.rating||''}"></div>
      </div>
      <div class="fg-row">
        <div class="fg"><label class="flbl">Start Date</label>
          <input class="fin" type="date" id="rw-start" value="${r.startDate||''}"></div>
        <div class="fg"><label class="flbl">Finish Date</label>
          <input class="fin" type="date" id="rw-end" value="${r.endDate||''}"></div>
      </div>
      <div class="fg"><label class="flbl">Notes</label>
        <textarea class="fin" id="rw-notes">${esc(r.notes||'')}</textarea>
      </div>
    </div>
    <div class="panel-actions">
      <button class="btn-del" onclick="deleteRewatch('${id}',${idx})">Delete</button>
      <button class="btn-cancel" onclick="renderDetailPanel(DATA.find(x=>x.id==='${id}'))">Cancel</button>
      <button class="btn-save" onclick="updateRewatch('${id}',${idx})">Save</button>
    </div>`;
}

function updateRewatch(id, idx) {
  const e = DATA.find(x => x.id === id); if (!e) return;
  const r = e.rewatches?.[idx]; if (!r) return;
  r.epWatched = document.getElementById('rw-eps')?.value || null;
  r.rating    = document.getElementById('rw-rating')?.value || null;
  r.startDate = document.getElementById('rw-start')?.value || null;
  r.endDate   = document.getElementById('rw-end')?.value || null;
  r.notes     = document.getElementById('rw-notes')?.value?.trim() || null;
  e.updatedAt = Date.now();
  saveData(DATA);
  renderDetailPanel(e);
  toast('✓ Rewatch updated');
}

function deleteRewatch(id, idx) {
  const e = DATA.find(x => x.id === id); if (!e) return;
  showConfirm('Delete this rewatch session?', () => {
    e.rewatches.splice(idx, 1);
    e.rewatchCount = e.rewatches.length;
    e.updatedAt = Date.now();
    saveData(DATA);
    renderDetailPanel(e);
    toast('Rewatch deleted');
  }, {title:'Delete Rewatch?', okLabel:'Delete'});
}



// ═══════════════════════════════════════════════════════
//  UNDO DELETE TOAST
// ═══════════════════════════════════════════════════════
let _undoTimer = null;

function toastWithUndo(title, onUndo) {
  // Clear any existing undo toast
  const existing = document.getElementById('undo-toast');
  if (existing) { existing.remove(); clearTimeout(_undoTimer); }

  const el = document.createElement('div');
  el.id = 'undo-toast';
  el.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e1e28;border:1px solid #3a3a4a;border-radius:8px;padding:10px 16px;display:flex;align-items:center;gap:12px;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.5);font-size:13px;color:#eeedf8;white-space:nowrap;animation:slideUp .2s ease';
  el.innerHTML = `
    <span>🗑 Deleted: <b>${esc(title)}</b></span>
    <div style="width:1px;height:16px;background:#3a3a4a"></div>
    <button id="undo-btn" style="background:none;border:none;color:#38bdf8;font-size:13px;font-weight:700;cursor:pointer;padding:0">Undo</button>
    <div id="undo-bar" style="width:60px;height:3px;background:#2a2a3a;border-radius:2px;overflow:hidden">
      <div id="undo-fill" style="height:100%;width:100%;background:#38bdf8;border-radius:2px;transition:width 5s linear"></div>
    </div>`;
  document.body.appendChild(el);

  // Start countdown bar
  setTimeout(() => {
    const fill = document.getElementById('undo-fill');
    if (fill) fill.style.width = '0%';
  }, 50);

  // Undo button
  el.querySelector('#undo-btn').onclick = () => {
    clearTimeout(_undoTimer);
    el.remove();
    onUndo();
    toast('↩ Restored!', 'var(--cd)');
  };

  // Auto-dismiss after 5s
  _undoTimer = setTimeout(() => { el.remove(); }, 5000);
}

if (!document.getElementById('undo-toast-style')) {
  const s = document.createElement('style');
  s.id = 'undo-toast-style';
  s.textContent = '@keyframes slideUp{from{transform:translateX(-50%) translateY(20px);opacity:0}to{transform:translateX(-50%) translateY(0);opacity:1}}';
  document.head.appendChild(s);
}



// ═══════════════════════════════════════════════════════
//  BROWSER NOTIFICATIONS — AIRING SHOWS
// ═══════════════════════════════════════════════════════
const NOTIF_KEY = 'ac_v4_notif_sent'; // stores date of last notification batch

function initNotifications() {
  // Only run once per day
  const today = new Date().toDateString();
  const lastSent = ls.str(NOTIF_KEY);
  if (lastSent === today) return;

  // Check permission
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    sendAiringNotifications();
  } else if (Notification.permission !== 'denied') {
    // Ask permission on first use
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') sendAiringNotifications();
    });
  }
}

function sendAiringNotifications() {
  const todayNum = new Date().getDay();
  const airingToday = DATA.filter(e =>
    e.status === 'watching' && e.airingDay === todayNum
  );

  if (!airingToday.length) return;

  // Store that we sent today
  ls.setStr(NOTIF_KEY, new Date().toDateString());

  airingToday.forEach((e, i) => {
    setTimeout(() => {
      const n = new Notification('📺 Airing Today — The Aether Codex', {
        body: `${e.title}${e.airingTime ? ' at ' + e.airingTime : ''} airs today!`,
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: 'airing-' + e.id,
      });
      n.onclick = () => {
        window.focus();
        nav('media');
        n.close();
      };
    }, i * 500); // stagger notifications 500ms apart
  });
}



// ═══════════════════════════════════════════════════════
//  KEYBOARD SHORTCUTS
// ═══════════════════════════════════════════════════════
const SHORTCUTS = [
  { key:'n',       desc:'New entry in current section' },
  { key:'/',       desc:'Focus search bar' },
  { key:'Escape',  desc:'Close panel / overlay' },
  { key:'f',       desc:'Toggle favourite on open entry' },
  { key:'g h',     desc:'Go to Home' },
  { key:'g m',     desc:'Go to Media' },
  { key:'g g',     desc:'Go to Games' },
  { key:'g b',     desc:'Go to Books' },
  { key:'g u',     desc:'Go to Music' },
  { key:'g v',     desc:'Go to Vault' },
  { key:'g l',     desc:'Go to Log' },
  { key:'g s',     desc:'Go to Settings' },
  { key:'?',       desc:'Show this help' },
];

let _kbSeq = ''; // for two-key sequences like "g h"
let _kbTimer = null;

function globalAdd() {
  const c = window.CURRENT;
  if (c === 'media' && window.openAdd) window.openAdd();
  else if (c === 'games' && window.openAddGame) window.openAddGame();
  else if (c === 'books' && window.openAddBook) window.openAddBook();
  else if (c === 'music' && window.openAddSong) window.openAddSong();
  else if (c === 'vault' && window.openAddLink) window.openAddLink();
  else if (['home', 'tools', 'settings', 'log'].includes(c) && window.toast) {
    window.toast('Navigate to a library section to add an entry', '#8888aa');
  }
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    // Ignore when typing in inputs
    const tag = document.activeElement?.tagName;
    if (['INPUT','TEXTAREA','SELECT'].includes(tag)) {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }

    const key = e.key;

    // Two-key sequence (g + letter)
    if (_kbSeq === 'g') {
      clearTimeout(_kbTimer);
      _kbSeq = '';
      const navMap = { h:'home', m:'media', g:'games', b:'books', u:'music', v:'vault', l:'log', s:'settings' };
      if (navMap[key]) { nav(navMap[key]); return; }
    }

    if (key === 'g') {
      _kbSeq = 'g';
      _kbTimer = setTimeout(() => { _kbSeq = ''; }, 1000);
      return;
    }

    // Single key shortcuts
    switch(key) {
      case '/':
        e.preventDefault();
        document.getElementById('srch')?.focus();
        break;
      case 'Escape':
        // Close panel if open
        if (document.getElementById('rpanel')?.classList.contains('open')) {
          closePanel();
        } else if (document.getElementById('mob-overlay')?.classList.contains('show')) {
          closeMob();
        } else if (document.getElementById('ai-panel')?.style.transform === 'translateY(0px)') {
          toggleAI();
        } else if (document.getElementById('wrapped-modal')) {
          document.getElementById('wrapped-modal').remove();
        }
        break;
      case 'n':
        // New entry for current section
        globalAdd();
        break;
      case 'f':
        // Toggle favourite on open entry
        if (PANEL === 'detail' && PEDIT) {
          const e2 = DATA.find(x => x.id === PEDIT);
          if (e2) {
            e2.favorite = !e2.favorite;
            e2.updatedAt = Date.now();
            saveData(DATA);
            renderDetailPanel(e2);
            renderMediaBody();
            toast(e2.favorite ? '★ Added to favourites' : '☆ Removed from favourites');
          }
        }
        break;
      case '?':
        showKeyboardHelp();
        break;
    }
  });
}

function showKeyboardHelp() {
  const existing = document.getElementById('kb-help-modal');
  if (existing) { existing.remove(); return; }

  const el = document.createElement('div');
  el.id = 'kb-help-modal';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9900;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px)';
  el.innerHTML = `
    <div style="background:#0a0a12;border:1px solid #2a2a3a;border-radius:12px;padding:24px;min-width:320px;max-width:460px;width:100%">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <div style="font-family:var(--fd);font-size:16px;font-weight:700;color:var(--tx)">⌨ Keyboard Shortcuts</div>
        <button onclick="document.getElementById('kb-help-modal').remove()" style="width:26px;height:26px;border-radius:50%;background:#18181f;border:1px solid #2a2a3a;color:#8888aa;cursor:pointer;font-size:14px">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${SHORTCUTS.map(s => `
          <div style="display:flex;align-items:center;gap:12px;padding:6px 0;border-bottom:1px solid #1a1a2e">
            <kbd style="background:#1e1e28;border:1px solid #3a3a4a;border-radius:4px;padding:2px 8px;font-size:11px;font-family:'DM Mono',monospace,sans-serif;color:#eeedf8;white-space:nowrap;min-width:40px;text-align:center">${s.key}</kbd>
            <span style="font-size:12px;color:#8888aa">${s.desc}</span>
          </div>`).join('')}
      </div>
      <div style="margin-top:12px;font-size:11px;color:#44445a;text-align:center">Press <kbd style="background:#1e1e28;border:1px solid #3a3a4a;border-radius:3px;padding:1px 5px;font-size:10px;color:#8888aa">?</kbd> anytime to show this</div>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
}



// ═══ CUSTOM DROPDOWN ═══
function openCDD(id) {
  // Close all others first
  document.querySelectorAll('.cdd-menu.open').forEach(m => {
    if (m.id !== id + '-menu') m.classList.remove('open');
  });
  const menu = document.getElementById(id + '-menu');
  if (menu) menu.classList.toggle('open');
  // Close on outside click
  setTimeout(() => {
    document.addEventListener('click', function closeCDD(e) {
      if (!e.target.closest('.cdd')) {
        document.querySelectorAll('.cdd-menu').forEach(m => m.classList.remove('open'));
        document.removeEventListener('click', closeCDD);
      }
    });
  }, 10);
}

function setCDD(id, value, label) {
  const btn = document.getElementById(id + '-btn');
  if (btn) btn.querySelector('.cdd-label').textContent = label;
  document.querySelectorAll(`#${id}-menu .cdd-item`).forEach(el => {
    el.classList.toggle('selected', el.dataset.val === value);
  });
  document.getElementById(id + '-menu')?.classList.remove('open');
}



function airingMobileList() {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const todayNum = new Date().getDay();
  const watching = DATA.filter(e => e.status==='watching' && e.airingDay != null);
  if (!watching.length) return '<div style="font-size:12px;color:var(--mu);padding:8px 0">No airing shows tracked</div>';
  
  // Sort by proximity to today
  const sorted = watching.map(e => {
    const diff = (e.airingDay - todayNum + 7) % 7;
    return { e, diff };
  }).sort((a,b) => a.diff - b.diff);

  return sorted.map(({e, diff}) => {
    const lbl = diff===0 ? 'Today' : diff===1 ? 'Tomorrow' : days[e.airingDay];
    const col = diff===0 ? '#4ade80' : diff===1 ? '#fbbf24' : 'var(--tx2)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid var(--brd)">
      <div style="width:56px;flex-shrink:0;text-align:right">
        <span style="font-size:11px;font-weight:700;color:${col}">${lbl}</span>
        ${e.airingTime?`<div style="font-size:10px;color:var(--mu)">${e.airingTime}</div>`:''}
      </div>
      <div style="flex:1;min-width:0;font-size:13px;font-weight:500;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.title)}</div>
    </div>`;
  }).join('');
}

// ── Register all extras functions as globals ──────────────────────────────
Object.assign(window, {
  startRewatch, saveRewatch, updateRewatchEp, openEditRewatch,
  updateRewatch, deleteRewatch,
  toastWithUndo,
  initNotifications, sendAiringNotifications,
  initKeyboardShortcuts, showKeyboardHelp, globalAdd,
  openCDD, setCDD,
  airingMobileList,
});
