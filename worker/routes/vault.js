// ═══════════════════════════════════════════════════════════════════
//  worker/routes/vault.js — RESTful Vault Links & Tags Controller
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse } from '../utils/response.js';
import { sanitizeString } from '../utils/validation.js';
import { updateFTSIndex, removeFTSIndex } from '../services/d1.js';

export async function handleVaultRoutes(request, env, ctx, requestId, pathname, claims) {
  const method = request.method;
  const userId = claims.sub;

  if (method === 'GET' && pathname === '/v1/vault') {
    const { results: links } = await env.DB.prepare('SELECT * FROM vault WHERE user_id = ? ORDER BY updated_at DESC;').bind(userId).all();
    const { results: tagRows } = await env.DB.prepare('SELECT * FROM vault_tags WHERE user_id = ?;').bind(userId).all();

    const tagMap = {};
    (tagRows || []).forEach(t => {
      if (!tagMap[t.vault_id]) tagMap[t.vault_id] = [];
      tagMap[t.vault_id].push(t.tag);
    });

    const items = (links || []).map(l => ({
      ...l,
      tags: tagMap[l.id] || [],
    }));

    return successResponse(items, requestId);
  }

  if (method === 'POST' && pathname === '/v1/vault') {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const id = body.id || crypto.randomUUID();
    const title = sanitizeString(body.title, 300);
    const url = sanitizeString(body.url, 2000);
    if (!title || !url) return errorResponse('INVALID_INPUT', 'Title and URL are required', requestId, 400);

    const category = sanitizeString(body.category, 100);
    const isEncrypted = body.is_encrypted || body.isEncrypted ? 1 : 0;
    const tags = Array.isArray(body.tags) ? body.tags.map(t => sanitizeString(t, 50)).filter(Boolean) : [];

    await env.DB.prepare(`
      INSERT INTO vault (id, user_id, title, url, category, is_encrypted, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, unixepoch(), unixepoch());
    `).bind(id, userId, title, url, category || null, isEncrypted).run();

    for (const tag of tags) {
      await env.DB.prepare('INSERT OR IGNORE INTO vault_tags (vault_id, user_id, tag) VALUES (?, ?, ?);')
        .bind(id, userId, tag).run();
    }

    await updateFTSIndex(env.DB, userId, id, 'vault', title, isEncrypted ? '' : url);

    const item = await env.DB.prepare('SELECT * FROM vault WHERE id = ? AND user_id = ?;').bind(id, userId).first();
    return successResponse({ ...item, tags }, requestId, 201);
  }

  if (method === 'PATCH' && pathname.startsWith('/v1/vault/')) {
    const id = pathname.split('/')[3];
    if (!id) return errorResponse('INVALID_INPUT', 'Vault link ID required', requestId, 400);

    let body = {};
    try { body = await request.json(); } catch (e) {}
    const updates = [];
    const params = [];

    if (body.title !== undefined) { updates.push('title = ?'); params.push(sanitizeString(body.title, 300)); }
    if (body.url !== undefined) { updates.push('url = ?'); params.push(sanitizeString(body.url, 2000)); }
    if (body.category !== undefined) { updates.push('category = ?'); params.push(sanitizeString(body.category, 100)); }

    if (body.tags !== undefined && Array.isArray(body.tags)) {
      await env.DB.prepare('DELETE FROM vault_tags WHERE vault_id = ? AND user_id = ?;').bind(id, userId).run();
      const tags = body.tags.map(t => sanitizeString(t, 50)).filter(Boolean);
      for (const tag of tags) {
        await env.DB.prepare('INSERT OR IGNORE INTO vault_tags (vault_id, user_id, tag) VALUES (?, ?, ?);')
          .bind(id, userId, tag).run();
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = unixepoch()');
      params.push(id, userId);
      const res = await env.DB.prepare(`UPDATE vault SET ${updates.join(', ')} WHERE id = ? AND user_id = ?;`).bind(...params).run();
      if (res.meta.changes === 0) return errorResponse('NOT_FOUND', 'Vault item not found', requestId, 404);
    }

    const updated = await env.DB.prepare('SELECT * FROM vault WHERE id = ? AND user_id = ?;').bind(id, userId).first();
    const { results: tagRows } = await env.DB.prepare('SELECT tag FROM vault_tags WHERE vault_id = ?;').bind(id).all();
    const tags = (tagRows || []).map(r => r.tag);

    await updateFTSIndex(env.DB, userId, id, 'vault', updated.title, updated.is_encrypted ? '' : updated.url);

    return successResponse({ ...updated, tags }, requestId);
  }

  if (method === 'DELETE' && pathname.startsWith('/v1/vault/')) {
    const id = pathname.split('/')[3];
    if (!id) return errorResponse('INVALID_INPUT', 'Vault ID required', requestId, 400);
    const res = await env.DB.prepare('DELETE FROM vault WHERE id = ? AND user_id = ?;').bind(id, userId).run();
    if (res.meta.changes === 0) return errorResponse('NOT_FOUND', 'Vault item not found', requestId, 404);

    await removeFTSIndex(env.DB, userId, id);
    return successResponse({ deleted: true, id }, requestId);
  }

  return null;
}
