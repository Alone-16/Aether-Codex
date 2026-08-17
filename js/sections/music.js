// ═══════════════════════════════════════════════════════
//  MUSIC DATA & STATE — YouTube Music Link Sync via Cloudflare Worker
// ═══════════════════════════════════════════════════════
const MUSIC_KEY     = 'ac_v4_music';
const MUSIC_PL_KEY  = 'ac_v4_music_playlists';

function loadMusic()      { return window.MDATA || []; }
function saveMusic(d)     { MDATA = d; window.MDATA = d; }
function loadPlaylists()  { return window.MPLAYLISTS || []; }
function savePlaylists(p) { MPLAYLISTS = p; window.MPLAYLISTS = p; if (window.musicApi?.putPlaylists) window.musicApi.putPlaylists(p).catch(() => {}); }

let MDATA      = loadMusic();
window.MDATA = MDATA;
let MPLAYLISTS = loadPlaylists();
window.MPLAYLISTS = MPLAYLISTS;

export function setMDATA(d) {
  MDATA = Array.isArray(d) ? d : [];
  window.MDATA = MDATA;
}
export function setMPLAYLISTS(p) {
  MPLAYLISTS = Array.isArray(p) ? p : [];
  window.MPLAYLISTS = MPLAYLISTS;
}
window.setMDATA = setMDATA;
window.setMPLAYLISTS = setMPLAYLISTS;

let MUSIC_PAGE = 'library';
let MSEARCH    = '';
let YT_SYNCING = false;

// ═══════════════════════════════════════════════════════
//  YOUTUBE PLAYLIST LINK SYNC (SERVER API)
// ═══════════════════════════════════════════════════════

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
  const interval = parseInt(intervalInput?.value || '7', 10);

  if (!url) {
    showAlert('Please enter a YouTube playlist link or ID.', { title: 'Missing Playlist Link' });
    return;
  }

  try {
    YT_SYNCING = true;
    updateMusicSyncBtn('syncing');
    toast('Fetching YouTube playlist & tracks...', 'var(--ac)');

    const res = await window.musicApi.syncPlaylist(url, interval);
    if (res) {
      if (res.tracks) setMDATA(res.tracks);
      if (res.playlists) setMPLAYLISTS(res.playlists);
      closePanel();
      toast(`✓ Synced ${res.tracksCount || 0} tracks from playlist!`, '#4ade80');
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
    const res = await window.musicApi.syncPlaylist(playlistUrl, syncIntervalDays);
    if (res) {
      if (res.tracks) setMDATA(res.tracks);
      if (res.playlists) setMPLAYLISTS(res.playlists);
      toast(`✓ Re-synced playlist`, '#4ade80');
      renderMusicBody();
    }
  } catch (e) {
    toast('Sync failed: ' + e.message, '#fb7185');
  } finally {
    YT_SYNCING = false;
    updateMusicSyncBtn('idle');
  }
}

export async function syncDuePlaylists() {
  try {
    const res = await window.musicApi.syncDuePlaylists();
    if (res && res.syncedCount > 0) {
      if (res.tracks) setMDATA(res.tracks);
      if (res.playlists) setMPLAYLISTS(res.playlists);
      toast(`✓ Auto-synced ${res.syncedCount} playlist(s)`, '#4ade80');
      renderMusicBody();
    }
  } catch (e) {}
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
    syncing: ['<span class="mu-sync-spinning">↻</span> Syncing', 'var(--ac)'],
    synced:  ['✓ Synced',  '#4ade80'],
    error:   ['✗ Sync',    '#fb7185'],
    idle:    ['⟳ Sync Link', 'var(--ac)'],
  };
  const [label, color] = map[state] || map.idle;
  btn.innerHTML = label; btn.style.color = color;
}

// ═══════════════════════════════════════════════════════
//  MUSIC RENDER
// ═══════════════════════════════════════════════════════
function renderMusic(c) {
  const tabs = ['Library', 'Playlists', 'Dashboard'];
  c.innerHTML = `
    <style>
      .m-card-slot { width: 100%; position: relative; contain: layout style; }
      .mu-row.m-card-lazy, .mu-pl-card.m-card-lazy { opacity: 0; transform: translateY(20px) scale(0.96); animation: none; }
      .mu-row.m-card-lazy.m-card-visible, .mu-pl-card.m-card-lazy.m-card-visible {
        animation: mu-cardEnter 0.5s cubic-bezier(0.16,1,0.3,1) both;
      }
    </style>
    <div class="sec-top-bar">
      <div class="sec-top-start">
        <div class="sub-tabs">
          ${tabs.map((t,i) => `<button class="stab${MUSIC_PAGE===['library','playlists','dashboard'][i]?' active':''}" onclick="setMusicPage('${['library','playlists','dashboard'][i]}')">${t}</button>`).join('')}
        </div>
      </div>
      <div class="sec-actions">
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
  document.getElementById('srch').value = '';
  MSEARCH = '';
  renderMusicBody();
}

function renderMusicBody() {
  const el = document.getElementById('music-body'); if (!el) return;
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
  const songs = MSEARCH
    ? MDATA.filter(s => !s.removedFromPlaylist && (s.title.toLowerCase().includes(MSEARCH) || (s.artist||'').toLowerCase().includes(MSEARCH)))
    : MDATA.filter(s => !s.removedFromPlaylist);

  if (!songs.length) {
    c.innerHTML = `
      <div class="mu-empty">
        <div class="mu-empty-ico">♪</div>
        <div class="mu-empty-title">No songs in library</div>
        <div class="mu-empty-sub">Sync a YouTube / YT Music playlist link or add songs manually</div>
        <div style="display:flex;gap:10px;justify-content:center;margin-top:14px">
          <button onclick="openAddPlaylistModal()" class="nb-btn ac">+ Sync Playlist Link</button>
          <button onclick="openAddSong()" class="nb-btn">+ Add Song</button>
        </div>
      </div>`;
    return;
  }

  const totalSecs = songs.reduce((a, s) => a + (s.duration_sec || s.duration || 0), 0);
  const cardHtmls = [];
  const rows = songs.map((s, i) => {
    const html = songRowHtml(s, i);
    cardHtmls.push(html);
    return _cardSlot(html, s.id);
  }).join('');

  c.innerHTML = `
    <div class="mu-cnt-lbl">${songs.length} song${songs.length!==1?'s':''} · ${fmtTotalDuration(totalSecs)}</div>
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

  return `<div class="mu-row m-card-lazy" onclick="openSongDetail('${s.id}')">
    <div class="mu-row-bar" style="background:var(--ac)"></div>
    ${thumb ? `<img src="${esc(thumb)}" class="mu-thumb" onerror="this.style.display='none'">` : '<div class="mu-thumb-ph">♪</div>'}
    <div class="mu-info">
      <div class="mu-title">${esc(s.title)}</div>
      <div class="mu-meta">
        <span class="mu-artist">${esc(s.artist||'Unknown')}</span>
        ${s.album?`<span class="mu-album">${esc(s.album)}</span>`:''}
        ${hasLyrics?'<span class="mu-lyrics-badge">♫ Lyrics</span>':''}
      </div>
    </div>
    <div class="mu-right">
      <div class="mu-eq"><span></span><span></span><span></span></div>
      <span class="mu-dur">${fmtDuration(duration)}</span>
      <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
        ${ytId?`<button class="mu-act-btn mu-act-play" onclick="window.open('https://youtu.be/${ytId}','_blank')" title="Open on YouTube">▶</button>`:''}
        <button class="mu-act-btn mu-act-edit" onclick="openEditSong('${s.id}')" title="Edit">✎</button>
        <button class="mu-act-btn mu-act-del" onclick="delSong('${s.id}')">✕</button>
      </div>
    </div>
  </div>`;
}

function fmtTotalDuration(secs) {
  if (!secs) return '';
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function openSongDetail(id) {
  const s = MDATA.find(x => x.id === id); if (!s) return;
  const ytId = s.youtube_id || s.videoId;
  const thumb = s.thumbnail || (ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : '');
  const duration = s.duration_sec || s.duration;

  document.getElementById('rpanel').classList.add('open');
  document.getElementById('poverlay').classList.add('show');
  document.getElementById('content').classList.add('pushed');

  const lyricsSection = s.lyrics ? `
    <div class="mu-lyrics-section">
      <div class="mu-lyrics-header" onclick="document.getElementById('mu-lyrics-body').classList.toggle('collapsed');this.querySelector('.mu-lyrics-arrow').classList.toggle('open')">
        <span class="flbl" style="margin:0;cursor:pointer">♫ Lyrics</span>
        <span class="mu-lyrics-arrow open">▾</span>
      </div>
      <div id="mu-lyrics-body" class="mu-lyrics-body">
        <pre class="mu-lyrics-text">${esc(s.lyrics)}</pre>
      </div>
    </div>` : '';

  document.getElementById('panel-inner').innerHTML = `
    <div class="ph">
      <div>
        <div class="ph-title">${esc(s.title)}</div>
        <div class="pbadges" style="margin-top:4px">
          <span style="font-size:12px;color:var(--tx2)">${esc(s.artist||'Unknown Artist')}</span>
        </div>
      </div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    ${thumb?`<div class="mu-det-hero"><img src="${esc(thumb)}" class="mu-det-hero-img" onerror="this.parentElement.style.display='none'"><div class="mu-det-hero-overlay"></div></div>`:''}
    <div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px;font-size:13px">
      ${s.artist?`<div><span class="flbl">Artist</span><span style="color:var(--tx);font-size:14px;font-weight:600">${esc(s.artist)}</span></div>`:''}
      ${s.album?`<div><span class="flbl">Album</span><span style="color:var(--tx);font-size:14px;font-weight:600">${esc(s.album)}</span></div>`:''}
      ${duration?`<div><span class="flbl">Duration</span><span style="color:var(--tx);font-size:14px;font-weight:600">${fmtDuration(duration)}</span></div>`:''}
      ${ytId?`<div><span class="flbl">YouTube</span>
        <a href="https://youtu.be/${ytId}" target="_blank" style="color:var(--ac);font-weight:600;font-size:14px;transition:opacity .2s" onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">Open on YouTube ↗</a></div>`:''}
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
    if(_mdel) addLog('music','Removed',_mdel.title,_mdel.artist||null);
    saveMusic(MDATA);
    closePanel();
    renderMusicBody();
    if(_mdel) toastWithUndo(_mdel.title,()=>{MDATA.push(_mdel);saveMusic(MDATA);renderMusicBody();});
  }, { title: 'Remove Song?', okLabel: 'Remove' });
}

// ── PLAYLISTS ──
function renderMusicPlaylists(c) {
  if (!MPLAYLISTS.length) {
    c.innerHTML = `
      <div class="mu-empty">
        <div class="mu-empty-ico">♪</div>
        <div class="mu-empty-title">No synced playlists</div>
        <div class="mu-empty-sub">Add any YouTube or YT Music playlist URL to auto-sync tracks on your preferred interval</div>
        <button onclick="openAddPlaylistModal()" class="nb-btn ac" style="margin:14px auto 0">+ Sync Playlist Link</button>
      </div>`;
    return;
  }

  const cardHtmls = [];
  const cards = MPLAYLISTS.map((pl) => {
    const songCount = MDATA.filter(s => (s.playlist_id || s.playlistId) === pl.id && !s.removedFromPlaylist).length;
    const intervalText = pl.sync_interval_days === 1 ? 'Every 1 day'
      : pl.sync_interval_days === 7 ? 'Every 1 week'
      : pl.sync_interval_days > 0 ? `Every ${pl.sync_interval_days} days`
      : 'Manual';

    const lastSyncDate = pl.last_synced_at ? new Date(pl.last_synced_at * 1000).toLocaleDateString() : 'Never';
    const plUrl = pl.playlist_url || `https://www.youtube.com/playlist?list=${pl.id}`;

    const cardHtml = `<div class="mu-pl-card m-card-lazy">
      ${pl.thumbnail?`<img src="${esc(pl.thumbnail)}" class="mu-pl-thumb" onerror="this.style.display='none'">`:'<div class="mu-pl-thumb-ph">♪</div>'}
      <div class="mu-pl-info">
        <div class="mu-pl-title">${esc(pl.title)}</div>
        <div class="mu-pl-meta">${pl.item_count || pl.itemCount || 0} videos · ${songCount} synced</div>
        <div style="margin-top:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:rgba(96,165,250,0.15);color:#60a5fa;border:1px solid rgba(96,165,250,0.3);font-weight:600">⚡ ${intervalText}</span>
          <span style="font-size:10px;color:var(--mu)">Last synced: ${lastSyncDate}</span>
        </div>
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button onclick="syncSinglePlaylist('${esc(plUrl)}', ${pl.sync_interval_days || 7})" class="mu-sync-toggle synced" title="Re-sync this playlist now">
          ↻ Sync Now
        </button>
      </div>
    </div>`;
    cardHtmls.push(cardHtml);
    return _cardSlot(cardHtml, pl.id);
  }).join('');

  c.innerHTML = `
    <div style="display:flex;align-items:center;justify-space-between;margin-bottom:12px">
      <div class="mu-cnt-lbl" style="margin:0">${MPLAYLISTS.length} playlist${MPLAYLISTS.length!==1?'s':''} synced</div>
      <button onclick="openAddPlaylistModal()" class="nb-btn ac" style="font-size:11px">+ Sync Playlist Link</button>
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
      <div class="fg"><label class="flbl">Title *</label><input class="fin" id="ms-title" placeholder="Song title"></div>
      <div class="fg"><label class="flbl">Artist</label><input class="fin" id="ms-artist" placeholder="Artist name"></div>
      <div class="fg"><label class="flbl">Album</label><input class="fin" id="ms-album" placeholder="Album name"></div>
      <div class="fg"><label class="flbl">YouTube Video ID (optional)</label><input class="fin" id="ms-vid" placeholder="e.g. dQw4w9WgXcQ"></div>
      <div class="fg"><label class="flbl">Lyrics Link (optional)</label><input class="fin" id="ms-lyricslink" placeholder="https://genius.com/..."></div>
      <div class="fg"><label class="flbl">Lyrics (optional)</label><textarea class="fin mu-lyrics-input" id="ms-lyrics" placeholder="Paste song lyrics here..." rows="6"></textarea></div>
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
  addLog('music', 'Edited', s.title, s.artist || null);
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

// ── Register all music functions as globals ───────────────────────────────
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
});
