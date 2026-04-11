// ═══════════════════════════════════════════════════════════════════
//  main.js  —  ES Module entry point for The Aether Codex
// ═══════════════════════════════════════════════════════════════════

// ── Shared infrastructure (must come first) ──────────────────────
import {
  DATA, GENRES, GACTIVE, CURRENT, SEARCH, MEDIA_PAGE, ls, K,
  uid, esc, today, fmtDate, h2r, gbyid, estTime, fmtMin,
  saveData, saveGenres,
  setDATA, setGENRES, setGACTIVE, setCURRENT, setSEARCH, setMEDIA_PAGE,
  PANEL, PEDIT, FORM_TL, COLLAPSED, DDRG, FDRG,
  setPANEL, setPEDIT, setFORM_TL, setCOLLAPSED, setDDRG, setFDRG,
  stag, rewatchBadge, pcol, SL, SC, SO, SSL,
  applyGenre, buildGenreMenu, toggleGdrop,
  selectGenre, changeGenreColor, addGenre,
  SECTION_META, render,
} from './shared/utils.js';

import { renderPage } from './shared/routing.js';
import { nav }        from './shared/nav.js';
import {
  driveBootstrap, openMob, closeMob, driveAction,
} from './shared/drive.js';

// ── Expose globals IMMEDIATELY so inline onclick="" handlers work ──
Object.assign(window, {
  nav, render, renderPage,
  openMob, closeMob, driveAction,
  DATA, GENRES, GACTIVE, CURRENT, SEARCH, MEDIA_PAGE, ls, K,
  uid, esc, today, fmtDate, h2r, gbyid, estTime, fmtMin,
  saveData, saveGenres,
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
  './sections/music.js',
  './sections/books.js',
  './sections/vault.js',
  './sections/notes.js',
  './sections/log.js',
  './sections/tools.js',
  './sections/settings.js',
  './sections/ai.js',
  './sections/wrapped.js',
  './sections/public.js',
];

await Promise.all(
  sections.map(path =>
    import(path).catch(e =>
      console.warn(`[main] Section failed to load: ${path}`, e.message)
    )
  )
);

// ── Shared extras ─────────────────────────────────────────────────
await import('./shared/extras.js').catch(e =>
  console.warn('[main] extras.js failed to load:', e.message)
);

// ── Migration ─────────────────────────────────────────────────────
const migration = await import('./shared/migration.js').catch(() => null);

// ── Boot ──────────────────────────────────────────────────────────
(async function boot() {

  // ── Run schema migration before first render ───────────────────
  if (migration?.runMigrationV1) {
    try {
      const result = await migration.runMigrationV1();
      if (result?.ran && typeof window.toast === 'function') {
        window.toast(
          `✓ Schema updated: ${result.entriesAfter} flat entries ` +
          `(${result.groups} group${result.groups !== 1 ? 's' : ''} expanded)`,
          '#34d399'
        );
      }
    } catch(e) {
      console.error('[Migration V1] Fatal error:', e);
    }
  }

  // ── Determine initial section ──────────────────────────────────
  //    Priority: URL hash → last saved section → home
  //    On first ever visit (no hash, no saved section) → always home.
  const VALID_SECTIONS = [
    'home','media','games','books','music',
    'vault','notes','log','tools','settings',
    'ai','wrapped','public',
  ];

  const rawHash = location.hash.replace('#/', '').replace('#', '').trim();
  const hash    = VALID_SECTIONS.includes(rawHash) ? rawHash : '';

  // Clear any stale / invalid hash from the URL bar
  if (rawHash && !hash) {
    history.replaceState({}, '', location.pathname);
  }

  const saved   = localStorage.getItem('ac_last_section');
  const isFirstVisit = !hash && !saved;

  // On first visit stamp home so returning visits remember it
  if (isFirstVisit) {
    localStorage.setItem('ac_last_section', 'home');
  }

  const initial = hash || (VALID_SECTIONS.includes(saved) ? saved : 'home');

  // ── First render ───────────────────────────────────────────────
  nav(initial, false);

  // ── Drive auth (non-blocking) ──────────────────────────────────
  driveBootstrap().catch(e => console.error('[Drive] bootstrap error:', e));

  // ── Reveal app ────────────────────────────────────────────────
  document.body.style.visibility            = 'visible';
  document.documentElement.style.visibility = 'visible';

})();
