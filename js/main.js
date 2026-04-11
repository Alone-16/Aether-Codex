// ═══════════════════════════════════════════════════════════════════
//  main.js  —  ES Module entry point for The Aether Codex
//
//  Import order matters: shared utilities first, then sections,
//  then extras/migration so everything is defined before boot.
// ═══════════════════════════════════════════════════════════════════

// ── Shared infrastructure ────────────────────────────────────────
import './shared/utils.js';
import './shared/routing.js';
import './shared/nav.js';
import { driveBootstrap, openMob, closeMob, driveAction, initGIS } from './shared/drive.js';

// ── Section renderers ────────────────────────────────────────────
import './sections/home.js';
import './sections/media.js';
import './sections/games.js';
import './sections/music.js';
import './sections/books.js';
import './sections/vault.js';
import './sections/notes.js';
import './sections/log.js';
import './sections/tools.js';
import './sections/settings.js';
import './sections/ai.js';
import './sections/wrapped.js';
import './sections/public.js';

// ── Shared extras & migration ────────────────────────────────────
import './shared/extras.js';
import './migration.js';

// ── Expose legacy globals that inline onclick="" handlers still need ──
//    Remove these one by one as you convert the remaining section files.
import { nav }                                     from './shared/nav.js';
import { render }                                  from './shared/routing.js';
import {
  DATA, GENRES, GACTIVE, CURRENT, SEARCH, ls, K,
  uid, esc, today, fmtDate, h2r, gbyid,
  saveData, saveGenres,
  stag, rewatchBadge, pcol, SL, SC, SO, SSL,
  applyGenre, buildGenreMenu, toggleGdrop,
  selectGenre, changeGenreColor, addGenre,
  SECTION_META,
} from './shared/utils.js';

// Assign to window so un-converted inline handlers and section files
// that still use bare globals continue to work during the migration.
Object.assign(window, {
  // navigation
  nav, render,
  openMob, closeMob, driveAction,
  // state & utils
  DATA, GENRES, GACTIVE, CURRENT, SEARCH, ls, K,
  uid, esc, today, fmtDate, h2r, gbyid,
  saveData, saveGenres,
  stag, rewatchBadge, pcol, SL, SC, SO, SSL,
  // genre UI
  applyGenre, buildGenreMenu, toggleGdrop,
  selectGenre, changeGenreColor, addGenre,
  SECTION_META,
});

// ── Boot ─────────────────────────────────────────────────────────
(async function boot() {
  // Determine initial section from hash or last-saved preference.
  const h       = location.hash.replace('#/', '').replace('#', '');
  const initial = h || localStorage.getItem('ac_last_section') || 'home';

  // First render.
  nav(initial, false);

  // Drive auth + migration.
  await driveBootstrap();

  // Reveal app (body was hidden to prevent FOUC).
  document.body.style.visibility = 'visible';
  document.documentElement.style.visibility = 'visible';
})();
