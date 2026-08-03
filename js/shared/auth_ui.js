// ═══════════════════════════════════════════════════════════════════
//  js/shared/auth_ui.js — Google Sign-In & Navbar Account UI
// ═══════════════════════════════════════════════════════════════════

import { loginWithGoogle, logout, logoutAllSessions, getAccessToken } from './api.js';
import { toast, showAlert, showConfirm } from './ui.js';

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

let googleInitialized = false;

export function initGoogleAuth(retries = 0) {
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
    if (retries < 15) {
      setTimeout(() => initGoogleAuth(retries + 1), 600);
    } else {
      console.warn('[Auth UI] Google Identity Services failed to load after retries.');
    }
    return;
  }

  const clientId = window.CLIENT_ID || '750528266098-oudtbb5dcmf4c167sf7l3fu46luqeq11.apps.googleusercontent.com';

  google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleCredentialResponse,
    auto_select: false,
  });

  googleInitialized = true;
  console.info('[Auth UI] Google Identity Services initialized.');
  updateNavbarUserUI();
}

function ensureGoogleInitialized() {
  if (googleInitialized) return true;
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    const clientId = window.CLIENT_ID || '750528266098-oudtbb5dcmf4c167sf7l3fu46luqeq11.apps.googleusercontent.com';
    google.accounts.id.initialize({
      client_id: clientId,
      callback: handleGoogleCredentialResponse,
      auto_select: false,
    });
    googleInitialized = true;
    return true;
  }
  return false;
}

export function promptGoogleSignIn() {
  if (ensureGoogleInitialized()) {
    google.accounts.id.prompt();
  } else {
    showAlert('Google Sign-In', 'Google Sign-In library is still loading. Please try again in a moment.');
  }
}

async function handleGoogleCredentialResponse(response) {
  if (!response.credential) return;
  try {
    toast('Signing in with Google...', '#60a5fa');
    const user = await loginWithGoogle(response.credential, navigator.userAgent || 'Web Browser');
    setCurrentUser(user);
    toast(`Welcome back, ${user.name || user.email}!`, '#4ade80');
    // Refresh active section data
    if (typeof window.bootApp === 'function') window.bootApp();
  } catch (err) {
    console.warn('[Auth UI] Google Sign-In error:', err.message);
    toast('Google Sign-In failed: ' + (err.message || 'Auth error'), '#fb7185');
  }
}

export function updateNavbarUserUI() {
  const container = document.getElementById('user-auth-wrap');
  if (!container) return;

  const user = getCurrentUser();
  if (user) {
    container.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="window.openAccountModal()" title="${user.email}">
        <img src="${user.picture || 'favicon.png'}" style="width:28px;height:28px;border-radius:50%;border:1px solid var(--ac)" alt="${user.name || 'User'}">
        <span style="font-size:12px;font-weight:600;color:var(--tx)" class="mob-hide">${user.name ? user.name.split(' ')[0] : 'Account'}</span>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button class="nb-btn" onclick="window.promptGoogleSignIn()" style="font-size:11px;font-weight:700;padding:4px 10px;background:var(--ac);color:#000;border:none">Sign In</button>
    `;
  }
}


export function openAccountModal() {
  const user = getCurrentUser();
  if (!user) {
    promptGoogleSignIn();
    return;
  }

  const html = `
    <div style="padding:20px;max-width:400px;margin:0 auto;color:var(--tx);font-family:var(--fd)">
      <div style="text-align:center;margin-bottom:20px">
        <img src="${user.picture || 'favicon.png'}" style="width:64px;height:64px;border-radius:50%;border:2px solid var(--ac);margin-bottom:8px" alt="Avatar">
        <div style="font-size:16px;font-weight:700;color:var(--tx)">${user.name || 'User'}</div>
        <div style="font-size:12px;color:var(--mu)">${user.email}</div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        <button onclick="window.handleLogoutCurrent()" style="padding:10px;border-radius:8px;background:var(--surf2);border:1px solid var(--brd);color:var(--tx);font-weight:600;cursor:pointer">Logout Current Session</button>
        <button onclick="window.handleLogoutAllSessions()" style="padding:10px;border-radius:8px;background:rgba(251,113,133,0.15);border:1px solid rgba(251,113,133,0.3);color:#fb7185;font-weight:600;cursor:pointer">Logout All Devices</button>
      </div>
    </div>
  `;

  if (typeof window.showPanelHtml === 'function') {
    window.showPanelHtml('Account Settings', html);
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
    initGoogleAuth,
    promptGoogleSignIn,
    openAccountModal,
    handleLogoutCurrent,
    handleLogoutAllSessions,
    getCurrentUser,
    setCurrentUser,
  });
}
