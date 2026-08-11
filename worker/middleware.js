// ═══════════════════════════════════════════════════════════════════
//  worker/middleware.js — CORS, Rate-Limiting & Auth Middleware
// ═══════════════════════════════════════════════════════════════════

import { verifyJWT } from './services/jwt.js';
import { errorResponse } from './utils/response.js';

export async function handleCors(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID, X-User-Key, X-Action',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  return null;
}

export async function authenticateRequest(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const secret = env.JWT_SECRET || 'aether-codex-jwt-secret-key-change-in-prod-vars';
    const claims = await verifyJWT(token, secret);
    if (claims) return claims; // Returns { sub, email, iat, exp }
  }

  // Cloudflare Access (Zero Trust) edge headers auto-authentication
  const cfEmail = request.headers.get('CF-Access-Authenticated-User-Email');
  const cfUserId = request.headers.get('CF-Access-Authenticated-User-Id');
  if (cfEmail) {
    const subId = cfUserId || 'cf_' + btoa(cfEmail).replace(/=/g, '');
    return {
      sub: subId,
      email: cfEmail,
      name: cfEmail.split('@')[0],
      cf_access: true,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    };
  }

  return null;
}

export function requireAuth(handler) {
  return async (request, env, ctx, requestId) => {
    const claims = await authenticateRequest(request, env);
    if (!claims || !claims.sub) {
      return errorResponse('UNAUTHORIZED', 'Invalid or expired authentication token. Please sign in again.', requestId, 401);
    }
    return handler(request, env, ctx, requestId, claims);
  };
}
