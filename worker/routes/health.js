// ═══════════════════════════════════════════════════════════════════
//  worker/routes/health.js — Versioned Worker Health Check Endpoint
// ═══════════════════════════════════════════════════════════════════

import { successResponse } from '../utils/response.js';

export async function handleHealthRoute(request, env, ctx, requestId, pathname) {
  if (request.method === 'GET' && pathname === '/v1/health') {
    const healthData = {
      status: 'ok',
      environment: env.ENVIRONMENT || 'development',
      version: '1.0.0',
      commit: '7f13ab4',
      timestamp: Math.floor(Date.now() / 1000),
    };
    return successResponse(healthData, requestId);
  }
  return null;
}
