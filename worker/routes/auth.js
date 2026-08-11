import { successResponse, errorResponse } from '../utils/response.js';
import { signJWT, hashToken } from '../services/jwt.js';
import { upsertUser, storeRefreshToken, findRefreshToken, deleteRefreshToken, deleteAllUserRefreshTokens, getUserRefreshTokens } from '../services/d1.js';

export async function handleAuth(request, env, ctx, requestId, pathname) {
  const method = request.method;

  // ── POST /v1/auth/cf-access — Cloudflare Access Edge Auth ──
  if (method === 'POST' && pathname === '/v1/auth/cf-access') {
    const cfEmail = request.headers.get('CF-Access-Authenticated-User-Email');
    const cfUserId = request.headers.get('CF-Access-Authenticated-User-Id');

    let body = {};
    try { body = await request.json(); } catch (e) {}
    const email = cfEmail || body.email;
    if (!email) {
      return errorResponse('UNAUTHORIZED', 'Cloudflare Access headers or email required', requestId, 401);
    }

    const userId = cfUserId || 'cf_' + btoa(email.toLowerCase().trim()).replace(/=/g, '');
    const user = {
      id: userId,
      email: email.toLowerCase().trim(),
      name: body.name || email.split('@')[0],
      picture: body.picture || null,
    };

    await upsertUser(env.DB, user);

    const jwtSecret = env.JWT_SECRET || 'aether-codex-jwt-secret-key-change-in-prod-vars';
    const accessToken = await signJWT({ sub: user.id, email: user.email }, jwtSecret, 900);

    const rawRefreshToken = crypto.randomUUID() + '-' + crypto.randomUUID();
    const tokenHash = await hashToken(rawRefreshToken);
    const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 3600);
    const ipAddress = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

    await storeRefreshToken(env.DB, {
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash,
      deviceName: body.device_name || request.headers.get('User-Agent') || 'Cloudflare Device',
      ipAddress,
      expiresAt,
    });

    return successResponse({
      user,
      access_token: accessToken,
      refresh_token: rawRefreshToken,
      expires_in: 900,
    }, requestId);
  }

  // ── POST /v1/auth/login — Server-Side Cloudflare Direct Login ──
  if (method === 'POST' && pathname === '/v1/auth/login') {
    let body = {};
    try { body = await request.json(); } catch (e) {}

    const { email, name, device_name } = body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return errorResponse('INVALID_INPUT', 'Valid email address required', requestId, 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    const userId = 'usr_' + btoa(cleanEmail).replace(/=/g, '').replace(/[^a-zA-Z0-9]/g, '');

    const user = {
      id: userId,
      email: cleanEmail,
      name: name || cleanEmail.split('@')[0],
      picture: null,
    };

    await upsertUser(env.DB, user);

    const jwtSecret = env.JWT_SECRET || 'aether-codex-jwt-secret-key-change-in-prod-vars';
    const accessToken = await signJWT({ sub: user.id, email: user.email }, jwtSecret, 900);

    const rawRefreshToken = crypto.randomUUID() + '-' + crypto.randomUUID();
    const tokenHash = await hashToken(rawRefreshToken);
    const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 3600);
    const ipAddress = request.headers.get('CF-Connecting-IP') || '127.0.0.1';

    await storeRefreshToken(env.DB, {
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash,
      deviceName: device_name || request.headers.get('User-Agent') || 'Web Browser',
      ipAddress,
      expiresAt,
    });

    return successResponse({
      user,
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
