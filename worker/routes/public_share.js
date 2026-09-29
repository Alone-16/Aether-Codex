// ═══════════════════════════════════════════════════════════════════
//  worker/routes/public_share.js — Public Share Controller & Service
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse, jsonResponse } from '../utils/response.js';

let _tableEnsured = false;

async function ensurePublicSharesTable(db) {
  if (_tableEnsured) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS public_shares (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        snapshot_json TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      );
    `).run();
    _tableEnsured = true;
  } catch (e) {
    console.warn('[D1 ensurePublicSharesTable]', e.message);
  }
}

/**
 * Unauthenticated read endpoints for public lists:
 * - GET /v1/public/share/:shareId
 * - GET /v1/public/drive?fileId=... (Legacy Drive proxy)
 */
export async function handlePublicShareRead(request, env, ctx, requestId, pathname, url) {
  const method = request.method;

  // 1. GET /v1/public/share/:shareId
  if (method === 'GET' && pathname.startsWith('/v1/public/share/')) {
    const shareId = decodeURIComponent(pathname.replace('/v1/public/share/', '')).trim();
    if (!shareId) {
      return errorResponse('INVALID_SHARE_ID', 'Missing public share ID', requestId, 400);
    }

    await ensurePublicSharesTable(env.DB);

    const row = await env.DB.prepare(
      'SELECT snapshot_json, updated_at FROM public_shares WHERE id = ?;'
    ).bind(shareId).first();

    if (!row) {
      return errorResponse('NOT_FOUND', 'This public list was not found or has been revoked.', requestId, 404);
    }

    let snapshot = {};
    try {
      snapshot = JSON.parse(row.snapshot_json);
    } catch (e) {
      return errorResponse('DATA_CORRUPT', 'Public list data is invalid.', requestId, 500);
    }

    return successResponse(snapshot, requestId, 200, { updated_at: row.updated_at });
  }

  // 2. Legacy Drive fileId proxy
  if (method === 'GET' && (url.searchParams.get('fileId') || pathname === '/v1/public/drive')) {
    const fileId = url.searchParams.get('fileId');
    if (!fileId) {
      return errorResponse('MISSING_FILE_ID', 'Missing fileId parameter', requestId, 400);
    }

    try {
      const driveRes = await fetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const text = await driveRes.text();
      return jsonResponse(text, 200, { 'Content-Type': 'application/json' });
    } catch (e) {
      return errorResponse('DRIVE_FETCH_ERROR', 'Could not fetch from Google Drive', requestId, 502);
    }
  }

  return null;
}

/**
 * Authenticated management endpoints for user's public share:
 * - GET    /v1/public/share  (Check active status)
 * - POST   /v1/public/share  (Publish or update list)
 * - DELETE /v1/public/share  (Revoke list)
 */
export async function handlePublicShareRoutes(request, env, ctx, requestId, pathname, claims) {
  const method = request.method;
  const userId = claims.sub;

  if (pathname !== '/v1/public/share') return null;

  await ensurePublicSharesTable(env.DB);

  // 1. GET /v1/public/share — Check status
  if (method === 'GET') {
    const row = await env.DB.prepare(
      'SELECT id, snapshot_json, updated_at FROM public_shares WHERE user_id = ?;'
    ).bind(userId).first();

    if (!row) {
      return successResponse({ active: false }, requestId);
    }

    let snap = {};
    try { snap = JSON.parse(row.snapshot_json); } catch (e) {}

    return successResponse({
      active: true,
      shareId: row.id,
      sections: snap.sections || [],
      updated_at: row.updated_at,
    }, requestId);
  }

  // 2. POST /v1/public/share — Publish or update snapshot
  if (method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (e) {}

    const snapshot = body.snapshot;
    if (!snapshot || typeof snapshot !== 'object') {
      return errorResponse('INVALID_BODY', 'Missing list snapshot', requestId, 400);
    }

    // Reuse existing share ID for this user or create a new clean UUID
    const existing = await env.DB.prepare(
      'SELECT id FROM public_shares WHERE user_id = ?;'
    ).bind(userId).first();

    const shareId = body.shareId || existing?.id || crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO public_shares (id, user_id, snapshot_json, updated_at)
      VALUES (?, ?, ?, unixepoch())
      ON CONFLICT(id) DO UPDATE SET
        snapshot_json = excluded.snapshot_json,
        updated_at = unixepoch();
    `).bind(shareId, userId, JSON.stringify(snapshot)).run();

    return successResponse({
      shareId,
      publicUrl: `/?share=${shareId}`,
    }, requestId);
  }

  // 3. DELETE /v1/public/share — Revoke
  if (method === 'DELETE') {
    await env.DB.prepare('DELETE FROM public_shares WHERE user_id = ?;').bind(userId).run();
    return successResponse({ revoked: true }, requestId);
  }

  return null;
}
