// ═══════════════════════════════════════════════════════════════════
//  worker/routes/files.js — R2 Object Upload & Game Save Folder Files
// ═══════════════════════════════════════════════════════════════════

import { successResponse, errorResponse } from '../utils/response.js';
import { sanitizeString } from '../utils/validation.js';
import { computeSHA256, uploadFileToR2, getFileFromR2, deleteFileFromR2 } from '../services/r2.js';

export async function handleFilesRoutes(request, env, ctx, requestId, pathname, claims) {
  const method = request.method;
  const userId = claims.sub;

  if (!pathname.startsWith('/v1/files')) return null;

  if (!env.BUCKET) {
    return errorResponse('STORAGE_NOT_CONFIGURED', 'R2 Storage bucket is not enabled on Cloudflare account yet.', requestId, 503);
  }

  // ── POST /v1/files/upload — Upload File/Save File to R2 ──
  if (method === 'POST' && pathname === '/v1/files/upload') {
    const contentType = request.headers.get('Content-Type') || '';
    const gameTitle = sanitizeString(request.headers.get('X-Game-Title') || 'Default', 200);
    const relativePath = sanitizeString(request.headers.get('X-Relative-Path') || '', 500);

    let filename = 'file_' + Date.now() + '.bin';
    let fileBuffer;
    let mimeType = 'application/octet-stream';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file || !(file instanceof File)) {
        return errorResponse('INVALID_INPUT', 'Missing file in multipart form data', requestId, 400);
      }
      filename = file.name || filename;
      mimeType = file.type || mimeType;
      fileBuffer = await file.arrayBuffer();
    } else {
      // Octet-stream raw body upload
      filename = sanitizeString(request.headers.get('X-Filename') || filename, 200);
      mimeType = contentType.split(';')[0] || mimeType;
      fileBuffer = await request.arrayBuffer();
    }

    if (!fileBuffer || fileBuffer.byteLength === 0) {
      return errorResponse('INVALID_INPUT', 'File payload cannot be empty', requestId, 400);
    }

    const fileId = crypto.randomUUID();
    const checksum = await computeSHA256(fileBuffer);
    const finalRelPath = relativePath || filename;
    const r2Key = `users/${userId}/games/${gameTitle}/${fileId}/${filename}`;

    // Upload object to R2 Bucket
    await uploadFileToR2(env.BUCKET, r2Key, fileBuffer, mimeType);

    // Save metadata in D1
    await env.DB.prepare(`
      INSERT INTO user_files (id, user_id, game_title, filename, relative_path, mime_type, size_bytes, checksum, r2_key, uploaded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch());
    `).bind(fileId, userId, gameTitle, filename, finalRelPath, mimeType, fileBuffer.byteLength, checksum, r2Key).run();

    const record = await env.DB.prepare('SELECT * FROM user_files WHERE id = ? AND user_id = ?;').bind(fileId, userId).first();
    return successResponse(record, requestId, 201);
  }

  // ── GET /v1/files/game/:gameTitle — List all files for a game ──
  if (method === 'GET' && pathname.startsWith('/v1/files/game/')) {
    const rawTitle = decodeURIComponent(pathname.split('/v1/files/game/')[1] || '');
    const { results } = await env.DB.prepare(
      'SELECT * FROM user_files WHERE user_id = ? AND game_title = ? ORDER BY uploaded_at DESC;'
    ).bind(userId, rawTitle).all();
    return successResponse(results || [], requestId);
  }

  // ── GET /v1/files/download/:id — Download File from R2 ──
  if (method === 'GET' && pathname.startsWith('/v1/files/download/')) {
    const fileId = pathname.split('/v1/files/download/')[1];
    const record = await env.DB.prepare('SELECT * FROM user_files WHERE id = ? AND user_id = ?;').bind(fileId, userId).first();
    if (!record) return errorResponse('NOT_FOUND', 'File metadata not found', requestId, 404);

    const object = await getFileFromR2(env.BUCKET, record.r2_key);
    if (!object) return errorResponse('NOT_FOUND', 'Object not found in R2 storage', requestId, 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Content-Disposition', `attachment; filename="${record.filename}"`);
    headers.set('Access-Control-Allow-Origin', '*');

    return new Response(object.body, { headers });
  }

  // ── DELETE /v1/files/:id — Delete File ──
  if (method === 'DELETE' && pathname.startsWith('/v1/files/')) {
    const fileId = pathname.split('/')[3];
    const record = await env.DB.prepare('SELECT * FROM user_files WHERE id = ? AND user_id = ?;').bind(fileId, userId).first();
    if (!record) return errorResponse('NOT_FOUND', 'File not found', requestId, 404);

    await deleteFileFromR2(env.BUCKET, record.r2_key);
    await env.DB.prepare('DELETE FROM user_files WHERE id = ? AND user_id = ?;').bind(fileId, userId).run();

    return successResponse({ deleted: true, id: fileId }, requestId);
  }

  return null;
}
