import { successResponse, errorResponse } from '../utils/response.js';
import { signJWT, hashToken } from '../services/jwt.js';
import { upsertUser, storeRefreshToken, findRefreshToken, deleteRefreshToken, deleteAllUserRefreshTokens, getUserRefreshTokens } from '../services/d1.js';

// ── Password Hashing (PBKDF2 via WebCrypto) ──────────────────────
async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const hashArr = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  return saltHex + ':' + hashArr;
}

async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [saltHex, expectedHash] = stored.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  const hashArr = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return hashArr === expectedHash;
}

// ── Helper: issue tokens ──────────────────────────────────────────
async function issueTokens(request, env, requestId, user, deviceName) {
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
    deviceName: deviceName || request.headers.get('User-Agent') || 'Web Browser',
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

export async function handleAuth(request, env, ctx, requestId, pathname) {
  const method = request.method;

  // ── POST /v1/auth/register — Create New Account ──
  if (method === 'POST' && pathname === '/v1/auth/register') {
    let body = {};
    try { body = await request.json(); } catch (e) {}

    const { email, password, name, device_name } = body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return errorResponse('INVALID_INPUT', 'Valid email address required', requestId, 400);
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return errorResponse('INVALID_INPUT', 'Password must be at least 6 characters', requestId, 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    const userId = 'usr_' + btoa(cleanEmail).replace(/=/g, '').replace(/[^a-zA-Z0-9]/g, '');

    // Check if user already exists
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?;').bind(cleanEmail).first();
    if (existing) {
      return errorResponse('USER_EXISTS', 'An account with this email already exists. Please sign in.', requestId, 409);
    }

    const passwordHash = await hashPassword(password);

    const user = {
      id: userId,
      email: cleanEmail,
      name: name || cleanEmail.split('@')[0],
      picture: null,
    };

    // Insert user with password hash
    await env.DB.prepare(
      `INSERT INTO users (id, email, name, picture, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, unixepoch())
       ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, password_hash = excluded.password_hash;`
    ).bind(user.id, user.email, user.name, null, passwordHash).run();

    return await issueTokens(request, env, requestId, user, device_name);
  }

  // ── POST /v1/auth/login — Sign In with Email & Password ──
  if (method === 'POST' && pathname === '/v1/auth/login') {
    let body = {};
    try { body = await request.json(); } catch (e) {}

    const { email, password, device_name } = body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return errorResponse('INVALID_INPUT', 'Valid email address required', requestId, 400);
    }
    if (!password || typeof password !== 'string') {
      return errorResponse('INVALID_INPUT', 'Password required', requestId, 400);
    }

    const cleanEmail = email.toLowerCase().trim();

    // Find user by email
    const userRow = await env.DB.prepare('SELECT id, email, name, picture, password_hash FROM users WHERE email = ?;').bind(cleanEmail).first();
    if (!userRow) {
      return errorResponse('USER_NOT_FOUND', 'No account found with this email. Please sign up first.', requestId, 401);
    }

    // Verify password
    if (!userRow.password_hash) {
      return errorResponse('NO_PASSWORD', 'This account was created before passwords were required. Please sign up again.', requestId, 401);
    }

    const valid = await verifyPassword(password, userRow.password_hash);
    if (!valid) {
      return errorResponse('WRONG_PASSWORD', 'Incorrect password', requestId, 401);
    }

    const user = {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name,
      picture: userRow.picture,
    };

    return await issueTokens(request, env, requestId, user, device_name);
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
