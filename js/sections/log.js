// ═══════════════════════════════════════════════════════
//  ACTIVITY LOG
// ═══════════════════════════════════════════════════════
const LOG_KEY = 'ac_v4_log';
const LOG_MAX_DAYS = 30;

function loadLog()  { return ls.get(LOG_KEY) || []; }
function saveLog(l) { ls.set(LOG_KEY, l); }

let LDATA   = loadLog();
let LFILTER = 'all';
let LSEARCH = '';

function addLog(section, action, title, detail) {
  const now = Date.now();
  // Prune entries older than 30 days first
  const cutoff = now - LOG_MAX_DAYS * 24 * 60 * 60 * 1000;
  LDATA = LDATA.filter(l => l.ts >= cutoff);
  LDATA.unshift({ id: uid(), section, action, title, detail: detail||null, ts: now });
  saveLog(LDATA);
}

const LOG_SECTION_COLOR = {
  media:  '#e879a0', games: '#f59e0b',
  books:  '#a78bfa', music: '#fb923c', vault: '#38bdf8',
};
const LOG_SECTION_ICON = {
  media:'◉', games:'◈', books:'◎', music:'♪', vault:'◈',
};

function fmtLogTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  const days = Math.floor(diff/86400);
  if (days < 7)     return `${days}d ago`;
  return d.toLocaleDateString('en-GB', {day:'numeric', month:'short'});
}

// ── RENDER ──
function renderLog(c) {
  const sections = ['all','media','games','books','music'];
  c.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div class="sub-tabs">
        ${sections.map(s => `<button class="stab${LFILTER===s?' active':''}" onclick="setLogFilter('${s}')">${s==='all'?'All':s.charAt(0).toUpperCase()+s.slice(1)}</button>`).join('')}
      </div>
      <button onclick="clearOldLogs()" style="font-size:11px;color:var(--mu);background:none;border:none;cursor:pointer;padding:4px 8px;border-radius:4px;border:1px solid var(--brd)">Clear Log</button>
    </div>
    <div id="log-body"></div>`;
  renderLogBody();
}

function setLogFilter(f) { LFILTER = f; renderLogBody(); }

function renderLogBody() {
  const el = document.getElementById('log-body'); if (!el) return;
  // Update tab active states
  const tabs = ['all','media','games','books','music'];
  document.querySelectorAll('.stab').forEach((t,i) => {
    if (tabs.includes(t.textContent.toLowerCase())) {
      t.classList.toggle('active', t.textContent.toLowerCase() === LFILTER || 
        (LFILTER==='all' && t.textContent.toLowerCase()==='all'));
    }
  });

  let entries = LDATA;
  if (LFILTER !== 'all') entries = entries.filter(l => l.section === LFILTER);
  if (LSEARCH) entries = entries.filter(l =>
    l.title?.toLowerCase().includes(LSEARCH) || l.action?.toLowerCase().includes(LSEARCH)
  );

  if (!entries.length) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">📋</div><p>No activity yet${LFILTER!=='all'?' in this section':''}</p></div>`;
    return;
  }

  // Group by date
  const groups = {};
  entries.forEach(l => {
    const d = new Date(l.ts);
    const key = d.toLocaleDateString('en-GB', {weekday:'long', day:'numeric', month:'long'});
    if (!groups[key]) groups[key] = [];
    groups[key].push(l);
  });

  el.innerHTML = Object.entries(groups).map(([date, logs]) => `
    <div style="margin-bottom:20px">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--mu);margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--brd)">${date}</div>
      <div style="display:flex;flex-direction:column;gap:4px">
        ${logs.map(l => {
          const col = LOG_SECTION_COLOR[l.section] || 'var(--ac)';
          const ico = LOG_SECTION_ICON[l.section] || '●';
          return `<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;background:var(--surf);border:1px solid var(--brd2);border-radius:7px;border-left:3px solid ${col}">
            <div style="font-size:11px;color:${col};font-weight:700;flex-shrink:0;margin-top:1px">${ico}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;color:var(--tx);line-height:1.4">${esc(l.action)} <b style="color:${col}">${esc(l.title||'')}</b>${l.detail?` <span style="color:var(--mu);font-size:12px">· ${esc(l.detail)}</span>`:''}</div>
            </div>
            <div style="font-size:10px;color:var(--mu);flex-shrink:0;white-space:nowrap;margin-top:2px">${fmtLogTime(l.ts)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function clearOldLogs() {
  showConfirm('Clear all activity log entries?', () => {
    LDATA = []; saveLog(LDATA); renderLogBody();
    toast('Activity log cleared');
  }, {title:'Clear Log?', okLabel:'Clear', danger:false});
}
