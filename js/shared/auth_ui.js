// ═══════════════════════════════════════════════════════════════════
//  js/shared/auth_ui.js — Account Sign In / Sign Up & Navbar UI
// ═══════════════════════════════════════════════════════════════════

import { loginServerAuth, registerUser, logout, logoutAllSessions, getAccessToken, updateProfileName } from './api.js';
import { toast, showAlert, showConfirm, closePanel } from './ui.js';
import { esc } from './utils.js';

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
            name: payload.name || localStorage.getItem('ac_display_name') || (payload.email ? payload.email.split('@')[0] : 'User')
          };
        }
      } catch (e) {}
    }
  }

  // Also support guest / local user with a saved display name
  if (!currentUser) {
    const localName = localStorage.getItem('ac_display_name') || localStorage.getItem('ac_local_name');
    if (localName && localName.trim()) {
      currentUser = {
        name: localName.trim(),
        isGuest: true
      };
    }
  }

  return currentUser;
}

export function setCurrentUser(user) {
  currentUser = user;
  if (user) {
    sessionStorage.setItem('ac_v5_user_profile', JSON.stringify(user));
    localStorage.setItem('ac_v5_user_profile', JSON.stringify(user));
    if (user.name) {
      localStorage.setItem('ac_display_name', user.name);
    }
  } else {
    sessionStorage.removeItem('ac_v5_user_profile');
    localStorage.removeItem('ac_v5_user_profile');
    localStorage.removeItem('ac_display_name');
  }
  updateNavbarUserUI();
}

export async function initServerAuth() {
  if (!getAccessToken()) {
    const localName = localStorage.getItem('ac_display_name') || localStorage.getItem('ac_local_name');
    if (localName && localName.trim()) {
      currentUser = { name: localName.trim(), isGuest: true };
    } else {
      currentUser = null;
      sessionStorage.removeItem('ac_v5_user_profile');
      localStorage.removeItem('ac_v5_user_profile');
    }
  } else {
    getCurrentUser();
  }
  updateNavbarUserUI();
}

export async function updateUserName(newName) {
  const cleanName = (newName || '').trim();
  if (!cleanName) {
    showAlert('Please enter a valid display name.', { title: 'Invalid Name' });
    return false;
  }
  if (cleanName.length > 100) {
    showAlert('Name must be 100 characters or fewer.', { title: 'Name Too Long' });
    return false;
  }

  // Always store locally first
  localStorage.setItem('ac_display_name', cleanName);

  const token = getAccessToken();
  let serverUpdated = false;

  if (token) {
    try {
      const updatedUser = await updateProfileName(cleanName);
      if (updatedUser) {
        currentUser = { ...(currentUser || {}), ...updatedUser, name: cleanName };
        sessionStorage.setItem('ac_v5_user_profile', JSON.stringify(currentUser));
        localStorage.setItem('ac_v5_user_profile', JSON.stringify(currentUser));
        serverUpdated = true;
      }
    } catch (err) {
      console.warn('[Auth UI] Cloud profile name update error:', err.message);
      // Still update local state if cloud request failed (e.g. offline)
      currentUser = { ...(currentUser || {}), name: cleanName };
      sessionStorage.setItem('ac_v5_user_profile', JSON.stringify(currentUser));
      localStorage.setItem('ac_v5_user_profile', JSON.stringify(currentUser));
      toast(`Name saved locally (cloud sync offline)`, '#fbbf24', 4000);
      updateNavbarUserUI();
      if (typeof window.renderSettingsBody === 'function' && window.CURRENT === 'settings') {
        window.renderSettingsBody();
      }
      return true;
    }
  } else {
    // Guest mode
    currentUser = { ...(currentUser || {}), name: cleanName, isGuest: true };
    sessionStorage.setItem('ac_v5_user_profile', JSON.stringify(currentUser));
    localStorage.setItem('ac_v5_user_profile', JSON.stringify(currentUser));
  }

  updateNavbarUserUI();

  // If settings section is open, re-render it to update name card
  if (typeof window.renderSettingsBody === 'function' && window.CURRENT === 'settings') {
    window.renderSettingsBody();
  }

  toast(serverUpdated ? `Display name updated to "${cleanName}"` : `Name set to "${cleanName}"`, '#4ade80');
  return true;
}

export function promptEditName() {
  const user = getCurrentUser();
  const currentName = user?.name || localStorage.getItem('ac_display_name') || '';

  const el = document.createElement('div');
  el.className = 'modal-overlay';
  el.innerHTML = `
    <div class="modal-box" style="max-width:380px">
      <div class="modal-title" style="display:flex;align-items:center;gap:8px">
        <span>✏</span> Change Display Name
      </div>
      <div class="modal-msg" style="margin-bottom:12px;font-size:12px;color:var(--tx2)">
        Enter the name you'd like displayed across Aether Codex and public shares.
      </div>
      <div style="margin-bottom:16px">
        <input class="fin" id="quick-edit-name-input" type="text" value="${esc(currentName)}" placeholder="e.g. Alex, Shadow, Neo" maxlength="100" style="width:100%;box-sizing:border-box">
      </div>
      <div class="modal-btns">
        <button class="modal-btn cancel" id="quick-edit-name-cancel">Cancel</button>
        <button class="modal-btn confirm" id="quick-edit-name-save" style="background:var(--ac);color:#000;font-weight:700">Save Name</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  const input = el.querySelector('#quick-edit-name-input');
  const cancelBtn = el.querySelector('#quick-edit-name-cancel');
  const saveBtn = el.querySelector('#quick-edit-name-save');

  const doSave = async () => {
    const val = input.value.trim();
    if (!val) {
      toast('Please enter a valid name', '#fb7185');
      input.focus();
      return;
    }
    el.remove();
    await updateUserName(val);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') el.remove();
  });
  saveBtn.onclick = doSave;
  cancelBtn.onclick = () => el.remove();
  el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
  setTimeout(() => { input.focus(); input.select(); }, 60);
}

export function onAuthSessionExpired() {
  setCurrentUser(null);
  updateNavbarUserUI();
  toast('Your session has expired. Please sign in to view your collection.', '#f59e0b', 5000);
  setTimeout(() => {
    promptServerSignIn('Your session expired. Please sign in to reload your collection.');
  }, 350);
}

if (typeof window !== 'undefined') {
  window.onAuthSessionExpired = onAuthSessionExpired;
  window.onTokensCleared = () => {
    setCurrentUser(null);
    updateNavbarUserUI();
  };
}

// ═══════════════════════════════════════════════════════════════════
//  SIGN IN PANEL
// ═══════════════════════════════════════════════════════════════════
export function promptServerSignIn(customSubtitle = null) {
  const panelInner = document.getElementById('panel-inner');
  const rpanel = document.getElementById('rpanel');
  const poverlay = document.getElementById('poverlay');
  const content = document.getElementById('content');

  if (!panelInner || !rpanel) return;

  const savedEmail = localStorage.getItem('ac_last_auth_email') || (currentUser && currentUser.email ? currentUser.email : '');
  const subtitle = customSubtitle || 'Sign in to access your cloud collection.';

  rpanel.classList.add('open');
  if (poverlay) poverlay.classList.add('show');
  if (content) content.classList.add('pushed');

  panelInner.innerHTML = `
    <div class="ph">
      <div class="ph-title">Sign In</div>
      <button class="ph-close" onclick="closePanel()">✕</button>
    </div>
    <div class="form-wrap" style="padding:20px">
      <div style="font-size:13px;color:var(--tx2);margin-bottom:16px;line-height:1.5">
        ${subtitle}
      </div>
      <div class="fg">
        <label class="flbl">Email Address *</label>
        <input class="fin" id="cf-auth-email" type="email" placeholder="user@example.com" value="${savedEmail}" autocapitalize="none" autocorrect="off" spellcheck="false" ${savedEmail ? '' : 'autofocus'}>
      </div>
      <div class="fg">
        <label class="flbl">Password *</label>
        <input class="fin" id="cf-auth-password" type="password" placeholder="••••••••" onkeydown="if(event.key==='Enter')submitServerSignIn()" ${savedEmail ? 'autofocus' : ''}>
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

  localStorage.setItem('ac_last_auth_email', email);

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

  const guestName = (getCurrentUser()?.name) || localStorage.getItem('ac_display_name') || '';

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
        <input class="fin" id="reg-name" type="text" placeholder="Your Name" value="${esc(guestName)}" ${guestName ? '' : 'autofocus'}>
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
  const isLoggedIn = !!(user && (user.email || (user.id && !user.isGuest && !user.id.startsWith('guest_'))));
  const userEmail = user?.email || '';
  const userName = user?.name || (userEmail ? userEmail.split('@')[0] : '');
  const initial = (userName || userEmail || 'U').charAt(0).toUpperCase();
  const displayName = userName || (userEmail ? userEmail.split('@')[0] : 'Profile');

  if (container) {
    if (isLoggedIn) {
      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;cursor:pointer" onclick="window.openAccountModal()" title="Account: ${userEmail || userName} (Click to edit name)">
          <div style="width:28px;height:28px;border-radius:50%;border:1px solid var(--ac);background:var(--surf2);color:var(--ac);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700">${initial}</div>
          <span style="font-size:12px;font-weight:600;color:var(--tx)" class="mob-hide">${displayName}</span>
        </div>
      `;
    } else if (userName) {
      // Guest user with a custom display name
      container.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px">
          <div style="display:flex;align-items:center;gap:6px;cursor:pointer" onclick="window.openAccountModal()" title="Local Profile: ${userName} (Click to edit name)">
            <div style="width:26px;height:26px;border-radius:50%;border:1px solid var(--ac);background:var(--surf2);color:var(--ac);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">${initial}</div>
            <span style="font-size:12px;font-weight:600;color:var(--tx)" class="mob-hide">${displayName}</span>
          </div>
          <button class="nb-btn" onclick="window.promptServerSignIn()" style="font-size:10px;font-weight:700;padding:3px 7px;background:transparent;color:var(--tx2);border:1px solid var(--brd)">Sign In</button>
        </div>
      `;
    } else {
      // Guest without name set yet
      container.innerHTML = `
        <div style="display:flex;gap:6px;align-items:center">
          <button class="nb-btn" onclick="window.openAccountModal()" title="Edit Name & Profile" style="font-size:11px;font-weight:600;padding:4px 8px;background:var(--surf2);color:var(--tx);border:1px solid var(--brd);display:flex;align-items:center;gap:4px">
            <span>👤</span><span class="mob-hide">Set Name</span>
          </button>
          <button class="nb-btn" onclick="window.promptServerSignIn()" style="font-size:11px;font-weight:700;padding:4px 10px;background:transparent;color:var(--ac);border:1px solid var(--ac)">Sign In</button>
          <button class="nb-btn" onclick="window.promptServerSignUp()" style="font-size:11px;font-weight:700;padding:4px 10px;background:var(--ac);color:#000;border:none">Sign Up</button>
        </div>
      `;
    }
  }

  if (mobContainer) {
    if (isLoggedIn) {
      mobContainer.innerHTML = `
        <div class="mob-profile-card" onclick="if(typeof window.closeMob==='function')window.closeMob();window.openAccountModal();" title="Account Settings (Click to edit name)">
          <div class="mob-profile-avatar">${initial}</div>
          <div class="mob-profile-info">
            <div class="mob-profile-name">${userName}</div>
            <div class="mob-profile-email">${userEmail}</div>
          </div>
          <span class="mob-profile-gear">⚙</span>
        </div>
      `;
    } else {
      mobContainer.innerHTML = `
        <div class="mob-profile-card" onclick="if(typeof window.closeMob==='function')window.closeMob();window.openAccountModal();" title="Local Profile (Tap to edit name)">
          <div class="mob-profile-avatar">${userName ? initial : '👤'}</div>
          <div class="mob-profile-info">
            <div class="mob-profile-name">${userName || 'Guest User'}</div>
            <div class="mob-profile-email" style="color:var(--ac)">Tap to edit name ✎</div>
          </div>
          <span class="mob-profile-gear" style="font-size:12px">✏</span>
        </div>
        <div style="display:flex;gap:8px;padding:4px 0 6px">
          <button onclick="if(typeof window.closeMob==='function')window.closeMob();window.promptServerSignIn()" style="flex:1;height:32px;border-radius:8px;background:transparent;color:var(--ac);border:1px solid var(--ac);font-size:11px;font-weight:700;cursor:pointer">Sign In</button>
          <button onclick="if(typeof window.closeMob==='function')window.closeMob();window.promptServerSignUp()" style="flex:1;height:32px;border-radius:8px;background:var(--ac);color:#000;border:none;font-size:11px;font-weight:700;cursor:pointer">Sign Up</button>
        </div>
      `;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
//  ACCOUNT & PROFILE MODAL
// ═══════════════════════════════════════════════════════════════════
export function openAccountModal() {
  const user = getCurrentUser();
  const userEmail = (user && user.email) ? user.email : '';
  const userName = (user && user.name) ? user.name : (userEmail ? userEmail.split('@')[0] : '');
  const initial = (userName || userEmail || 'U').charAt(0).toUpperCase();

  const html = `
    <div style="padding:20px;max-width:400px;margin:0 auto;color:var(--tx);font-family:var(--fd)">
      <!-- Profile Header Card -->
      <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:12px;padding:22px 18px;text-align:center;margin-bottom:16px;position:relative;overflow:hidden">
        <div style="position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg, var(--ac), var(--ac2, var(--ac)))"></div>
        <div id="account-modal-avatar" style="width:70px;height:70px;border-radius:50%;border:2px solid var(--ac);background:linear-gradient(135deg, rgba(var(--ac-rgb),0.25) 0%, rgba(var(--ac-rgb),0.05) 100%);color:var(--ac);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:800;margin:0 auto 12px;box-shadow:0 0 20px rgba(var(--ac-rgb),0.25)">${initial}</div>
        <div id="account-modal-display-name" style="font-size:18px;font-weight:700;color:var(--tx);letter-spacing:0.3px">${esc(userName || 'Guest User')}</div>
        ${userEmail ? `
          <div style="font-size:12px;color:var(--mu);margin-top:3px">${esc(userEmail)}</div>
          <div style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#4ade80;background:rgba(74,222,128,0.1);border:1px solid rgba(74,222,128,0.25);border-radius:20px;padding:3px 10px;margin-top:10px">
            <span>●</span> Cloud Account (Synced)
          </div>
        ` : `
          <div style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:var(--ac);background:rgba(var(--ac-rgb),0.1);border:1px solid rgba(var(--ac-rgb),0.25);border-radius:20px;padding:3px 10px;margin-top:8px">
            <span>○</span> Local Profile (Guest Mode)
          </div>
        `}
      </div>

      <!-- Edit Display Name Section -->
      <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:12px;padding:16px;margin-bottom:16px">
        <label class="flbl" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span>Display Name</span>
          <span style="font-size:10px;color:var(--mu);text-transform:none;letter-spacing:normal">Change anytime</span>
        </label>
        <div style="display:flex;gap:8px">
          <input class="fin" id="account-name-input" type="text" value="${esc(userName)}" placeholder="Enter your display name" maxlength="100" style="flex:1" onkeydown="if(event.key==='Enter')window.saveAccountNameFromModal()">
          <button class="btn-save" id="account-name-save-btn" onclick="window.saveAccountNameFromModal()" style="padding:0 18px;white-space:nowrap;font-size:12px;display:flex;align-items:center;justify-content:center;height:38px">
            Save
          </button>
        </div>
        <div id="account-name-status" style="font-size:11px;margin-top:6px;display:none"></div>
      </div>

      <!-- Additional Actions (Cloud Sign In if guest, or Session Revoke if logged in) -->
      ${userEmail ? `
        <div style="display:flex;flex-direction:column;gap:8px">
          <div style="font-size:11px;font-weight:700;color:var(--mu);text-transform:uppercase;letter-spacing:0.8px;padding-left:2px">Session Management</div>
          <button onclick="window.handleLogoutCurrent()" style="padding:10px 14px;border-radius:8px;background:var(--surf2);border:1px solid var(--brd);color:var(--tx);font-weight:600;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between">
            <span>Log Out Current Session</span>
            <span style="color:var(--mu)">→</span>
          </button>
          <button onclick="window.handleLogoutAllSessions()" style="padding:10px 14px;border-radius:8px;background:rgba(251,113,133,0.1);border:1px solid rgba(251,113,133,0.25);color:#fb7185;font-weight:600;font-size:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between">
            <span>Log Out All Devices</span>
            <span style="color:#fb7185">✕</span>
          </button>
        </div>
      ` : `
        <div style="background:rgba(var(--ac-rgb),0.04);border:1px solid rgba(var(--ac-rgb),0.2);border-radius:12px;padding:16px;text-align:center">
          <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:4px">Cloud Synchronization</div>
          <div style="font-size:12px;color:var(--mu);line-height:1.5;margin-bottom:14px">
            Sign in or create an account to back up your collection and access it anywhere.
          </div>
          <div style="display:flex;gap:8px">
            <button onclick="closePanel();window.promptServerSignIn()" style="flex:1;height:34px;border-radius:6px;background:transparent;color:var(--ac);border:1px solid var(--ac);font-size:12px;font-weight:700;cursor:pointer">Sign In</button>
            <button onclick="closePanel();window.promptServerSignUp()" style="flex:1;height:34px;border-radius:6px;background:var(--ac);color:#000;border:none;font-size:12px;font-weight:700;cursor:pointer">Create Account</button>
          </div>
        </div>
      `}
    </div>
  `;

  const panelInner = document.getElementById('panel-inner');
  const rpanel = document.getElementById('rpanel');
  const poverlay = document.getElementById('poverlay');
  const content = document.getElementById('content');

  if (panelInner && rpanel) {
    panelInner.innerHTML = `
      <div class="ph">
        <div class="ph-title">Account & Profile</div>
        <button class="ph-close" onclick="closePanel()">✕</button>
      </div>
      ${html}
    `;
    rpanel.classList.add('open');
    if (poverlay) poverlay.classList.add('show');
    if (content) content.classList.add('pushed');
    setTimeout(() => {
      const input = document.getElementById('account-name-input');
      if (input) input.focus();
    }, 100);
  } else {
    promptEditName();
  }
}

export async function saveAccountNameFromModal() {
  const input = document.getElementById('account-name-input');
  const btn = document.getElementById('account-name-save-btn');
  const statusEl = document.getElementById('account-name-status');
  if (!input) return;

  const val = input.value.trim();
  if (!val) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.color = '#fb7185';
      statusEl.textContent = 'Name cannot be empty';
    }
    input.focus();
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
  }

  try {
    const ok = await updateUserName(val);
    if (ok) {
      const modalNameEl = document.getElementById('account-modal-display-name');
      if (modalNameEl) modalNameEl.textContent = val;
      const avatarEl = document.getElementById('account-modal-avatar');
      if (avatarEl) avatarEl.textContent = val.charAt(0).toUpperCase();

      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.color = '#4ade80';
        statusEl.textContent = '✓ Name saved successfully!';
        setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
      }
      if (btn) {
        btn.textContent = 'Saved ✓';
        setTimeout(() => {
          if (btn) {
            btn.disabled = false;
            btn.textContent = 'Save';
          }
        }, 1200);
      }
    } else {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    }
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Save';
    }
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.color = '#fb7185';
      statusEl.textContent = err.message || 'Failed to save name';
    }
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
    promptEditName,
    updateUserName,
    saveAccountNameFromModal,
    handleLogoutCurrent,
    handleLogoutAllSessions,
    getCurrentUser,
    setCurrentUser,
  });
}
