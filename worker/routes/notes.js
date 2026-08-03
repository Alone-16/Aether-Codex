// ═══════════════════════════════════════════════════════════════════
//  worker/routes/notes.js — RESTful Notes & Tags Controller
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse } from '../utils/response.js';
import { sanitizeString } from '../utils/validation.js';
import { updateFTSIndex, removeFTSIndex } from '../services/d1.js';

export async function handleNotesRoutes(request, env, ctx, requestId, pathname, claims) {
  const method = request.method;
  const userId = claims.sub;

  // ── GET /v1/notes — Fetch all notes and tags for user ──
  if (method === 'GET' && pathname === '/v1/notes') {
    const { results: notes } = await env.DB.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC;').bind(userId).all();
    const { results: tagRows } = await env.DB.prepare('SELECT * FROM note_tags WHERE user_id = ?;').bind(userId).all();

    const tagMap = {};
    (tagRows || []).forEach(t => {
      if (!tagMap[t.note_id]) tagMap[t.note_id] = [];
      tagMap[t.note_id].push(t.tag);
    });

    const items = (notes || []).map(n => ({
      ...n,
      tags: tagMap[n.id] || [],
    }));

    return successResponse(items, requestId);
  }

  // ── POST /v1/notes — Create new note ──
  if (method === 'POST' && pathname === '/v1/notes') {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const id = body.id || crypto.randomUUID();
    const title = sanitizeString(body.title, 300);
    if (!title) return errorResponse('INVALID_INPUT', 'Note title is required', requestId, 400);

    const content = sanitizeString(body.content, 50000);
    const isEncrypted = body.is_encrypted || body.isEncrypted ? 1 : 0;
    const tags = Array.isArray(body.tags) ? body.tags.map(t => sanitizeString(t, 50)).filter(Boolean) : [];

    await env.DB.prepare(`
      INSERT INTO notes (id, user_id, title, content, is_encrypted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, unixepoch(), unixepoch());
    `).bind(id, userId, title, content || null, isEncrypted).run();

    // Insert tags into note_tags table
    for (const tag of tags) {
      await env.DB.prepare('INSERT OR IGNORE INTO note_tags (note_id, user_id, tag) VALUES (?, ?, ?);')
        .bind(id, userId, tag).run();
    }

    await updateFTSIndex(env.DB, userId, id, 'notes', title, isEncrypted ? '' : content);

    const note = await env.DB.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?;').bind(id, userId).first();
    return successResponse({ ...note, tags }, requestId, 201);
  }

  // ── PATCH /v1/notes/:id — Partial update ──
  if (method === 'PATCH' && pathname.startsWith('/v1/notes/')) {
    const id = pathname.split('/')[3];
    if (!id) return errorResponse('INVALID_INPUT', 'Note ID required', requestId, 400);

    let body = {};
    try { body = await request.json(); } catch (e) {}
    const updates = [];
    const params = [];

    if (body.title !== undefined) { updates.push('title = ?'); params.push(sanitizeString(body.title, 300)); }
    if (body.content !== undefined) { updates.push('content = ?'); params.push(sanitizeString(body.content, 50000)); }
    if (body.is_encrypted !== undefined || body.isEncrypted !== undefined) {
      updates.push('is_encrypted = ?');
      params.push(body.is_encrypted ?? body.isEncrypted ? 1 : 0);
    }

    if (body.tags !== undefined && Array.isArray(body.tags)) {
      await env.DB.prepare('DELETE FROM note_tags WHERE note_id = ? AND user_id = ?;').bind(id, userId).run();
      const tags = body.tags.map(t => sanitizeString(t, 50)).filter(Boolean);
      for (const tag of tags) {
        await env.DB.prepare('INSERT OR IGNORE INTO note_tags (note_id, user_id, tag) VALUES (?, ?, ?);')
          .bind(id, userId, tag).run();
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = unixepoch()');
      params.push(id, userId);
      const res = await env.DB.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ? AND user_id = ?;`).bind(...params).run();
      if (res.meta.changes === 0) return errorResponse('NOT_FOUND', 'Note not found', requestId, 404);
    }

    const updated = await env.DB.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?;').bind(id, userId).first();
    const { results: tagRows } = await env.DB.prepare('SELECT tag FROM note_tags WHERE note_id = ?;').bind(id).all();
    const tags = (tagRows || []).map(r => r.tag);

    await updateFTSIndex(env.DB, userId, id, 'notes', updated.title, updated.is_encrypted ? '' : updated.content);

    return successResponse({ ...updated, tags }, requestId);
  }

  // ── DELETE /v1/notes/:id — Delete note ──
  if (method === 'DELETE' && pathname.startsWith('/v1/notes/')) {
    const id = pathname.split('/')[3];
    if (!id) return errorResponse('INVALID_INPUT', 'Note ID required', requestId, 400);
    const res = await env.DB.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?;').bind(id, userId).run();
    if (res.meta.changes === 0) return errorResponse('NOT_FOUND', 'Note not found', requestId, 404);

    await removeFTSIndex(env.DB, userId, id);
    return successResponse({ deleted: true, id }, requestId);
  }

  return null;
}
