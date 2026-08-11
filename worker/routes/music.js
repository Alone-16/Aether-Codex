// ═══════════════════════════════════════════════════════════════════
//  worker/routes/music.js — RESTful Music & Playlists Controller
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse } from '../utils/response.js';
import { sanitizeString, validateInt } from '../utils/validation.js';

export async function handleMusicRoutes(request, env, ctx, requestId, pathname, claims) {
  const method = request.method;
  const userId = claims.sub;

  // ── GET /v1/music — Fetch tracks & playlists ──
  if (method === 'GET' && pathname === '/v1/music') {
    const { results: tracks } = await env.DB.prepare('SELECT * FROM music WHERE user_id = ? ORDER BY updated_at DESC;').bind(userId).all();
    const { results: playlists } = await env.DB.prepare('SELECT * FROM playlists WHERE user_id = ? ORDER BY updated_at DESC;').bind(userId).all();
    const mappedTracks = (tracks || []).map(t => ({
      ...t,
      durationSec: t.duration_sec,
      youtubeId: t.youtube_id,
      playlistId: t.playlist_id,
      addedAt: t.created_at,
      updatedAt: t.updated_at,
    }));
    return successResponse({ tracks: mappedTracks, playlists: playlists || [] }, requestId);
  }

  // ── POST /v1/music — Create music track ──
  if (method === 'POST' && pathname === '/v1/music') {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const id = body.id || crypto.randomUUID();
    const title = sanitizeString(body.title, 300);
    if (!title) return errorResponse('INVALID_INPUT', 'Track title required', requestId, 400);

    const artist = sanitizeString(body.artist, 200);
    const album = sanitizeString(body.album, 200);
    const duration = validateInt(body.duration_sec || body.durationSec, 0, 0);
    const ytId = sanitizeString(body.youtube_id || body.youtubeId, 100);
    const playlistId = sanitizeString(body.playlist_id || body.playlistId, 100);

    await env.DB.prepare(`
      INSERT INTO music (id, user_id, title, artist, album, duration_sec, youtube_id, playlist_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch());
    `).bind(id, userId, title, artist || null, album || null, duration, ytId || null, playlistId || null).run();

    const item = await env.DB.prepare('SELECT * FROM music WHERE id = ? AND user_id = ?;').bind(id, userId).first();
    return successResponse(item, requestId, 201);
  }

  // ── PATCH /v1/music/:id — Update track ──
  if (method === 'PATCH' && pathname.startsWith('/v1/music/')) {
    const id = pathname.split('/')[3];
    if (!id) return errorResponse('INVALID_INPUT', 'Track ID required', requestId, 400);

    let body = {};
    try { body = await request.json(); } catch (e) {}
    const updates = [];
    const params = [];

    if (body.title !== undefined) { updates.push('title = ?'); params.push(sanitizeString(body.title, 300)); }
    if (body.artist !== undefined) { updates.push('artist = ?'); params.push(sanitizeString(body.artist, 200)); }
    if (body.album !== undefined) { updates.push('album = ?'); params.push(sanitizeString(body.album, 200)); }
    if (body.playlist_id !== undefined || body.playlistId !== undefined) { updates.push('playlist_id = ?'); params.push(sanitizeString(body.playlist_id ?? body.playlistId, 100)); }

    if (updates.length === 0) return errorResponse('INVALID_INPUT', 'No fields to update', requestId, 400);

    updates.push('updated_at = unixepoch()');
    params.push(id, userId);

    const res = await env.DB.prepare(`UPDATE music SET ${updates.join(', ')} WHERE id = ? AND user_id = ?;`).bind(...params).run();
    if (res.meta.changes === 0) return errorResponse('NOT_FOUND', 'Track not found', requestId, 404);

    const updated = await env.DB.prepare('SELECT * FROM music WHERE id = ? AND user_id = ?;').bind(id, userId).first();
    return successResponse(updated, requestId);
  }

  // ── DELETE /v1/music/:id — Delete track ──
  if (method === 'DELETE' && pathname.startsWith('/v1/music/')) {
    const id = pathname.split('/')[3];
    if (!id) return errorResponse('INVALID_INPUT', 'Track ID required', requestId, 400);
    const res = await env.DB.prepare('DELETE FROM music WHERE id = ? AND user_id = ?;').bind(id, userId).run();
    if (res.meta.changes === 0) return errorResponse('NOT_FOUND', 'Track not found', requestId, 404);
    return successResponse({ deleted: true, id }, requestId);
  }

  // ── POST /v1/music/sync-playlist — Sync YouTube Playlist by URL / ID ──
  if (method === 'POST' && pathname === '/v1/music/sync-playlist') {
    let body = {};
    try { body = await request.json(); } catch (e) {}

    const playlistUrl = sanitizeString(body.playlist_url || body.playlistUrl, 500);
    const syncInterval = validateInt(body.sync_interval_days || body.syncIntervalDays, 1, 7);

    if (!playlistUrl) return errorResponse('INVALID_INPUT', 'Playlist URL or ID required', requestId, 400);

    const match = playlistUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/) || playlistUrl.match(/^([a-zA-Z0-9_-]{10,50})$/);
    const playlistId = match ? match[1] : null;

    if (!playlistId) return errorResponse('INVALID_INPUT', 'Could not parse playlist ID from provided link', requestId, 400);

    const apiKey = env.YOUTUBE_API_KEY || env.GOOGLE_API_KEY;
    const plData = await fetchYouTubePlaylistData(playlistId, apiKey);

    // Save/Update playlist in D1
    await env.DB.prepare(`
      INSERT INTO playlists (id, user_id, title, description, thumbnail, item_count, synced, playlist_url, sync_interval_days, last_synced_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, unixepoch(), unixepoch())
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        thumbnail = excluded.thumbnail,
        item_count = excluded.item_count,
        synced = 1,
        playlist_url = excluded.playlist_url,
        sync_interval_days = excluded.sync_interval_days,
        last_synced_at = unixepoch(),
        updated_at = unixepoch();
    `).bind(
      playlistId,
      userId,
      sanitizeString(plData.title, 300),
      sanitizeString(plData.description, 1000) || null,
      sanitizeString(plData.thumbnail, 500) || null,
      plData.itemCount || 0,
      playlistUrl,
      syncInterval
    ).run();

    // Insert/Update tracks for playlist
    for (const t of plData.tracks) {
      await env.DB.prepare(`
        INSERT INTO music (id, user_id, title, artist, album, duration_sec, youtube_id, playlist_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          artist = excluded.artist,
          duration_sec = excluded.duration_sec,
          youtube_id = excluded.youtube_id,
          playlist_id = excluded.playlist_id,
          updated_at = unixepoch();
      `).bind(
        t.id,
        userId,
        sanitizeString(t.title, 300),
        sanitizeString(t.artist, 200) || null,
        t.album || null,
        t.duration_sec || null,
        t.youtube_id || null,
        playlistId
      ).run();
    }

    const { results: tracks } = await env.DB.prepare('SELECT * FROM music WHERE user_id = ? ORDER BY updated_at DESC;').bind(userId).all();
    const { results: playlists } = await env.DB.prepare('SELECT * FROM playlists WHERE user_id = ? ORDER BY updated_at DESC;').bind(userId).all();

    const mappedTracks = (tracks || []).map(t => ({
      ...t,
      durationSec: t.duration_sec,
      youtubeId: t.youtube_id,
      playlistId: t.playlist_id,
      addedAt: t.created_at,
      updatedAt: t.updated_at,
    }));

    return successResponse({
      syncedPlaylistId: playlistId,
      tracksCount: plData.tracks.length,
      tracks: mappedTracks,
      playlists: playlists || [],
    }, requestId);
  }

  // ── POST /v1/music/sync-due — Sync all playlists past sync interval ──
  if (method === 'POST' && pathname === '/v1/music/sync-due') {
    const { results: duePlaylists } = await env.DB.prepare(`
      SELECT * FROM playlists
      WHERE user_id = ? AND synced = 1 AND playlist_url IS NOT NULL
        AND (last_synced_at + (sync_interval_days * 86400)) <= unixepoch();
    `).bind(userId).all();

    const apiKey = env.YOUTUBE_API_KEY || env.GOOGLE_API_KEY;
    let syncedCount = 0;

    for (const pl of duePlaylists || []) {
      const match = pl.playlist_url.match(/[?&]list=([a-zA-Z0-9_-]+)/) || pl.playlist_url.match(/^([a-zA-Z0-9_-]{10,50})$/);
      const playlistId = match ? match[1] : pl.id;
      if (!playlistId) continue;

      const plData = await fetchYouTubePlaylistData(playlistId, apiKey);
      await env.DB.prepare(`
        UPDATE playlists SET
          title = ?, description = ?, thumbnail = ?, item_count = ?, last_synced_at = unixepoch(), updated_at = unixepoch()
        WHERE id = ? AND user_id = ?;
      `).bind(sanitizeString(plData.title, 300), sanitizeString(plData.description, 1000) || null, sanitizeString(plData.thumbnail, 500) || null, plData.itemCount || 0, pl.id, userId).run();

      for (const t of plData.tracks) {
        await env.DB.prepare(`
          INSERT INTO music (id, user_id, title, artist, album, duration_sec, youtube_id, playlist_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
          ON CONFLICT(id) DO UPDATE SET title = excluded.title, artist = excluded.artist, duration_sec = excluded.duration_sec, updated_at = unixepoch();
        `).bind(t.id, userId, sanitizeString(t.title, 300), sanitizeString(t.artist, 200) || null, t.album || null, t.duration_sec || null, t.youtube_id || null, pl.id).run();
      }
      syncedCount++;
    }

    const { results: tracks } = await env.DB.prepare('SELECT * FROM music WHERE user_id = ? ORDER BY updated_at DESC;').bind(userId).all();
    const { results: playlists } = await env.DB.prepare('SELECT * FROM playlists WHERE user_id = ? ORDER BY updated_at DESC;').bind(userId).all();

    return successResponse({ syncedCount, tracks: tracks || [], playlists: playlists || [] }, requestId);
  }

  // ── PUT /v1/playlists — Sync YouTube playlists array ──
  if (method === 'PUT' && pathname === '/v1/playlists') {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const playlists = Array.isArray(body.playlists) ? body.playlists : [];

    // Atomic replace playlists for user
    await env.DB.prepare('DELETE FROM playlists WHERE user_id = ?;').bind(userId).run();
    for (const p of playlists) {
      await env.DB.prepare(`
        INSERT INTO playlists (id, user_id, title, description, thumbnail, item_count, synced, playlist_url, sync_interval_days, last_synced_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch());
      `).bind(
        p.id || crypto.randomUUID(),
        userId,
        sanitizeString(p.title, 300),
        sanitizeString(p.description, 1000) || null,
        sanitizeString(p.thumbnail, 500) || null,
        validateInt(p.itemCount || p.item_count, 0, 0),
        p.synced ? 1 : 0,
        p.playlist_url || p.playlistUrl || null,
        validateInt(p.sync_interval_days || p.syncIntervalDays, 1, 7),
        p.last_synced_at || p.lastSyncedAt || 0
      ).run();
    }

    const { results } = await env.DB.prepare('SELECT * FROM playlists WHERE user_id = ?;').bind(userId).all();
    return successResponse(results || [], requestId);
  }

  return null;
}

async function fetchYouTubePlaylistData(playlistId, apiKey) {
  let title = 'YouTube Playlist';
  let description = '';
  let thumbnail = '';
  let tracks = [];

  if (apiKey) {
    try {
      const plRes = await fetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&id=${playlistId}&key=${apiKey}`);
      if (plRes.ok) {
        const plData = await plRes.json();
        const item = plData.items?.[0];
        if (item) {
          title = item.snippet?.title || title;
          description = item.snippet?.description || '';
          thumbnail = item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url || '';

          let pageToken = '';
          const allItems = [];
          do {
            const itemsRes = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=${playlistId}&maxResults=50${pageToken ? '&pageToken=' + pageToken : ''}&key=${apiKey}`);
            if (!itemsRes.ok) break;
            const itemsData = await itemsRes.json();
            allItems.push(...(itemsData.items || []));
            pageToken = itemsData.nextPageToken || '';
          } while (pageToken && allItems.length < 250);

          const videoIds = allItems.map(i => i.contentDetails?.videoId).filter(Boolean);
          const durations = {};
          for (let i = 0; i < videoIds.length; i += 50) {
            const chunk = videoIds.slice(i, i + 50).join(',');
            const vRes = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${chunk}&key=${apiKey}`);
            if (vRes.ok) {
              const vData = await vRes.json();
              (vData.items || []).forEach(v => {
                durations[v.id] = parseISO8601Duration(v.contentDetails?.duration || '');
              });
            }
          }

          tracks = allItems.map(item => {
            const vid = item.contentDetails?.videoId;
            if (!vid) return null;
            return {
              id: 'yt_' + vid,
              youtube_id: vid,
              title: item.snippet?.title || 'Unknown Track',
              artist: item.snippet?.videoOwnerChannelTitle?.replace(/ - Topic$/, '').trim() || 'Unknown Artist',
              album: null,
              duration_sec: durations[vid] || null,
            };
          }).filter(Boolean);

          return { title, description, thumbnail, itemCount: tracks.length, tracks };
        }
      }
    } catch (e) {
      console.warn('[Music Route] YouTube API error, falling back to scraper:', e.message);
    }
  }

  try {
    const htmlRes = await fetch(`https://www.youtube.com/playlist?list=${playlistId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    });
    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const jsonMatch = html.match(/var\s+ytInitialData\s*=\s*({.+?});<\/script>/s) || html.match(/window\["ytInitialData"\]\s*=\s*({.+?});/s);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[1]);
        const header = data.header?.playlistHeaderRenderer || data.sidebar?.playlistSidebarRenderer?.items?.[0]?.playlistSidebarPrimaryInfoRenderer;
        if (header) {
          title = header.title?.simpleText || header.title?.runs?.[0]?.text || title;
          const thumbs = header.thumbnailRenderer?.playlistVideoThumbnailRenderer?.thumbnail?.thumbnails || header.thumbnail?.thumbnails;
          if (thumbs && thumbs.length) thumbnail = thumbs[thumbs.length - 1].url;
        }

        const contents = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents?.[0]?.playlistVideoListRenderer?.contents || [];
        for (const item of contents) {
          const v = item.playlistVideoRenderer;
          if (!v || !v.videoId) continue;
          const vid = v.videoId;
          const trackTitle = v.title?.runs?.[0]?.text || v.title?.simpleText || 'Unknown Track';
          const artist = v.shortBylineText?.runs?.[0]?.text || v.ownerBadges?.[0]?.metadataBadgeRenderer?.label || 'Unknown Artist';
          const durText = v.lengthText?.simpleText || '';
          const duration_sec = parseDurationText(durText);

          tracks.push({
            id: 'yt_' + vid,
            youtube_id: vid,
            title: trackTitle,
            artist,
            album: null,
            duration_sec,
          });
        }

        return { title, description, thumbnail, itemCount: tracks.length, tracks };
      }
    }
  } catch (e) {
    console.warn('[Music Route] HTML Scraper error:', e.message);
  }

  return { title, description, thumbnail, itemCount: tracks.length, tracks };
}

function parseISO8601Duration(dur) {
  if (!dur) return null;
  const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = parseInt(m[1]||0), min = parseInt(m[2]||0), s = parseInt(m[3]||0);
  return h*3600 + min*60 + s;
}

function parseDurationText(str) {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
  if (parts.length === 2) return parts[0]*60 + parts[1];
  return null;
}
