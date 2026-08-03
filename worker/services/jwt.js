// ═══════════════════════════════════════════════════════════════════
//  worker/services/jwt.js — WebCrypto JWT & Token Hashing
// ═══════════════════════════════════════════════════════════════════

const DEFAULT_JWT_SECRET = 'aether-codex-jwt-secret-key-change-in-prod-vars';

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) {
    str += '=';
  }
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getCryptoKey(secret) {
  const enc = new TextEncoder();
  return await crypto.subtle.importKey(
    'raw',
    enc.encode(secret || DEFAULT_JWT_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/** Lean JWT Token generation (sub, email, iat, exp). Access token expires in 15 minutes. */
export async function signJWT(payload, secret, expiresInSeconds = 900) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encClaims = base64UrlEncode(new TextEncoder().encode(JSON.stringify(claims)));
  const dataToSign = `${encHeader}.${encClaims}`;

  const key = await getCryptoKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(dataToSign));
  const encSignature = base64UrlEncode(signature);

  return `${dataToSign}.${encSignature}`;
}

export async function verifyJWT(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [encHeader, encClaims, encSignature] = parts;
  const dataToSign = `${encHeader}.${encClaims}`;

  try {
    const key = await getCryptoKey(secret);
    const signature = base64UrlDecode(encSignature);
    const valid = await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(dataToSign));
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(encClaims)));
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp && claims.exp < now) return null;

    return claims;
  } catch (e) {
    return null;
  }
}

/** Compute SHA-256 hash of a refresh token string for secure D1 storage. */
export async function hashToken(token) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(token));
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
