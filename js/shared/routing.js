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

let renderSeq = 0;

export async function renderPage(id) {
  const c = document.getElementById('content');
  if (!c) return;

  const seq = ++renderSeq;

  // Try the explicit map first, then fall back to auto-derive name
  const fnName = SECTION_RENDERERS[id]
    || ('render' + id.charAt(0).toUpperCase() + id.slice(1));

  if (typeof window[fnName] !== 'function') {
    c.innerHTML = `<div style="padding:60px 20px;text-align:center;color:var(--mu);font-family:var(--fd);font-size:13px;letter-spacing:.5px;display:flex;flex-direction:column;align-items:center;gap:12px">
      <div style="width:20px;height:20px;border:2px solid var(--surf2);border-top-color:var(--ac);border-radius:50%;animation:routing-spin .6s linear infinite"></div>
      Loading ${id}...
    </div>
    <style>@keyframes routing-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}</style>`;
    
    try {
      await import(`../sections/${id}.js`);
    } catch (e) {
      if (seq === renderSeq) {
        console.warn(`[routing] lazy load failed for section ${id}:`, e);
      }
    }
  }

  if (seq !== renderSeq) return;

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
