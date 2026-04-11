// ═══════════════════════════════════════════════════════════════════
//  main.js  —  ES Module entry point for The Aether Codex
// ═══════════════════════════════════════════════════════════════════

// ── Shared infrastructure (must come first) ──────────────────────
import {
  DATA, GENRES, GACTIVE, CURRENT, SEARCH, ls, K,
  uid, esc, today, fmtDate, h2r, gbyid,
  saveData, saveGenres,
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
//    This runs synchronously as soon as the imports above resolve,
//    before any section files or async work starts.
Object.assign(window, {
  nav, render, renderPage,
  openMob, closeMob, driveAction,
  DATA, GENRES, GACTIVE, CURRENT, SEARCH, ls, K,
  uid, esc, today, fmtDate, h2r, gbyid,
  saveData, saveGenres,
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

// ── Migration — dynamic import so a 404 is non-fatal ─────────────
//    GitHub Pages returns an HTML page for missing files; a static
//    import of that fails with "disallowed MIME type" and kills the
//    entire module graph. Dynamic import() + catch() isolates it.
const migration = await import('./shared/migration.js').catch(() => null);

// ── Boot ──────────────────────────────────────────────────────────
(async function boot() {
  // Run schema migration before first render.
  if (migration?.runMigrationV1) {
    try {
      const result = await migration.runMigrationV1();
      if (result?.ran && typeof toast === 'function') {
        toast(
          `✓ Schema updated: ${result.entriesAfter} flat entries ` +
          `(${result.groups} group${result.groups !== 1 ? 's' : ''} expanded)`,
          '#34d399'
        );
      }
    } catch(e) {
      console.error('[Migration V1] Fatal error:', e);
    }
  }

  // Determine initial section.
  const h       = location.hash.replace('#/', '').replace('#', '');
  const initial = h || localStorage.getItem('ac_last_section') || 'home';

  // First render.
  nav(initial, false);

  // Drive auth (non-blocking — UI is already visible).
  driveBootstrap().catch(e => console.error('[Drive] bootstrap error:', e));

  // Reveal app.
  document.body.style.visibility            = 'visible';
  document.documentElement.style.visibility = 'visible';
})();
