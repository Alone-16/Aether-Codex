// ═══════════════════════════════════════════════════════════════════
//  js/shared/auth_ui.js — Cloudflare Server-Side & Navbar Account UI
// ═══════════════════════════════════════════════════════════════════

import { loginServerAuth, loginCFAccess, logout, logoutAllSessions, getAccessToken } from './api.js';
import { toast, showAlert, showConfirm, closePanel } from './ui.js';

let currentUser = null;

export function getCurrentUser() {
  if (currentUser) return currentUser;
  try {
    const raw = sessionStorage.getItem('ac_v5_user_profile') || localStorage.getItem('ac_v5_user_profile');
    if (raw) currentUser = JSON.parse(raw);
  } catch (e) {}
  return currentUser;
}

export function setCurrentUser(user) {
  currentUser = user;
  if (user) {
    sessionStorage.setItem('ac_v5_user_profile', JSON.stringify(user));
    localStorage.setItem('ac_v5_user_profile', JSON.stringify(user));
  } else {
    sessionStorage.removeItem('ac_v5_user_profile');
    localStorage.removeItem('ac_v5_user_profile');
  }
  updateNavbarUserUI();
}

export async function initServerAuth() {
  // Silent check for Cloudflare Access Edge headers auto-auth if no token exists
  if (!getAccessToken()) {
    try {
      const user = await loginCFAccess();
      if (user) {
        setCurrentUser(user);
        console.info('[Auth UI] Authenticated via Cloudflare Access Edge.');
      }
    } catch (e) {}
  }
  updateNavbarUserUI();
}

export function promptServerSignIn() {
  const panelInner = document.getElementById('panel-inner');
  const rpanel = document.getElementById('rpanel');
  const poverlay = document.getElementById('poverlay');
  const content = document.getElementById('content');

  if (!panelInner || !rpanel) {
    const email = prompt('Enter your email address to sign in via Cloudflare Worker:');
    if (email) handleDirectSignIn(email);
    return;
  }

  rpanel.classList.add('open');
  if (poverlay) poverlay.classList.add('show');
  if (content) content.classList.add('pushed');

  panelInner.innerHTML = `
    <div class="ph">
      <div class="ph-title">Cloudflare Server Sign In</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="form-wrap" style="padding:20px">
      <div style="font-size:13px;color:var(--tx2);margin-bottom:16px">
        Sign in to your server-side Aether Codex account handled directly by Cloudflare.
      </div>
      <div class="fg">
        <label class="flbl">Email Address *</label>
        <input class="fin" id="cf-auth-email" type="email" placeholder="user@example.com" autofocus>
      </div>
      <div class="fg">
        <label class="flbl">Display Name (optional)</label>
        <input class="fin" id="cf-auth-name" type="text" placeholder="Your Name">
      </div>
    </div>
    <div class="panel-actions">
      <button class="btn-cancel" onclick="closePanel()">Cancel</button>
      <button class="btn-save" onclick="submitServerSignIn()">Sign In</button>
    </div>
  `;
}

export async function submitServerSignIn() {
  const emailInput = document.getElementById('cf-auth-email');
  const nameInput = document.getElementById('cf-auth-name');
  const email = emailInput?.value?.trim();
  const name = nameInput?.value?.trim();

  if (!email || !email.includes('@')) {
    showAlert('Please enter a valid email address.', { title: 'Invalid Email' });
    return;
  }

  try {
    toast('Authenticating with Cloudflare Worker...', 'var(--ac)');
    const user = await loginServerAuth(email, name, navigator.userAgent || 'Web Browser');
    setCurrentUser(user);
    closePanel();
    toast(`Welcome back, ${user.name || user.email}!`, '#4ade80');
    if (typeof window.bootApp === 'function') window.bootApp();
  } catch (err) {
    console.warn('[Auth UI] Cloudflare Server Auth error:', err.message);
    toast('Sign in failed: ' + (err.message || 'Auth error'), '#fb7185');
  }
}

async function handleDirectSignIn(email) {
  try {
    toast('Authenticating with Cloudflare Worker...', 'var(--ac)');
    const user = await loginServerAuth(email, null, navigator.userAgent || 'Web Browser');
    setCurrentUser(user);
    toast(`Welcome back, ${user.name || user.email}!`, '#4ade80');
    if (typeof window.bootApp === 'function') window.bootApp();
  } catch (err) {
    toast('Sign in failed: ' + err.message, '#fb7185');
  }
}

export function updateNavbarUserUI() {
  const container = document.getElementById('user-auth-wrap');
  if (!container) return;

  const user = getCurrentUser();
  if (user) {
    const initial = (user.name || user.email || 'A').charAt(0).toUpperCase();
    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="window.openAccountModal()" title="${user.email}">
        <div style="width:28px;height:28px;border-radius:50%;border:1px solid var(--ac);background:var(--surf2);color:var(--ac);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${initial}</div>
        <span style="font-size:12px;font-weight:600;color:var(--tx)" class="mob-hide">${user.name ? user.name.split(' ')[0] : 'Account'}</span>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button class="nb-btn" onclick="window.promptServerSignIn()" style="font-size:11px;font-weight:700;padding:4px 10px;background:var(--ac);color:#000;border:none">Sign In</button>
    `;
  }
}

export function openAccountModal() {
  const user = getCurrentUser();
  if (!user) {
    promptServerSignIn();
    return;
  }

  const initial = (user.name || user.email || 'A').charAt(0).toUpperCase();
  const html = `
    <div style="padding:20px;max-width:400px;margin:0 auto;color:var(--tx);font-family:var(--fd)">
      <div style="text-align:center;margin-bottom:20px">
        <div style="width:64px;height:64px;border-radius:50%;border:2px solid var(--ac);background:var(--surf2);color:var(--ac);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;margin:0 auto 8px">${initial}</div>
        <div style="font-size:16px;font-weight:700;color:var(--tx)">${user.name || 'User'}</div>
        <div style="font-size:12px;color:var(--mu)">${user.email}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button onclick="window.handleLogoutCurrent()" style="padding:10px;border-radius:8px;background:var(--surf2);border:1px solid var(--brd);color:var(--tx);font-weight:600;cursor:pointer">Logout Current Session</button>
        <button onclick="window.handleLogoutAllSessions()" style="padding:10px;border-radius:8px;background:rgba(251,113,133,0.15);border:1px solid rgba(251,113,133,0.3);color:#fb7185;font-weight:600;cursor:pointer">Logout All Devices</button>
      </div>
    </div>
  `;

  const panelInner = document.getElementById('panel-inner');
  const rpanel = document.getElementById('rpanel');
  const poverlay = document.getElementById('poverlay');
  const content = document.getElementById('content');

  if (panelInner && rpanel) {
    panelInner.innerHTML = `
      <div class="ph">
        <div class="ph-title">Account Settings</div>
        <button class="ph-close" onclick="closePanel()">✕</button>
      </div>
      ${html}
    `;
    rpanel.classList.add('open');
    if (poverlay) poverlay.classList.add('show');
    if (content) content.classList.add('pushed');
  } else {
    alert(`Account: ${user.name} (${user.email})`);
  }
}

export async function handleLogoutCurrent() {
  const confirmed = await showConfirm('Logout', 'Are you sure you want to log out of this session?');
  if (!confirmed) return;
  await logout();
  setCurrentUser(null);
  toast('Logged out successfully', '#fb7185');
  location.reload();
}

export async function handleLogoutAllSessions() {
  const confirmed = await showConfirm('Revoke All Sessions', 'This will log you out of all active devices. Proceed?');
  if (!confirmed) return;
  await logoutAllSessions();
  setCurrentUser(null);
  toast('All active sessions revoked', '#fb7185');
  location.reload();
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    initServerAuth,
    promptServerSignIn,
    submitServerSignIn,
    openAccountModal,
    handleLogoutCurrent,
    handleLogoutAllSessions,
    getCurrentUser,
    setCurrentUser,
  });
}
