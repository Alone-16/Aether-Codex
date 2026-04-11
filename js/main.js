// js/main.js  — browser entry point
// This is the ONLY script loaded as type="module" in index.html.
// Electron's main.js (root/main.js) is CommonJS and is completely separate.

import {
  // Genre / theme
  applyGenre, buildGenreMenu, toggleGdrop, selectGenre,
  changeGenreColor, addGenre,
  // State readers used by inline HTML (read-only is fine via window)
  getDATA, getGENRES, getCURRENT, getGACTIVE,
  saveData, saveGenres,
  uid, esc, fmtDate, gbyid,
  stag, rewatchBadge, pcol,
  SL, SC, SO, SSL, SECTION_META,
} from './shared/utils.js';

import { nav, openMob, closeMob } from './shared/nav.js';

import { render, renderPage, onSearch } from './shared/routing.js';

import {
  driveAction, scheduleDriveSync, initGIS,
  startMALAuth, refreshMALAccessToken,
} from './shared/drive.js';

// ── Expose everything that index.html inline onclick= attributes call ─────
// Modules are NOT auto-global. Every function referenced in HTML must be
// explicitly attached to window here.
Object.assign(window, {
  // Navigation
  nav,
  openMob,
  closeMob,

  // Search & render
  render,
  renderPage,
  onSearch,

  // Drive / auth
  driveAction,
  scheduleDriveSync,
  initGIS,
  startMALAuth,
  refreshMALAccessToken,

  // Genre UI
  toggleGdrop,
  selectGenre,
  changeGenreColor,
  addGenre,

  // Utility helpers used by section files (still non-module scripts)
  uid, esc, fmtDate, gbyid,
  stag, rewatchBadge, pcol,
  SL, SC, SO, SSL, SECTION_META,
  getDATA, getGENRES, getCURRENT, getGACTIVE,
  saveData, saveGenres,

  // openAdd, exportData, importFile, showKeyboardHelp, toggleAI, aiSend,
  // aiKeydown, openPanel, closePanel, showConfirm, toast, openCDD, setCDD …
  // These live in section files / extras.js (not yet uploaded).
  // As those files are converted to modules, import them here and add
  // them to this Object.assign call.
});

// ── Boot ─────────────────────────────────────────────────────────────────
// Determine starting section from URL hash or last saved section.
const _startSection = location.hash.replace('#/', '').replace('#', '')
  || localStorage.getItem('ac_last_section')
  || 'home';
nav(_startSection, false);   // false = don't push a new history entry