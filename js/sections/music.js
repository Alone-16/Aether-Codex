// ═══════════════════════════════════════════════════════
//  MUSIC DATA & STATE
// ═══════════════════════════════════════════════════════
const MUSIC_KEY     = 'ac_v4_music';
const MUSIC_PL_KEY  = 'ac_v4_music_playlists';
const YT_SCOPE      = 'https://www.googleapis.com/auth/youtube.readonly';

function loadMusic()      { return ls.get(MUSIC_KEY) || []; }
function saveMusic(d) { MDATA = d; window.MDATA = d; ls.set(MUSIC_KEY, d); ls.setStr(K.SAVED, String(Date.now())); window.scheduleDriveSync('music'); }
function loadPlaylists()  { return ls.get(MUSIC_PL_KEY) || []; }
function savePlaylists(p) { MPLAYLISTS = p; window.MPLAYLISTS = p; ls.set(MUSIC_PL_KEY, p); }

let MDATA      = loadMusic();
window.MDATA = MDATA;
let MPLAYLISTS = loadPlaylists();
window.MPLAYLISTS = MPLAYLISTS;
let MUSIC_PAGE = 'library';
let MSEARCH    = '';
let YT_TOKEN_CLIENT = null;
let YT_READY   = false;
let YT_SYNCING = false;

// ── YT OAuth (shares GIS client, adds youtube scope) ──
function initYTAuth() {
  if (!window.google?.accounts?.oauth2) { setTimeout(initYTAuth, 600); return; }
  YT_TOKEN_CLIENT = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: DRIVE_SCOPE + ' ' + YT_SCOPE,
    callback: async resp => {
      if (resp.error) { toast('YouTube auth failed: ' + resp.error, 'var(--err)'); return; }
      // Store token (reuse drive token storage — same account)
      ls.setStr(K.DTOKEN, resp.access_token);
      ls.setStr(K.DEXP, String(Date.now() + (resp.expires_in - 60) * 1000));
      _updateDriveBtn('syncing');
      await _driveInit();
      await syncYouTubePlaylists();
    }
  });
  YT_READY = true;
  // Auto-sync on open if connected
  if (_isConnected()) syncYouTubePlaylists();
}

// ═══════════════════════════════════════════════════════
//  YOUTUBE SYNC
// ═══════════════════════════════════════════════════════
async function syncYouTubePlaylists() {
  if (YT_SYNCING) return;
  YT_SYNCING = true;
  updateMusicSyncBtn('syncing');

  try {
    const token = _getToken(); if (!token) throw new Error('Not connected');

    // Fetch user's playlists
    const plRes = await fetch(
      'https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50',
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!plRes.ok) throw new Error('Failed to fetch playlists');
    const plData = await plRes.json();
    const playlists = (plData.items || []).map(p => ({
      id:    p.id,
      title: p.snippet.title,
      description: p.snippet.description || '',
      thumbnail: p.snippet.thumbnails?.medium?.url || p.snippet.thumbnails?.default?.url || '',
      itemCount: p.contentDetails.itemCount,
      synced: MPLAYLISTS.find(x => x.id === p.id)?.synced || false,
    }));

    // Merge with existing (keep synced flag)
    MPLAYLISTS = playlists.map(p => {
      const existing = MPLAYLISTS.find(x => x.id === p.id);
      return { ...p, synced: existing?.synced || false };
    });
    savePlaylists(MPLAYLISTS);

    // Auto-sync playlists that were previously synced
    const toSync = MPLAYLISTS.filter(p => p.synced);
    for (const pl of toSync) {
      await syncPlaylistSongs(pl.id, token);
    }

    updateMusicSyncBtn('synced');
    if (CURRENT === 'music') renderMusicBody();
  } catch(e) {
    updateMusicSyncBtn('error');
    if (e.message !== 'Not connected') toast('YouTube sync failed: ' + e.message, 'var(--err)');
  } finally {
    YT_SYNCING = false;
  }
}

async function syncPlaylistSongs(playlistId, token) {
  const allItems = [];
  let pageToken = '';
  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50${pageToken ? '&pageToken=' + pageToken : ''}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) break;
    const data = await res.json();
    allItems.push(...(data.items || []));
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  // Get video details for duration
  const videoIds = allItems.map(i => i.contentDetails?.videoId).filter(Boolean);
  const durations = {};
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50).join(',');
    const vRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${chunk}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (vRes.ok) {
      const vData = await vRes.json();
      (vData.items || []).forEach(v => {
        durations[v.id] = {
          duration: parseISO8601Duration(v.contentDetails?.duration || ''),
          artist: extractArtist(v.snippet?.title || '', v.snippet?.channelTitle || ''),
          thumbnail: v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || '',
        };
      });
    }
  }

  // Build song list from playlist
  const ytSongIds = new Set();
  const newSongs = allItems.map(item => {
    const vid = item.contentDetails?.videoId;
    if (!vid) return null;
    ytSongIds.add('yt_' + vid);
    const existing = MDATA.find(s => s.id === 'yt_' + vid);
    if (existing) return existing; // Keep existing entry

    const title = item.snippet?.title || 'Unknown';
    const det = durations[vid] || {};
    return {
      id:          'yt_' + vid,
      title:       title,
      artist:      det.artist || item.snippet?.videoOwnerChannelTitle || 'Unknown Artist',
      album:       null,
      duration:    det.duration || null,
      thumbnail:   det.thumbnail || item.snippet?.thumbnails?.medium?.url || '',
      playlistId:  playlistId,
      videoId:     vid,
      addedAt:     new Date(item.snippet?.publishedAt || Date.now()).getTime(),
      updatedAt:   Date.now(),
      manual:      false,
    };
  }).filter(Boolean);

  // Detect removed songs → move to trash concept (mark as removed)
  const existingInPlaylist = MDATA.filter(s => s.playlistId === playlistId);
  existingInPlaylist.forEach(s => {
    if (!ytSongIds.has(s.id)) {
      s.removedFromPlaylist = true;
      s.updatedAt = Date.now();
    }
  });

  // Merge
  const otherSongs = MDATA.filter(s => s.playlistId !== playlistId);
  MDATA = [...otherSongs, ...newSongs];
  saveMusic(MDATA);

  // Update playlist synced status
  const pl = MPLAYLISTS.find(p => p.id === playlistId);
  if (pl) { pl.synced = true; pl.lastSync = Date.now(); savePlaylists(MPLAYLISTS); }
}

function parseISO8601Duration(dur) {
  if (!dur) return null;
  const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = parseInt(m[1]||0), min = parseInt(m[2]||0), s = parseInt(m[3]||0);
  return h*3600 + min*60 + s;
}

function fmtDuration(secs) {
  if (!secs) return '—';
  const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function extractArtist(title, channelTitle) {
  // Try "Artist - Title" pattern
  const dash = title.match(/^(.+?)\s*[-–]\s*/);
  if (dash) return dash[1].trim();
  return channelTitle.replace(/ - Topic$/, '').trim();
}

function updateMusicSyncBtn(state) {
  const btn = document.getElementById('music-sync-btn'); if (!btn) return;
  const map = {
    syncing: ['<span class="mu-sync-spinning">↻</span> Syncing', 'var(--ac)'],
    synced:  ['✓ Synced',  '#4ade80'],
    error:   ['✗ Sync',    '#fb7185'],
    idle:    ['⟳ Sync YT', 'var(--ac)'],
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
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div class="sub-tabs">
        ${tabs.map((t,i) => `<button class="stab${MUSIC_PAGE===['library','playlists','dashboard'][i]?' active':''}" onclick="setMusicPage('${['library','playlists','dashboard'][i]}')">${t}</button>`).join('')}
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button id="music-sync-btn" onclick="handleMusicSync()" class="nb-btn" style="color:var(--ac)">⟳ Sync YT</button>
        <button onclick="openAddSong()" class="nb-btn ac">+ Add Song</button>
      </div>
    </div>
    <div id="music-body"></div>`;
  renderMusicBody();
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
  if (!_isConnected()) {
    if (!YT_READY) { toast('Google API loading...', 'var(--ch)'); return; }
    YT_TOKEN_CLIENT.requestAccessToken();
  } else {
    syncYouTubePlaylists();
  }
}

// ── LIBRARY ──
function renderMusicLibrary(c) {
  const songs = MSEARCH
    ? MDATA.filter(s => !s.removedFromPlaylist && (s.title.toLowerCase().includes(MSEARCH) || (s.artist||'').toLowerCase().includes(MSEARCH)))
    : MDATA.filter(s => !s.removedFromPlaylist);

  if (!songs.length) {
    c.innerHTML = `<div class="mu-empty"><div class="mu-empty-ico">♪</div><div class="mu-empty-title">No songs yet</div><div class="mu-empty-sub">Sync a YouTube playlist or add songs manually to get started</div></div>`;
    return;
  }

  const totalSecs = songs.reduce((a, s) => a + (s.duration || 0), 0);
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
  return `<div class="mu-row m-card-lazy" onclick="openSongDetail('${s.id}')">
    <div class="mu-row-bar" style="background:var(--ac)"></div>
    ${s.thumbnail ? `<img src="${esc(s.thumbnail)}" class="mu-thumb" onerror="this.style.display='none'">` : '<div class="mu-thumb-ph">♪</div>'}
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
      <span class="mu-dur">${fmtDuration(s.duration)}</span>
      <div style="display:flex;gap:6px" onclick="event.stopPropagation()">
        ${s.videoId?`<button class="mu-act-btn mu-act-play" onclick="window.open('https://youtu.be/${s.videoId}','_blank')" title="Open on YouTube">▶</button>`:''}
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
    ${s.thumbnail?`<div class="mu-det-hero"><img src="${esc(s.thumbnail)}" class="mu-det-hero-img" onerror="this.parentElement.style.display='none'"><div class="mu-det-hero-overlay"></div></div>`:''}
    <div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px;font-size:13px">
      ${s.artist?`<div><span class="flbl">Artist</span><span style="color:var(--tx);font-size:14px;font-weight:600">${esc(s.artist)}</span></div>`:''}
      ${s.album?`<div><span class="flbl">Album</span><span style="color:var(--tx);font-size:14px;font-weight:600">${esc(s.album)}</span></div>`:''}
      ${s.duration?`<div><span class="flbl">Duration</span><span style="color:var(--tx);font-size:14px;font-weight:600">${fmtDuration(s.duration)}</span></div>`:''}
      ${s.videoId?`<div><span class="flbl">YouTube</span>
        <a href="https://youtu.be/${s.videoId}" target="_blank" style="color:var(--ac);font-weight:600;font-size:14px;transition:opacity .2s" onmouseover="this.style.opacity='.8'" onmouseout="this.style.opacity='1'">Open on YouTube ↗</a></div>`:''}
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
    c.innerHTML = `<div class="mu-empty"><div class="mu-empty-ico">♪</div><div class="mu-empty-title">No YouTube playlists found</div><div class="mu-empty-sub">Connect your YouTube account to sync playlists</div><button onclick="handleMusicSync()" class="nb-btn ac" style="margin:12px auto 0">Connect YouTube →</button></div>`;
    return;
  }

  const cardHtmls = [];
  const cards = MPLAYLISTS.map((pl,i) => {
    const songCount = MDATA.filter(s => s.playlistId === pl.id && !s.removedFromPlaylist).length;
    const isSynced = pl.synced;
    const cardHtml = `<div class="mu-pl-card m-card-lazy">
      ${pl.thumbnail?`<img src="${esc(pl.thumbnail)}" class="mu-pl-thumb" onerror="this.style.display='none'">`:'<div class="mu-pl-thumb-ph">♪</div>'}
      <div class="mu-pl-info">
        <div class="mu-pl-title">${esc(pl.title)}</div>
        <div class="mu-pl-meta">${pl.itemCount} videos${isSynced?' · '+songCount+' synced':''}</div>
        ${pl.lastSync?`<div class="mu-pl-sync-date">Last synced: ${new Date(pl.lastSync).toLocaleDateString()}</div>`:''}
      </div>
      <button onclick="togglePlaylistSync('${pl.id}')" class="mu-sync-toggle ${isSynced?'synced':'unsynced'}">
        ${isSynced?'✓ Synced':'+ Sync'}
      </button>
    </div>`;
    cardHtmls.push(cardHtml);
    return _cardSlot(cardHtml, pl.id);
  }).join('');

  c.innerHTML = `<div class="mu-cnt-lbl">${MPLAYLISTS.length} playlist${MPLAYLISTS.length!==1?'s':''} found</div>${cards}`;
  _hydrateSlots(c, cardHtmls);
  _observeCardVisibility(c);
}

async function togglePlaylistSync(id) {
  const pl = MPLAYLISTS.find(p => p.id === id); if (!pl) return;
  if (pl.synced) {
    showConfirm(`Stop syncing "${pl.title}"? Songs already added will remain.`, async () => {
      pl.synced = false; savePlaylists(MPLAYLISTS);
      renderMusicBody();
    }, { title: 'Unsync Playlist?', okLabel: 'Unsync', danger: false });
  } else {
    pl.synced = true; savePlaylists(MPLAYLISTS);
    toast('Syncing playlist...', 'var(--ac)');
    const token = _getToken();
    if (token) {
      await syncPlaylistSongs(id, token);
      renderMusicBody();
      toast(`✓ Playlist synced`, 'var(--cd)');
    } else {
      toast('Connect YouTube first', 'var(--err)');
      pl.synced = false; savePlaylists(MPLAYLISTS);
    }
  }
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
    videoId: vid, thumbnail: vid ? `https://img.youtube.com/vi/${vid}/mqdefault.jpg` : '',
    duration: null, playlistId: null, manual: true,
    addedAt: Date.now(), updatedAt: Date.now(),
  };
  MDATA.unshift(song); saveMusic(MDATA);
  closePanel(); renderMusicBody(); toast('✓ Song added');
}

// ── EDIT SONG ──
function openEditSong(id) {
  const s = MDATA.find(x => x.id === id); if (!s) return;
  document.getElementById('rpanel').classList.add('open');
  document.getElementById('poverlay').classList.add('show');
  document.getElementById('content').classList.add('pushed');
  document.getElementById('panel-inner').innerHTML = `
    <div class="ph">
      <div class="ph-title">Edit Song</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    ${s.thumbnail?`<div class="mu-det-hero" style="margin-bottom:-10px"><img src="${esc(s.thumbnail)}" class="mu-det-hero-img" onerror="this.parentElement.style.display='none'"><div class="mu-det-hero-overlay"></div></div>`:''}
    <div class="form-wrap">
      <div class="fg"><label class="flbl">Title *</label><input class="fin" id="me-title" value="${esc(s.title||'')}"></div>
      <div class="fg"><label class="flbl">Artist</label><input class="fin" id="me-artist" value="${esc(s.artist||'')}"></div>
      <div class="fg"><label class="flbl">Album</label><input class="fin" id="me-album" value="${esc(s.album||'')}"></div>
      ${s.videoId?`<div class="fg"><label class="flbl">YouTube Video</label><div style="font-size:12px;color:var(--tx2);padding:8px 0"><a href="https://youtu.be/${s.videoId}" target="_blank" style="color:var(--ac)">youtu.be/${s.videoId} ↗</a> <span style="color:var(--mu);font-size:10px">(synced)</span></div></div>`:''}
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
  const totalSecs = songs.reduce((a, s) => a + (s.duration || 0), 0);
  const artists = new Set(songs.map(s => s.artist).filter(Boolean)).size;
  const syncedPl = MPLAYLISTS.filter(p => p.synced).length;
  const manualCount = songs.filter(s => s.manual).length;

  // Top artists
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
  handleMusicSync, syncYouTubePlaylists,
  renderMusicLibrary, songRowHtml, fmtTotalDuration,
  openSongDetail, delSong,
  renderMusicPlaylists, togglePlaylistSync,
  openAddSong, saveManualSong,
  openEditSong, saveEditSong,
  renderMusicDash,
  initYTAuth, updateMusicSyncBtn,
  parseISO8601Duration, fmtDuration, extractArtist,
});
