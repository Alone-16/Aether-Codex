/**
 * js/shared/notifications.js
 * 
 * In-app Notification System:
 * - Manages navbar bell badge and dropdown.
 * - Handles sequel announcements, premiere date changes, 1-click add to library, and ignore list.
 */

import { esc, fmtDate } from './utils.js';
import { toast } from './ui.js';
import { getAccessToken, mediaApi } from './api.js';
import { formatReleaseDate } from './date_utils.js';

let _notifications = [];
let _unreadCount = 0;
let _filterUnreadOnly = false;
let _isOpen = false;
let _isSyncing = false;

function _getApiBase() {
  if (typeof window !== 'undefined' && window.ENV && window.ENV.API_URL) {
    return window.ENV.API_URL;
  }
  return '';
}

function _formatNotifTime(d) {
  if (!d) return '';
  const date = new Date(typeof d === 'string' && !d.includes('T') ? d.replace(' ', 'T') + 'Z' : d);
  if (isNaN(date.getTime())) return '';
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - date.getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Fetches notifications from worker endpoint.
 */
export async function fetchNotifications() {
  const token = getAccessToken();
  if (!token) {
    _updateBadge(0);
    return;
  }

  try {
    const res = await fetch(`${_getApiBase()}/v1/notifications`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) return;

    const body = await res.json();
    const data = body.data || body;
    _notifications = data.notifications || [];
    _unreadCount = data.unreadCount || 0;

    _updateBadge(_unreadCount);

    if (_isOpen) {
      renderNotifDropdown();
    }
  } catch (err) {
    console.warn('[Notifications] Failed to fetch:', err);
  }
}

function _updateBadge(count) {
  const badgeEl = document.getElementById('notif-badge');
  if (!badgeEl) return;

  if (count > 0) {
    badgeEl.textContent = count > 9 ? '9+' : String(count);
    badgeEl.style.display = 'block';
  } else {
    badgeEl.style.display = 'none';
  }
}

export function toggleNotifDropdown(e) {
  if (e) e.stopPropagation();
  _isOpen = !_isOpen;

  const dd = document.getElementById('notif-dropdown');
  if (!dd) return;

  if (_isOpen) {
    renderNotifDropdown();
    dd.style.display = 'block';
    fetchNotifications();
  } else {
    dd.style.display = 'none';
  }
}

export function closeNotifDropdown() {
  _isOpen = false;
  const dd = document.getElementById('notif-dropdown');
  if (dd) dd.style.display = 'none';
}

export function toggleNotifFilter(unreadOnly, e) {
  if (e) e.stopPropagation();
  _filterUnreadOnly = unreadOnly;
  renderNotifDropdown();
}

/**
 * 1-Click Add sequel to upcoming library.
 */
export async function addSequelToLibrary(notifId, e) {
  if (e) e.stopPropagation();
  const token = getAccessToken();
  if (!token) return;

  try {
    const res = await fetch(`${_getApiBase()}/v1/notifications/${notifId}/add`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      toast('Failed to add to library', '#fb7185');
      return;
    }

    const body = await res.json();
    const data = body.data || body;

    // Mark as added in local state
    const notif = _notifications.find(n => n.id === notifId);
    if (notif) {
      notif.mediaId = data.mediaId;
      notif.isRead = true;
      notif.readAt = new Date().toISOString();
    }
    _unreadCount = Math.max(0, _unreadCount - 1);
    _updateBadge(_unreadCount);

    toast(`✓ "${data.title || 'Anime'}" added to Upcoming!`, '#38bdf8');

    // Refresh media library
    if (typeof mediaApi?.list === 'function') {
      mediaApi.list().then(items => {
        if (Array.isArray(items) && typeof window.setDATA === 'function') {
          window.setDATA(items);
          if (typeof window.saveData === 'function') window.saveData(items);
          if (typeof window.render === 'function') window.render();
          const content = document.getElementById('content');
          if (content && typeof window.renderHome === 'function' && window.CURRENT === 'home') {
            window.renderHome(content);
          }
        }
      }).catch(() => {});
    }

    renderNotifDropdown();
  } catch (err) {
    console.error('[Notifications] Add error:', err);
    toast('Error adding anime', '#fb7185');
  }
}

export async function ignoreSequel(notifId, e) {
  if (e) e.stopPropagation();
  const token = getAccessToken();
  if (!token) return;

  try {
    await fetch(`${_getApiBase()}/v1/notifications/${notifId}/ignore`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    _notifications = _notifications.filter(n => n.id !== notifId);
    _unreadCount = Math.max(0, _unreadCount - 1);
    _updateBadge(_unreadCount);
    toast('Title ignored — will not notify again');
    renderNotifDropdown();
  } catch (err) {
    console.warn('[Notifications] Ignore error:', err);
  }
}

export async function dismissNotif(notifId, e) {
  if (e) e.stopPropagation();
  const token = getAccessToken();
  if (!token) return;

  try {
    await fetch(`${_getApiBase()}/v1/notifications/${notifId}/dismiss`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });

    _notifications = _notifications.filter(n => n.id !== notifId);
    _unreadCount = Math.max(0, _unreadCount - 1);
    _updateBadge(_unreadCount);
    renderNotifDropdown();
  } catch (err) {
    console.warn('[Notifications] Dismiss error:', err);
  }
}

export async function markNotifRead(notifId, e) {
  if (e) e.stopPropagation();
  const notif = _notifications.find(n => n.id === notifId);
  if (!notif || notif.isRead) return;

  notif.isRead = true;
  notif.readAt = new Date().toISOString();
  _unreadCount = Math.max(0, _unreadCount - 1);
  _updateBadge(_unreadCount);
  renderNotifDropdown();

  const token = getAccessToken();
  if (token) {
    fetch(`${_getApiBase()}/v1/notifications/${notifId}/read`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    }).catch(() => {});
  }
}

export async function markAllRead(e) {
  if (e) e.stopPropagation();
  _notifications.forEach(n => { n.isRead = true; n.readAt = new Date().toISOString(); });
  _unreadCount = 0;
  _updateBadge(0);
  renderNotifDropdown();

  const token = getAccessToken();
  if (token) {
    fetch(`${_getApiBase()}/v1/notifications/read-all`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    }).catch(() => {});
  }
}

export async function syncUpcomingNow(e) {
  if (e) e.stopPropagation();
  if (_isSyncing) return;
  _isSyncing = true;
  renderNotifDropdown();
  toast('Checking for upcoming anime updates...', '#38bdf8');

  const token = getAccessToken();
  try {
    const res = await fetch(`${_getApiBase()}/v1/notifications/sync`, {
      method: 'POST',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    });
    if (res.ok) {
      toast('✓ Synced with AniList & MAL');
    }
  } catch (e) {
    console.warn('[Notifications] Manual sync failed:', e);
  } finally {
    _isSyncing = false;
    await fetchNotifications();
    renderNotifDropdown();
  }
}

export function renderNotifDropdown() {
  const dd = document.getElementById('notif-dropdown');
  if (!dd) return;

  const isMobile = window.innerWidth < 640;
  if (isMobile) {
    dd.style.position = 'fixed';
    dd.style.left = '0';
    dd.style.right = '0';
    dd.style.bottom = '0';
    dd.style.top = 'auto';
    dd.style.width = '100%';
    dd.style.maxWidth = '100%';
    dd.style.borderRadius = '16px 16px 0 0';
    dd.style.maxHeight = '80vh';
  } else {
    dd.style.position = 'absolute';
    dd.style.left = 'auto';
    dd.style.right = '0';
    dd.style.bottom = 'auto';
    dd.style.top = 'calc(100% + 8px)';
    dd.style.width = '390px';
    dd.style.maxWidth = '92vw';
    dd.style.borderRadius = '12px';
    dd.style.maxHeight = '520px';
  }

  const items = _filterUnreadOnly ? _notifications.filter(n => !n.isRead) : _notifications;

  const headerHtml = `
    <div style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.02)">
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:13px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:var(--tx)">Notifications</span>
        ${_unreadCount > 0 ? `<span style="font-size:10px;font-weight:700;background:rgba(239,68,68,0.2);color:#f87171;border:1px solid rgba(239,68,68,0.3);border-radius:10px;padding:1px 6px">${_unreadCount} unread</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        ${_unreadCount > 0 ? `
          <button onclick="markAllRead(event)" style="background:none;border:none;color:var(--ac);font-size:11px;font-weight:600;cursor:pointer;padding:3px 6px">Mark all read</button>
        ` : ''}
        ${isMobile ? `<button onclick="closeNotifDropdown()" style="background:none;border:none;color:var(--mu);font-size:16px;cursor:pointer;padding:0 4px">✕</button>` : ''}
      </div>
    </div>
    <div style="padding:6px 16px;border-bottom:1px solid rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:space-between;gap:8px">
      <div style="display:flex;gap:4px">
        <button onclick="toggleNotifFilter(false, event)" style="padding:3px 8px;border-radius:4px;font-size:11px;font-weight:${!_filterUnreadOnly?'700':'500'};border:none;cursor:pointer;background:${!_filterUnreadOnly?'rgba(var(--ac-rgb),0.15)':'transparent'};color:${!_filterUnreadOnly?'var(--ac)':'var(--mu)'}">All</button>
        <button onclick="toggleNotifFilter(true, event)" style="padding:3px 8px;border-radius:4px;font-size:11px;font-weight:${_filterUnreadOnly?'700':'500'};border:none;cursor:pointer;background:${_filterUnreadOnly?'rgba(var(--ac-rgb),0.15)':'transparent'};color:${_filterUnreadOnly?'var(--ac)':'var(--mu)'}">Unread (${_unreadCount})</button>
      </div>
      <button onclick="syncUpcomingNow(event)" style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:var(--tx2);font-size:11px;border-radius:5px;padding:3px 8px;cursor:pointer;display:flex;align-items:center;gap:4px">
        <span style="display:inline-block;animation:${_isSyncing?'ai-bounce .8s infinite':'none'}">🔄</span> Check MAL/AniList
      </button>
    </div>
  `;

  let listHtml = '';
  if (items.length === 0) {
    listHtml = `
      <div style="padding:32px 16px;text-align:center;color:var(--mu);font-size:12px">
        <div style="font-size:24px;margin-bottom:6px">🔕</div>
        ${_filterUnreadOnly ? 'No unread notifications' : 'No notifications yet'}<br>
        <span style="font-size:11px;opacity:0.7">New seasons and release dates for your anime will appear here</span>
      </div>
    `;
  } else {
    listHtml = `<div style="max-height:360px;overflow-y:auto;padding:6px 0">` + items.map(n => {
      const data = n.data || {};
      const isSequel = n.type === 'sequel_discovery';
      const isDateChange = n.type === 'date_change';
      const relDateStr = data.release_date || data.new_date;
      const formattedDate = relDateStr ? formatReleaseDate(relDateStr) : null;
      const alreadyAdded = Boolean(n.mediaId);

      return `
        <div class="notif-card" style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.03);background:${n.isRead ? 'transparent' : 'rgba(var(--ac-rgb),0.03)'};display:flex;gap:10px;align-items:flex-start;position:relative" onclick="markNotifRead('${n.id}', event)">
          ${!n.isRead ? `<span style="position:absolute;top:12px;left:5px;width:5px;height:5px;border-radius:50%;background:var(--ac)"></span>` : ''}
          ${data.poster ? `<img src="${esc(data.poster)}" style="width:36px;height:50px;object-fit:cover;border-radius:4px;flex-shrink:0;border:1px solid rgba(255,255,255,0.08)" onerror="this.style.display='none'">` : ''}
          <div style="flex:1;min-width:0">
            <div style="display:flex;justify-content:space-between;align-items:baseline;gap:6px">
              <span class="notif-title" style="font-size:12px;font-weight:700;color:var(--tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(n.title)}</span>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
                ${n.malId ? `
                  <a href="https://myanimelist.net/anime/${n.malId}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="Open on MyAnimeList in new tab" style="font-size:9px;color:var(--ac);font-weight:700;text-decoration:none;display:inline-flex;align-items:center;gap:2px;background:rgba(var(--ac-rgb),0.1);padding:1px 5px;border-radius:3px;border:1px solid rgba(var(--ac-rgb),0.2)">
                    MAL ↗
                  </a>
                ` : ''}
                <span style="font-size:9px;color:var(--mu)">${_formatNotifTime(n.createdAt)}</span>
              </div>
            </div>
            <div class="notif-rel" style="font-size:11px;color:var(--tx2);margin-top:2px;line-height:1.35">${esc(n.message || '')}</div>
            
            ${formattedDate ? `
              <div style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:1px 6px;border-radius:4px;background:rgba(251,191,36,0.1);color:#fbbf24;font-size:10px;font-weight:600">
                🗓 ${formattedDate}
              </div>
            ` : ''}

            <!-- Action buttons -->
            <div style="margin-top:6px;display:flex;align-items:center;gap:6px" onclick="event.stopPropagation()">
              ${isSequel ? (
                alreadyAdded ? `
                  <span style="font-size:10px;color:#4ade80;font-weight:600">✓ In Library</span>
                  <button onclick="nav('media');openDetail('${n.mediaId}');closeNotifDropdown()" style="padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);color:var(--tx);font-size:10px;cursor:pointer">View →</button>
                ` : `
                  <button onclick="addSequelToLibrary('${n.id}', event)" style="padding:3px 9px;border-radius:5px;background:var(--ac);border:none;color:#000;font-size:10px;font-weight:800;cursor:pointer;transition:transform .15s">
                    + Add to Upcoming
                  </button>
                  <button onclick="ignoreSequel('${n.id}', event)" style="padding:3px 8px;border-radius:5px;background:transparent;border:1px solid rgba(255,255,255,0.1);color:var(--mu);font-size:10px;cursor:pointer">
                    Ignore
                  </button>
                `
              ) : ''}
              ${isDateChange ? `
                <button onclick="dismissNotif('${n.id}', event)" style="padding:2px 7px;border-radius:4px;background:transparent;border:1px solid rgba(255,255,255,0.08);color:var(--mu);font-size:10px;cursor:pointer">
                  Dismiss
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('') + `</div>`;
  }

  const footerHtml = `
    <div style="padding:8px 14px;border-top:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.01)">
      <a href="javascript:void(0)" class="notif-shortcuts-link" onclick="closeNotifDropdown();if(typeof showKeyboardHelp==='function')showKeyboardHelp()" style="color:var(--mu);font-size:11px;text-decoration:none;display:flex;align-items:center;gap:4px">
        ⌨ Shortcuts (?)
      </a>
      <span style="font-size:10px;color:var(--mu)">Aether Radar</span>
    </div>
  `;

  dd.innerHTML = headerHtml + listHtml + footerHtml;
}

/**
 * Initializes notification listeners and background poll.
 */
export function initNotifications() {
  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('notif-wrap');
    if (!_isOpen || !wrap) return;

    if (typeof e.composedPath === 'function' && e.composedPath().includes(wrap)) {
      return;
    }
    if (wrap.contains(e.target)) {
      return;
    }
    const rect = wrap.getBoundingClientRect();
    if (
      e.clientX >= rect.left &&
      e.clientX <= rect.right &&
      e.clientY >= rect.top &&
      e.clientY <= rect.bottom
    ) {
      return;
    }

    closeNotifDropdown();
  });

  // Close dropdown on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _isOpen) {
      closeNotifDropdown();
    }
  });

  // Initial fetch
  fetchNotifications();

  // Periodic poll every 10 minutes
  setInterval(() => {
    fetchNotifications();
  }, 10 * 60 * 1000);
}

// Global exposure for onclick handlers
Object.assign(window, {
  toggleNotifDropdown,
  closeNotifDropdown,
  toggleNotifFilter,
  addSequelToLibrary,
  ignoreSequel,
  dismissNotif,
  markNotifRead,
  markAllRead,
  syncUpcomingNow,
  fetchNotifications,
});
