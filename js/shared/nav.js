// js/shared/nav.js
import {
  getCURRENT, setCURRENT, setSEARCH,
  SECTION_META, getGACTIVE, gbyid,
} from './utils.js';
import { renderPage, onSearch } from './routing.js';

const SECTION_ORDER = ['home','media','games','books','music','vault','log','tools','settings'];

// ── Mobile sidebar ──────────────────────────────────────────────────────
export function openMob() {
  document.getElementById('mob-ov').classList.add('show');
  document.getElementById('mob-sb').classList.add('open');
}

export function closeMob() {
  document.getElementById('mob-ov').classList.remove('show');
  document.getElementById('mob-sb').classList.remove('open');
}

// ── Main navigation ─────────────────────────────────────────────────────
export function nav(id, push = true) {
  const prevId = getCURRENT();
  setCURRENT(id);
  localStorage.setItem('ac_last_section', id);
  if (push) try { history.pushState({}, '', ' #/' + (id === 'home' ? '' : id)); } catch(e) {}

  const c   = document.getElementById('content');
  const pi  = SECTION_ORDER.indexOf(prevId);
  const ni  = SECTION_ORDER.indexOf(id);
  const dir = ni > pi ? 'translateX(12px)' : 'translateX(-12px)';

  c.style.transition = 'none';
  c.style.opacity    = '0';
  c.style.transform  = prevId === id ? 'none' : dir;

  setTimeout(() => {
    c.style.transition = '';
    document.documentElement.setAttribute('data-section', id);

    const sectionBg = {
      home:'#070d0b', media:'#07000f', games:'#080600',
      books:'#f5f0e8', music:'#080400', vault:'#f0eefa',
      log:'#010c14', tools:'#080006', settings:'#0a0a12', notes:'#d0e8d0',
    };
    document.documentElement.style.background      = sectionBg[id] || sectionBg.home;
    document.documentElement.style.backgroundColor = sectionBg[id] || sectionBg.home;

    document.querySelectorAll('.ni').forEach(el     => el.classList.toggle('active', el.dataset.r === id));
    document.querySelectorAll('.mob-ni').forEach(el => el.classList.toggle('active', el.dataset.r === id));
    document.querySelectorAll('.bn-item').forEach(el => el.classList.toggle('active', el.dataset.r === id));

    const meta = SECTION_META[id] || { title: id, label: id };
    document.getElementById('nb-title').textContent = meta.title;
    document.getElementById('nb-sec').textContent   = meta.label;

    const srch = document.getElementById('srch');
    srch.placeholder = id === 'home' ? 'Search everything...' : `Search ${meta.label}...`;
    document.getElementById('filterbar').style.display = id === 'media' ? 'flex' : 'none';

    // Auto-lock: games ──────────────────────────────────────────────────
    // Replace with direct import once games.js is a module.
    if (id !== 'games' && typeof window.GAMES_UNLOCKED !== 'undefined') {
      window.GAMES_UNLOCKED = false;
      clearTimeout(window.GAMES_IDLE_TIMER);
    }
    // Auto-lock: vault ──────────────────────────────────────────────────
    if (id !== 'vault' && typeof window.lockVaultOnNav === 'function') {
      window.lockVaultOnNav();
    }

    // Per-section search handlers ────────────────────────────────────────
    // Replace each window.XSEARCH / window.renderXBody with a direct
    // import once that section file is converted to a module.
    const searchMap = {
      games: e => { window.GSEARCH = e.target.value.toLowerCase(); window.renderGamesBody?.(); },
      music: e => { window.MSEARCH = e.target.value.toLowerCase(); window.renderMusicBody?.(); },
      books: e => { window.BSEARCH = e.target.value.toLowerCase(); window.renderBooksBody?.(); },
      vault: e => { window.VSEARCH = e.target.value.toLowerCase(); window.renderVaultBody?.(); },
      log:   e => { window.LSEARCH = e.target.value.toLowerCase(); window.renderLogBody?.();   },
      notes: e => { window.NSEARCH = e.target.value.toLowerCase(); window.renderNotesBody?.(); },
    };
    srch.oninput = searchMap[id] ?? (e => onSearch(e.target.value));

    // Genre CSS vars (media only) ────────────────────────────────────────
    if (id === 'media') {
      const g = gbyid(getGACTIVE()), clr = g.color;
      const nbSec = document.getElementById('nb-sec');
      if (nbSec) nbSec.textContent = g.name;
      document.documentElement.style.setProperty('--ac', clr);
      document.documentElement.style.setProperty('--ac-rgb',
        `${parseInt(clr.slice(1,3),16)},${parseInt(clr.slice(3,5),16)},${parseInt(clr.slice(5,7),16)}`);
    } else {
      document.documentElement.style.removeProperty('--ac');
      document.documentElement.style.removeProperty('--ac-rgb');
    }

    renderPage(id);

    requestAnimationFrame(() => {
      c.style.opacity   = '1';
      c.style.transform = 'translateX(0)';
    });
  }, 150);

  closeMob();
}

// Hash-based routing (module-level side effect — runs once on import)
window.addEventListener('hashchange', () => {
  const h = location.hash.replace('#/', '').replace('#', '');
  nav(h || 'home', false);
});