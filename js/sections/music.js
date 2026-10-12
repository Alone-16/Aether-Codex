// ═══════════════════════════════════════════════════════════════════════════════
//  MUSIC DATA & STATE ── YouTube Music Link Sync via Cloudflare Worker
// ═══════════════════════════════════════════════════════════════════════════════
import { musicApi } from '../shared/api.js';
import { _cardSlot, _hydrateSlots, _observeCardVisibility } from '../shared/ui.js';
import { esc } from '../shared/utils.js';

const MUSIC_KEY     = 'ac_v4_music';
const MUSIC_PL_KEY  = 'ac_v4_music_playlists';
const MUSIC_SORT_KEY = 'ac_v5_music_sort';

function loadMusic()      { return (window.MDATA && window.MDATA.length) ? window.MDATA : (typeof ls !== 'undefined' && ls.get ? ls.get(MUSIC_KEY) : null) || window.MDATA || []; }
function saveMusic(d)     { MDATA = d; window.MDATA = d; if (typeof ls !== 'undefined' && ls.set) ls.set(MUSIC_KEY, d); }
function loadPlaylists()  { return (window.MPLAYLISTS && window.MPLAYLISTS.length) ? window.MPLAYLISTS : (typeof ls !== 'undefined' && ls.get ? ls.get(MUSIC_PL_KEY) : null) || window.MPLAYLISTS || []; }
function savePlaylists(p) { MPLAYLISTS = p; window.MPLAYLISTS = p; if (typeof ls !== 'undefined' && ls.set) ls.set(MUSIC_PL_KEY, p); const api = window.musicApi || musicApi; if (api?.putPlaylists) api.putPlaylists(p).catch(() => {}); }

let MDATA      = loadMusic();
window.MDATA = MDATA;
let MPLAYLISTS = loadPlaylists();
window.MPLAYLISTS = MPLAYLISTS;

export function setMDATA(d) {
  MDATA = Array.isArray(d) ? d : [];
  window.MDATA = MDATA;
  if (typeof ls !== 'undefined' && ls.set) ls.set(MUSIC_KEY, MDATA);
}
export function setMPLAYLISTS(p) {
  MPLAYLISTS = Array.isArray(p) ? p : [];
  window.MPLAYLISTS = MPLAYLISTS;
  if (typeof ls !== 'undefined' && ls.set) ls.set(MUSIC_PL_KEY, MPLAYLISTS);
}
window.setMDATA = setMDATA;
window.setMPLAYLISTS = setMPLAYLISTS;

let MUSIC_PAGE = 'library';
let MSEARCH    = (typeof window !== 'undefined' && window.MSEARCH) ? window.MSEARCH : '';
let YT_SYNCING = false;
let SELECTED_PLAYLIST = null;

let MUSIC_SORT = (typeof localStorage !== 'undefined' ? localStorage.getItem(MUSIC_SORT_KEY) : null) || 'added';
window.MUSIC_SORT = MUSIC_SORT;

export function getMusicSearch() {
  const srch = typeof document !== 'undefined' ? document.getElementById('srch') : null;
  const val = (srch && srch.value !== undefined) ? srch.value : (window.MSEARCH ?? MSEARCH ?? '');
  return String(val || '').toLowerCase().trim();
}

export function setMusicSearch(q) {
  MSEARCH = String(q || '').toLowerCase().trim();
  window.MSEARCH = MSEARCH;
  const srch = typeof document !== 'undefined' ? document.getElementById('srch') : null;
  if (srch && srch.value !== q) srch.value = q;
  renderMusicBody();
}

export function clearMusicSearch() {
  const srch = typeof document !== 'undefined' ? document.getElementById('srch') : null;
  if (srch) srch.value = '';
  MSEARCH = '';
  window.MSEARCH = '';
  renderMusicBody();
  if (srch) srch.focus();
}

export function filterMusicByPlaylist(id) {
  SELECTED_PLAYLIST = id;
  MUSIC_PAGE = 'library';
  renderMusicBody();
}

export function clearPlaylistFilter() {
  SELECTED_PLAYLIST = null;
  renderMusicBody();
}

export function getSortLabel() {
  if (MUSIC_SORT === 'title') return 'A → Z';
  if (MUSIC_SORT === 'title-desc') return 'Z → A';
  if (MUSIC_SORT === 'oldest') return 'Time added (Oldest)';
  return 'Time added (Newest)';
}

export function toggleMusicSortDd(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('mu-sort-dd');
  const menu = dd?.querySelector('.m-dd-menu');
  const btn = dd?.querySelector('.m-dd-btn');
  const isOpen = menu?.classList.contains('open');

  document.querySelectorAll('.m-dd-menu.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.m-dd-btn[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));

  if (!isOpen && menu && btn) {
    menu.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
  }
}

export function setMusicSort(val) {
  MUSIC_SORT = val;
  window.MUSIC_SORT = val;
  try { localStorage.setItem(MUSIC_SORT_KEY, val); } catch (e) {}
  document.querySelectorAll('.m-dd-menu.open').forEach(m => m.classList.remove('open'));
  document.querySelectorAll('.m-dd-btn[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
  renderMusicBody();
}

function getSongAddedTime(s) {
  const t = s.addedAt || s.created_at || s.updated_at || s.updatedAt || 0;
  return t < 1e11 ? t * 1000 : t;
}

function getPlaylistAddedTime(pl) {
  const t = pl.last_synced_at || pl.lastSyncedAt || pl.updated_at || pl.updatedAt || pl.created_at || 0;
  return t < 1e11 ? t * 1000 : t;
}

function renderSortDropdown(target = 'music') {
  const sortLbl = getSortLabel();
  return `
    <div class="m-sort-dd m-dd" id="mu-sort-dd">
      <button type="button" class="m-dd-btn" onclick="toggleMusicSortDd(event)" aria-haspopup="listbox" aria-expanded="false" aria-label="Sort ${target}">
        <span class="m-dd-lbl">${sortLbl}</span>
        <span class="m-dd-chev" aria-hidden="true"></span>
      </button>
      <div class="m-dd-menu" id="mu-sort-menu" role="listbox">
        <button type="button" class="m-dd-opt${MUSIC_SORT === 'added' ? ' active' : ''}" role="option" aria-selected="${MUSIC_SORT === 'added' ? 'true' : 'false'}" onclick="event.stopPropagation();setMusicSort('added')">Time added (Newest)</button>
        <button type="button" class="m-dd-opt${MUSIC_SORT === 'title' ? ' active' : ''}" role="option" aria-selected="${MUSIC_SORT === 'title' ? 'true' : 'false'}" onclick="event.stopPropagation();setMusicSort('title')">A → Z</button>
        <button type="button" class="m-dd-opt${MUSIC_SORT === 'title-desc' ? ' active' : ''}" role="option" aria-selected="${MUSIC_SORT === 'title-desc' ? 'true' : 'false'}" onclick="event.stopPropagation();setMusicSort('title-desc')">Z → A</button>
        <button type="button" class="m-dd-opt${MUSIC_SORT === 'oldest' ? ' active' : ''}" role="option" aria-selected="${MUSIC_SORT === 'oldest' ? 'true' : 'false'}" onclick="event.stopPropagation();setMusicSort('oldest')">Time added (Oldest)</button>
      </div>
    </div>`;
}

// Global click closer for sort dropdown
if (typeof window !== 'undefined') {
  window.addEventListener('click', (e) => {
    if (e.target.closest('#mu-sort-dd')) return;
    const menu = document.getElementById('mu-sort-menu');
    const btn = document.querySelector('#mu-sort-dd .m-dd-btn');
    if (menu && menu.classList.contains('open')) {
      menu.classList.remove('open');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  YOUTUBE PLAYLIST LINK SYNC (SERVER API)
// ═══════════════════════════════════════════════════════════════════════════════

export function openAddPlaylistModal() {
  const rpanel = document.getElementById('rpanel');
  const poverlay = document.getElementById('poverlay');
  const content = document.getElementById('content');
  const panelInner = document.getElementById('panel-inner');

  if (!rpanel || !panelInner) return;

  panelInner.innerHTML = `
    <div class="ph">
      <div class="ph-title">Sync YouTube Playlist</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="form-wrap">
      <div class="fg">
        <label class="flbl">YouTube / YT Music Playlist Link *</label>
        <input class="fin" id="pl-sync-url" placeholder="https://music.youtube.com/playlist?list=PL..." autofocus>
        <div style="font-size:11px;color:var(--mu);margin-top:4px">Paste any public or unlisted YouTube or YT Music playlist URL</div>
      </div>
      <div class="fg">
        <label class="flbl">Sync Interval</label>
        <select class="fsel" id="pl-sync-interval">
          <option value="5" selected>Every 5 Days</option>
          <option value="7">Every 1 Week (7 Days)</option>
          <option value="10">Every 10 Days</option>
          <option value="1">Daily (Every 1 Day)</option>
          <option value="14">Every 2 Weeks (14 Days)</option>
          <option value="30">Monthly (30 Days)</option>
          <option value="0">Manual Only</option>
        </select>
      </div>
    </div>
    <div class="panel-actions">
      <button class="btn-cancel" onclick="closePanel()">Cancel</button>
      <button class="btn-save" onclick="submitAddPlaylistSync()">Import & Sync</button>
    </div>
  `;

  rpanel.classList.add('open');
  if (poverlay) poverlay.classList.add('show');
  if (content) content.classList.add('pushed');
}

export async function submitAddPlaylistSync() {
  const urlInput = document.getElementById('pl-sync-url');
  const intervalInput = document.getElementById('pl-sync-interval');

  const url = urlInput?.value?.trim();
  const interval = parseInt(intervalInput?.value ?? '7', 10);

  if (!url) {
    showAlert('Please enter a YouTube playlist link or ID.', { title: 'Missing Playlist Link' });
    return;
  }

  try {
    YT_SYNCING = true;
    updateMusicSyncBtn('syncing');
    toast('Fetching YouTube playlist & tracks...', 'var(--ac)');

    const res = await (window.musicApi || musicApi).syncPlaylist(url, interval);
    if (res) {
      if (res.tracks) setMDATA(res.tracks);
      if (res.playlists) setMPLAYLISTS(res.playlists);
      closePanel();
      if ((res.tracksCount || 0) > 0) {
        toast(`✓ Synced ${res.tracksCount} tracks from playlist!`, '#4ade80');
      } else {
        toast('Synced playlist, but no tracks could be extracted.', '#f59e0b');
      }
      renderMusicBody();
    }
  } catch (e) {
    console.error('[Music Sync Error]', e);
    toast('Playlist sync failed: ' + (e.message || 'Error'), '#fb7185');
  } finally {
    YT_SYNCING = false;
    updateMusicSyncBtn('idle');
  }
}

export async function syncSinglePlaylist(playlistUrl, syncIntervalDays = 7) {
  if (!playlistUrl) return;
  try {
    YT_SYNCING = true;
    updateMusicSyncBtn('syncing');
    toast('Re-syncing playlist...', 'var(--ac)');
    const res = await (window.musicApi || musicApi).syncPlaylist(playlistUrl, syncIntervalDays);
    if (res) {
      if (res.tracks) setMDATA(res.tracks);
      if (res.playlists) setMPLAYLISTS(res.playlists);
      toast(`✓ Re-synced playlist (${res.tracksCount || 0} tracks)`, '#4ade80');
      renderMusicBody();
    }
  } catch (e) {
    toast('Sync failed: ' + (e.message || 'Error'), '#fb7185');
  } finally {
    YT_SYNCING = false;
    updateMusicSyncBtn('idle');
  }
}

let _dueSyncPromise = null;
let _lastDueSyncCheck = 0;

export async function syncDuePlaylists() {
  const now = Date.now();
  if (YT_SYNCING || _dueSyncPromise || (now - _lastDueSyncCheck < 60000)) return;
  _lastDueSyncCheck = now;
  _dueSyncPromise = (async () => {
    try {
      const res = await (window.musicApi || musicApi).syncDuePlaylists();
      if (res && res.syncedCount > 0) {
        if (res.tracks) setMDATA(res.tracks);
        if (res.playlists) setMPLAYLISTS(res.playlists);
        toast(`✓ Auto-synced ${res.syncedCount} playlist(s)`, '#4ade80');
        renderMusicBody();
      }
    } catch (e) {
      console.warn('[Music syncDuePlaylists]', e);
    } finally {
      _dueSyncPromise = null;
    }
  })();
}

function fmtDuration(secs) {
  if (!secs) return '—';
  const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function updateMusicSyncBtn(state) {
  const btn = document.getElementById('music-sync-btn'); if (!btn) return;
  const map = {
    syncing: ['<span class="mu-sync-spinning">🔄</span> Syncing', 'var(--ac)'],
    synced:  ['✓ Synced',  '#4ade80'],
    error:   ['⚠ Sync',    '#fb7185'],
    idle:    ['⟳ Sync Link', 'var(--ac)'],
  };
  const [label, color] = map[state] || map.idle;
  btn.innerHTML = label; btn.style.color = color;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MUSIC RENDER
// ═══════════════════════════════════════════════════════════════════════════════
function renderMusic(c) {
  const tabs = ['Library', 'Playlists', 'Dashboard'];
  c.innerHTML = `
    <style>
      .m-card-slot { width: 100%; position: relative; contain: layout style; }
      .mu-row.m-card-lazy, .mu-pl-card.m-card-lazy { opacity: 0; transform: translateY(20px) scale(0.96); animation: none; }
      .mu-row.m-card-lazy.m-card-visible, .mu-pl-card.m-card-lazy.m-card-visible {
        animation: mu-cardEnter 0.5s cubic-bezier(0.16,1,0.3,1) both;
      }
      .mu-pl-badge:hover {
        background: rgba(var(--ac-rgb), 0.15) !important;
        color: var(--ac) !important;
        border-color: rgba(var(--ac-rgb), 0.3) !important;
      }
      .mu-toolbar {
        animation: mu-cardEnter 0.3s cubic-bezier(0.16,1,0.3,1) both;
      }
    </style>
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div class="sub-tabs">
        ${tabs.map((t,i) => `<button class="stab${MUSIC_PAGE===['library','playlists','dashboard'][i]?' active':''}" onclick="setMusicPage('${['library','playlists','dashboard'][i]}')">${t}</button>`).join('')}
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button id="music-sync-btn" onclick="openAddPlaylistModal()" class="nb-btn" style="color:var(--ac)">⟳ Sync Link</button>
        <button onclick="openAddSong()" class="nb-btn ac">+ Add Song</button>
      </div>
    </div>
    <div id="music-body"></div>`;
  renderMusicBody();
  syncDuePlaylists();
}

function setMusicPage(p) {
  MUSIC_PAGE = p;
  const srch = document.getElementById('srch');
  if (srch) {
    srch.placeholder = p === 'playlists' ? 'Search playlists...' : 'Search songs, artists, albums...';
  }
  renderMusicBody();
}

function renderMusicBody() {
  const el = document.getElementById('music-body'); if (!el) return;
  const srch = document.getElementById('srch');
  if (srch && srch.value !== undefined) {
    MSEARCH = srch.value.toLowerCase().trim();
    window.MSEARCH = MSEARCH;
  } else if (window.MSEARCH !== undefined) {
    MSEARCH = String(window.MSEARCH).toLowerCase().trim();
  }

  if (MUSIC_PAGE === 'library')    renderMusicLibrary(el);
  else if (MUSIC_PAGE === 'playlists') renderMusicPlaylists(el);
  else if (MUSIC_PAGE === 'dashboard') renderMusicDash(el);

  document.querySelectorAll('.stab').forEach((t,i) => {
    t.classList.toggle('active', ['library','playlists','dashboard'][i] === MUSIC_PAGE);
  });
  updateMusicSyncBtn(YT_SYNCING ? 'syncing' : 'idle');
}

function handleMusicSync() {
  openAddPlaylistModal();
}

// ── LIBRARY ──
function renderMusicLibrary(c) {
  const q = getMusicSearch();
  const rawSongs = Array.isArray(MDATA) ? MDATA : [];
  const songsWithoutRemoved = rawSongs.filter(s => !s.removedFromPlaylist);

  if (!songsWithoutRemoved.length) {
    c.innerHTML = `
      <div class="mu-empty">
        <div class="mu-empty-ico">🎵</div>
        <div class="mu-empty-title">No songs in library</div>
        <div class="mu-empty-sub">Sync a YouTube / YT Music playlist link or add songs manually</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:14px">
          <button onclick="openAddPlaylistModal()" class="nb-btn ac">+ Sync Playlist Link</button>
          <button onclick="openAddSong()" class="nb-btn">+ Add Song</button>
        </div>
      </div>`;
    return;
  }

  let songs = [...songsWithoutRemoved];

  let selectedPl = null;
  if (SELECTED_PLAYLIST) {
    selectedPl = MPLAYLISTS.find(p => p.id === SELECTED_PLAYLIST);
    if (selectedPl) {
      songs = songs.filter(s => (s.playlist_id || s.playlistId) === SELECTED_PLAYLIST);
    } else {
      SELECTED_PLAYLIST = null;
    }
  }

  if (q) {
    const plMap = new Map();
    MPLAYLISTS.forEach(p => plMap.set(p.id, (p.title || '').toLowerCase()));

    songs = songs.filter(s => {
      const titleMatch = (s.title || '').toLowerCase().includes(q);
      const artistMatch = (s.artist || '').toLowerCase().includes(q);
      const albumMatch = (s.album || '').toLowerCase().includes(q);
      const plId = s.playlist_id || s.playlistId;
      const plTitle = plId ? (plMap.get(plId) || '') : '';
      const plMatch = plTitle.includes(q);
      return titleMatch || artistMatch || albumMatch || plMatch;
    });
  }

  if (MUSIC_SORT === 'title') {
    songs.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
  } else if (MUSIC_SORT === 'title-desc') {
    songs.sort((a, b) => (b.title || '').localeCompare(a.title || '', undefined, { sensitivity: 'base' }));
  } else if (MUSIC_SORT === 'oldest') {
    songs.sort((a, b) => {
      const ta = getSongAddedTime(a);
      const tb = getSongAddedTime(b);
      return ta !== tb ? ta - tb : (a.title || '').localeCompare(b.title || '');
    });
  } else {
    // 'added' (Newest time added first)
    songs.sort((a, b) => {
      const ta = getSongAddedTime(a);
      const tb = getSongAddedTime(b);
      return tb !== ta ? tb - ta : (a.title || '').localeCompare(b.title || '');
    });
  }

  const selectedPlPill = selectedPl
    ? `<span style="font-size:11px;background:rgba(96,165,250,0.15);color:#60a5fa;border:1px solid rgba(96,165,250,0.3);padding:2px 8px;border-radius:12px;font-weight:600;display:inline-flex;align-items:center;gap:6px">📁 ${esc(selectedPl.title)} <button onclick="clearPlaylistFilter()" title="Clear playlist filter" style="background:none;border:none;color:inherit;cursor:pointer;font-size:13px;padding:0;line-height:1">✕</button></span>`
    : '';

  if (!songs.length) {
    c.innerHTML = `
      <div class="mu-toolbar" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div class="mu-cnt-lbl" style="margin:0">0 of ${songsWithoutRemoved.length} songs</div>
          ${selectedPlPill}
          ${q ? `<span style="font-size:11px;background:rgba(var(--ac-rgb),0.12);color:var(--ac);padding:2px 8px;border-radius:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px">for "${esc(q)}" <button onclick="clearMusicSearch()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:13px;padding:0;line-height:1">✕</button></span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${renderSortDropdown('songs')}
        </div>
      </div>
      <div class="mu-empty">
        <div class="mu-empty-ico">🔍</div>
        <div class="mu-empty-title">No songs found</div>
        <div class="mu-empty-sub">${q ? `No tracks match "${esc(q)}"` : 'No tracks in this playlist'}</div>
        <div style="display:flex;gap:8px;justify-content:center;margin-top:14px">
          ${q ? `<button onclick="clearMusicSearch()" class="nb-btn ac">Clear Search</button>` : ''}
          ${SELECTED_PLAYLIST ? `<button onclick="clearPlaylistFilter()" class="nb-btn">Show All Songs</button>` : ''}
        </div>
      </div>`;
    return;
  }

  const totalSecs = songs.reduce((a, s) => a + (s.duration_sec || s.duration || 0), 0);
  const countLabel = (q || selectedPl)
    ? `Showing ${songs.length} of ${songsWithoutRemoved.length} songs • ${fmtTotalDuration(totalSecs)}`
    : `${songs.length} song${songs.length!==1?'s':''} • ${fmtTotalDuration(totalSecs)}`;

  const cardHtmls = [];
  const rows = songs.map((s, i) => {
    const html = songRowHtml(s, i);
    cardHtmls.push(html);
    return _cardSlot(html, s.id);
  }).join('');

  c.innerHTML = `
    <div class="mu-toolbar" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div class="mu-cnt-lbl" style="margin:0">${countLabel}</div>
        ${selectedPlPill}
        ${q ? `<span style="font-size:11px;background:rgba(var(--ac-rgb),0.12);color:var(--ac);padding:2px 8px;border-radius:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px">for "${esc(q)}" <button onclick="clearMusicSearch()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:13px;padding:0;line-height:1">✕</button></span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${renderSortDropdown('songs')}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:0">
      ${rows}
    </div>`;
  _hydrateSlots(c, cardHtmls);
  _observeCardVisibility(c);
}

function songRowHtml(s, idx=0) {
  const hasLyrics = !!(s.lyrics || s.lyricsLink);
  const duration = s.duration_sec || s.duration;
  const ytId = s.youtube_id || s.videoId;
  const thumb = s.thumbnail || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : '');
  const plId = s.playlist_id || s.playlistId;
  const pl = plId ? MPLAYLISTS.find(p => p.id === plId) : null;
  const plBadge = pl ? `<span class="mu-pl-badge" onclick="event.stopPropagation();filterMusicByPlaylist('${pl.id}')" title="Filter by playlist: ${esc(pl.title)}" style="font-size:10px;padding:1px 6px;border-radius:4px;background:rgba(255,255,255,0.06);color:var(--mu);border:1px solid rgba(255,255,255,0.08);cursor:pointer;transition:all .15s">📁 ${esc(pl.title)}</span>` : '';

  return `<div class="mu-row m-card-lazy" onclick="openSongDetail('${s.id}')">
    <div class="mu-row-bar" style="background:var(--ac)"></div>
    ${thumb ? `<img src="${esc(thumb)}" class="mu-thumb" onerror="this.style.display='none'">` : '<div class="mu-thumb-ph">🎵</div>'}
    <div class="mu-info">
      <div class="mu-title">${esc(s.title)}</div>
      <div class="mu-meta">
        <span class="mu-artist">${esc(s.artist||'Unknown')}</span>
        ${s.album?`<span class="mu-album">${esc(s.album)}</span>`:''}
        ${plBadge}
        ${hasLyrics?'<span class="mu-lyrics-badge">🎵 Lyrics</span>':''}
      </div>
    </div>
    <div class="mu-right">
      <div class="mu-eq"><span></span><span></span><span></span></div>
      <span class="mu-dur">${fmtDuration(duration)}</span>
      <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
        ${ytId?`<button class="mu-act-btn mu-act-play" onclick="window.open('https://youtu.be/${ytId}','_blank')" title="Open on YouTube">▶ </button>`:''}
        <button class="mu-act-btn mu-act-edit" onclick="openEditSong('${s.id}')" title="Edit">✎</button>
        <button class="mu-act-btn mu-act-del" onclick="delSong('${s.id}')">✕</button>
      </div>
    </div>
  </div>`;
}

function fmtTotalDuration(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── SONG DETAIL PANEL ──
function openSongDetail(id) {
  const s = MDATA.find(x => x.id === id); if (!s) return;
  const duration = s.duration_sec || s.duration;
  const ytId = s.youtube_id || s.videoId;
  const thumb = s.thumbnail || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : '');
  const plId = s.playlist_id || s.playlistId;
  const pl = plId ? MPLAYLISTS.find(p => p.id === plId) : null;

  document.getElementById('rpanel').classList.add('open');
  document.getElementById('poverlay').classList.add('show');
  document.getElementById('content').classList.add('pushed');

  const lyricsSection = s.lyrics ? `
    <div style="margin-top:16px">
      <div class="flbl" style="margin-bottom:8px">Lyrics</div>
      <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:10px;padding:14px;font-size:13px;line-height:1.7;white-space:pre-wrap;max-height:260px;overflow-y:auto;color:var(--tx2)">
        ${esc(s.lyrics)}
      </div>
    </div>` : '';

  document.getElementById('panel-inner').innerHTML = `
    <div class="ph">
      <div class="ph-title">${esc(s.title)}</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    ${thumb ? `<img src="${esc(thumb)}" style="width:100%;height:180px;object-fit:cover;border-radius:12px;margin-bottom:16px;box-shadow:0 8px 24px rgba(0,0,0,0.4)">` : ''}
    <div style="display:flex;flex-direction:column;gap:10px">
      <div><span class="flbl">Artist</span><span style="color:var(--tx);font-size:14px;font-weight:600">${esc(s.artist||'Unknown')}</span></div>
      ${s.album?`<div><span class="flbl">Album</span><span style="color:var(--tx);font-size:14px;font-weight:600">${esc(s.album)}</span></div>`:''}
      ${duration?`<div><span class="flbl">Duration</span><span style="color:var(--tx);font-size:14px;font-weight:600">${fmtDuration(duration)}</span></div>`:''}
      ${pl?`<div><span class="flbl">Playlist</span><span style="color:var(--ac);font-size:13px;font-weight:600;cursor:pointer" onclick="closePanel();filterMusicByPlaylist('${pl.id}')">📁 ${esc(pl.title)}</span></div>`:''}
      ${ytId?`<div><span class="flbl">YouTube</span><a href="https://youtu.be/${ytId}" target="_blank" style="color:var(--ac);font-size:13px;font-weight:600">Open on YouTube ↗</a></div>`:''}
      ${s.lyricsLink?`<div><span class="flbl">Lyrics Link</span>
        <a href="${esc(s.lyricsLink)}" target="_blank" style="color:var(--ac);font-weight:600;font-size:14px;transition:opacity .2s" onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">View Lyrics ↗</a></div>`:''}
    </div>
    ${lyricsSection}
    <div class="panel-actions">
      <button class="btn-del" onclick="delSong('${s.id}')">Remove</button>
      <button class="btn-save" onclick="openEditSong('${s.id}')">✎ Edit</button>
      <button class="btn-cancel" onclick="closePanel()">Close</button>
    </div>`;
}

function delSong(id) {
  showConfirm('Remove this song from your library?', () => {
    const _mdel=MDATA.find(x=>x.id===id);
    MDATA = MDATA.filter(x => x.id !== id);
    if(_mdel && typeof addLog === 'function') addLog('music','Removed',_mdel.title,_mdel.artist||null);
    saveMusic(MDATA);
    closePanel();
    renderMusicBody();
    if(_mdel) toastWithUndo(_mdel.title,()=>{MDATA.push(_mdel);saveMusic(MDATA);renderMusicBody();});
  }, { title: 'Remove Song?', okLabel: 'Remove' });
}

// ── PLAYLISTS ──
function renderMusicPlaylists(c) {
  const q = getMusicSearch();
  const rawPlaylists = Array.isArray(MPLAYLISTS) ? MPLAYLISTS : [];

  if (!rawPlaylists.length) {
    c.innerHTML = `
      <div class="mu-empty">
        <div class="mu-empty-ico">🎵</div>
        <div class="mu-empty-title">No synced playlists</div>
        <div class="mu-empty-sub">Add any YouTube or YT Music playlist URL to auto-sync tracks on your preferred interval</div>
        <button onclick="openAddPlaylistModal()" class="nb-btn ac" style="margin:14px auto 0">+ Sync Playlist Link</button>
      </div>`;
    return;
  }

  let filtered = q
    ? rawPlaylists.filter(pl => {
        const titleMatch = (pl.title || '').toLowerCase().includes(q);
        const descMatch = (pl.description || '').toLowerCase().includes(q);
        const idMatch = (pl.id || '').toLowerCase().includes(q);
        return titleMatch || descMatch || idMatch;
      })
    : [...rawPlaylists];

  if (MUSIC_SORT === 'title') {
    filtered.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));
  } else if (MUSIC_SORT === 'title-desc') {
    filtered.sort((a, b) => (b.title || '').localeCompare(a.title || '', undefined, { sensitivity: 'base' }));
  } else if (MUSIC_SORT === 'oldest') {
    filtered.sort((a, b) => {
      const ta = getPlaylistAddedTime(a);
      const tb = getPlaylistAddedTime(b);
      return ta !== tb ? ta - tb : (a.title || '').localeCompare(b.title || '');
    });
  } else {
    // 'added' (Newest / recent sync first)
    filtered.sort((a, b) => {
      const ta = getPlaylistAddedTime(a);
      const tb = getPlaylistAddedTime(b);
      return tb !== ta ? tb - ta : (a.title || '').localeCompare(b.title || '');
    });
  }

  if (!filtered.length) {
    c.innerHTML = `
      <div class="mu-toolbar" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div class="mu-cnt-lbl" style="margin:0">0 of ${rawPlaylists.length} playlists</div>
          <span style="font-size:11px;background:rgba(var(--ac-rgb),0.12);color:var(--ac);padding:2px 8px;border-radius:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px">for "${esc(q)}" <button onclick="clearMusicSearch()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:13px;padding:0;line-height:1">✕</button></span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          ${renderSortDropdown('playlists')}
          <button onclick="openAddPlaylistModal()" class="nb-btn ac" style="font-size:11px">+ Sync Playlist Link</button>
        </div>
      </div>
      <div class="mu-empty">
        <div class="mu-empty-ico">🔍</div>
        <div class="mu-empty-title">No playlists match "${esc(q)}"</div>
        <div class="mu-empty-sub">Try searching by a different playlist title or keyword</div>
        <button onclick="clearMusicSearch()" class="nb-btn ac" style="margin:14px auto 0">Clear Search</button>
      </div>`;
    return;
  }

  const cardHtmls = [];
  const cards = filtered.map((pl) => {
    const songCount = MDATA.filter(s => (s.playlist_id || s.playlistId) === pl.id && !s.removedFromPlaylist).length;
    const intervalText = pl.sync_interval_days === 1 ? 'Every 1 day'
      : pl.sync_interval_days === 7 ? 'Every 1 week'
      : pl.sync_interval_days > 0 ? `Every ${pl.sync_interval_days} days`
      : 'Manual';

    const lastSyncDate = pl.last_synced_at ? new Date(pl.last_synced_at * 1000).toLocaleDateString() : 'Never';
    const plUrl = pl.playlist_url || `https://www.youtube.com/playlist?list=${pl.id}`;

    const cardHtml = `<div class="mu-pl-card m-card-lazy" onclick="filterMusicByPlaylist('${pl.id}')" style="cursor:pointer" title="Click to view songs in this playlist">
      ${pl.thumbnail?`<img src="${esc(pl.thumbnail)}" class="mu-pl-thumb" onerror="this.style.display='none'">`:'<div class="mu-pl-thumb-ph">🎵</div>'}
      <div class="mu-pl-info">
        <div class="mu-pl-title">${esc(pl.title)}</div>
        <div class="mu-pl-meta">${pl.item_count || pl.itemCount || 0} videos · ${songCount} synced</div>
        <div style="margin-top:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(96,165,250,0.15);color:#60a5fa;border:1px solid rgba(96,165,250,0.3);font-weight:600">⏱ ${intervalText}</span>
          <span style="font-size:10px;color:var(--mu)">Last synced: ${lastSyncDate}</span>
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center" onclick="event.stopPropagation()">
        <button onclick="event.stopPropagation();filterMusicByPlaylist('${pl.id}')" class="nb-btn" style="font-size:11px;padding:6px 12px;color:var(--tx)" title="View songs in this playlist">
          View Songs →
        </button>
        <button onclick="event.stopPropagation();syncSinglePlaylist('${esc(plUrl).replace(/'/g, "\\'")}', ${pl.sync_interval_days || 7})" class="mu-sync-toggle synced" title="Re-sync this playlist now">
          🔄 Sync Now
        </button>
      </div>
    </div>`;
    cardHtmls.push(cardHtml);
    return _cardSlot(cardHtml, pl.id);
  }).join('');

  c.innerHTML = `
    <div class="mu-toolbar" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <div class="mu-cnt-lbl" style="margin:0">${q ? `Showing ${filtered.length} of ${rawPlaylists.length} playlists` : `${rawPlaylists.length} playlist${rawPlaylists.length!==1?'s':''} synced`}</div>
        ${q ? `<span style="font-size:11px;background:rgba(var(--ac-rgb),0.12);color:var(--ac);padding:2px 8px;border-radius:12px;font-weight:600;display:inline-flex;align-items:center;gap:5px">for "${esc(q)}" <button onclick="clearMusicSearch()" style="background:none;border:none;color:inherit;cursor:pointer;font-size:13px;padding:0;line-height:1">✕</button></span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        ${renderSortDropdown('playlists')}
        <button onclick="openAddPlaylistModal()" class="nb-btn ac" style="font-size:11px">+ Sync Playlist Link</button>
      </div>
    </div>
    ${cards}`;
  _hydrateSlots(c, cardHtmls);
  _observeCardVisibility(c);
}

// ── ADD MANUAL SONG ──
function openAddSong() {
  document.getElementById('rpanel').classList.add('open');
  document.getElementById('poverlay').classList.add('show');
  document.getElementById('content').classList.add('pushed');
  document.getElementById('panel-inner').innerHTML = `
    <div class="ph">
      <div class="ph-title">Add Song Manually</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="form-wrap">
      <div class="fg"><label class="flbl">Song Title *</label><input class="fin" id="ms-title" placeholder="Song title"></div>
      <div class="fg"><label class="flbl">Artist</label><input class="fin" id="ms-artist" placeholder="Artist or Band"></div>
      <div class="fg"><label class="flbl">Album</label><input class="fin" id="ms-album" placeholder="Album name"></div>
      <div class="fg"><label class="flbl">YouTube Video URL or ID</label><input class="fin" id="ms-vid" placeholder="e.g. dQw4w9WgXcQ or full link"></div>
      <div class="fg"><label class="flbl">Lyrics Link (Genius, AZLyrics, etc.)</label><input class="fin" id="ms-lyricslink" placeholder="https://genius.com/..."></div>
      <div class="fg"><label class="flbl">Lyrics (Paste text)</label><textarea class="fta" id="ms-lyrics" rows="5" placeholder="Paste song lyrics here..."></textarea></div>
    </div>
    <div class="panel-actions">
      <button class="btn-cancel" onclick="closePanel()">Cancel</button>
      <button class="btn-save" onclick="saveManualSong()">Save</button>
    </div>`;
}

function saveManualSong() {
  const title = document.getElementById('ms-title')?.value?.trim();
  if (!title) { showAlert('Please enter a song title', { title: 'Missing Title' }); return; }
  const vid = document.getElementById('ms-vid')?.value?.trim().replace(/.*v=|.*youtu\.be\//,'').split('&')[0] || null;
  const song = {
    id: uid(), title,
    artist:     document.getElementById('ms-artist')?.value?.trim() || null,
    album:      document.getElementById('ms-album')?.value?.trim() || null,
    lyricsLink: document.getElementById('ms-lyricslink')?.value?.trim() || null,
    lyrics:     document.getElementById('ms-lyrics')?.value?.trim() || null,
    videoId: vid, youtube_id: vid, thumbnail: vid ? `https://img.youtube.com/vi/${vid}/mqdefault.jpg` : '',
    duration: null, playlistId: null, manual: true,
    addedAt: Date.now(), updatedAt: Date.now(),
  };
  MDATA.unshift(song); saveMusic(MDATA);
  if (typeof addLog === 'function') addLog('music', 'Added', song.title, song.artist || null);
  closePanel(); renderMusicBody(); toast('✓ Song added');
}

// ── EDIT SONG ──
function openEditSong(id) {
  const s = MDATA.find(x => x.id === id); if (!s) return;
  const ytId = s.youtube_id || s.videoId;
  const thumb = s.thumbnail || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : '');

  document.getElementById('rpanel').classList.add('open');
  document.getElementById('poverlay').classList.add('show');
  document.getElementById('content').classList.add('pushed');
  document.getElementById('panel-inner').innerHTML = `
    <div class="ph">
      <div class="ph-title">Edit Song</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    ${thumb?`<div class="mu-det-hero" style="margin-bottom:-10px"><img src="${esc(thumb)}" class="mu-det-hero-img" onerror="this.parentElement.style.display='none'"><div class="mu-det-hero-overlay"></div></div>`:''}
    <div class="form-wrap">
      <div class="fg"><label class="flbl">Title *</label><input class="fin" id="me-title" value="${esc(s.title||'')}"></div>
      <div class="fg"><label class="flbl">Artist</label><input class="fin" id="me-artist" value="${esc(s.artist||'')}"></div>
      <div class="fg"><label class="flbl">Album</label><input class="fin" id="me-album" value="${esc(s.album||'')}"></div>
      ${ytId?`<div class="fg"><label class="flbl">YouTube Video</label><div style="font-size:12px;color:var(--tx2);padding:8px 0"><a href="https://youtu.be/${ytId}" target="_blank" style="color:var(--ac)">youtu.be/${ytId} ↗</a> <span style="color:var(--mu);font-size:10px">(synced)</span></div></div>`:''}
      <div class="mu-edit-divider"></div>
      <div class="fg"><label class="flbl">Lyrics Link</label><input class="fin" id="me-lyricslink" value="${esc(s.lyricsLink||'')}" placeholder="https://genius.com/..."></div>
      <div class="fg"><label class="flbl">Lyrics</label><textarea class="fin mu-lyrics-input" id="me-lyrics" placeholder="Paste song lyrics here..." rows="8">${esc(s.lyrics||'')}</textarea></div>
    </div>
    <div class="panel-actions">
      <button class="btn-del" onclick="delSong('${s.id}')">Remove</button>
      <button class="btn-cancel" onclick="closePanel()">Cancel</button>
      <button class="btn-save" onclick="saveEditSong('${s.id}')">Save Changes</button>
    </div>`;
}

function saveEditSong(id) {
  const s = MDATA.find(x => x.id === id); if (!s) return;
  const title = document.getElementById('me-title')?.value?.trim();
  if (!title) { showAlert('Please enter a song title', { title: 'Missing Title' }); return; }

  s.title      = title;
  s.artist     = document.getElementById('me-artist')?.value?.trim() || null;
  s.album      = document.getElementById('me-album')?.value?.trim() || null;
  s.lyricsLink = document.getElementById('me-lyricslink')?.value?.trim() || null;
  s.lyrics     = document.getElementById('me-lyrics')?.value?.trim() || null;
  s.updatedAt  = Date.now();

  saveMusic(MDATA);
  if (typeof addLog === 'function') addLog('music', 'Edited', s.title, s.artist || null);
  closePanel();
  renderMusicBody();
  toast('✓ Song updated');
}

// ── DASHBOARD ──
function renderMusicDash(c) {
  const songs = MDATA.filter(s => !s.removedFromPlaylist);
  const totalSecs = songs.reduce((a, s) => a + (s.duration_sec || s.duration || 0), 0);
  const artists = new Set(songs.map(s => s.artist).filter(Boolean)).size;
  const syncedPl = MPLAYLISTS.filter(p => p.synced || p.playlist_url).length;

  const artistCounts = {};
  songs.forEach(s => { if (s.artist) artistCounts[s.artist] = (artistCounts[s.artist]||0)+1; });
  const topArtists = Object.entries(artistCounts).sort((a,b) => b[1]-a[1]).slice(0,8);
  const maxCount = topArtists[0]?.[1] || 1;

  c.innerHTML = `
    <div style="font-family:var(--fd);font-size:18px;font-weight:800;margin-bottom:20px;color:var(--ac);text-shadow:0 0 15px rgba(var(--ac-rgb),0.3);letter-spacing:0.5px">♪ Music Dashboard</div>
    <div class="mu-dash-grid">
      <div class="mu-dash-stat" style="animation-delay:0s"><div class="mu-dash-stat-v">${songs.length}</div><div class="mu-dash-stat-l">Songs</div></div>
      <div class="mu-dash-stat" style="animation-delay:0.08s"><div class="mu-dash-stat-v">${artists}</div><div class="mu-dash-stat-l">Artists</div></div>
      <div class="mu-dash-stat" style="animation-delay:0.16s"><div class="mu-dash-stat-v">${syncedPl}</div><div class="mu-dash-stat-l">Playlists</div></div>
      <div class="mu-dash-stat" style="animation-delay:0.24s"><div class="mu-dash-stat-v">${fmtTotalDuration(totalSecs)||'—'}</div><div class="mu-dash-stat-l">Total Time</div></div>
    </div>
    ${topArtists.length ? `
    <div class="mu-artists-card">
      <div class="mu-artists-title">Top Artists</div>
      ${topArtists.map(([artist, count], i) => `
        <div class="mu-artist-row">
          <span class="mu-artist-rank${i<3?' top':''}">${i+1}</span>
          <span class="mu-artist-name">${esc(artist)}</span>
          <div class="mu-artist-bar-wrap"><div class="mu-artist-bar" style="width:${Math.round(count/maxCount*100)}%"></div></div>
          <span class="mu-artist-cnt">${count}</span>
        </div>`).join('')}
    </div>` : ''}`;
}

// ── Register all music functions as globals ──
Object.assign(window, {
  renderMusic, renderMusicBody, setMusicPage,
  saveMusic, savePlaylists,
  handleMusicSync, openAddPlaylistModal, submitAddPlaylistSync, syncSinglePlaylist, syncDuePlaylists,
  renderMusicLibrary, songRowHtml, fmtTotalDuration,
  openSongDetail, delSong,
  renderMusicPlaylists,
  openAddSong, saveManualSong,
  openEditSong, saveEditSong,
  renderMusicDash, updateMusicSyncBtn,
  fmtDuration,
  toggleMusicSortDd, setMusicSort, getSortLabel,
  getMusicSearch, setMusicSearch, clearMusicSearch,
  filterMusicByPlaylist, clearPlaylistFilter,
});
