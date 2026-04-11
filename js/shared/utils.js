// ═══════════════════════════════
//  STORAGE KEYS & CONSTANTS
// ═══════════════════════════════
export const K = {
  DATA:'ac_v4_media', GENRES:'ac_v4_genres', THEME:'ac_v4_theme',
  GENRE:'ac_v4_genre', VER:'ac_v4_ver', SAVED:'ac_v4_saved',
  DTOKEN:'ac_v4_dtoken', DEXP:'ac_v4_dexp', DFILE:'ac_v4_dfile', DSYNC:'ac_v4_dsync',
};
export const DATA_VERSION   = '4.0';
export const CLIENT_ID      = '750528266098-oudtbb5dcmf4c167sf7l3fu46luqeq11.apps.googleusercontent.com';
export const DRIVE_SCOPE    = 'https://www.googleapis.com/auth/drive.file';
export const YT_SCOPE_CONST = 'https://www.googleapis.com/auth/youtube.readonly';
export const DRIVE_FOLDER   = 'Aether Codex';
export const DRIVE_FILE     = 'AetherCodex_data.json';

// ═══════════════════════════════
//  localStorage WRAPPER
// ═══════════════════════════════
export const ls = {
  get:    k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set:    (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  str:    k => localStorage.getItem(k),
  setStr: (k, v) => localStorage.setItem(k, v),
  del:    k => localStorage.removeItem(k),
};

// ═══════════════════════════════
//  DEFAULT DATA
// ═══════════════════════════════
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

// ═══════════════════════════════
//  MUTABLE STATE
//  Use getters/setters — modules can't reassign each other's bindings.
// ═══════════════════════════════
const _state = {
  DATA:       ls.get(K.DATA)   || [],
  GENRES:     ls.get(K.GENRES) || DEFAULT_GENRES(),
  GACTIVE:    ls.str(K.GENRE)  || 'anime',
  CURRENT:    'home',
  MEDIA_PAGE: 'list',
  SEARCH:     '',
  PANEL:      null,
  PEDIT:      null,
  FORM_TL:    [],
  COLLAPSED:  {},
  DDRG:       null,
  FDRG:       null,
};

export const getDATA       = () => _state.DATA;
export const getGENRES     = () => _state.GENRES;
export const getGACTIVE    = () => _state.GACTIVE;
export const getCURRENT    = () => _state.CURRENT;
export const getMEDIA_PAGE = () => _state.MEDIA_PAGE;
export const getSEARCH     = () => _state.SEARCH;
export const getPANEL      = () => _state.PANEL;
export const getPEDIT      = () => _state.PEDIT;
export const getFORM_TL    = () => _state.FORM_TL;
export const getCOLLAPSED  = () => _state.COLLAPSED;
export const getDDRG       = () => _state.DDRG;
export const getFDRG       = () => _state.FDRG;

export const setDATA       = v => { _state.DATA       = v; };
export const setGENRES     = v => { _state.GENRES     = v; };
export const setGACTIVE    = v => { _state.GACTIVE    = v; };
export const setCURRENT    = v => { _state.CURRENT    = v; };
export const setMEDIA_PAGE = v => { _state.MEDIA_PAGE = v; };
export const setSEARCH     = v => { _state.SEARCH     = v; };
export const setPANEL      = v => { _state.PANEL      = v; };
export const setPEDIT      = v => { _state.PEDIT      = v; };
export const setFORM_TL    = v => { _state.FORM_TL    = v; };
export const setCOLLAPSED  = v => { _state.COLLAPSED  = v; };
export const setDDRG       = v => { _state.DDRG       = v; };
export const setFDRG       = v => { _state.FDRG       = v; };

// ── Post-load schema normalisation ───────────────────────────────────────
(function _ensureV1Fields() {
  let dirty = false;
  for (const e of _state.DATA) {
    if (e.malId            === undefined) { e.malId            = null; dirty = true; }
    if (e.linkedGroupId    === undefined) { e.linkedGroupId    = null; dirty = true; }
    if (e.linkedGroupOrder === undefined) { e.linkedGroupOrder = null; dirty = true; }
  }
  if (dirty) ls.set(K.DATA, _state.DATA);
})();

// ═══════════════════════════════
//  DRIVE SYNC CALLBACK INJECTION
//  Breaks the utils ↔ drive circular dependency.
//  drive.js calls setDriveSyncCallback(scheduleDriveSync) on module load.
// ═══════════════════════════════
let _driveSyncFn = () => {};
export function setDriveSyncCallback(fn) { _driveSyncFn = fn; }

// ═══════════════════════════════
//  PERSISTENCE
// ═══════════════════════════════
export function saveData(d) {
  setDATA(d);
  ls.set(K.DATA, d);
  ls.setStr(K.SAVED, String(Date.now()));
  _driveSyncFn();   // calls scheduleDriveSync once drive.js has registered it
}

export function saveGenres(g) {
  setGENRES(g);
  ls.set(K.GENRES, g);
  _driveSyncFn();
}

// ═══════════════════════════════
//  PURE UTILS
// ═══════════════════════════════
export function uid()      { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
export function esc(s)     { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
export function today()    { return new Date().toISOString().slice(0, 10); }
export function fmtDate(d) { if (!d) return '—'; return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }
export function h2r(hex, a){ const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; }
export function gbyid(id)  { return getGENRES().find(g => g.id === id) || getGENRES()[0]; }
export function estTime(eps, dur) { if (!eps) return '—'; const tot=eps*((parseInt(dur)||24)/60); const h=Math.floor(tot),m=Math.round((tot-h)*60); return h?`~${h}h${m>0?' '+m+'m':''}`:` ~${m}m`; }
export function fmtMin(min){ if (!min) return '—'; const d=Math.floor(min/1440),h=Math.floor((min%1440)/60),m=min%60; if(d>0)return`${d}d ${h}h`; if(h>0)return`${h}h${m>0?' '+m+'m':''}`; return`${m}m`; }

export const SL  = { watching:'▶ Watching', completed:'✓ Done', on_hold:'⏸ On Hold', dropped:'✗ Dropped', plan:'◻ Planned', upcoming:'◉ Upcoming', not_started:'○ Not Started' };
export const SC  = { watching:'#38bdf8', completed:'#4ade80', on_hold:'#fbbf24', dropped:'#fb7185', plan:'#a78bfa', upcoming:'#fb923c', not_started:'var(--mu)' };
export const SO  = ['watching','plan','not_started','completed','on_hold','dropped','upcoming'];
export const SSL = { watching:['#38bdf8','WATCHING'], plan:['#a78bfa','PLAN TO WATCH'], not_started:['var(--mu)','NOT STARTED'], completed:['#4ade80','COMPLETED'], on_hold:['#fbbf24','ON HOLD'], dropped:['#fb7185','DROPPED'], upcoming:['#fb923c','UPCOMING'] };

export function stag(s)         { return `<span class="stag st-${s}">${SL[s] || s}</span>`; }
export function rewatchBadge(e) { return e.rewatches?.length ? `<span style="font-size:10px;color:#60a5fa;background:rgba(96,165,250,.12);border:1px solid rgba(96,165,250,.2);border-radius:3px;padding:1px 5px">↺ ${e.rewatches.length}×</span>` : ''; }
export function pcol(s)         { return SC[s] || 'var(--ac)'; }

// ═══════════════════════════════
//  GENRE THEME
// ═══════════════════════════════
export function applyGenre(id) {
  setGACTIVE(id); ls.setStr(K.GENRE, id);
  const g = gbyid(id), c = g.color;
  if (getCURRENT() === 'media') {
    document.documentElement.style.setProperty('--ac', c);
    document.documentElement.style.setProperty('--ac-rgb',
      `${parseInt(c.slice(1,3),16)},${parseInt(c.slice(3,5),16)},${parseInt(c.slice(5,7),16)}`);
  }
  buildGenreMenu();
}

export function buildGenreMenu() {
  const m = document.getElementById('gdrop-menu'); if (!m) return;
  m.innerHTML = getGENRES().map(g => `
    <div class="gm-item${g.id === getGACTIVE() ? ' gm-active' : ''}" onclick="selectGenre('${g.id}')">
      <span style="width:7px;height:7px;border-radius:50%;background:${g.color};flex-shrink:0;display:inline-block"></span>
      <span style="flex:1">${esc(g.name)}</span>
      <input type="color" value="${g.color}" onclick="event.stopPropagation()"
        onchange="changeGenreColor('${g.id}',this.value)"
        style="width:16px;height:16px;border-radius:3px;border:1px solid var(--brd);padding:0;cursor:pointer;background:none">
    </div>`).join('') + `
    <div style="height:1px;background:var(--brd);margin:3px 0"></div>
    <div style="padding:7px 9px;display:flex;gap:5px;align-items:center">
      <input id="new-genre-inp" class="fin" placeholder="New genre..." style="flex:1;font-size:12px;padding:4px 7px"
        onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter')addGenre()">
      <button onclick="event.stopPropagation();addGenre()"
        style="background:var(--ac);color:#000;border:none;border-radius:4px;padding:4px 9px;font-size:12px;font-weight:700;cursor:pointer">+</button>
    </div>`;
}

export function toggleGdrop(e) {
  e.stopPropagation();
  document.getElementById('gdrop-menu')?.classList.toggle('open');
}

export function selectGenre(id) {
  setGACTIVE(id); ls.setStr(K.GENRE, id);
  const nbSec = document.getElementById('nb-sec');
  if (nbSec && getCURRENT() === 'media') nbSec.textContent = gbyid(id).name;
  const g = gbyid(id), c = g.color;
  document.documentElement.style.setProperty('--ac', c);
  const [r, gg, b] = [parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16)];
  document.documentElement.style.setProperty('--ac-rgb', `${r},${gg},${b}`);
  document.getElementById('gdrop-lbl').textContent = g.name;
  const dot = document.getElementById('gdot'); if (dot) dot.style.background = c;
  document.getElementById('gdrop-menu').classList.remove('open');
  setSEARCH('');
  document.getElementById('srch').value = '';
  document.getElementById('fstatus').value = '';
  window.render?.();  // routing.js exposes render on window via main.js
}

export function changeGenreColor(id, color) {
  const g = getGENRES().find(x => x.id === id); if (!g) return;
  g.color = color; saveGenres(getGENRES());
  if (id === getGACTIVE()) selectGenre(id); else buildGenreMenu();
}

export function addGenre() {
  const inp = document.getElementById('new-genre-inp'); if (!inp) return;
  const name = inp.value.trim(); if (!name) return;
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  if (getGENRES().find(g => g.id === id)) { inp.value = ''; return; }
  const colors = ['#e879a0','#60a5fa','#fb923c','#34d399','#a78bfa','#22d3ee','#fbbf24','#f472b6','#a3e635'];
  const genres = getGENRES();
  genres.push({ id, name, color: colors[genres.length % colors.length] });
  saveGenres(genres); inp.value = ''; selectGenre(id);
}

export const SECTION_META = {
  home:    { title:'The Aether Codex', label:'Home'     },
  media:   { title:'Media Codex',      label:'Media'    },
  games:   { title:'Game Codex',       label:'Games'    },
  books:   { title:'Book Codex',       label:'Books'    },
  music:   { title:'Music Codex',      label:'Music'    },
  vault:   { title:'Link Vault',       label:'Vault'    },
  log:     { title:'Activity Log',     label:'Log'      },
  notes:   { title:'Notes Codex',      label:'Notes'    },
  tools:   { title:'The Aether Codex', label:'Tools'    },
  settings:{ title:'Settings',         label:'Settings' },
};

// Click-outside for genre dropdown (module-level side effect, runs once)
document.addEventListener('click', e => {
  const m = document.getElementById('gdrop-menu');
  const d = document.getElementById('gdrop');
  if (m && d && !d.contains(e.target)) m.classList.remove('open');
});