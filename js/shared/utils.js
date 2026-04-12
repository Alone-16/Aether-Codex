'use strict';
// ═══════════════════════════════
//  STORAGE
// ═══════════════════════════════
export const K = {
  DATA:'ac_v4_media', GENRES:'ac_v4_genres', THEME:'ac_v4_theme',
  GENRE:'ac_v4_genre', VER:'ac_v4_ver', SAVED:'ac_v4_saved',
  DTOKEN:'ac_v4_dtoken', DEXP:'ac_v4_dexp', DFILE:'ac_v4_dfile', DSYNC:'ac_v4_dsync'
};
export const DATA_VERSION  = '4.0';
export const CLIENT_ID     = '750528266098-oudtbb5dcmf4c167sf7l3fu46luqeq11.apps.googleusercontent.com';
export const DRIVE_SCOPE   = 'https://www.googleapis.com/auth/drive.file';
export const YT_SCOPE_CONST= 'https://www.googleapis.com/auth/youtube.readonly';
export const DRIVE_FOLDER  = 'Aether Codex';
export const DRIVE_FILE    = 'AetherCodex_data.json';

export const ls = {
  get    : k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set    : (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  str    : k => localStorage.getItem(k),
  setStr : (k, v) => localStorage.setItem(k, v),
  del    : k => localStorage.removeItem(k),
};

export function DEFAULT_GENRES() {
  return [
    { id:'anime',     name:'Anime',      color:'#e879a0' },
    { id:'kdrama',    name:'K-Drama',    color:'#60a5fa' },
    { id:'cdrama',    name:'C-Drama',    color:'#fb923c' },
    { id:'tvshow',    name:'TV Show',    color:'#34d399' },
    { id:'jdrama',    name:'J-Drama',    color:'#a78bfa' },
    { id:'thaidrama', name:'Thai Drama', color:'#22d3ee' },
    { id:'webseries', name:'Web Series', color:'#818cf8' },
    { id:'cartoon',   name:'Cartoon',    color:'#fbbf24' },
    { id:'manhwa',    name:'Manhwa',     color:'#f97316' },
    { id:'hmanhwa',   name:'HManhwa',    color:'#a3e635' },
  ];
}

export function loadData()   { return ls.get(K.DATA)   || []; }
export function loadGenres() { return ls.get(K.GENRES) || DEFAULT_GENRES(); }

// ═══════════════════════════════
//  MUTABLE STATE
//  Exported as `let` so all importers get live ESM bindings.
//  External modules that need to *reassign* (not just mutate) these
//  must call the matching setter so the live binding updates everywhere.
// ═══════════════════════════════
export let DATA       = loadData();
export let GENRES     = loadGenres();
export let GACTIVE    = ls.str(K.GENRE) || 'anime';
export let CURRENT    = 'home';
export let MEDIA_PAGE = 'list';
export let SEARCH     = '';
export let PANEL      = null;
export let PEDIT      = null;
export let FORM_TL    = [];
export let COLLAPSED  = {};
export let DDRG       = null;
export let FDRG       = null;

// ── Setters for reassignable state ───────────────────────────────────────────
export function setDATA(d)         { DATA       = d; window.DATA       = d; }
export function setGENRES(g)       { GENRES     = g; window.GENRES     = g; }
export function setGACTIVE(id)     { GACTIVE    = id; window.GACTIVE    = id; }
export function setCURRENT(id)     { CURRENT    = id; window.CURRENT    = id; }
export function setMEDIA_PAGE(p)   { MEDIA_PAGE = p; window.MEDIA_PAGE = p; }
export function setSEARCH(s)       { SEARCH     = s; window.SEARCH     = s; }
export function setPANEL(v)        { PANEL      = v; window.PANEL      = v; }
export function setPEDIT(v)        { PEDIT      = v; window.PEDIT      = v; }
export function setFORM_TL(v)      { FORM_TL    = v; window.FORM_TL    = v; }
export function setCOLLAPSED(v)    { COLLAPSED  = v; window.COLLAPSED  = v; }
export function setDDRG(v)         { DDRG       = v; window.DDRG       = v; }
export function setFDRG(v)         { FDRG       = v; window.FDRG       = v; }

// ── Persist helpers ───────────────────────────────────────────────────────────
export function saveData(d) {
  ls.set(K.DATA, d);
  ls.setStr(K.SAVED, String(Date.now()));
  scheduleDriveSync();   // defined in drive.js; call via lazy import below
}
export function saveGenres(g) {
  ls.set(K.GENRES, g);
  scheduleDriveSync();
}

// Lazy reference patched in by drive.js after module graph settles.
// This avoids a hard circular import while keeping saveData/saveGenres here.
let _scheduleDriveSync = () => {};
/** >0 while drive.js is running a full pull/merge/push — avoids re-scheduling sync from those writes. */
let _driveSyncSchedulePauseDepth = 0;

export function pauseDriveSyncScheduling() { _driveSyncSchedulePauseDepth++; }
export function resumeDriveSyncScheduling() {
  _driveSyncSchedulePauseDepth = Math.max(0, _driveSyncSchedulePauseDepth - 1);
}

export function scheduleDriveSync() {
  if (_driveSyncSchedulePauseDepth > 0) return;
  _scheduleDriveSync();
}
export function patchScheduleDriveSync(fn) { _scheduleDriveSync = fn; }

// ── Post-load schema normalisation ───────────────────────────────────────────
(function _ensureV1Fields() {
  let dirty = false;
  for (let i = 0; i < DATA.length; i++) {
    const e = DATA[i];
    if (e.malId            === undefined) { e.malId            = null; dirty = true; }
    if (e.linkedGroupId    === undefined) { e.linkedGroupId    = null; dirty = true; }
    if (e.linkedGroupOrder === undefined) { e.linkedGroupOrder = null; dirty = true; }
  }
  if (dirty) ls.set(K.DATA, DATA); // silent local write, no Drive push
})();

// ═══════════════════════════════
//  UTILS
// ═══════════════════════════════
export function uid()         { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
export function esc(s)        { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
export function today()       { return new Date().toISOString().slice(0, 10); }
export function fmtDate(d)    { if (!d) return '—'; return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }
export function h2r(hex, a)   { const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; }
export function gbyid(id)     { return GENRES.find(g => g.id === id) || GENRES[0]; }
export function estTime(eps, dur) { if (!eps) return '—'; const tot=eps*((parseInt(dur)||24)/60); const h=Math.floor(tot),m=Math.round((tot-h)*60); return h ? `~${h}h${m>0?' '+m+'m':''}` : ` ~${m}m`; }

/** Flat entries only (after V3 migration). */
export function entryStats(e) {
  const dur = parseInt(e.epDuration) || 24;
  const cur = parseInt(e.epCur || 0);
  const tot = parseInt(e.epTot || 0);
  const pct = tot ? Math.round(cur / tot * 100) : (cur > 0 ? 100 : 0);
  return { cur, tot, pct, time: estTime(tot || cur, dur) };
}

export function fmtMin(min)   { if (!min) return '—'; const d=Math.floor(min/1440),h=Math.floor((min%1440)/60),m=min%60; if(d>0) return `${d}d ${h}h`; if(h>0) return `${h}h${m>0?' '+m+'m':''}`; return `${m}m`; }

export const SL  = { watching:'▶ Watching', completed:'✓ Done', on_hold:'⏸ On Hold', dropped:'✗ Dropped', plan:'◻ Planned', upcoming:'◉ Upcoming', not_started:'○ Not Started' };
export const SC  = { watching:'#7dd3fc', completed:'#4ade80', on_hold:'#fbbf24', dropped:'#fb7185', plan:'#a78bfa', upcoming:'#fb923c', not_started:'var(--mu)' };
export const SO  = ['watching','plan','not_started','completed','on_hold','dropped','upcoming'];
export const SSL = { watching:['#7dd3fc','WATCHING'], plan:['#a78bfa','PLAN TO WATCH'], not_started:['var(--mu)','NOT STARTED'], completed:['#4ade80','COMPLETED'], on_hold:['#fbbf24','ON HOLD'], dropped:['#fb7185','DROPPED'], upcoming:['#fb923c','UPCOMING'] };

export function stag(s)         { return `<span class="stag st-${s}">${SL[s] || s}</span>`; }
export function rewatchBadge(e) { if (e.rewatches?.length) return `<span style="font-size:10px;color:#60a5fa;background:rgba(96,165,250,.12);border:1px solid rgba(96,165,250,.2);border-radius:3px;padding:1px 5px">↺ ${e.rewatches.length}×</span>`; return ''; }
export function pcol(s)         { return SC[s] || 'var(--ac)'; }

// ═══════════════════════════════
//  GENRE THEME (Media)
// ═══════════════════════════════
export function applyGenre(id) {
  setGACTIVE(id); ls.setStr(K.GENRE, id);
  const g = gbyid(id); const c = g.color;
  const el = document.documentElement;
  if (CURRENT === 'media') {
    el.style.setProperty('--ac', c);
    el.style.setProperty('--ac-rgb', `${parseInt(c.slice(1,3),16)},${parseInt(c.slice(3,5),16)},${parseInt(c.slice(5,7),16)}`);
  }
  buildGenreMenu();
}

export function buildGenreMenu() {
  const m = document.getElementById('gdrop-menu'); if (!m) return;
  m.innerHTML = GENRES.map(g => {
    const active = g.id === GACTIVE;
    return `
    <div class="gm-item${active ? ' gm-active' : ''}" role="option" aria-selected="${active}" onclick="selectGenre('${g.id}')">
      <span class="gm-dot" style="background:${g.color}"></span>
      <span class="gm-name">${esc(g.name)}</span>
      ${active ? '<span class="gm-check" aria-hidden="true">✓</span>' : '<span class="gm-check gm-check--ph" aria-hidden="true"></span>'}
      <input type="color" class="gm-color" value="${g.color}" title="Genre color" aria-label="Color for ${esc(g.name)}"
        onclick="event.stopPropagation()" onchange="changeGenreColor('${g.id}',this.value)">
    </div>`;
  }).join('') + `
    <div class="gm-divider"></div>
    <div class="gm-footer">
      <input id="new-genre-inp" class="fin gm-new-inp" placeholder="New list…" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter')addGenre()">
      <button type="button" class="gm-add" onclick="event.stopPropagation();addGenre()">Add</button>
    </div>`;
}

function _syncGdropAria(open) {
  const btn = document.querySelector('#gdrop .m-genre-btn');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}
export function toggleGdrop(e) {
  e.stopPropagation();
  const m = document.getElementById('gdrop-menu');
  const wrap = document.getElementById('gdrop');
  if (m) {
    m.classList.toggle('open');
    const open = m.classList.contains('open');
    if (wrap) wrap.classList.toggle('open', open);
    _syncGdropAria(open);
  }
}
document.addEventListener('click', e => {
  const m = document.getElementById('gdrop-menu');
  const d = document.getElementById('gdrop');
  if (m && d && !d.contains(e.target)) {
    m.classList.remove('open');
    d.classList.remove('open');
    _syncGdropAria(false);
  }
});

export function selectGenre(id) {
  setGACTIVE(id); ls.setStr(K.GENRE, id);
  const nbSec = document.getElementById('nb-sec');
  if (nbSec && CURRENT === 'media') nbSec.textContent = gbyid(id).name;
  const g = gbyid(id); const c = g.color;
  document.documentElement.style.setProperty('--ac', c);
  const [r, gg, b] = [parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16)];
  document.documentElement.style.setProperty('--ac-rgb', `${r},${gg},${b}`);
  
  const glbl = document.getElementById('gdrop-lbl');
  if (glbl) glbl.textContent = g.name;
  
  const _gdot = document.getElementById('gdot'); 
  if (_gdot) _gdot.style.background = c;
  
  const gmenu = document.getElementById('gdrop-menu');
  const gwrap = document.getElementById('gdrop');
  if (gmenu) {
    gmenu.classList.remove('open');
    _syncGdropAria(false);
  }
  if (gwrap) gwrap.classList.remove('open');
  
  setSEARCH(''); 
  const srch = document.getElementById('srch');
  if (srch) srch.value = '';
  
  const fstatus = document.getElementById('fstatus');
  if (fstatus) fstatus.value = '';
  
  render();  // render() is patched in below — see patchRender()
}

export function changeGenreColor(id, color) {
  const g = GENRES.find(x => x.id === id); if (!g) return;
  g.color = color; saveGenres(GENRES);
  if (id === GACTIVE) selectGenre(id); else buildGenreMenu();
}

export function addGenre() {
  const inp = document.getElementById('new-genre-inp'); if (!inp) return;
  const name = inp.value.trim(); if (!name) return;
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (GENRES.find(g => g.id === id)) { inp.value = ''; return; }
  const colors = ['#e879a0','#60a5fa','#fb923c','#34d399','#a78bfa','#22d3ee','#fbbf24','#f472b6','#a3e635'];
  GENRES.push({ id, name, color: colors[GENRES.length % colors.length] });
  saveGenres(GENRES); inp.value = ''; selectGenre(id);
}

// Lazy render reference — patched by routing.js to avoid circular import.
let _render = () => {};
export function render() { _render(); }
export function patchRender(fn) { _render = fn; }

// ═══════════════════════════════
//  ROUTER META
// ═══════════════════════════════
export const SECTION_META = {
  home    : { title:'The Aether Codex', label:'Home'     },
  media   : { title:'Media Codex',      label:'Media'    },
  games   : { title:'Game Codex',       label:'Games'    },
  books   : { title:'Book Codex',       label:'Books'    },
  music   : { title:'Music Codex',      label:'Music'    },
  vault   : { title:'Link Vault',       label:'Vault'    },
  log     : { title:'Activity Log',     label:'Log'      },
  notes   : { title:'Notes Codex',      label:'Notes'    },
  tools   : { title:'The Aether Codex', label:'Tools'    },
  settings: { title:'Settings',         label:'Settings' },
};
