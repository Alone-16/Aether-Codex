// ═══════════════════════════════════════════════════════════════════
//  worker/routes/media.js — RESTful Media Resource Controller
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse } from '../utils/response.js';
import { sanitizeString, validateRating, validateInt, validateEnum, ALLOWED_MEDIA_STATUSES } from '../utils/validation.js';
import { updateFTSIndex, removeFTSIndex } from '../services/d1.js';

export async function handleMediaRoutes(request, env, ctx, requestId, pathname, claims) {
  const method = request.method;
  const userId = claims.sub;

  // ── GET /v1/media — Fetch all media entries for user ──
  if (method === 'GET' && pathname === '/v1/media') {
    const { results } = await env.DB.prepare(
      `SELECT * FROM media WHERE user_id = ? ORDER BY updated_at DESC;`
    ).bind(userId).all();

    // Fetch rewatches for user's media
    const { results: rewatchRows } = await env.DB.prepare(
      `SELECT * FROM rewatches WHERE user_id = ? ORDER BY created_at ASC;`
    ).bind(userId).all();

    const rewatchMap = {};
    (rewatchRows || []).forEach(r => {
      if (!rewatchMap[r.media_id]) rewatchMap[r.media_id] = [];
      rewatchMap[r.media_id].push(r);
    });

    const items = (results || []).map(m => ({
      ...m,
      // Map snake_case DB columns to camelCase for frontend compatibility
      genreId: m.genre_id,
      titleEn: m.title_en,
      titleJp: m.title_jp,
      epCur: m.ep_cur,
      epTot: m.ep_tot,
      epDuration: m.ep_duration,
      rewatchCount: m.rewatch_count,
      malId: m.mal_id,
      linkedGroupId: m.linked_group_id,
      linkedGroupOrder: m.linked_group_order,
      addedAt: m.created_at,
      updatedAt: m.updated_at,
      rewatches: rewatchMap[m.id] || [],
    }));

    return successResponse(items, requestId);
  }

  // ── POST /v1/media — Create new media entry ──
  if (method === 'POST' && pathname === '/v1/media') {
    let body = {};
    try { body = await request.json(); } catch (e) {}

    const id = body.id || crypto.randomUUID();
    const title = sanitizeString(body.title, 300);
    if (!title) return errorResponse('INVALID_INPUT', 'Title is required', requestId, 400);

    const genreId = sanitizeString(body.genre_id || body.genreId || 'anime', 50);
    const status = validateEnum(body.status, ALLOWED_MEDIA_STATUSES, 'watching');
    const score = validateRating(body.score);
    const epCur = validateInt(body.ep_cur || body.epCur, 0, 0);
    const epTot = validateInt(body.ep_tot || body.epTot, 0, 0);
    const epDuration = validateInt(body.ep_duration || body.epDuration, 1, 24);
    const malId = body.mal_id || body.malId ? parseInt(body.mal_id || body.malId) : null;
    const notes = sanitizeString(body.notes, 5000);

    await env.DB.prepare(`
      INSERT INTO media (id, user_id, genre_id, title, title_en, title_jp, status, score, ep_cur, ep_tot, ep_duration, mal_id, linked_group_id, linked_group_order, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch());
    `).bind(
      id, userId, genreId, title,
      sanitizeString(body.title_en || body.titleEn, 300) || null,
      sanitizeString(body.title_jp || body.titleJp, 300) || null,
      status, score, epCur, epTot, epDuration, malId,
      body.linked_group_id || body.linkedGroupId || null,
      body.linked_group_order || body.linkedGroupOrder || null,
      notes || null
    ).run();

    await updateFTSIndex(env.DB, userId, id, 'media', title, notes);

    const item = await env.DB.prepare('SELECT * FROM media WHERE id = ? AND user_id = ?;').bind(id, userId).first();
    return successResponse(item, requestId, 201);
  }

  // ── PATCH /v1/media/:id — Partial update ──
  if (method === 'PATCH' && pathname.startsWith('/v1/media/')) {
    const parts = pathname.split('/');
    const id = parts[3];
    if (!id) return errorResponse('INVALID_INPUT', 'Media ID required', requestId, 400);

    let body = {};
    try { body = await request.json(); } catch (e) {}

    const updates = [];
    const params = [];

    if (body.title !== undefined) { updates.push('title = ?'); params.push(sanitizeString(body.title, 300)); }
    if (body.status !== undefined) { updates.push('status = ?'); params.push(validateEnum(body.status, ALLOWED_MEDIA_STATUSES, 'watching')); }
    if (body.score !== undefined) { updates.push('score = ?'); params.push(validateRating(body.score)); }
    if (body.ep_cur !== undefined || body.epCur !== undefined) { updates.push('ep_cur = ?'); params.push(validateInt(body.ep_cur ?? body.epCur, 0, 0)); }
    if (body.ep_tot !== undefined || body.epTot !== undefined) { updates.push('ep_tot = ?'); params.push(validateInt(body.ep_tot ?? body.epTot, 0, 0)); }
    if (body.notes !== undefined) { updates.push('notes = ?'); params.push(sanitizeString(body.notes, 5000)); }

    if (updates.length === 0) return errorResponse('INVALID_INPUT', 'No fields to update', requestId, 400);

    updates.push('updated_at = unixepoch()');
    params.push(id, userId);

    const res = await env.DB.prepare(`UPDATE media SET ${updates.join(', ')} WHERE id = ? AND user_id = ?;`).bind(...params).run();
    if (res.meta.changes === 0) return errorResponse('NOT_FOUND', 'Media item not found', requestId, 404);

    const updated = await env.DB.prepare('SELECT * FROM media WHERE id = ? AND user_id = ?;').bind(id, userId).first();
    await updateFTSIndex(env.DB, userId, id, 'media', updated.title, updated.notes);

    return successResponse(updated, requestId);
  }

  // ── DELETE /v1/media/:id — Delete media entry ──
  if (method === 'DELETE' && pathname.startsWith('/v1/media/')) {
    const id = pathname.split('/')[3];
    if (!id) return errorResponse('INVALID_INPUT', 'Media ID required', requestId, 400);

    const res = await env.DB.prepare('DELETE FROM media WHERE id = ? AND user_id = ?;').bind(id, userId).run();
    if (res.meta.changes === 0) return errorResponse('NOT_FOUND', 'Media item not found', requestId, 404);

    await removeFTSIndex(env.DB, userId, id);
    return successResponse({ deleted: true, id }, requestId);
  }

  return null;
}
