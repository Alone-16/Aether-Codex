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
    return successResponse({ tracks: tracks || [], playlists: playlists || [] }, requestId);
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

  // ── PUT /v1/playlists — Sync YouTube playlists array ──
  if (method === 'PUT' && pathname === '/v1/playlists') {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const playlists = Array.isArray(body.playlists) ? body.playlists : [];

    // Atomic replace playlists for user
    await env.DB.prepare('DELETE FROM playlists WHERE user_id = ?;').bind(userId).run();
    for (const p of playlists) {
      await env.DB.prepare(`
        INSERT INTO playlists (id, user_id, title, description, thumbnail, item_count, synced, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch());
      `).bind(
        p.id || crypto.randomUUID(),
        userId,
        sanitizeString(p.title, 300),
        sanitizeString(p.description, 1000) || null,
        sanitizeString(p.thumbnail, 500) || null,
        validateInt(p.itemCount || p.item_count, 0, 0),
        p.synced ? 1 : 0
      ).run();
    }

    const { results } = await env.DB.prepare('SELECT * FROM playlists WHERE user_id = ?;').bind(userId).all();
    return successResponse(results || [], requestId);
  }

  return null;
}
