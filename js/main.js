// ═══════════════════════════════════════════════════════════════════
//  main.js  —  ES Module entry point for The Aether Codex
// ═══════════════════════════════════════════════════════════════════

// ── Shared infrastructure (must come first) ──────────────────────
import {
  DATA, GENRES, GACTIVE, CURRENT, SEARCH, MEDIA_PAGE, ls, K, DATA_VERSION,
  uid, esc, today, fmtDate, h2r, gbyid, estTime, entryStats, fmtMin,
  saveData, saveGenres, scheduleDriveSync,
  setDATA, setGENRES, setGACTIVE, setCURRENT, setSEARCH, setMEDIA_PAGE,
  PANEL, PEDIT, FORM_TL, COLLAPSED, DDRG, FDRG,
  setPANEL, setPEDIT, setFORM_TL, setCOLLAPSED, setDDRG, setFDRG,
  stag, rewatchBadge, pcol, SL, SC, SO, SSL,
  applyGenre, buildGenreMenu, toggleGdrop,
  selectGenre, changeGenreColor, addGenre,
  SECTION_META, render,
} from './shared/utils.js';

import { toast, showConfirm, showAlert, closePanel } from './shared/ui.js';

import { renderPage } from './shared/routing.js';
import { nav }        from './shared/nav.js';
import {
  driveBootstrap, openMob, closeMob, driveAction, syncDrive,
  initGIS,
} from './shared/drive.js';

// ── Expose globals IMMEDIATELY so inline onclick="" handlers work ──
Object.assign(window, {
  nav, render, renderPage,
  toast, showConfirm, showAlert, closePanel,
  openMob, closeMob, driveAction, syncDrive,
  DATA, GENRES, GACTIVE, CURRENT, SEARCH, MEDIA_PAGE, ls, K, DATA_VERSION,
  uid, esc, today, fmtDate, h2r, gbyid, estTime, entryStats, fmtMin,
  saveData, saveGenres, scheduleDriveSync,
  setDATA, setGENRES, setGACTIVE, setCURRENT, setSEARCH, setMEDIA_PAGE,
  PANEL, PEDIT, FORM_TL, COLLAPSED, DDRG, FDRG,
  setPANEL, setPEDIT, setFORM_TL, setCOLLAPSED, setDDRG, setFDRG,
  stag, rewatchBadge, pcol, SL, SC, SO, SSL,
  applyGenre, buildGenreMenu, toggleGdrop,
  selectGenre, changeGenreColor, addGenre,
  SECTION_META,
});

// ── Section renderers ─────────────────────────────────────────────
//    Wrapped individually so a missing/broken file does NOT take
//    down the whole app.
const sections = [
  './sections/home.js',
  './sections/media.js',
  './sections/games.js',
  './sections/books.js',
  './sections/music.js',
  './sections/notes.js',
  './sections/vault.js',
  './sections/tools.js',
  './sections/log.js',
  './sections/settings.js',
  './sections/ai.js'
];

await Promise.all(
  sections.map(path =>
    import(path).catch(e =>
      console.warn(`[main] Section failed to load: ${path}`, e.message)
    )
  )
);

// Apply saved layout (section order, visibility, font/density) — static index.html sidebars
// are defaults only until this runs.
if (typeof window.applySettings === 'function') window.applySettings();

// ── Error Handling ────────────────────────────────────────────────
window.onerror = function(msg, url, line, col, error) {
  if (window.SETTINGS && window.SETTINGS.devMode) {
    if (typeof window.toast === 'function') window.toast(`[Dev Error] ${msg}`, '#fb7185');
  }
};
window.onunhandledrejection = function(e) {
  if (window.SETTINGS && window.SETTINGS.devMode) {
    const msg = e.reason && e.reason.message ? e.reason.message : String(e.reason);
    if (typeof window.toast === 'function') window.toast(`[Dev Promise] ${msg}`, '#fb7185');
  }
};

import {
  refreshAuth, getAccessToken, checkHealth,
  mediaApi, gamesApi, booksApi, musicApi, notesApi, vaultApi, logsApi, settingsApi
} from './shared/api.js';

import { initServerAuth, updateNavbarUserUI } from './shared/auth_ui.js';

// ── Shared extras ─────────────────────────────────────────────────
await import('./shared/extras.js').catch(e =>
  console.warn('[main] extras.js failed to load:', e.message)
);

// ── Boot ──────────────────────────────────────────────────────────
async function boot() {
  console.log('[Boot] v2 starting, hash:', location.hash);

  // ── 0. Handle MAL OAuth Callback FIRST (before anything clears the URL) ──
  const rawHashFull = location.hash;
  if (rawHashFull.includes('code=') && rawHashFull.includes('state=mal')) {
    console.log('[Boot] MAL OAuth callback detected in hash');
    const hashQuery = rawHashFull.split('?')[1];
    if (hashQuery) {
      const hp = new URLSearchParams(hashQuery);
      const oauthCode  = hp.get('code');
      const oauthState = hp.get('state');
      const oauthError = hp.get('error');
      if (oauthCode || oauthError) {
        console.log('[Boot] Stashing OAuth params:', { code: oauthCode?.substring(0, 20) + '...', state: oauthState, error: oauthError });
        if (oauthCode)  sessionStorage.setItem('_ac_oauth_code',  oauthCode);
        if (oauthState) sessionStorage.setItem('_ac_oauth_state', oauthState);
        if (oauthError) sessionStorage.setItem('_ac_oauth_error', oauthError);
      }
    }
  }

  // 1. Check Worker Health Endpoint
  const health = await checkHealth();
  if (health) {
    console.info(`[Boot] Worker Connected (${health.environment || 'dev'}, v${health.version || '1.0.0'})`);
  } else {
    console.warn('[Boot] Worker Health Check unreachable. Will retry on request.');
  }

  // 2. Initialize Server Auth & Auth UI
  await initServerAuth();

  // 3. Attempt silent refresh of auth tokens
  if (!getAccessToken()) {
    await refreshAuth().catch(() => {});
  }
  updateNavbarUserUI();

  // Determine initial section
  const VALID_SECTIONS = [
    'home','media','games','books','music',
    'vault','notes','log','tools','settings',
    'ai','wrapped','public',
  ];

  const rawHash = location.hash.replace('#/', '').replace('#', '').trim();
  const sectionPart = rawHash.split('?')[0] || '';
  const hash = VALID_SECTIONS.includes(sectionPart) ? sectionPart : '';

  if (rawHash && !hash) {
    history.replaceState({}, '', location.pathname);
  }

  const saved   = localStorage.getItem('ac_last_section');
  const isFirstVisit = !hash && !saved;

  if (isFirstVisit) {
    localStorage.setItem('ac_last_section', 'home');
  }

  const initial = hash || (VALID_SECTIONS.includes(saved) ? saved : 'home');

  // Render shell
  nav(initial, false);

  // Reveal app
  document.body.style.visibility            = 'visible';
  document.documentElement.style.visibility = 'visible';

  // 4. Fetch User Data directly into JS memory (No LocalStorage / IndexedDB Caching)
  if (getAccessToken()) {
    try {
      await Promise.all([
        mediaApi.getAll().then(d => { if (Array.isArray(d)) (typeof window.setDATA === 'function' ? window.setDATA(d) : window.DATA = d); }).catch(() => {}),
        gamesApi.getAll().then(d => { if (Array.isArray(d)) (typeof window.setGDATA === 'function' ? window.setGDATA(d) : window.GDATA = d); }).catch(() => {}),
        booksApi.getAll().then(d => { if (Array.isArray(d)) (typeof window.setBDATA === 'function' ? window.setBDATA(d) : window.BDATA = d); }).catch(() => {}),
        musicApi.getAll().then(d => {
          if (d.tracks) (typeof window.setMDATA === 'function' ? window.setMDATA(d.tracks) : window.MDATA = d.tracks);
          if (d.playlists) (typeof window.setMPLAYLISTS === 'function' ? window.setMPLAYLISTS(d.playlists) : window.MPLAYLISTS = d.playlists);
        }).catch(() => {}),
        notesApi.getAll().then(d => { if (Array.isArray(d)) (typeof window.setNDATA === 'function' ? window.setNDATA(d) : window.NDATA = d); }).catch(() => {}),
        vaultApi.getAll().then(d => { if (Array.isArray(d)) (typeof window.setVDATA_PUBLIC === 'function' ? window.setVDATA_PUBLIC(d) : window.VDATA_PUBLIC = d); }).catch(() => {}),
        logsApi.getAll().then(d => { if (Array.isArray(d)) window.LDATA = d; }).catch(() => {}),
        settingsApi.get().then(d => {
          if (d.settings) window.SETTINGS = { ...(window.SETTINGS || {}), ...d.settings };
          if (d.genres && Array.isArray(d.genres)) window.setGENRES(d.genres);
        }).catch(() => {}),
      ]);
    } catch (e) {
      console.warn('[Boot] Data fetch error:', e.message);
    }
  }

  // Re-render active section with memory data
  if (typeof window.render === 'function') window.render();

  // 5. Initialize Drive/OAuth — handles MAL callback redirect & Google sync
  driveBootstrap().catch(e => console.error('[Boot] driveBootstrap error:', e));
}

window.bootApp = boot;
boot();

