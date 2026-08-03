// ═══════════════════════════════════════════════════════════════════
//  worker/services/r2.js — Cloudflare R2 Object Storage Service
// ═══════════════════════════════════════════════════════════════════

export async function computeSHA256(arrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', arrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function uploadFileToR2(bucket, key, body, contentType) {
  return await bucket.put(key, body, {
    httpMetadata: {
      contentType: contentType || 'application/octet-stream',
    },
  });
}

export async function getFileFromR2(bucket, key) {
  return await bucket.get(key);
}

export async function deleteFileFromR2(bucket, key) {
  return await bucket.delete(key);
}
