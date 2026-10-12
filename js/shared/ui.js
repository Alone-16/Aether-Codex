'use strict';

import { setPANEL, setPEDIT } from './utils.js';

export function showConfirm(arg1, arg2, arg3) {
  let msg = '';
  let onOk = null;
  let opts = {};

  if (typeof arg2 === 'function') {
    msg = arg1;
    onOk = arg2;
    opts = arg3 || {};
  } else if (typeof arg3 === 'function') {
    msg = arg2;
    onOk = arg3;
    opts = { title: arg1 };
  } else {
    msg = typeof arg2 === 'string' ? arg2 : (arg1 || '');
    opts = typeof arg1 === 'string' && typeof arg2 === 'string' ? { title: arg1 } : {};
  }

  const isDanger = opts.danger !== false;
  const title    = opts.title || (isDanger ? '⚠ Confirm' : 'Confirm');
  const okLabel  = opts.okLabel || (isDanger ? 'Delete' : 'OK');
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">${title}</div>
      <div class="modal-msg">${msg}</div>
      <div class="modal-btns">
        <button class="modal-btn cancel" id="modal-cancel">Cancel</button>
        <button class="modal-btn ${isDanger ? 'danger' : 'confirm'}" id="modal-ok">${okLabel}</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#modal-cancel').onclick = () => el.remove();
  el.querySelector('#modal-ok').onclick     = () => { el.remove(); if (typeof onOk === 'function') onOk(); };
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  setTimeout(() => el.querySelector('#modal-ok').focus(), 50);
}

export function showAlert(msg, opts = {}) {
  const title = opts.title || 'Notice';
  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal-box">
      <div class="modal-title">${title}</div>
      <div class="modal-msg">${msg}</div>
      <div class="modal-btns">
        <button class="modal-btn confirm" id="modal-ok">OK</button>
      </div>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#modal-ok').onclick = () => el.remove();
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  setTimeout(() => el.querySelector('#modal-ok').focus(), 50);
}

export function toast(msg, col) {
  const el = document.createElement('div');
  el.className = 'toast-el';
  if (col) el.style.borderLeftColor = col;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2200);
}

export function closePanel() {
  setPANEL(null);
  setPEDIT(null);
  if (typeof window !== 'undefined') {
    if (typeof window.setGPANEL === 'function') {
      window.setGPANEL(null);
      window.setGPEDIT(null);
    } else {
      window.GPANEL = null; window.GPEDIT = null;
    }
    if (typeof window.setBPANEL === 'function') {
      window.setBPANEL(null);
      window.setBPEDIT(null);
    } else {
      window.BPANEL = null; window.BPEDIT = null;
    }
    if (typeof window.setNPANEL === 'function') {
      window.setNPANEL(null);
      window.setNEDIT_ID(null);
    }
    if (typeof window.setVEDIT_ID === 'function') {
      window.setVEDIT_ID(null);
    }
  }
  document.getElementById('rpanel')?.classList.remove('open');
  document.getElementById('poverlay')?.classList.remove('show');
  document.getElementById('content')?.classList.remove('pushed');
  document.querySelectorAll('.m-card-active, .note-card-active, .active-row').forEach(c => {
    c.classList.remove('m-card-active', 'note-card-active', 'active-row');
  });
}

// ── Virtual Scroll & Card Slot Infrastructure ───────────────────────────
let _cardObserver = null;
const _slotCache = new WeakMap();
if (typeof window !== 'undefined') {
  window._slotCache = _slotCache;
}

export function _observeCardVisibility(container) {
  if (!container) return;
  if (_cardObserver) _cardObserver.disconnect();

  // Immediately reveal any non-slotted lazy elements (e.g. Dashboard / Upcoming stats)
  container.querySelectorAll('.m-card-lazy:not(.m-card-slot *)').forEach(el => {
    el.classList.add('m-card-visible');
  });

  const slots = container.querySelectorAll('.m-card-slot');
  if (!slots.length) return;

  if (typeof IntersectionObserver === 'undefined') {
    slots.forEach(slot => {
      const cache = _slotCache.get(slot);
      if (cache) {
        slot.style.minHeight = '';
        slot.innerHTML = cache.html;
        slot.dataset.loaded = '1';
        slot.firstElementChild?.classList.add('m-card-visible');
      }
    });
    return;
  }

  let batchIndex = 0;
  let batchFrame = null;

  _cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const slot = entry.target;
      const cache = _slotCache.get(slot);
      if (!cache) return;

      if (entry.isIntersecting) {
        // ── LOAD: populate card HTML into the slot ──
        if (slot.dataset.loaded === '1') return;
        slot.style.minHeight = '';
        slot.innerHTML = cache.html;
        slot.dataset.loaded = '1';

        // Animate in with stagger
        const card = slot.firstElementChild;
        if (card) {
          const delay = batchIndex * 0.035;
          card.style.animationDelay = delay + 's';
          card.classList.add('m-card-visible');
          batchIndex++;
        }
        if (!batchFrame) {
          batchFrame = requestAnimationFrame(() => {
            batchIndex = 0;
            batchFrame = null;
          });
        }
      } else {
        // ── UNLOAD: replace with height placeholder ──
        if (slot.dataset.loaded !== '1') return;
        // Save measured height so scroll position stays stable
        cache.height = slot.offsetHeight;
        slot.style.minHeight = cache.height + 'px';
        slot.innerHTML = '';
        slot.dataset.loaded = '0';
      }
    });
  }, {
    // Pre-load ahead so cards are ready before user sees them
    rootMargin: '600px 0px',
    threshold: 0
  });

  slots.forEach(slot => _cardObserver.observe(slot));
}

/** Wraps a card HTML string into a virtual-scroll slot div */
export function _cardSlot(cardHtml, entryId) {
  const slotId = entryId ? `slot-${entryId}` : '';
  return `<div class="m-card-slot" id="${slotId}" data-loaded="0" data-card-html style="min-height:62px"></div>`;
}

/** After innerHTML is set, hydrate slot elements with their card HTML */
export function _hydrateSlots(container, htmlMap) {
  if (!container || !htmlMap) return;
  const slots = container.querySelectorAll('.m-card-slot[data-card-html]');
  let i = 0;
  slots.forEach(slot => {
    if (i < htmlMap.length) {
      _slotCache.set(slot, { html: htmlMap[i], height: 62 });
      slot.removeAttribute('data-card-html');
    }
    i++;
  });
}

/* ── Throttled 3D Tilt (rAF-based) ── */
let _tiltFrame = null;
export function _throttledTilt(el, event) {
  if (_tiltFrame || !el) return;
  _tiltFrame = requestAnimationFrame(() => {
    const r = el.getBoundingClientRect();
    const x = event.clientX - r.left;
    const y = event.clientY - r.top;
    el.style.setProperty('--mouse-x', x + 'px');
    el.style.setProperty('--mouse-y', y + 'px');
    el.style.setProperty('--rot-x', ((y / r.height) - 0.5) * -8 + 'deg');
    el.style.setProperty('--rot-y', ((x / r.width) - 0.5) * 8 + 'deg');
    _tiltFrame = null;
  });
}

export { _slotCache };

// Assign to window for immediate global availability
if (typeof window !== 'undefined') {
  Object.assign(window, {
    _cardSlot,
    _hydrateSlots,
    _observeCardVisibility,
    _throttledTilt,
    _slotCache,
  });
}

