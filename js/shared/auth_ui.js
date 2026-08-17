// ═══════════════════════════════════════════════════════════════════
//  js/shared/auth_ui.js — Account Sign In / Sign Up & Navbar UI
// ═══════════════════════════════════════════════════════════════════

import { loginServerAuth, registerUser, logout, logoutAllSessions, getAccessToken } from './api.js';
import { toast, showAlert, showConfirm, closePanel } from './ui.js';

let currentUser = null;

export function getCurrentUser() {
  if (currentUser) return currentUser;
  try {
    const raw = sessionStorage.getItem('ac_v5_user_profile') || localStorage.getItem('ac_v5_user_profile') || localStorage.getItem('ac_user') || localStorage.getItem('user');
    if (raw) {
      let parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.user) parsed = parsed.user;
        currentUser = parsed;
      }
    }
  } catch (e) {}

  if (!currentUser) {
    const token = getAccessToken();
    if (token && token.includes('.')) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload && (payload.email || payload.sub)) {
          currentUser = {
            id: payload.sub,
            email: payload.email || (payload.sub && payload.sub.includes('@') ? payload.sub : ''),
            name: payload.name || (payload.email ? payload.email.split('@')[0] : 'User')
          };
        }
      } catch (e) {}
    }
  }
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
  // Restore user from storage and update UI
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
        <input class="fin" id="cf-auth-email" type="email" placeholder="user@example.com" autocapitalize="none" autocorrect="off" spellcheck="false" autofocus>
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
  const email = emailInput?.value?.trim()?.toLowerCase();
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
    if (typeof window.bootApp === 'function') {
      try { await window.bootApp(); } catch (e) {}
    }
    setTimeout(() => location.reload(), 200);
  } catch (err) {
    console.warn('[Auth UI] Sign in error:', err.message);
    const msg = err.message || '';
    if (msg.includes('No account found') || msg.includes('USER_NOT_FOUND') || msg.includes('sign up')) {
      showAlert('No account found with this email. Please click "Sign Up" to create a new account.', { title: 'Account Not Found' });
      promptServerSignUp();
    } else if (msg.includes('Incorrect password') || msg.includes('WRONG_PASSWORD')) {
      showAlert('Incorrect password. Please check your password and try again.', { title: 'Invalid Password' });
    } else {
      toast('Sign in failed: ' + (msg || 'Auth error'), '#fb7185');
    }
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
        <input class="fin" id="reg-email" type="email" placeholder="user@example.com" autocapitalize="none" autocorrect="off" spellcheck="false">
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
  const email = emailInput?.value?.trim()?.toLowerCase();
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
    if (typeof window.bootApp === 'function') {
      try { await window.bootApp(); } catch (e) {}
    }
    setTimeout(() => location.reload(), 200);
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
  const mobContainer = document.getElementById('mob-user-auth-wrap');

  const user = getCurrentUser();
  if (user && (user.email || user.name || user.id)) {
    const userEmail = user.email || (user.id && user.id.includes('@') ? user.id : '');
    const userName = user.name || (userEmail ? userEmail.split('@')[0] : 'Account');
    const initial = (userName || userEmail || 'A').charAt(0).toUpperCase();
    const displayName = userName ? userName.split(' ')[0] : 'Account';

    if (container) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="window.openAccountModal()" title="${userEmail || userName}">
          <div style="width:28px;height:28px;border-radius:50%;border:1px solid var(--ac);background:var(--surf2);color:var(--ac);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${initial}</div>
          <span style="font-size:12px;font-weight:600;color:var(--tx)" class="mob-hide">${displayName}</span>
        </div>
      `;
    }
    if (mobContainer) {
      mobContainer.innerHTML = `
        <div class="mob-profile-card" onclick="if(typeof window.closeMob==='function')window.closeMob();window.openAccountModal();" title="Account Settings">
          <div class="mob-profile-avatar">${initial}</div>
          <div class="mob-profile-info">
            <div class="mob-profile-name">${userName}</div>
            ${userEmail ? `<div class="mob-profile-email">${userEmail}</div>` : ''}
          </div>
          <span class="mob-profile-gear">⚙</span>
        </div>
      `;
    }
  } else {
    if (container) {
      container.innerHTML = `
        <div style="display:flex;gap:6px;align-items:center">
          <button class="nb-btn" onclick="window.promptServerSignIn()" style="font-size:11px;font-weight:700;padding:4px 10px;background:transparent;color:var(--ac);border:1px solid var(--ac)">Sign In</button>
          <button class="nb-btn" onclick="window.promptServerSignUp()" style="font-size:11px;font-weight:700;padding:4px 10px;background:var(--ac);color:#000;border:none">Sign Up</button>
        </div>
      `;
    }
    if (mobContainer) {
      mobContainer.innerHTML = `
        <div style="display:flex;gap:8px;padding:6px 0;margin-bottom:4px">
          <button onclick="if(typeof window.closeMob==='function')window.closeMob();window.promptServerSignIn()" style="flex:1;height:34px;border-radius:8px;background:transparent;color:var(--ac);border:1px solid var(--ac);font-size:12px;font-weight:700;cursor:pointer">Sign In</button>
          <button onclick="if(typeof window.closeMob==='function')window.closeMob();window.promptServerSignUp()" style="flex:1;height:34px;border-radius:8px;background:var(--ac);color:#000;border:none;font-size:12px;font-weight:700;cursor:pointer">Sign Up</button>
        </div>
      `;
    }
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

  const userEmail = user.email || (user.id && user.id.includes('@') ? user.id : '');
  const userName = user.name || (userEmail ? userEmail.split('@')[0] : 'User');
  const initial = (userName || userEmail || 'A').charAt(0).toUpperCase();
  const html = `
    <div style="padding:20px;max-width:400px;margin:0 auto;color:var(--tx);font-family:var(--fd)">
      <div style="text-align:center;margin-bottom:20px">
        <div style="width:64px;height:64px;border-radius:50%;border:2px solid var(--ac);background:var(--surf2);color:var(--ac);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:700;margin:0 auto 8px">${initial}</div>
        <div style="font-size:16px;font-weight:700;color:var(--tx)">${userName}</div>
        ${userEmail ? `<div style="font-size:12px;color:var(--mu);margin-top:2px">${userEmail}</div>` : ''}
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

export function handleLogoutCurrent() {
  showConfirm('Are you sure you want to log out of this session?', async () => {
    await logout();
    setCurrentUser(null);
    toast('Logged out successfully', '#fb7185');
    location.reload();
  }, { title: 'Logout', danger: true, okLabel: 'Logout' });
}

export function handleLogoutAllSessions() {
  showConfirm('This will log you out of all active devices. Proceed?', async () => {
    await logoutAllSessions();
    setCurrentUser(null);
    toast('All active sessions revoked', '#fb7185');
    location.reload();
  }, { title: 'Revoke All Sessions', danger: true, okLabel: 'Logout All' });
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
