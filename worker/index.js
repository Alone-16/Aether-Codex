// ═══════════════════════════════════════════════════════════════════
//  worker/index.js — Main Request Router & Worker Entrypoint
// ═══════════════════════════════════════════════════════════════════

import { handleCors, authenticateRequest } from './middleware.js';
import { successResponse, errorResponse } from './utils/response.js';
import { handleAuth, handleAuthenticatedAuth } from './routes/auth.js';
import { handleMediaRoutes } from './routes/media.js';
import { handleGamesRoutes } from './routes/games.js';
import { handleBooksRoutes } from './routes/books.js';
import { handleMusicRoutes } from './routes/music.js';
import { handleNotesRoutes } from './routes/notes.js';
import { handleVaultRoutes } from './routes/vault.js';
import { handleLogsRoutes } from './routes/logs.js';
import { handleSettingsRoutes } from './routes/settings.js';
import { handleSearchRoutes } from './routes/search.js';
import { handleFilesRoutes } from './routes/files.js';
import { handleHealthRoute } from './routes/health.js';
import { upsertUser } from './services/d1.js';
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';
import manifestJSON from '__STATIC_CONTENT_MANIFEST';

export default {
  async fetch(request, env, ctx) {
    const requestId = crypto.randomUUID();

    // 1. CORS Preflight OPTIONS
    const corsRes = await handleCors(request);
    if (corsRes) return corsRes;

    const url = new URL(request.url);
    const pathname = url.pathname;

    // Handle OAuth Callback Redirection (/auth/callback)
    if (pathname === '/auth/callback') {
      const state = url.searchParams.get('state') || '';
      let targetSection = 'settings';
      if (state.includes(':')) {
        const parts = state.split(':');
        targetSection = parts[parts.length - 1] || 'settings';
      }
      const redirectUrl = `${url.origin}/#/${targetSection}?${url.searchParams.toString()}`;
      return Response.redirect(redirectUrl, 302);
    }

    // Serve static website frontend if route is non-API
    if (!pathname.startsWith('/v1/') && !pathname.startsWith('/mal/') && !pathname.startsWith('/ai/')) {
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
        return env.ASSETS.fetch(request);
      }
      if (env.__STATIC_CONTENT) {
        try {
          const assetManifest = typeof manifestJSON === 'string' ? JSON.parse(manifestJSON) : manifestJSON;
          return await getAssetFromKV(
            { request, waitUntil: (p) => ctx.waitUntil(p) },
            {
              ASSET_NAMESPACE: env.__STATIC_CONTENT,
              ASSET_MANIFEST: assetManifest,
              mapRequestToAsset: (req) => {
                const u = new URL(req.url);
                if (u.pathname === '/' || !u.pathname.includes('.')) {
                  u.pathname = '/index.html';
                }
                return new Request(u.toString(), req);
              }
            }
          );
        } catch (e) {
          console.warn('[Worker Site Asset Fallback Error]', e.message);
        }
      }
      // Ultimate fallback: Proxy non-API website request to Cloudflare Pages
      const pagesUrl = new URL(request.url);
      pagesUrl.hostname = 'aether-codex-cj7.pages.dev';
      return fetch(new Request(pagesUrl.toString(), request));
    }

    try {
      // 1.5 Health check route
      const healthRes = await handleHealthRoute(request, env, ctx, requestId, pathname);
      if (healthRes) return healthRes;

      // 2. Unauthenticated Auth Routes (/v1/auth/cf-access, /v1/auth/login, /v1/auth/refresh, /v1/auth/logout)
      const authRes = await handleAuth(request, env, ctx, requestId, pathname);
      if (authRes) return authRes;

      // 2.5 MAL OAuth Endpoints (Authorize URL, Token Exchange & Refresh)
      const action = request.headers.get('X-Action');
      const malClientId = env.MAL_CLIENT_ID || '97959fe7356ea8135f3b19db28cb941f';
      const malClientSecret = env.MAL_CLIENT_SECRET || '';

      if (action === 'mal_authorize_url' || pathname === '/mal/auth') {
        let body = {};
        try { body = await request.json(); } catch (e) {}
        const redirectUri = body.redirect_uri || `${url.origin}/auth/callback`;
        const codeChallenge = body.code_challenge || '';
        const state = body.state || '';
        const authUrl = `https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=${malClientId}&code_challenge=${codeChallenge}&code_challenge_method=plain&state=${encodeURIComponent(state)}&redirect_uri=${encodeURIComponent(redirectUri)}`;
        return successResponse({ url: authUrl }, requestId);
      }

      if (action === 'mal_exchange_code' || pathname === '/mal/token') {
        let body = {};
        try { body = await request.json(); } catch (e) {}
        const formParams = new URLSearchParams({
          client_id: malClientId,
          client_secret: malClientSecret,
          code: body.code || '',
          code_verifier: body.code_verifier || '',
          grant_type: 'authorization_code',
          redirect_uri: body.redirect_uri || `${url.origin}/auth/callback`
        });

        const malTokenRes = await fetch('https://myanimelist.net/v1/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formParams
        });
        const tokenData = await malTokenRes.json();
        if (!malTokenRes.ok) return errorResponse('MAL_TOKEN_ERROR', tokenData.error_description || tokenData.message || 'MAL token exchange failed', requestId, malTokenRes.status);
        return successResponse(tokenData, requestId);
      }

      if (action === 'mal_refresh_token' || pathname === '/mal/refresh') {
        let body = {};
        try { body = await request.json(); } catch (e) {}
        const formParams = new URLSearchParams({
          client_id: malClientId,
          client_secret: malClientSecret,
          refresh_token: body.refresh_token || '',
          grant_type: 'refresh_token'
        });

        const malRefreshRes = await fetch('https://myanimelist.net/v1/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formParams
        });
        const refreshData = await malRefreshRes.json();
        if (!malRefreshRes.ok) return errorResponse('MAL_REFRESH_ERROR', refreshData.error_description || refreshData.message || 'MAL token refresh failed', requestId, malRefreshRes.status);
        return successResponse(refreshData, requestId);
      }

      // 3. MAL API Search Proxy (Preserved)
      if (request.method === 'GET' && pathname === '/mal/search') {
        const q = url.searchParams.get('q');
        if (!q) return errorResponse('MISSING_QUERY', 'Provide ?q= parameter', requestId, 400);
        const malRes = await fetch(
          `https://api.myanimelist.net/v2/anime?q=${encodeURIComponent(q)}&limit=10&fields=id,title,alternative_titles,main_picture,num_episodes,mean,status,media_type,start_date,broadcast,average_episode_duration,synopsis`,
          { headers: { 'X-MAL-CLIENT-ID': env.MAL_CLIENT_ID } }
        );
        const data = await malRes.json();
        if (!malRes.ok) return errorResponse('MAL_ERROR', data.message || 'MAL search failed', requestId, malRes.status);
        const results = (data.data || []).map(({ node: n }) => ({
          id: n.id,
          title: n.title,
          title_en: n.alternative_titles?.en || null,
          image: n.main_picture?.medium || n.main_picture?.large || null,
          episodes: n.num_episodes || null,
          duration_min: n.average_episode_duration ? Math.round(n.average_episode_duration / 60) : 24,
          synopsis: n.synopsis || null,
          score: n.mean || null,
          status: n.status || null,
          media_type: n.media_type || null,
          start_date: n.start_date || null,
          broadcast: n.broadcast || null,
        }));
        return successResponse({ results }, requestId);
      }

      // 4. MAL Detail Proxy (Preserved)
      if (request.method === 'GET' && pathname.startsWith('/mal/anime/')) {
        const id = pathname.split('/mal/anime/')[1];
        if (!id || isNaN(Number(id))) return errorResponse('INVALID_ID', 'Provide numeric MAL anime ID', requestId, 400);
        const fields = ['id', 'title', 'alternative_titles', 'main_picture', 'synopsis', 'mean', 'rank', 'popularity', 'num_episodes', 'status', 'start_date', 'end_date', 'genres', 'media_type', 'average_episode_duration', 'studios', 'source', 'rating', 'related_anime'].join(',');
        const malRes = await fetch(`https://api.myanimelist.net/v2/anime/${id}?fields=${fields}`, { headers: { 'X-MAL-CLIENT-ID': env.MAL_CLIENT_ID } });
        const data = await malRes.json();
        if (!malRes.ok) return errorResponse('MAL_ERROR', data.message || 'MAL detail failed', requestId, malRes.status);
        return successResponse(data, requestId);
      }

      // 5. Gemini AI Generate Endpoint (Preserved)
      if (request.method === 'POST' && (pathname === '/ai/generate' || pathname === '/gemini_ai')) {
        if (!env.GEMINI_API_KEY) return errorResponse('NO_KEY', 'Gemini API key not configured on Worker', requestId, 500);
        let body = {};
        try { body = await request.json(); } catch (e) {}
        const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${env.GEMINI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const aiData = await aiRes.json();
        return successResponse(aiData, requestId, aiRes.status);
      }

      // 6. Authenticated V1 REST API Routes
      const claims = await authenticateRequest(request, env);
      if (!claims || !claims.sub) {
        return errorResponse('UNAUTHORIZED', 'Authentication required. Please sign in.', requestId, 401);
      }

      // Auto-ensure user row exists in D1 (satisfies foreign key constraints on first request)
      await upsertUser(env.DB, { id: claims.sub, email: claims.email || 'unknown@user' });

      // Route to resource controllers
      const authedAuthRes = await handleAuthenticatedAuth(request, env, ctx, requestId, pathname, claims);
      if (authedAuthRes) return authedAuthRes;

      const mediaRes = await handleMediaRoutes(request, env, ctx, requestId, pathname, claims);
      if (mediaRes) return mediaRes;

      const gamesRes = await handleGamesRoutes(request, env, ctx, requestId, pathname, claims);
      if (gamesRes) return gamesRes;

      const booksRes = await handleBooksRoutes(request, env, ctx, requestId, pathname, claims);
      if (booksRes) return booksRes;

      const musicRes = await handleMusicRoutes(request, env, ctx, requestId, pathname, claims);
      if (musicRes) return musicRes;

      const notesRes = await handleNotesRoutes(request, env, ctx, requestId, pathname, claims);
      if (notesRes) return notesRes;

      const vaultRes = await handleVaultRoutes(request, env, ctx, requestId, pathname, claims);
      if (vaultRes) return vaultRes;

      const logsRes = await handleLogsRoutes(request, env, ctx, requestId, pathname, claims);
      if (logsRes) return logsRes;

      const settingsRes = await handleSettingsRoutes(request, env, ctx, requestId, pathname, claims);
      if (settingsRes) return settingsRes;

      const searchRes = await handleSearchRoutes(request, env, ctx, requestId, pathname, claims);
      if (searchRes) return searchRes;

      const filesRes = await handleFilesRoutes(request, env, ctx, requestId, pathname, claims);
      if (filesRes) return filesRes;

      return errorResponse('NOT_FOUND', `Route ${pathname} not found on server`, requestId, 404);
    } catch (err) {
      console.error('[Worker Fatal Error]', err);
      return errorResponse('INTERNAL_ERROR', err.message || 'Server error', requestId, 500);
    }
  },
};
