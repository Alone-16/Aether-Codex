// ═══════════════════════════════════════════════════════════════════
//  worker/routes/media.js — RESTful Media Resource Controller
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse } from '../utils/response.js';
import { sanitizeString, validateRating, validateInt, validateEnum, ALLOWED_MEDIA_STATUSES } from '../utils/validation.js';
import { updateFTSIndex, removeFTSIndex } from '../services/d1.js';
import { syncAiringCache, refreshAiringCacheForMalId } from '../services/airing_cache.js';

export async function handleMediaRoutes(request, env, ctx, requestId, pathname, claims) {
  const method = request.method;
  const userId = claims.sub;

  // ── GET /v1/media — Fetch all media entries for user ──
  if (method === 'GET' && pathname === '/v1/media') {
    const { results } = await env.DB.prepare(
      `SELECT m.*,
              ac.released_eps,
              ac.total_eps AS cache_total_eps,
              ac.next_ep_no,
              ac.next_ep_at,
              ac.shiki_status,
              ac.source AS cache_source,
              ac.checked_at AS cache_checked_at
       FROM media m
       LEFT JOIN airing_cache ac ON (m.genre_id = 'anime' AND m.mal_id = ac.mal_id)
       WHERE m.user_id = ? 
       ORDER BY m.updated_at DESC;`
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
      startDate: m.start_date,
      endDate: m.end_date,
      airingDay: m.airing_day,
      airingTime: m.airing_time,
      releaseDate: m.release_date,
      releaseDateSource: m.release_date_source,
      releaseDateUpdatedAt: m.release_date_updated_at,
      upcomingDate: m.release_date,
      coverImage: m.cover_image,
      watchUrl: m.watch_url,
      pinned: Boolean(m.pinned),
      addedAt: m.created_at,
      updatedAt: m.updated_at,
      rewatches: rewatchMap[m.id] || [],
      // Airing Cache fields
      releasedEps: m.released_eps ?? null,
      nextEpNo: m.next_ep_no ?? null,
      nextEpAt: m.next_ep_at ?? null,
      shikiStatus: m.shiki_status ?? null,
      cacheSource: m.cache_source ?? null,
      cacheCheckedAt: m.cache_checked_at ?? null,
    }));

    return successResponse(items, requestId);
  }

  // ── POST /v1/airing/sync — Trigger Shikimori Airing Cache sync (manual / cron / test) ──
  if (method === 'POST' && (pathname === '/v1/airing/sync' || pathname === '/v1/media/sync-airing')) {
    const syncRes = await syncAiringCache(env, { forceBatch: true });
    return successResponse(syncRes, requestId);
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

    const startDate = body.start_date || body.startDate || null;
    const endDate = body.end_date || body.endDate || null;
    const airingDay = body.airing_day !== undefined ? body.airing_day : (body.airingDay !== undefined ? body.airingDay : null);
    const airingTime = body.airing_time || body.airingTime || null;
    const releaseDate = body.release_date || body.releaseDate || body.upcoming_date || body.upcomingDate || null;
    const releaseDateSource = body.release_date_source || body.releaseDateSource || (releaseDate ? 'manual' : null);
    const releaseDateUpdatedAt = releaseDate ? new Date().toISOString() : null;
    const coverImage = body.cover_image || body.coverImage || null;
    const watchUrl = body.watch_url || body.watchUrl || null;

    // Check if an anime with the same MyAnimeList ID already exists in this genre
    if (malId) {
      const existing = await env.DB.prepare(
        'SELECT id, title FROM media WHERE user_id = ? AND genre_id = ? AND mal_id = ? LIMIT 1;'
      ).bind(userId, genreId, malId).first();
      if (existing) {
        return errorResponse('DUPLICATE_ENTRY', `An anime with this MyAnimeList ID already exists in your library: "${existing.title}" (MAL #${malId})`, requestId, 409);
      }
    }

    try {
      await env.DB.prepare(`
        INSERT INTO media (id, user_id, genre_id, title, title_en, title_jp, status, score, ep_cur, ep_tot, ep_duration, start_date, end_date, airing_day, airing_time, release_date, release_date_source, release_date_updated_at, cover_image, watch_url, mal_id, linked_group_id, linked_group_order, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch());
      `).bind(
        id, userId, genreId, title,
        sanitizeString(body.title_en || body.titleEn, 300) || null,
        sanitizeString(body.title_jp || body.titleJp, 300) || null,
        status, score, epCur, epTot, epDuration,
        startDate, endDate, airingDay, airingTime, releaseDate, releaseDateSource, releaseDateUpdatedAt, coverImage, watchUrl,
        malId,
        body.linked_group_id || body.linkedGroupId || null,
        body.linked_group_order || body.linkedGroupOrder || null,
        notes || null
      ).run();
    } catch (err) {
      if (err.message && (err.message.includes('UNIQUE constraint') || err.message.includes('SQLITE_CONSTRAINT'))) {
        return errorResponse('DUPLICATE_ENTRY', 'An item with this MyAnimeList ID already exists in your library.', requestId, 409);
      }
      throw err;
    }

    await updateFTSIndex(env.DB, userId, id, 'media', title, notes);

    const item = await env.DB.prepare(`
      SELECT m.*,
             ac.released_eps,
             ac.total_eps AS cache_total_eps,
             ac.next_ep_no,
             ac.next_ep_at,
             ac.shiki_status,
             ac.source AS cache_source,
             ac.checked_at AS cache_checked_at
      FROM media m
      LEFT JOIN airing_cache ac ON (m.genre_id = 'anime' AND m.mal_id = ac.mal_id)
      WHERE m.id = ? AND m.user_id = ?;
    `).bind(id, userId).first();

    if (genreId === 'anime' && status === 'watching' && malId && ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(refreshAiringCacheForMalId(env, malId));
    }

    const mappedItem = item ? {
      ...item,
      genreId: item.genre_id,
      titleEn: item.title_en,
      titleJp: item.title_jp,
      epCur: item.ep_cur,
      epTot: item.ep_tot,
      epDuration: item.ep_duration,
      malId: item.mal_id,
      releasedEps: item.released_eps ?? null,
      nextEpNo: item.next_ep_no ?? null,
      nextEpAt: item.next_ep_at ?? null,
      shikiStatus: item.shiki_status ?? null,
      cacheSource: item.cache_source ?? null,
      cacheCheckedAt: item.cache_checked_at ?? null,
    } : null;

    return successResponse(mappedItem, requestId, 201);
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
    if (body.start_date !== undefined || body.startDate !== undefined) { updates.push('start_date = ?'); params.push(body.start_date ?? body.startDate ?? null); }
    if (body.end_date !== undefined || body.endDate !== undefined) { updates.push('end_date = ?'); params.push(body.end_date ?? body.endDate ?? null); }
    if (body.airing_day !== undefined || body.airingDay !== undefined) { updates.push('airing_day = ?'); params.push(body.airing_day ?? body.airingDay ?? null); }
    if (body.airing_time !== undefined || body.airingTime !== undefined) { updates.push('airing_time = ?'); params.push(body.airing_time ?? body.airingTime ?? null); }
    if (body.release_date !== undefined || body.releaseDate !== undefined || body.upcoming_date !== undefined || body.upcomingDate !== undefined) {
      const val = body.release_date ?? body.releaseDate ?? body.upcoming_date ?? body.upcomingDate ?? null;
      updates.push('release_date = ?');
      params.push(val);
      const src = body.release_date_source ?? body.releaseDateSource ?? (val ? 'manual' : null);
      updates.push('release_date_source = ?');
      params.push(src);
      updates.push('release_date_updated_at = ?');
      params.push(new Date().toISOString());
    } else if (body.release_date_source !== undefined || body.releaseDateSource !== undefined) {
      updates.push('release_date_source = ?');
      params.push(body.release_date_source ?? body.releaseDateSource ?? null);
    }
    if (body.cover_image !== undefined || body.coverImage !== undefined) { updates.push('cover_image = ?'); params.push(body.cover_image ?? body.coverImage ?? null); }
    if (body.watch_url !== undefined || body.watchUrl !== undefined) { updates.push('watch_url = ?'); params.push(body.watch_url ?? body.watchUrl ?? null); }
    if (body.mal_id !== undefined || body.malId !== undefined) {
      const parsedMalId = body.mal_id ? parseInt(body.mal_id) : (body.malId ? parseInt(body.malId) : null);
      if (parsedMalId) {
        const existing = await env.DB.prepare(
          'SELECT id, title FROM media WHERE user_id = ? AND genre_id = (SELECT genre_id FROM media WHERE id = ? AND user_id = ?) AND mal_id = ? AND id != ? LIMIT 1;'
        ).bind(userId, id, userId, parsedMalId, id).first();
        if (existing) {
          return errorResponse('DUPLICATE_ENTRY', `An anime with this MyAnimeList ID already exists in your library: "${existing.title}" (MAL #${parsedMalId})`, requestId, 409);
        }
      }
      updates.push('mal_id = ?');
      params.push(parsedMalId);
    }
    if (body.notes !== undefined) { updates.push('notes = ?'); params.push(sanitizeString(body.notes, 5000)); }
    if (body.pinned !== undefined) { updates.push('pinned = ?'); params.push(body.pinned ? 1 : 0); }

    if (updates.length === 0) return errorResponse('INVALID_INPUT', 'No fields to update', requestId, 400);

    updates.push('updated_at = unixepoch()');
    params.push(id, userId);

    try {
      const res = await env.DB.prepare(`UPDATE media SET ${updates.join(', ')} WHERE id = ? AND user_id = ?;`).bind(...params).run();
      if (res.meta.changes === 0) return errorResponse('NOT_FOUND', 'Media item not found', requestId, 404);
    } catch (err) {
      if (err.message && (err.message.includes('UNIQUE constraint') || err.message.includes('SQLITE_CONSTRAINT'))) {
        return errorResponse('DUPLICATE_ENTRY', 'An item with this MyAnimeList ID already exists in your library.', requestId, 409);
      }
      throw err;
    }

    const updated = await env.DB.prepare(`
      SELECT m.*,
             ac.released_eps,
             ac.total_eps AS cache_total_eps,
             ac.next_ep_no,
             ac.next_ep_at,
             ac.shiki_status,
             ac.source AS cache_source,
             ac.checked_at AS cache_checked_at
      FROM media m
      LEFT JOIN airing_cache ac ON (m.genre_id = 'anime' AND m.mal_id = ac.mal_id)
      WHERE m.id = ? AND m.user_id = ?;
    `).bind(id, userId).first();
    await updateFTSIndex(env.DB, userId, id, 'media', updated.title, updated.notes);

    if (updated.genre_id === 'anime' && updated.status === 'watching' && updated.mal_id && ctx && typeof ctx.waitUntil === 'function') {
      ctx.waitUntil(refreshAiringCacheForMalId(env, updated.mal_id));
    }

    const mappedUpdated = updated ? {
      ...updated,
      genreId: updated.genre_id,
      titleEn: updated.title_en,
      titleJp: updated.title_jp,
      epCur: updated.ep_cur,
      epTot: updated.ep_tot,
      epDuration: updated.ep_duration,
      malId: updated.mal_id,
      releasedEps: updated.released_eps ?? null,
      nextEpNo: updated.next_ep_no ?? null,
      nextEpAt: updated.next_ep_at ?? null,
      shikiStatus: updated.shiki_status ?? null,
      cacheSource: updated.cache_source ?? null,
      cacheCheckedAt: updated.cache_checked_at ?? null,
    } : null;

    return successResponse(mappedUpdated, requestId);
  }

  // ── DELETE /v1/media/:id — Delete media entry ──
  if (method === 'DELETE' && pathname.startsWith('/v1/media/')) {
    const rawId = pathname.split('/')[3];
    const id = rawId ? decodeURIComponent(rawId) : null;
    if (!id) return errorResponse('INVALID_INPUT', 'Media ID required', requestId, 400);

    await env.DB.prepare('DELETE FROM rewatches WHERE media_id = ? AND user_id = ?;').bind(id, userId).run().catch(() => {});
    const res = await env.DB.prepare('DELETE FROM media WHERE id = ? AND user_id = ?;').bind(id, userId).run();
    if (res.meta.changes === 0) return errorResponse('NOT_FOUND', 'Media item not found', requestId, 404);

    await removeFTSIndex(env.DB, userId, id);
    return successResponse({ deleted: true, id }, requestId);
  }

  return null;
}
