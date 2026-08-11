// ═══════════════════════════════════════════════════════════════════
//  js/shared/auth_ui.js — Account Sign In / Sign Up & Navbar UI
// ═══════════════════════════════════════════════════════════════════

import { loginServerAuth, registerUser, logout, logoutAllSessions, getAccessToken } from './api.js';
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
  // Just restore user from storage and update UI — no auto network calls
  getCurrentUser();
  updateNavbarUserUI();
}

// ═══════════════════════════════════════════════════════════════════
//  SIGN IN PANEL
// ═══════════════════════════════════════════════════════════════════
export function promptServerSignIn() {
  const panelInner = document.getElementById('panel-inner');
  const rpanel = document.getElementById('rpanel');
  const poverlay = document.getElementById('poverlay');
  const content = document.getElementById('content');

  if (!panelInner || !rpanel) return;

  rpanel.classList.add('open');
  if (poverlay) poverlay.classList.add('show');
  if (content) content.classList.add('pushed');

  panelInner.innerHTML = `
    <div class="ph">
      <div class="ph-title">Sign In</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="form-wrap" style="padding:20px">
      <div style="font-size:13px;color:var(--tx2);margin-bottom:16px">
        Sign in to your Aether Codex account.
      </div>
      <div class="fg">
        <label class="flbl">Email Address *</label>
        <input class="fin" id="cf-auth-email" type="email" placeholder="user@example.com" autofocus>
      </div>
      <div class="fg">
        <label class="flbl">Password *</label>
        <input class="fin" id="cf-auth-password" type="password" placeholder="••••••••" onkeydown="if(event.key==='Enter')submitServerSignIn()">
      </div>
    </div>
    <div class="panel-actions" style="flex-direction:column;gap:8px">
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn-cancel" onclick="closePanel()" style="flex:1">Cancel</button>
        <button class="btn-save" onclick="submitServerSignIn()" style="flex:1">Sign In</button>
      </div>
      <div style="text-align:center;font-size:12px;color:var(--tx2);padding-top:4px">
        Don't have an account? <a href="#" onclick="event.preventDefault();window.promptServerSignUp()" style="color:var(--ac);font-weight:700;text-decoration:none">Sign Up</a>
      </div>
    </div>
  `;
}

export async function submitServerSignIn() {
  const emailInput = document.getElementById('cf-auth-email');
  const passInput = document.getElementById('cf-auth-password');
  const email = emailInput?.value?.trim();
  const password = passInput?.value || '';

  if (!email || !email.includes('@')) {
    showAlert('Please enter a valid email address.', { title: 'Invalid Email' });
    return;
  }
  if (!password) {
    showAlert('Please enter your password.', { title: 'Password Required' });
    return;
  }

  try {
    toast('Signing in...', 'var(--ac)');
    const user = await loginServerAuth(email, password, null, navigator.userAgent || 'Web Browser');
    setCurrentUser(user);
    closePanel();
    toast(`Welcome back, ${user.name || user.email}!`, '#4ade80');
    if (typeof window.bootApp === 'function') window.bootApp();
  } catch (err) {
    console.warn('[Auth UI] Sign in error:', err.message);
    toast('Sign in failed: ' + (err.message || 'Auth error'), '#fb7185');
  }
}

// ═══════════════════════════════════════════════════════════════════
//  SIGN UP PANEL
// ═══════════════════════════════════════════════════════════════════
export function promptServerSignUp() {
  const panelInner = document.getElementById('panel-inner');
  const rpanel = document.getElementById('rpanel');
  const poverlay = document.getElementById('poverlay');
  const content = document.getElementById('content');

  if (!panelInner || !rpanel) return;

  rpanel.classList.add('open');
  if (poverlay) poverlay.classList.add('show');
  if (content) content.classList.add('pushed');

  panelInner.innerHTML = `
    <div class="ph">
      <div class="ph-title">Create Account</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="form-wrap" style="padding:20px">
      <div style="font-size:13px;color:var(--tx2);margin-bottom:16px">
        Create a new Aether Codex account.
      </div>
      <div class="fg">
        <label class="flbl">Display Name</label>
        <input class="fin" id="reg-name" type="text" placeholder="Your Name" autofocus>
      </div>
      <div class="fg">
        <label class="flbl">Email Address *</label>
        <input class="fin" id="reg-email" type="email" placeholder="user@example.com">
      </div>
      <div class="fg">
        <label class="flbl">Password * (min 6 chars)</label>
        <input class="fin" id="reg-password" type="password" placeholder="••••••••">
      </div>
      <div class="fg">
        <label class="flbl">Confirm Password *</label>
        <input class="fin" id="reg-password2" type="password" placeholder="••••••••" onkeydown="if(event.key==='Enter')submitServerSignUp()">
      </div>
    </div>
    <div class="panel-actions" style="flex-direction:column;gap:8px">
      <div style="display:flex;gap:8px;width:100%">
        <button class="btn-cancel" onclick="closePanel()" style="flex:1">Cancel</button>
        <button class="btn-save" onclick="submitServerSignUp()" style="flex:1">Sign Up</button>
      </div>
      <div style="text-align:center;font-size:12px;color:var(--tx2);padding-top:4px">
        Already have an account? <a href="#" onclick="event.preventDefault();window.promptServerSignIn()" style="color:var(--ac);font-weight:700;text-decoration:none">Sign In</a>
      </div>
    </div>
  `;
}

export async function submitServerSignUp() {
  const nameInput = document.getElementById('reg-name');
  const emailInput = document.getElementById('reg-email');
  const passInput = document.getElementById('reg-password');
  const pass2Input = document.getElementById('reg-password2');
  const name = nameInput?.value?.trim();
  const email = emailInput?.value?.trim();
  const password = passInput?.value || '';
  const password2 = pass2Input?.value || '';

  if (!email || !email.includes('@')) {
    showAlert('Please enter a valid email address.', { title: 'Invalid Email' });
    return;
  }
  if (!password || password.length < 6) {
    showAlert('Password must be at least 6 characters.', { title: 'Weak Password' });
    return;
  }
  if (password !== password2) {
    showAlert('Passwords do not match.', { title: 'Mismatch' });
    return;
  }

  try {
    toast('Creating account...', 'var(--ac)');
    const user = await registerUser(email, password, name, navigator.userAgent || 'Web Browser');
    setCurrentUser(user);
    closePanel();
    toast(`Welcome, ${user.name || user.email}! Account created.`, '#4ade80');
    if (typeof window.bootApp === 'function') window.bootApp();
  } catch (err) {
    console.warn('[Auth UI] Sign up error:', err.message);
    toast('Sign up failed: ' + (err.message || 'Registration error'), '#fb7185');
  }
}

// ═══════════════════════════════════════════════════════════════════
//  NAVBAR USER UI
// ═══════════════════════════════════════════════════════════════════
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
      <div style="display:flex;gap:6px;align-items:center">
        <button class="nb-btn" onclick="window.promptServerSignIn()" style="font-size:11px;font-weight:700;padding:4px 10px;background:transparent;color:var(--ac);border:1px solid var(--ac)">Sign In</button>
        <button class="nb-btn" onclick="window.promptServerSignUp()" style="font-size:11px;font-weight:700;padding:4px 10px;background:var(--ac);color:#000;border:none">Sign Up</button>
      </div>
    `;
  }
}

// ═══════════════════════════════════════════════════════════════════
//  ACCOUNT MODAL
// ═══════════════════════════════════════════════════════════════════
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
    promptServerSignUp,
    submitServerSignIn,
    submitServerSignUp,
    openAccountModal,
    handleLogoutCurrent,
    handleLogoutAllSessions,
    getCurrentUser,
    setCurrentUser,
  });
}
