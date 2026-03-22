// MUSIC DATA & STATE
// ═══════════════════════════════════════════════════════
const MUSIC_KEY     = 'ac_v4_music';
const MUSIC_PL_KEY  = 'ac_v4_music_playlists';
const YT_SCOPE      = 'https://www.googleapis.com/auth/youtube.readonly';

function loadMusic()      { return ls.get(MUSIC_KEY) || []; }
function saveMusic(d)     { ls.set(MUSIC_KEY, d); ls.setStr(K.SAVED, String(Date.now())); scheduleDriveSync(); }
function loadPlaylists()  { return ls.get(MUSIC_PL_KEY) || []; }
function savePlaylists(p) { ls.set(MUSIC_PL_KEY, p); }

let MDATA      = loadMusic();
let MPLAYLISTS = loadPlaylists();
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
      if (resp.error) { toast('YouTube auth failed: ' + resp.error, 'var(--cr)'); return; }
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
    if (e.message !== 'Not connected') toast('YouTube sync failed: ' + e.message, 'var(--cr)');
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
    syncing: ['↻ Syncing', '#fb923c'],
    synced:  ['✓ Synced',  '#4ade80'],
    error:   ['✗ Sync',    '#fb7185'],
    idle:    ['⟳ Sync YT', '#fb923c'],
  };
  const [label, color] = map[state] || map.idle;
  btn.textContent = label; btn.style.color = color;
}

// ═══════════════════════════════════════════════════════
//  MUSIC RENDER
// ═══════════════════════════════════════════════════════
function renderMusic(c) {
  const tabs = ['Library', 'Playlists', 'Dashboard'];
  c.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:14px">
      <div class="sub-tabs">
        ${tabs.map((t,i) => `<button class="stab${MUSIC_PAGE===['library','playlists','dashboard'][i]?' active':''}" onclick="setMusicPage('${['library','playlists','dashboard'][i]}')">${t}</button>`).join('')}
      </div>
      <div style="display:flex;gap:6px;align-items:center">
        <button id="music-sync-btn" onclick="handleMusicSync()" class="nb-btn" style="color:#fb923c">⟳ Sync YT</button>
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
    c.innerHTML = `<div class="empty"><div class="empty-ico">♪</div><p>No songs yet — sync a YouTube playlist to get started</p></div>`;
    return;
  }

  // Group by album/artist
  const byArtist = {};
  songs.forEach(s => {
    const key = s.artist || 'Unknown Artist';
    if (!byArtist[key]) byArtist[key] = [];
    byArtist[key].push(s);
  });

  const totalSecs = songs.reduce((a, s) => a + (s.duration || 0), 0);
  c.innerHTML = `
    <div style="font-size:12px;color:var(--mu);margin-bottom:12px">${songs.length} song${songs.length!==1?'s':''} · ${fmtTotalDuration(totalSecs)}</div>
    <div style="display:flex;flex-direction:column;gap:2px">
      ${songs.map(s => songRowHtml(s)).join('')}
    </div>`;
}

function songRowHtml(s) {
  return `<div class="row" style="min-height:52px" onclick="openSongDetail('${s.id}')">
    <div class="row-bar" style="background:var(--ac)"></div>
    ${s.thumbnail ? `<img src="${esc(s.thumbnail)}" style="width:40px;height:40px;object-fit:cover;flex-shrink:0;border-radius:3px;margin:0 6px" onerror="this.style.display='none'">` : '<div style="width:8px"></div>'}
    <div class="row-info">
      <div class="row-title">${esc(s.title)}</div>
      <div class="row-meta">
        <span style="font-size:11px;color:var(--tx2)">${esc(s.artist||'Unknown')}</span>
        ${s.album?`<span style="font-size:10px;color:var(--mu)">· ${esc(s.album)}</span>`:''}
      </div>
    </div>
    <div class="row-r">
      <span style="font-size:11px;color:var(--mu);white-space:nowrap">${fmtDuration(s.duration)}</span>
      <div class="row-btns" onclick="event.stopPropagation()">
        ${s.videoId?`<button class="rbt" onclick="window.open('https://youtu.be/${s.videoId}','_blank')" title="Open on YouTube" style="color:var(--ac)">▶</button>`:''}
        <button class="rbt del" onclick="delSong('${s.id}')">✕</button>
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
    ${s.thumbnail?`<img src="${esc(s.thumbnail)}" style="width:100%;max-height:200px;object-fit:cover" onerror="this.style.display='none'">`:''}
    <div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px;font-size:13px">
      ${s.artist?`<div><span style="color:var(--mu);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:2px">Artist</span><span style="color:var(--tx)">${esc(s.artist)}</span></div>`:''}
      ${s.album?`<div><span style="color:var(--mu);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:2px">Album</span><span style="color:var(--tx)">${esc(s.album)}</span></div>`:''}
      ${s.duration?`<div><span style="color:var(--mu);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:2px">Duration</span><span style="color:var(--tx)">${fmtDuration(s.duration)}</span></div>`:''}
      ${s.videoId?`<div><span style="color:var(--mu);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:2px">YouTube</span>
        <a href="https://youtu.be/${s.videoId}" target="_blank" style="color:var(--ac)">Open on YouTube ↗</a></div>`:''}
    </div>
    <div class="panel-actions">
      <button class="btn-del" onclick="delSong('${s.id}')">Remove</button>
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
      <div style="text-align:center;padding:40px 20px">
        <div style="font-size:32px;opacity:.3;margin-bottom:12px">♪</div>
        <p style="font-size:14px;color:var(--tx2);margin-bottom:16px">No YouTube playlists found</p>
        <button onclick="handleMusicSync()" class="nb-btn ac" style="margin:0 auto">Connect YouTube →</button>
      </div>`;
    return;
  }

  const cards = MPLAYLISTS.map(pl => {
    const songCount = MDATA.filter(s => s.playlistId === pl.id && !s.removedFromPlaylist).length;
    const isSynced = pl.synced;
    return `<div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);padding:14px 16px;display:flex;align-items:center;gap:12px;margin-bottom:8px;transition:border-color .15s" onmouseover="this.style.borderColor='var(--brd2)'" onmouseout="this.style.borderColor='var(--brd)'">
      ${pl.thumbnail?`<img src="${esc(pl.thumbnail)}" style="width:56px;height:56px;object-fit:cover;border-radius:5px;flex-shrink:0" onerror="this.style.display='none'">`:'<div style="width:56px;height:56px;background:var(--surf2);border-radius:5px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:24px">♪</div>'}
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:600;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(pl.title)}</div>
        <div style="font-size:12px;color:var(--tx2);margin-top:2px">${pl.itemCount} videos${isSynced?' · '+songCount+' synced':''}</div>
        ${pl.lastSync?`<div style="font-size:10px;color:var(--mu);margin-top:2px">Last synced: ${new Date(pl.lastSync).toLocaleDateString()}</div>`:''}
      </div>
      <button onclick="togglePlaylistSync('${pl.id}')" style="padding:6px 14px;border-radius:5px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid;white-space:nowrap;
        ${isSynced?'background:rgba(251,146,60,.12);color:#fb923c;border-color:rgba(251,146,60,.3)':'background:var(--surf2);color:var(--tx2);border-color:var(--brd)'}">
        ${isSynced?'✓ Synced':'+ Sync'}
      </button>
    </div>`;
  }).join('');

  c.innerHTML = `
    <div style="font-size:12px;color:var(--mu);margin-bottom:12px">${MPLAYLISTS.length} playlist${MPLAYLISTS.length!==1?'s':''} found</div>
    ${cards}`;
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
      toast('Connect YouTube first', 'var(--cr)');
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
    artist:  document.getElementById('ms-artist')?.value?.trim() || null,
    album:   document.getElementById('ms-album')?.value?.trim() || null,
    videoId: vid, thumbnail: vid ? `https://img.youtube.com/vi/${vid}/mqdefault.jpg` : '',
    duration: null, playlistId: null, manual: true,
    addedAt: Date.now(), updatedAt: Date.now(),
  };
  MDATA.unshift(song); saveMusic(MDATA);
  closePanel(); renderMusicBody(); toast('✓ Song added');
}

// ── DASHBOARD ──
function renderMusicDash(c) {
  const songs = MDATA.filter(s => !s.removedFromPlaylist);
  const totalSecs = songs.reduce((a, s) => a + (s.duration || 0), 0);
  const artists = new Set(songs.map(s => s.artist).filter(Boolean)).size;
  const syncedPl = MPLAYLISTS.filter(p => p.synced).length;

  // Top artists
  const artistCounts = {};
  songs.forEach(s => { if (s.artist) artistCounts[s.artist] = (artistCounts[s.artist]||0)+1; });
  const topArtists = Object.entries(artistCounts).sort((a,b) => b[1]-a[1]).slice(0,8);
  const maxCount = topArtists[0]?.[1] || 1;

  c.innerHTML = `
    <div style="font-family:var(--fd);font-size:18px;font-weight:700;margin-bottom:16px;color:var(--ac)">♪ Music Dashboard</div>
    <div class="dash-grid" style="margin-bottom:20px">
      <div class="dc"><div class="dc-v">${songs.length}</div><div class="dc-l">Songs</div></div>
      <div class="dc"><div class="dc-v">${artists}</div><div class="dc-l">Artists</div></div>
      <div class="dc"><div class="dc-v">${syncedPl}</div><div class="dc-l">Playlists</div></div>
      <div class="dc"><div class="dc-v">${fmtTotalDuration(totalSecs)||'—'}</div><div class="dc-l">Total Time</div></div>
    </div>
    ${topArtists.length ? `
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);padding:16px;max-width:480px">
      <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:var(--mu);margin-bottom:12px">Top Artists</div>
      ${topArtists.map(([artist, count]) => `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--brd)">
          <span style="flex:1;font-size:13px;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(artist)}</span>
          <div style="width:100px;height:4px;background:var(--surf3);border-radius:2px;overflow:hidden;flex-shrink:0">
            <div style="height:100%;width:${Math.round(count/maxCount*100)}%;background:var(--ac);border-radius:2px"></div>
          </div>
          <span style="font-size:12px;font-weight:700;color:var(--tx2);min-width:24px;text-align:right">${count}</span>
        </div>`).join('')}
    </div>` : ''}`;
}




// ═══════════════════════════════════════════════════════
//
