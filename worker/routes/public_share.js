// ═══════════════════════════════════════════════════════════════════
//  worker/routes/public_share.js — Public Share Controller (No Login Required)
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse, jsonResponse } from '../utils/response.js';
import { authenticateRequest } from '../middleware.js';

let _tableEnsured = false;

async function ensurePublicSharesTable(db) {
  if (_tableEnsured) return;
  try {
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS public_shares (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        manage_key TEXT,
        snapshot_json TEXT NOT NULL,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      );
    `).run();
    // Ensure manage_key column exists if table was created in an earlier migration
    await db.prepare(`ALTER TABLE public_shares ADD COLUMN manage_key TEXT;`).run().catch(() => {});
    _tableEnsured = true;
  } catch (e) {
    console.warn('[D1 ensurePublicSharesTable]', e.message);
  }
}

/**
 * Public Share Controller — Handles all public list routes.
 * NO LOGIN REQUIRED for viewing or generating public links.
 *
 * Routes:
 * - GET    /v1/public/share/:shareId  → Read public list (public)
 * - GET    /v1/public/share           → Check active share status (anonymous or authed)
 * - POST   /v1/public/share           → Publish or update list (anonymous or authed)
 * - DELETE /v1/public/share           → Revoke public list (anonymous with manageKey or authed)
 * - GET    /v1/public/drive           → Legacy Drive fallback proxy
 */
export async function handlePublicShareRoutes(request, env, ctx, requestId, pathname, url) {
  const method = request.method;

  // 1. GET /v1/public/share/:shareId — Unauthenticated read of a shared list
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

  // 2. Legacy Drive fileId proxy (GET /v1/public/drive or ?fileId=...)
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

  // Check for base route /v1/public/share
  if (pathname !== '/v1/public/share') return null;

  await ensurePublicSharesTable(env.DB);

  // Optional authentication — works seamlessly for both logged in users AND guest/anonymous users
  const claims = await authenticateRequest(request, env).catch(() => null);

  // 3. GET /v1/public/share — Check active share status
  if (method === 'GET') {
    const shareId = url.searchParams.get('shareId')?.trim();
    const manageKey = url.searchParams.get('manageKey')?.trim();

    let row = null;
    if (claims && claims.sub) {
      row = await env.DB.prepare(
        'SELECT id, manage_key, snapshot_json, updated_at FROM public_shares WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1;'
      ).bind(claims.sub).first();
    }

    if (!row && shareId && manageKey) {
      row = await env.DB.prepare(
        'SELECT id, manage_key, snapshot_json, updated_at FROM public_shares WHERE id = ? AND manage_key = ?;'
      ).bind(shareId, manageKey).first();
    } else if (!row && shareId) {
      row = await env.DB.prepare(
        'SELECT id, manage_key, snapshot_json, updated_at FROM public_shares WHERE id = ?;'
      ).bind(shareId).first();
    }

    if (!row) {
      return successResponse({ active: false }, requestId);
    }

    let snap = {};
    try { snap = JSON.parse(row.snapshot_json); } catch (e) {}

    return successResponse({
      active: true,
      shareId: row.id,
      manageKey: row.manage_key,
      sections: snap.sections || [],
      updated_at: row.updated_at,
    }, requestId);
  }

  // 4. POST /v1/public/share — Publish or update a snapshot (NO LOGIN REQUIRED)
  if (method === 'POST') {
    let body = {};
    try { body = await request.json(); } catch (e) {}

    const snapshot = body.snapshot;
    if (!snapshot || typeof snapshot !== 'object') {
      return errorResponse('INVALID_BODY', 'Missing list snapshot', requestId, 400);
    }

    const payloadStr = JSON.stringify(snapshot);
    if (payloadStr.length > 2 * 1024 * 1024) {
      return errorResponse('PAYLOAD_TOO_LARGE', 'Snapshot exceeds 2MB limit', requestId, 413);
    }

    const reqShareId = body.shareId?.trim();
    const reqManageKey = body.manageKey?.trim();
    const userId = claims?.sub || 'anonymous';

    // Check if updating an existing share
    let existing = null;
    if (reqShareId) {
      existing = await env.DB.prepare(
        'SELECT id, user_id, manage_key FROM public_shares WHERE id = ?;'
      ).bind(reqShareId).first();
    }

    if (existing) {
      const isAuthorized =
        (claims && claims.sub && existing.user_id === claims.sub) ||
        (reqManageKey && existing.manage_key === reqManageKey) ||
        (existing.user_id === 'anonymous');

      if (isAuthorized) {
        await env.DB.prepare(`
          UPDATE public_shares
          SET snapshot_json = ?, updated_at = unixepoch()
          WHERE id = ?;
        `).bind(payloadStr, existing.id).run();

        return successResponse({
          shareId: existing.id,
          manageKey: existing.manage_key || reqManageKey,
          publicUrl: `/?share=${existing.id}`,
        }, requestId);
      }
    }

    // Otherwise, generate a fresh new share entry
    const shareId = crypto.randomUUID();
    const manageKey = crypto.randomUUID();

    await env.DB.prepare(`
      INSERT INTO public_shares (id, user_id, manage_key, snapshot_json, updated_at)
      VALUES (?, ?, ?, ?, unixepoch());
    `).bind(shareId, userId, manageKey, payloadStr).run();

    return successResponse({
      shareId,
      manageKey,
      publicUrl: `/?share=${shareId}`,
    }, requestId);
  }

  // 5. DELETE /v1/public/share — Revoke public list (NO LOGIN REQUIRED with manageKey)
  if (method === 'DELETE') {
    let body = {};
    try { body = await request.json(); } catch (e) {}

    const shareId = body.shareId?.trim() || url.searchParams.get('shareId')?.trim();
    const manageKey = body.manageKey?.trim() || url.searchParams.get('manageKey')?.trim();

    if (claims && claims.sub) {
      await env.DB.prepare('DELETE FROM public_shares WHERE user_id = ?;').bind(claims.sub).run();
    }

    if (shareId && manageKey) {
      await env.DB.prepare('DELETE FROM public_shares WHERE id = ? AND manage_key = ?;').bind(shareId, manageKey).run();
    } else if (shareId) {
      await env.DB.prepare('DELETE FROM public_shares WHERE id = ?;').bind(shareId).run();
    }

    return successResponse({ revoked: true }, requestId);
  }

  return null;
}
