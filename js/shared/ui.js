'use strict';

import { setPANEL, setPEDIT, render } from './utils.js';

export function showConfirm(msg, onOk, opts = {}) {
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
  el.querySelector('#modal-ok').onclick     = () => { el.remove(); onOk(); };
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
  document.getElementById('rpanel').classList.remove('open');
  document.getElementById('poverlay').classList.remove('show');
  document.getElementById('content').classList.remove('pushed');
  render();
}
