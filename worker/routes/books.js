// ═══════════════════════════════════════════════════════════════════
//  worker/routes/books.js — RESTful Books Controller
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse } from '../utils/response.js';
import { sanitizeString, validateRating, validateInt, validateEnum, ALLOWED_BOOK_FORMATS } from '../utils/validation.js';
import { updateFTSIndex, removeFTSIndex } from '../services/d1.js';

export async function handleBooksRoutes(request, env, ctx, requestId, pathname, claims) {
  const method = request.method;
  const userId = claims.sub;

  if (method === 'GET' && pathname === '/v1/books') {
    const { results } = await env.DB.prepare('SELECT * FROM books WHERE user_id = ? ORDER BY updated_at DESC;').bind(userId).all();
    const items = (results || []).map(b => ({
      ...b,
      progressCur: b.progress_cur,
      progressTot: b.progress_tot,
      addedAt: b.created_at,
      updatedAt: b.updated_at,
    }));
    return successResponse(items, requestId);
  }

  if (method === 'POST' && pathname === '/v1/books') {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const id = body.id || crypto.randomUUID();
    const title = sanitizeString(body.title, 300);
    if (!title) return errorResponse('INVALID_INPUT', 'Book title required', requestId, 400);

    const author = sanitizeString(body.author, 200);
    const format = validateEnum(body.format, ALLOWED_BOOK_FORMATS, 'novel');
    const status = sanitizeString(body.status || 'reading', 50);
    const rating = validateRating(body.rating);
    const progressCur = validateInt(body.progress_cur || body.progressCur, 0, 0);
    const progressTot = validateInt(body.progress_tot || body.progressTot, 0, 0);
    const notes = sanitizeString(body.notes, 5000);

    await env.DB.prepare(`
      INSERT INTO books (id, user_id, title, author, format, status, rating, progress_cur, progress_tot, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch());
    `).bind(id, userId, title, author || null, format, status, rating, progressCur, progressTot, notes || null).run();

    await updateFTSIndex(env.DB, userId, id, 'books', title + ' ' + (author || ''), notes);
    const item = await env.DB.prepare('SELECT * FROM books WHERE id = ? AND user_id = ?;').bind(id, userId).first();
    return successResponse(item, requestId, 201);
  }

  if (method === 'PATCH' && pathname.startsWith('/v1/books/')) {
    const id = pathname.split('/')[3];
    if (!id) return errorResponse('INVALID_INPUT', 'Book ID required', requestId, 400);

    let body = {};
    try { body = await request.json(); } catch (e) {}
    const updates = [];
    const params = [];

    if (body.title !== undefined) { updates.push('title = ?'); params.push(sanitizeString(body.title, 300)); }
    if (body.author !== undefined) { updates.push('author = ?'); params.push(sanitizeString(body.author, 200)); }
    if (body.format !== undefined) { updates.push('format = ?'); params.push(validateEnum(body.format, ALLOWED_BOOK_FORMATS, 'novel')); }
    if (body.status !== undefined) { updates.push('status = ?'); params.push(sanitizeString(body.status, 50)); }
    if (body.rating !== undefined) { updates.push('rating = ?'); params.push(validateRating(body.rating)); }
    if (body.progress_cur !== undefined || body.progressCur !== undefined) { updates.push('progress_cur = ?'); params.push(validateInt(body.progress_cur ?? body.progressCur, 0, 0)); }
    if (body.progress_tot !== undefined || body.progressTot !== undefined) { updates.push('progress_tot = ?'); params.push(validateInt(body.progress_tot ?? body.progressTot, 0, 0)); }
    if (body.notes !== undefined) { updates.push('notes = ?'); params.push(sanitizeString(body.notes, 5000)); }

    if (updates.length === 0) return errorResponse('INVALID_INPUT', 'No fields to update', requestId, 400);

    updates.push('updated_at = unixepoch()');
    params.push(id, userId);

    const res = await env.DB.prepare(`UPDATE books SET ${updates.join(', ')} WHERE id = ? AND user_id = ?;`).bind(...params).run();
    if (res.meta.changes === 0) return errorResponse('NOT_FOUND', 'Book not found', requestId, 404);

    const updated = await env.DB.prepare('SELECT * FROM books WHERE id = ? AND user_id = ?;').bind(id, userId).first();
    await updateFTSIndex(env.DB, userId, id, 'books', updated.title + ' ' + (updated.author || ''), updated.notes);
    return successResponse(updated, requestId);
  }

  if (method === 'DELETE' && pathname.startsWith('/v1/books/')) {
    const id = pathname.split('/')[3];
    if (!id) return errorResponse('INVALID_INPUT', 'Book ID required', requestId, 400);
    const res = await env.DB.prepare('DELETE FROM books WHERE id = ? AND user_id = ?;').bind(id, userId).run();
    if (res.meta.changes === 0) return errorResponse('NOT_FOUND', 'Book not found', requestId, 404);
    await removeFTSIndex(env.DB, userId, id);
    return successResponse({ deleted: true, id }, requestId);
  }

  return null;
}
