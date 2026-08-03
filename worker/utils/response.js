// ═══════════════════════════════════════════════════════════════════
//  worker/utils/response.js — Standard API Response Helper
// ═══════════════════════════════════════════════════════════════════

export function jsonResponse(payload, status = 200, headers = {}) {
  const defaultCors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-ID, X-User-Key',
    'Content-Type': 'application/json',
  };
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...defaultCors, ...headers },
  });
}

export function successResponse(data, requestId, status = 200, extra = {}) {
  const reqId = requestId || crypto.randomUUID();
  return jsonResponse({
    success: true,
    data,
    request_id: reqId,
    ...extra,
  }, status, { 'X-Request-ID': reqId });
}

export function errorResponse(code, message, requestId, status = 400) {
  const reqId = requestId || crypto.randomUUID();
  return jsonResponse({
    success: false,
    error: {
      code: code || 'BAD_REQUEST',
      message: message || 'An error occurred processing your request.',
    },
    request_id: reqId,
  }, status, { 'X-Request-ID': reqId });
}
