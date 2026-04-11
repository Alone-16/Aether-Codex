import {
  CURRENT,
  patchRender,
} from './utils.js';

// Patch the lazy render stub in utils so selectGenre / saveData can call render()
// without a circular import.
patchRender(() => renderPage(CURRENT));

// Valid sections and their render function names
const SECTION_RENDERERS = {
  home    : 'renderHome',
  media   : 'renderMedia',
  games   : 'renderGames',
  music   : 'renderMusic',
  books   : 'renderBooks',
  vault   : 'renderVault',
  notes   : 'renderNotes',
  log     : 'renderLog',
  tools   : 'renderTools',
  settings: 'renderSettings',
};

export function renderPage(id) {
  const c = document.getElementById('content');
  if (!c) return;

  // Try the explicit map first, then fall back to auto-derive name
  const fnName = SECTION_RENDERERS[id]
    || ('render' + id.charAt(0).toUpperCase() + id.slice(1));

  if (typeof window[fnName] === 'function') {
    window[fnName](c);
  } else if (typeof window.renderSectionStub === 'function') {
    window.renderSectionStub(id, c);
  } else {
    c.innerHTML = `<div style="padding:40px;text-align:center;color:var(--mu)">
      Section <strong>${id}</strong> is not available yet.
    </div>`;
  }
}

// Convenience alias used throughout the codebase.
export function render() { renderPage(CURRENT); }
