// ═══════════════════════════════════════════════════════════════════
//  worker/routes/search.js — Full-Text Search (SQLite FTS5)
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse } from '../utils/response.js';
import { sanitizeString } from '../utils/validation.js';

export async function handleSearchRoutes(request, env, ctx, requestId, pathname, claims) {
  const method = request.method;
  const userId = claims.sub;

  if (method === 'GET' && pathname === '/v1/search') {
    const url = new URL(request.url);
    const q = sanitizeString(url.searchParams.get('q') || '', 100);
    if (!q) {
      return successResponse([], requestId);
    }

    try {
      const ftsQuery = q.split(/\s+/).map(term => `"${term}"*`).join(' AND ');
      const { results } = await env.DB.prepare(`
        SELECT item_id, section, title, content, snippet(search_fts, 3, '<b>', '</b>', '...', 15) as snippet
        FROM search_fts
        WHERE user_id = ? AND search_fts MATCH ?
        LIMIT 50;
      `).bind(userId, ftsQuery).all();

      return successResponse(results || [], requestId);
    } catch (e) {
      console.warn('[FTS5 Search Fallback]', e.message);
      return successResponse([], requestId);
    }
  }

  return null;
}
