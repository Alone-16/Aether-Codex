// ═══════════════════════════════════════════════════════════════════
//  worker/routes/settings.js — User Settings & Genres Controller
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse } from '../utils/response.js';

export async function handleSettingsRoutes(request, env, ctx, requestId, pathname, claims) {
  const method = request.method;
  const userId = claims.sub;

  if (method === 'GET' && pathname === '/v1/settings') {
    const row = await env.DB.prepare('SELECT preferences_json, genres_json, updated_at FROM settings WHERE user_id = ?;').bind(userId).first();
    if (!row) {
      return successResponse({ settings: {}, genres: [] }, requestId);
    }
    let settings = {};
    let genres = [];
    try { settings = JSON.parse(row.preferences_json || '{}'); } catch (e) {}
    try { genres = JSON.parse(row.genres_json || '[]'); } catch (e) {}

    return successResponse({ settings, genres, updated_at: row.updated_at }, requestId);
  }

  if (method === 'PUT' && pathname === '/v1/settings') {
    let body = {};
    try { body = await request.json(); } catch (e) {}

    const settingsJson = JSON.stringify(body.settings || {});
    const genresJson = JSON.stringify(body.genres || []);

    await env.DB.prepare(`
      INSERT INTO settings (user_id, preferences_json, genres_json, updated_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(user_id) DO UPDATE SET
        preferences_json = excluded.preferences_json,
        genres_json = excluded.genres_json,
        updated_at = unixepoch();
    `).bind(userId, settingsJson, genresJson).run();

    return successResponse({ updated: true }, requestId);
  }

  return null;
}
