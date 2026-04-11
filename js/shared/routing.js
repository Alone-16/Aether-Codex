import {
  CURRENT,
  patchRender,
} from './utils.js';

// Patch the lazy render stub in utils so selectGenre / saveData can call render()
// without a circular import.
patchRender(() => renderPage(CURRENT));

export function renderPage(id) {
  const c = document.getElementById('content');
  if      (id === 'media')    renderMedia(c);
  else if (id === 'home')     renderHome(c);
  else if (id === 'games')    renderGames(c);
  else if (id === 'music')    renderMusic(c);
  else if (id === 'books')    renderBooks(c);
  else if (id === 'vault')    renderVault(c);
  else if (id === 'notes')    renderNotes(c);
  else if (id === 'log')      renderLog(c);
  else if (id === 'tools')    renderTools(c);
  else if (id === 'settings') renderSettings(c);
  else                        renderSectionStub(id, c);
}

// Convenience alias used throughout the codebase.
export function render() { renderPage(CURRENT); }
