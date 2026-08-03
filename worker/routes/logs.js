// ═══════════════════════════════════════════════════════════════════
//  worker/routes/logs.js — Activity Logs Controller
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse } from '../utils/response.js';
import { sanitizeString } from '../utils/validation.js';

export async function handleLogsRoutes(request, env, ctx, requestId, pathname, claims) {
  const method = request.method;
  const userId = claims.sub;

  if (method === 'GET' && pathname === '/v1/logs') {
    const { results } = await env.DB.prepare(
      'SELECT * FROM logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 200;'
    ).bind(userId).all();
    return successResponse(results || [], requestId);
  }

  if (method === 'POST' && pathname === '/v1/logs') {
    let body = {};
    try { body = await request.json(); } catch (e) {}

    const id = body.id || crypto.randomUUID();
    const section = sanitizeString(body.section, 50);
    const action = sanitizeString(body.action, 100);
    if (!section || !action) return errorResponse('INVALID_INPUT', 'Section and action required', requestId, 400);

    const target = sanitizeString(body.target, 200);
    const details = sanitizeString(body.details, 500);
    const ipAddress = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
    const userAgent = sanitizeString(request.headers.get('User-Agent') || '', 200);

    await env.DB.prepare(`
      INSERT INTO logs (id, user_id, section, action, target, details, ip_address, user_agent, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch());
    `).bind(id, userId, section, action, target || null, details || null, ipAddress, userAgent || null).run();

    return successResponse({ id, section, action, target, details }, requestId, 201);
  }

  return null;
}
