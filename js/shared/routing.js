// js/shared/routing.js
import { getCURRENT, setSEARCH } from './utils.js';

// Section render functions are accessed via window until those files are
// also converted to ES modules. Swap each window.renderX for a direct
// named import as you migrate each section file.
export function renderPage(id) {
  const c = document.getElementById('content');
  switch (id) {
    case 'media':    window.renderMedia?.(c);       break;
    case 'home':     window.renderHome?.(c);        break;
    case 'games':    window.renderGames?.(c);       break;
    case 'music':    window.renderMusic?.(c);       break;
    case 'books':    window.renderBooks?.(c);       break;
    case 'vault':    window.renderVault?.(c);       break;
    case 'notes':    window.renderNotes?.(c);       break;
    case 'log':      window.renderLog?.(c);         break;
    case 'tools':    window.renderTools?.(c);       break;
    case 'settings': window.renderSettings?.(c);    break;
    default:         window.renderSectionStub?.(id, c); break;
  }
}

export function render() {
  renderPage(getCURRENT());
}

export function onSearch(val) {
  setSEARCH(val);
  render();
}