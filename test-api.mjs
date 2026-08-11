// ═══════════════════════════════════════════════════════════════════
//  test-api.mjs — Local API Integration Test Script
//  Run: node test-api.mjs
// ═══════════════════════════════════════════════════════════════════

const BASE = 'http://127.0.0.1:8787';

// Step 1: Generate a test JWT locally (same algorithm as worker/services/jwt.js)
async function signTestJWT() {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    sub: 'test-user-001',
    email: 'test@aethercodex.dev',
    iat: now,
    exp: now + 3600, // 1 hour
  };

  const secret = 'aether-codex-jwt-secret-key-change-in-prod-vars'; // matches default in jwt.js

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  const b64url = (buf) => {
    const bytes = new Uint8Array(buf);
    let str = '';
    for (let i = 0; i < bytes.byteLength; i++) str += String.fromCharCode(bytes[i]);
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const encHeader = b64url(enc.encode(JSON.stringify(header)));
  const encClaims = b64url(enc.encode(JSON.stringify(claims)));
  const dataToSign = `${encHeader}.${encClaims}`;
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(dataToSign));

  return `${dataToSign}.${b64url(signature)}`;
}

async function req(method, path, body = null, token = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE}${path}`, opts);
  const json = await res.json();
  const status = res.status;
  return { status, json };
}

function log(label, result) {
  const icon = result.json.success ? '✅' : '❌';
  console.log(`${icon} [${result.status}] ${label}`);
  if (!result.json.success) console.log('   Error:', result.json.error);
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log(' Aether Codex API — Local Integration Tests');
  console.log('═══════════════════════════════════════════════\n');

  // First, seed a test user directly via the auth endpoint workaround
  // We need the user to exist in D1 for authenticated routes to work.
  // For local testing, we'll insert via a settings PUT which auto-creates via JWT sub.

  const token = await signTestJWT();
  console.log('🔑 Generated test JWT token\n');

  // But first — the user row must exist. Let's seed it via a direct D1 call...
  // Actually, authenticated routes just use claims.sub as user_id.
  // D1 queries will just return empty results for a non-existent user — that's fine for testing.

  // ── Test 0: Health Check ──
  console.log('── Health Check Test ──');
  const healthRes = await req('GET', '/v1/health');
  log('GET /v1/health → 200', healthRes);

  // ── Test 1: Unauthenticated routes return 401 ──
  console.log('\n── Auth Guard Tests ──');
  const noAuth = await req('GET', '/v1/media');
  log('GET /v1/media (no token) → 401', noAuth);

  // ── Test 2: Authenticated GET (empty results) ──
  console.log('\n── Authenticated CRUD Tests ──');
  const mediaList = await req('GET', '/v1/media', null, token);
  log('GET /v1/media → empty list', mediaList);

  // ── Test 3: POST create a media item ──
  const createMedia = await req('POST', '/v1/media', {
    title: 'Naruto Shippuden',
    genre_id: 'anime',
    status: 'watching',
    score: 8.5,
    ep_cur: 120,
    ep_tot: 500,
  }, token);
  log('POST /v1/media (create Naruto)', createMedia);
  const mediaId = createMedia.json?.data?.id;

  // ── Test 4: PATCH partial update ──
  if (mediaId) {
    const patchMedia = await req('PATCH', `/v1/media/${mediaId}`, {
      ep_cur: 125,
      score: 9.0,
    }, token);
    log('PATCH /v1/media/:id (ep 120→125, score 8.5→9)', patchMedia);
  }

  // ── Test 5: GET media list (should have 1 item) ──
  const mediaAfter = await req('GET', '/v1/media', null, token);
  log(`GET /v1/media → ${mediaAfter.json?.data?.length || 0} item(s)`, mediaAfter);

  // ── Test 6: POST create a game ──
  const createGame = await req('POST', '/v1/games', {
    title: 'Cyberpunk 2077',
    platform: 'pc',
    status: 'playing',
    rating: 9,
    hours_played: 45,
  }, token);
  log('POST /v1/games (create Cyberpunk)', createGame);

  // ── Test 7: POST create a book ──
  const createBook = await req('POST', '/v1/books', {
    title: 'Dune',
    author: 'Frank Herbert',
    format: 'novel',
    status: 'reading',
    progress_cur: 150,
    progress_tot: 688,
  }, token);
  log('POST /v1/books (create Dune)', createBook);

  // ── Test 8: POST create a note with tags ──
  const createNote = await req('POST', '/v1/notes', {
    title: 'Linux Setup Guide',
    content: 'Install Arch Linux with BTRFS filesystem...',
    tags: ['linux', 'coding', 'setup'],
  }, token);
  log('POST /v1/notes (with 3 tags)', createNote);

  // ── Test 9: GET notes (check tags) ──
  const notesList = await req('GET', '/v1/notes', null, token);
  log(`GET /v1/notes → ${notesList.json?.data?.length || 0} note(s)`, notesList);
  if (notesList.json?.data?.[0]?.tags) {
    console.log('   Tags:', notesList.json.data[0].tags);
  }

  // ── Test 10: PUT settings ──
  const putSettings = await req('PUT', '/v1/settings', {
    settings: { theme: 'dark', fontSize: 'medium', density: 'default' },
    genres: [{ id: 'anime', name: 'Anime', color: '#e879a0' }],
  }, token);
  log('PUT /v1/settings', putSettings);

  // ── Test 11: GET settings ──
  const getSettings = await req('GET', '/v1/settings', null, token);
  log('GET /v1/settings', getSettings);

  // ── Test 12: FTS5 Search ──
  const search = await req('GET', '/v1/search?q=Naruto', null, token);
  log(`GET /v1/search?q=Naruto → ${search.json?.data?.length || 0} result(s)`, search);

  // ── Test 14: R2 File Upload (POST /v1/files/upload) ──
  console.log('\n── R2 File Upload Tests ──');
  const sampleContent = 'SAVED_GAME_DATA_v1_BINARY_BLOB_CONTENT';
  const fileUploadRes = await fetch(`${BASE}/v1/files/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'X-Game-Title': 'Cyberpunk 2077',
      'X-Filename': 'save01.dat',
      'X-Relative-Path': 'saves/save01.dat',
    },
    body: sampleContent,
  });
  const fileUploadJson = await fileUploadRes.json();
  if (fileUploadRes.status === 503) {
    console.log('ℹ️ [503] R2 Storage is optional and disabled on Cloudflare account.');
  } else {
    log('POST /v1/files/upload (Upload Cyberpunk save file)', { status: fileUploadRes.status, json: fileUploadJson });
  }
  const fileId = fileUploadJson.data?.id;

  // ── Test 15: List Game Files (GET /v1/files/game/:gameTitle) ──
  if (fileId) {
    const listFiles = await req('GET', '/v1/files/game/Cyberpunk%202077', null, token);
    log(`GET /v1/files/game/Cyberpunk 2077 → ${listFiles.json?.data?.length || 0} file(s)`, listFiles);

    // ── Test 16: Download Game File (GET /v1/files/download/:id) ──
    const dlRes = await fetch(`${BASE}/v1/files/download/${fileId}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    const dlText = await dlRes.text();
    const dlMatch = dlRes.status === 200 && dlText === sampleContent;
    console.log(`${dlMatch ? '✅' : '❌'} [${dlRes.status}] GET /v1/files/download/:id → ${dlText.length} bytes downloaded (content match: ${dlMatch})`);

    // ── Test 17: Delete Game File (DELETE /v1/files/:id) ──
    const delFile = await req('DELETE', `/v1/files/${fileId}`, null, token);
    log('DELETE /v1/files/:id', delFile);
  }

  // ── Test 18: Server Auth (/v1/auth/login) ──
  console.log('\n── Cloudflare Server Auth Tests ──');
  const serverLogin = await req('POST', '/v1/auth/login', { email: 'cloud@aethercodex.dev', name: 'Cloud User' });
  log('POST /v1/auth/login (Server auth)', serverLogin);

  // ── Test 19: YouTube Playlist Link Sync (/v1/music/sync-playlist) ──
  console.log('\n── YT Music Link Sync Tests ──');
  const playlistSync = await req('POST', '/v1/music/sync-playlist', {
    playlist_url: 'https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG',
    sync_interval_days: 5,
  }, token);
  log('POST /v1/music/sync-playlist (Sync 5-day interval)', playlistSync);

  // ── Test 20: 404 Route ──
  const notFound = await req('GET', '/v1/doesnotexist', null, token);
  log('GET /v1/doesnotexist → 404', notFound);

  console.log('\n═══════════════════════════════════════════════');
  console.log(' Tests complete!');
  console.log('═══════════════════════════════════════════════');
}

main().catch(e => { console.error('Fatal test error:', e); process.exit(1); });
