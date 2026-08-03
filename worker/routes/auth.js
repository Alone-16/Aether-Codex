// ═══════════════════════════════════════════════════════════════════
//  worker/routes/auth.js — Dual-Token Authentication & Device Sessions
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse } from '../utils/response.js';
import { signJWT, hashToken } from '../services/jwt.js';
import { verifyGoogleToken } from '../services/google.js';
import { upsertUser, storeRefreshToken, findRefreshToken, deleteRefreshToken, deleteAllUserRefreshTokens, getUserRefreshTokens } from '../services/d1.js';

export async function handleAuth(request, env, ctx, requestId, pathname) {
  const method = request.method;

  // ── POST /v1/auth/google — Login / Auth with Google ID Token ──
  if (method === 'POST' && pathname === '/v1/auth/google') {
    let body = {};
    try { body = await request.json(); } catch (e) {}

    const { id_token, device_name } = body;
    if (!id_token) {
      return errorResponse('INVALID_INPUT', 'Missing Google id_token in request body', requestId, 400);
    }

    const gUser = await verifyGoogleToken(id_token, env.CLIENT_ID);
    if (!gUser || !gUser.id) {
      return errorResponse('AUTH_FAILED', 'Failed to verify Google ID token', requestId, 401);
    }

    // Upsert user in D1
    await upsertUser(env.DB, gUser);

    // Generate 15-minute Access Token
    const jwtSecret = env.JWT_SECRET || 'aether-codex-jwt-secret-key-change-in-prod-vars';
    const accessToken = await signJWT({ sub: gUser.id, email: gUser.email }, jwtSecret, 900); // 15 min

    // Generate 30-day Refresh Token
    const rawRefreshToken = crypto.randomUUID() + '-' + crypto.randomUUID();
    const tokenHash = await hashToken(rawRefreshToken);
    const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 3600); // 30 days
    const ipAddress = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

    await storeRefreshToken(env.DB, {
      id: crypto.randomUUID(),
      userId: gUser.id,
      tokenHash,
      deviceName: device_name || request.headers.get('User-Agent') || 'Web Browser',
      ipAddress,
      expiresAt,
    });

    return successResponse({
      user: gUser,
      access_token: accessToken,
      refresh_token: rawRefreshToken,
      expires_in: 900,
    }, requestId);
  }

  // ── POST /v1/auth/refresh — Refresh Access Token ──
  if (method === 'POST' && pathname === '/v1/auth/refresh') {
    let body = {};
    try { body = await request.json(); } catch (e) {}

    const { refresh_token } = body;
    if (!refresh_token) {
      return errorResponse('INVALID_INPUT', 'Missing refresh_token', requestId, 400);
    }

    const tokenHash = await hashToken(refresh_token);
    const record = await findRefreshToken(env.DB, tokenHash);
    if (!record) {
      return errorResponse('INVALID_REFRESH_TOKEN', 'Refresh token expired or revoked', requestId, 401);
    }

    // Issue new 15-minute Access Token
    const jwtSecret = env.JWT_SECRET || 'aether-codex-jwt-secret-key-change-in-prod-vars';
    const accessToken = await signJWT({ sub: record.user_id }, jwtSecret, 900);

    return successResponse({
      access_token: accessToken,
      expires_in: 900,
    }, requestId);
  }

  // ── POST /v1/auth/logout — Revoke current Refresh Token ──
  if (method === 'POST' && pathname === '/v1/auth/logout') {
    let body = {};
    try { body = await request.json(); } catch (e) {}
    const { refresh_token } = body;
    if (refresh_token) {
      const tokenHash = await hashToken(refresh_token);
      await deleteRefreshToken(env.DB, tokenHash);
    }
    return successResponse({ message: 'Logged out successfully' }, requestId);
  }

  return null;
}

export async function handleAuthenticatedAuth(request, env, ctx, requestId, pathname, claims) {
  const method = request.method;

  // ── GET /v1/auth/me — Current User Profile ──
  if (method === 'GET' && pathname === '/v1/auth/me') {
    const user = await env.DB.prepare('SELECT id, email, name, picture, created_at FROM users WHERE id = ?;').bind(claims.sub).first();
    if (!user) return errorResponse('USER_NOT_FOUND', 'User profile not found', requestId, 404);
    return successResponse(user, requestId);
  }

  // ── GET /v1/auth/sessions — List Active Devices ──
  if (method === 'GET' && pathname === '/v1/auth/sessions') {
    const sessions = await getUserRefreshTokens(env.DB, claims.sub);
    return successResponse(sessions, requestId);
  }

  // ── DELETE /v1/auth/sessions — Logout All Devices ──
  if (method === 'DELETE' && pathname === '/v1/auth/sessions') {
    await deleteAllUserRefreshTokens(env.DB, claims.sub);
    return successResponse({ message: 'All active sessions revoked' }, requestId);
  }

  return null;
}
