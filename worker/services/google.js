// ═══════════════════════════════════════════════════════════════════
//  worker/services/google.js — Google OAuth & External API Services
// ═══════════════════════════════════════════════════════════════════

export async function verifyGoogleToken(idToken, clientId) {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (clientId && data.aud !== clientId) {
      console.warn('[Google Auth] Client ID mismatch:', data.aud, clientId);
    }
    return {
      id: data.sub,
      email: data.email,
      name: data.name,
      picture: data.picture,
    };
  } catch (e) {
    console.error('[Google Auth] Token verify failed:', e);
    return null;
  }
}

export async function exchangeGoogleCode(code, redirectUri, clientId, clientSecret) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  return await res.json();
}
