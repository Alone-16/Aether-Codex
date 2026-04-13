import {
  CURRENT, setCURRENT,
  GACTIVE, setGACTIVE,
  SEARCH, setSEARCH,
  SECTION_META,
  ls,
  gbyid,
} from './utils.js';

import { renderPage } from './routing.js';

import './crypto.js'; // vault session state (VAULT_UNLOCKED, etc.) — load with nav

// ── openMob / closeMob are defined in drive.js but used here.
//    We import them lazily (patched in by drive.js) to avoid a hard
//    circular dependency at parse time.
let _closeMob = () => {};
export function patchCloseMob(fn) { _closeMob = fn; }

export function nav(id, push = true) {
  const prevId = CURRENT;
  setCURRENT(id);
  localStorage.setItem('ac_last_section', id);
  if (push) try { history.pushState({}, '', ' #/' + (id === 'home' ? '' : id)); } catch(e) {}

  const c = document.getElementById('content');
  const ORDER = ['home','media','games','books','music','notes','vault','tools','settings','log'];
  const pi = ORDER.indexOf(prevId), ni = ORDER.indexOf(id);
  const goingRight = ni > pi;

  c.style.transition = 'none';
  c.style.opacity    = '0';
  c.style.transform  = prevId === id ? 'none' : goingRight ? 'translateX(12px)' : 'translateX(-12px)';

  setTimeout(() => {
    c.style.transition = '';
    document.documentElement.setAttribute('data-section', id);

    const sectionBg = {
      home:'#000000', media:'#000000', games:'#000000',
      books:'#000000', music:'#000000', vault:'#000000',
      log:'#000000', tools:'#000000', settings:'#000000', notes:'#000000',
    };
    document.documentElement.style.background      = sectionBg[id] || sectionBg.home;
    document.documentElement.style.backgroundColor = sectionBg[id] || sectionBg.home;

    document.querySelectorAll('.ni')      .forEach(el => el.classList.toggle('active', el.dataset.r === id));
    document.querySelectorAll('.mob-ni')  .forEach(el => el.classList.toggle('active', el.dataset.r === id));
    document.querySelectorAll('.bn-item') .forEach(el => el.classList.toggle('active', el.dataset.r === id));

    const m = SECTION_META[id] || { title: id, label: id };
    document.getElementById('nb-title').textContent = m.title;
    document.getElementById('nb-sec').textContent   = m.label;

    const srch = document.getElementById('srch');
    srch.placeholder = id === 'home' ? 'Search everything...' : `Search ${m.label}...`;

    // Auto-lock games when leaving
    if (CURRENT !== 'games' && typeof GAMES_UNLOCKED !== 'undefined') {
      GAMES_UNLOCKED = false; clearTimeout(GAMES_IDLE_TIMER);
    }
    // Auto-lock vault when leaving
    if (CURRENT !== 'vault' && typeof lockVaultOnNav === 'function') lockVaultOnNav();

    // Section-specific search handlers
    if      (id === 'games') srch.oninput = e => { GSEARCH = e.target.value.toLowerCase(); renderGamesBody(); };
    else if (id === 'music') srch.oninput = e => { MSEARCH = e.target.value.toLowerCase(); renderMusicBody(); };
    else if (id === 'books') srch.oninput = e => { BSEARCH = e.target.value.toLowerCase(); renderBooksBody(); };
    else if (id === 'vault') srch.oninput = e => { VSEARCH = e.target.value.toLowerCase(); renderVaultBody(); };
    else if (id === 'log')   srch.oninput = e => { LSEARCH = e.target.value.toLowerCase(); renderLogBody();   };
    else if (id === 'notes') srch.oninput = e => { NSEARCH = e.target.value.toLowerCase(); renderNotesBody(); };
    else                     srch.oninput = e => { onSearch(e.target.value); };

    // Apply genre CSS vars for media section
    if (id === 'media') {
      const g   = gbyid(GACTIVE);
      const c2  = g.color;
      const nbSec = document.getElementById('nb-sec');
      if (nbSec) nbSec.textContent = g.name;
      document.documentElement.style.setProperty('--ac', c2);
      const [r, gg, b] = [parseInt(c2.slice(1,3),16), parseInt(c2.slice(3,5),16), parseInt(c2.slice(5,7),16)];
      document.documentElement.style.setProperty('--ac-rgb', `${r},${gg},${b}`);
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

  _closeMob();
}

window.addEventListener('hashchange', () => {
  const h = location.hash.replace('#/', '').replace('#', '');
  nav(h || 'home', false);
});
