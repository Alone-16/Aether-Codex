// ═══════════════════════════════════════════════════════════════════
//  worker/routes/games.js — RESTful Games Controller
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse } from '../utils/response.js';
import { sanitizeString, validateRating, validateInt, validateEnum, ALLOWED_GAME_PLATFORMS } from '../utils/validation.js';
import { updateFTSIndex, removeFTSIndex } from '../services/d1.js';

export async function handleGamesRoutes(request, env, ctx, requestId, pathname, claims) {
  const method = request.method;
  const userId = claims.sub;

  if (method === 'GET' && pathname === '/v1/games') {
    const { results } = await env.DB.prepare('SELECT * FROM games WHERE user_id = ? ORDER BY updated_at DESC;').bind(userId).all();
    const items = (results || []).map(g => ({
      ...g,
      hoursPlayed: g.hours_played,
      addedAt: g.created_at,
      updatedAt: g.updated_at,
    }));
    return successResponse(items, requestId);
  }

  if (method === 'POST' && pathname === '/v1/games') {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const id = body.id || crypto.randomUUID();
    const title = sanitizeString(body.title, 300);
    if (!title) return errorResponse('INVALID_INPUT', 'Game title is required', requestId, 400);

    const platform = validateEnum(body.platform, ALLOWED_GAME_PLATFORMS, 'pc');
    const status = sanitizeString(body.status || 'plan', 50);
    const rating = validateRating(body.rating);
    const hours = validateInt(body.hours_played || body.hoursPlayed, 0, 0);
    const notes = sanitizeString(body.notes, 5000);

    await env.DB.prepare(`
      INSERT INTO games (id, user_id, title, platform, status, rating, hours_played, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch());
    `).bind(id, userId, title, platform, status, rating, hours, notes || null).run();

    await updateFTSIndex(env.DB, userId, id, 'games', title, notes);
    const item = await env.DB.prepare('SELECT * FROM games WHERE id = ? AND user_id = ?;').bind(id, userId).first();
    return successResponse(item, requestId, 201);
  }

  if (method === 'PATCH' && pathname.startsWith('/v1/games/')) {
    const id = pathname.split('/')[3];
    if (!id) return errorResponse('INVALID_INPUT', 'Game ID required', requestId, 400);

    let body = {};
    try { body = await request.json(); } catch (e) {}
    const updates = [];
    const params = [];

    if (body.title !== undefined) { updates.push('title = ?'); params.push(sanitizeString(body.title, 300)); }
    if (body.platform !== undefined) { updates.push('platform = ?'); params.push(validateEnum(body.platform, ALLOWED_GAME_PLATFORMS, 'pc')); }
    if (body.status !== undefined) { updates.push('status = ?'); params.push(sanitizeString(body.status, 50)); }
    if (body.rating !== undefined) { updates.push('rating = ?'); params.push(validateRating(body.rating)); }
    if (body.hours_played !== undefined || body.hoursPlayed !== undefined) { updates.push('hours_played = ?'); params.push(validateInt(body.hours_played ?? body.hoursPlayed, 0, 0)); }
    if (body.notes !== undefined) { updates.push('notes = ?'); params.push(sanitizeString(body.notes, 5000)); }

    if (updates.length === 0) return errorResponse('INVALID_INPUT', 'No fields to update', requestId, 400);

    updates.push('updated_at = unixepoch()');
    params.push(id, userId);

    const res = await env.DB.prepare(`UPDATE games SET ${updates.join(', ')} WHERE id = ? AND user_id = ?;`).bind(...params).run();
    if (res.meta.changes === 0) return errorResponse('NOT_FOUND', 'Game not found', requestId, 404);

    const updated = await env.DB.prepare('SELECT * FROM games WHERE id = ? AND user_id = ?;').bind(id, userId).first();
    await updateFTSIndex(env.DB, userId, id, 'games', updated.title, updated.notes);
    return successResponse(updated, requestId);
  }

  if (method === 'DELETE' && pathname.startsWith('/v1/games/')) {
    const id = pathname.split('/')[3];
    if (!id) return errorResponse('INVALID_INPUT', 'Game ID required', requestId, 400);
    const res = await env.DB.prepare('DELETE FROM games WHERE id = ? AND user_id = ?;').bind(id, userId).run();
    if (res.meta.changes === 0) return errorResponse('NOT_FOUND', 'Game not found', requestId, 404);
    await removeFTSIndex(env.DB, userId, id);
    return successResponse({ deleted: true, id }, requestId);
  }

  return null;
}
