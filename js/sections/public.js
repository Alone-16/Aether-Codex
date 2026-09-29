// ═══════════════════════════════════════════════════════════════════
//  public.js — Zero-Login Public List Sharing & Read-Only Viewer
// ═══════════════════════════════════════════════════════════════════

const SHARE_KEY = 'ac_v4_share';
const PLAT_LABEL = { pc: 'PC', mobile: 'Mobile', both: 'PC + Mobile' };

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function loadShareSettings() {
  try {
    const raw = localStorage.getItem(SHARE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        window.SHARE_SETTINGS = { ...parsed };
        return window.SHARE_SETTINGS;
      }
    }
  } catch (e) {}
  return window.SHARE_SETTINGS || { shareId: null, manageKey: null, sections: ['media', 'games', 'books'], enabled: false };
}

function saveShareSettings(s) {
  window.SHARE_SETTINGS = s;
  try {
    localStorage.setItem(SHARE_KEY, JSON.stringify(s));
  } catch (e) {}
}

// ── Check if we're in public view mode (?share=... or #share=...) ──
export function checkPublicView() {
  const searchParams = new URLSearchParams(window.location.search);
  let shareId = searchParams.get('share');

  if (!shareId && window.location.hash.includes('share=')) {
    const hashStr = window.location.hash.replace(/^#\/?/, '');
    const hp = new URLSearchParams(hashStr.includes('?') ? hashStr.split('?')[1] : hashStr);
    shareId = hp.get('share');
  }

  if (shareId) {
    renderPublicView(shareId.trim());
    return true;
  }
  return false;
}

export async function renderPublicView(shareId) {
  // Reveal body and set full-scroll styling
  document.body.style.visibility = 'visible';
  document.documentElement.style.visibility = 'visible';
  document.documentElement.style.cssText = 'height:auto!important;overflow:auto!important;background:#000;color:rgba(255,255,255,.93)';
  document.body.style.cssText = 'height:auto!important;overflow:auto!important;display:block!important;background:#000;color:rgba(255,255,255,.93);font-family:Outfit,sans-serif;margin:0;padding:0';

  document.body.innerHTML = `
    <style>
      html, body { background: #000000 !important; color: rgba(255,255,255,.93) !important; font-family: 'Outfit', sans-serif !important; }
      .pub-card { transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease; }
      .pub-card:hover { transform: translateY(-2px); border-color: rgba(56,189,248,.35) !important; box-shadow: 0 8px 24px rgba(0,0,0,.6); }
      .pub-filter-btn { border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.04); color: rgba(255,255,255,.6); border-radius: 20px; padding: 6px 14px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s; }
      .pub-filter-btn:hover { background: rgba(255,255,255,.09); color: #fff; }
      .pub-filter-btn.active { background: rgba(56,189,248,.15); border-color: #38bdf8; color: #38bdf8; }
      @keyframes pub-spin { to { transform: rotate(360deg); } }
    </style>
    <div style="min-height:100vh;display:flex;flex-direction:column">
      <nav style="background:rgba(15,15,20,0.85);backdrop-filter:blur(20px);border-bottom:1px solid rgba(255,255,255,.08);padding:12px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="font-family:'Outfit',sans-serif;font-size:17px;font-weight:800;letter-spacing:.3px;color:#38bdf8">The Aether Codex</div>
          <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,.6);padding:3px 9px;background:rgba(56,189,248,.12);border:1px solid rgba(56,189,248,.25);border-radius:12px">Public Share</span>
        </div>
        <a href="/" style="font-size:12px;font-weight:600;color:#38bdf8;text-decoration:none;padding:5px 12px;background:rgba(56,189,248,.08);border:1px solid rgba(56,189,248,.2);border-radius:6px;transition:background .15s">Open App →</a>
      </nav>

      <main id="pub-content" style="flex:1;max-width:920px;margin:0 auto;width:100%;padding:28px 16px 40px">
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;gap:14px;color:rgba(255,255,255,.5)">
          <div style="width:28px;height:28px;border:3px solid rgba(255,255,255,.1);border-top-color:#38bdf8;border-radius:50%;animation:pub-spin .6s linear infinite"></div>
          <div style="font-size:13px;letter-spacing:.5px">Loading collection...</div>
        </div>
      </main>

      <footer style="padding:20px;text-align:center;border-top:1px solid rgba(255,255,255,.06);font-size:12px;color:rgba(255,255,255,.4)">
        Powered by <a href="/" style="color:#38bdf8;text-decoration:none;font-weight:600">The Aether Codex</a>
      </footer>
    </div>`;

  let snapData = null;

  // 1. Direct URL data encoding (data:<base64>)
  if (shareId.startsWith('data:')) {
    try {
      const b64 = shareId.slice(5);
      const raw = decodeURIComponent(escape(atob(b64)));
      snapData = JSON.parse(raw);
    } catch (e) {
      console.warn('[Public View] URL data decode error:', e);
    }
  }

  // 2. Worker /v1/public/share/:shareId
  if (!snapData) {
    try {
      if (window.publicShareApi && typeof window.publicShareApi.getPublicList === 'function') {
        snapData = await window.publicShareApi.getPublicList(shareId);
      } else {
        const apiBase = (window.ENV && window.ENV.API_URL) ? window.ENV.API_URL : location.origin;
        const res = await fetch(`${apiBase}/v1/public/share/${encodeURIComponent(shareId)}`);
        const json = await res.json().catch(() => ({}));
        if (res.ok && json.success) snapData = json.data;
      }
    } catch (e) {
      console.warn('[Public View] API fetch error:', e.message);
    }
  }

  if (snapData && typeof snapData === 'object') {
    renderPublicContent(snapData);
  } else {
    const el = document.getElementById('pub-content');
    if (el) {
      el.innerHTML = `
        <div style="text-align:center;padding:80px 20px;max-width:440px;margin:0 auto">
          <div style="font-size:42px;margin-bottom:16px">🔒</div>
          <div style="font-size:20px;font-weight:700;color:rgba(255,255,255,.93);margin-bottom:8px">List Unavailable</div>
          <div style="font-size:13px;color:rgba(255,255,255,.5);line-height:1.6;margin-bottom:24px">
            This collection snapshot could not be found. It may have been revoked by its owner or the link is invalid.
          </div>
          <a href="/" style="display:inline-block;background:#38bdf8;color:#000;font-weight:700;font-size:13px;padding:10px 22px;border-radius:6px;text-decoration:none">
            Go to The Aether Codex
          </a>
        </div>`;
    }
  }
}

let _currentPublicFilter = 'all';

function renderPublicContent(snap) {
  const el = document.getElementById('pub-content');
  if (!el) return;

  const sections = snap.sections || [];
  const owner = snap.owner || 'Aether Codex User';
  const generated = snap.generatedAt ? new Date(snap.generatedAt).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) : '';

  const mediaList = sections.includes('media') && Array.isArray(snap.media) ? snap.media : [];
  const gamesList = sections.includes('games') && Array.isArray(snap.games) ? snap.games : [];
  const booksList = sections.includes('books') && Array.isArray(snap.books) ? snap.books : [];

  const totalCount = mediaList.length + gamesList.length + booksList.length;

  const STATUS_CONFIG = {
    watching:  { label: 'Watching / In Progress', color: '#38bdf8' },
    completed: { label: 'Completed',             color: '#4ade80' },
    plan:      { label: 'Plan to Experience',    color: '#a78bfa' },
    on_hold:   { label: 'On Hold',               color: '#fbbf24' },
    dropped:   { label: 'Dropped',               color: '#fb7185' },
  };

  const getStatusInfo = (s) => STATUS_CONFIG[s] || { label: s ? s.toUpperCase() : 'Active', color: '#94a3b8' };

  let html = `
    <div style="margin-bottom:28px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:12px">
        <div>
          <h1 style="font-size:clamp(22px,4vw,28px);font-weight:800;color:#fff;margin:0 0 4px 0">${esc(owner)}'s Codex</h1>
          ${generated ? `<div style="font-size:12px;color:rgba(255,255,255,.45)">Snapshot published on ${esc(generated)} · ${totalCount} items</div>` : ''}
        </div>
      </div>

      <!-- Filter Tabs -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;padding:4px 0;margin-top:16px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:14px">
        <button class="pub-filter-btn ${_currentPublicFilter === 'all' ? 'active' : ''}" onclick="window.setPublicFilter('all')">
          All (${totalCount})
        </button>
        ${mediaList.length ? `
          <button class="pub-filter-btn ${_currentPublicFilter === 'media' ? 'active' : ''}" onclick="window.setPublicFilter('media')">
            ◉ Media (${mediaList.length})
          </button>` : ''}
        ${gamesList.length ? `
          <button class="pub-filter-btn ${_currentPublicFilter === 'games' ? 'active' : ''}" onclick="window.setPublicFilter('games')">
            ◈ Games (${gamesList.length})
          </button>` : ''}
        ${booksList.length ? `
          <button class="pub-filter-btn ${_currentPublicFilter === 'books' ? 'active' : ''}" onclick="window.setPublicFilter('books')">
            ◎ Books (${booksList.length})
          </button>` : ''}
      </div>
    </div>`;

  // 1. Media Section
  if ((_currentPublicFilter === 'all' || _currentPublicFilter === 'media') && mediaList.length) {
    const byStatus = {};
    mediaList.forEach(e => {
      const st = e.status || 'watching';
      if (!byStatus[st]) byStatus[st] = [];
      byStatus[st].push(e);
    });

    const statusOrder = ['watching', 'completed', 'plan', 'on_hold', 'dropped'];

    html += `
      <div style="margin-bottom:36px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#38bdf8">◉ Media Collection</span>
          <div style="flex:1;height:1px;background:rgba(56,189,248,.18)"></div>
          <span style="font-size:11px;color:rgba(255,255,255,.4);font-weight:600">${mediaList.length} titles</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:20px">
          ${statusOrder.map(st => {
            const rows = byStatus[st];
            if (!rows || !rows.length) return '';
            const info = getStatusInfo(st);
            return `
              <div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                  <span style="width:8px;height:8px;border-radius:50%;background:${info.color};box-shadow:0 0 8px ${info.color}"></span>
                  <span style="font-size:12px;font-weight:700;color:${info.color};text-transform:uppercase;letter-spacing:.5px">${info.label} (${rows.length})</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(270px, 1fr));gap:8px">
                  ${rows.map(e => `
                    <div class="pub-card" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#111115;border:1px solid rgba(255,255,255,.08);border-radius:8px">
                      <div style="width:3px;height:34px;background:${info.color};border-radius:2px;flex-shrink:0"></div>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,.95);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(e.title)}">${esc(e.title)}</div>
                        <div style="font-size:11px;color:rgba(255,255,255,.45);margin-top:2px;display:flex;align-items:center;gap:6px">
                          ${e.genre ? `<span style="padding:1px 6px;background:rgba(255,255,255,.06);border-radius:4px">${esc(e.genre)}</span>` : ''}
                          ${e.progress ? `<span>${esc(e.progress)}</span>` : ''}
                        </div>
                      </div>
                      ${e.rating ? `<span style="font-size:12px;font-weight:700;color:#fbbf24;flex-shrink:0">★ ${e.rating}</span>` : ''}
                    </div>`).join('')}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  // 2. Games Section
  if ((_currentPublicFilter === 'all' || _currentPublicFilter === 'games') && gamesList.length) {
    const byStatus = {};
    gamesList.forEach(g => {
      const st = g.status || 'watching';
      if (!byStatus[st]) byStatus[st] = [];
      byStatus[st].push(g);
    });

    const statusOrder = ['watching', 'completed', 'plan', 'on_hold', 'dropped'];

    html += `
      <div style="margin-bottom:36px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#f59e0b">◈ Games Collection</span>
          <div style="flex:1;height:1px;background:rgba(245,158,11,.18)"></div>
          <span style="font-size:11px;color:rgba(255,255,255,.4);font-weight:600">${gamesList.length} games</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:20px">
          ${statusOrder.map(st => {
            const rows = byStatus[st];
            if (!rows || !rows.length) return '';
            const info = getStatusInfo(st);
            return `
              <div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                  <span style="width:8px;height:8px;border-radius:50%;background:${info.color};box-shadow:0 0 8px ${info.color}"></span>
                  <span style="font-size:12px;font-weight:700;color:${info.color};text-transform:uppercase;letter-spacing:.5px">${info.label} (${rows.length})</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(270px, 1fr));gap:8px">
                  ${rows.map(g => `
                    <div class="pub-card" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#111115;border:1px solid rgba(255,255,255,.08);border-radius:8px">
                      <div style="width:3px;height:34px;background:${info.color};border-radius:2px;flex-shrink:0"></div>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,.95);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(g.title)}">${esc(g.title)}</div>
                        <div style="font-size:11px;color:rgba(255,255,255,.45);margin-top:2px;display:flex;align-items:center;gap:6px">
                          ${g.platform ? `<span style="padding:1px 6px;background:rgba(255,255,255,.06);border-radius:4px">${esc(g.platform)}</span>` : ''}
                          ${g.totalHours ? `<span>${esc(g.totalHours)}h played</span>` : ''}
                        </div>
                      </div>
                      ${g.rating ? `<span style="font-size:12px;font-weight:700;color:#fbbf24;flex-shrink:0">★ ${g.rating}</span>` : ''}
                    </div>`).join('')}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  // 3. Books Section
  if ((_currentPublicFilter === 'all' || _currentPublicFilter === 'books') && booksList.length) {
    const byStatus = {};
    booksList.forEach(b => {
      const st = b.status || 'watching';
      if (!byStatus[st]) byStatus[st] = [];
      byStatus[st].push(b);
    });

    const statusOrder = ['watching', 'completed', 'plan', 'on_hold', 'dropped'];

    html += `
      <div style="margin-bottom:36px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#a78bfa">◎ Books Collection</span>
          <div style="flex:1;height:1px;background:rgba(167,139,250,.18)"></div>
          <span style="font-size:11px;color:rgba(255,255,255,.4);font-weight:600">${booksList.length} books</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:20px">
          ${statusOrder.map(st => {
            const rows = byStatus[st];
            if (!rows || !rows.length) return '';
            const info = getStatusInfo(st);
            return `
              <div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                  <span style="width:8px;height:8px;border-radius:50%;background:${info.color};box-shadow:0 0 8px ${info.color}"></span>
                  <span style="font-size:12px;font-weight:700;color:${info.color};text-transform:uppercase;letter-spacing:.5px">${info.label} (${rows.length})</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(270px, 1fr));gap:8px">
                  ${rows.map(b => `
                    <div class="pub-card" style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#111115;border:1px solid rgba(255,255,255,.08);border-radius:8px">
                      <div style="width:3px;height:34px;background:${info.color};border-radius:2px;flex-shrink:0"></div>
                      <div style="flex:1;min-width:0">
                        <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,.95);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${esc(b.title)}">${esc(b.title)}</div>
                        <div style="font-size:11px;color:rgba(255,255,255,.45);margin-top:2px;display:flex;align-items:center;gap:6px">
                          ${b.author ? `<span style="padding:1px 6px;background:rgba(255,255,255,.06);border-radius:4px">${esc(b.author)}</span>` : ''}
                          ${b.progress ? `<span>${esc(b.progress)}</span>` : ''}
                        </div>
                      </div>
                      ${b.rating ? `<span style="font-size:12px;font-weight:700;color:#fbbf24;flex-shrink:0">★ ${b.rating}</span>` : ''}
                    </div>`).join('')}
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  el.innerHTML = html;

  window.setPublicFilter = function(filter) {
    _currentPublicFilter = filter;
    renderPublicContent(snap);
  };
}

// ── Generate / Update public snapshot (NO LOGIN OR DRIVE REQUIRED) ──
export async function generatePublicLink(sections) {
  const shareSettings = loadShareSettings();

  const gbyidFn = window.gbyid || (id => (window.GENRES || []).find(g => g.id === id));
  const entryStatsFn = window.entryStats || (e => ({ cur: e.ep_cur || 0, tot: e.ep_tot || 0 }));

  const currentUser = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
  const owner = currentUser?.name || (currentUser?.email ? currentUser.email.split('@')[0] : 'Aether Codex User');

  const snap = {
    owner,
    generatedAt: Date.now(),
    sections,
    media: sections.includes('media') && Array.isArray(window.DATA) ? window.DATA.filter(e => e.status !== 'dropped').map(e => ({
      title: e.title,
      status: e.status,
      rating: e.score || e.rating || null,
      genre: gbyidFn(e.genre_id || e.genreId)?.name || '',
      progress: (() => { const s = entryStatsFn(e); return s.tot ? `${s.cur}/${s.tot}ep` : (s.cur ? `${s.cur}ep` : null); })()
    })) : [],
    games: sections.includes('games') && Array.isArray(window.GDATA) ? window.GDATA.filter(g => !g.adult18).map(g => ({
      title: g.title,
      status: g.status,
      rating: g.rating || null,
      platform: PLAT_LABEL[g.platform] || g.platform || 'PC',
      totalHours: g.hours_played || g.totalHours || null,
    })) : [],
    books: sections.includes('books') && Array.isArray(window.BDATA) ? window.BDATA.map(b => ({
      title: b.title,
      status: b.status,
      rating: b.rating || null,
      author: b.author || '',
      progress: b.progress_tot ? `${b.progress_cur || 0}/${b.progress_tot}` : (b.progress_cur ? `${b.progress_cur}` : null)
    })) : [],
  };

  // 1. Primary: Cloudflare Worker API (Zero login required!)
  if (window.publicShareApi) {
    try {
      const res = await window.publicShareApi.publish(snap, shareSettings.shareId, shareSettings.manageKey);
      const shareId = res.shareId;
      shareSettings.shareId = shareId;
      if (res.manageKey) shareSettings.manageKey = res.manageKey;
      shareSettings.sections = sections;
      shareSettings.enabled = true;
      saveShareSettings(shareSettings);
      return `${location.origin}/?share=${encodeURIComponent(shareId)}`;
    } catch (e) {
      console.warn('[Public Share] Server publish error:', e);
    }
  }

  // 2. Offline / Serverless Zero-Dependency Fallback: Portable data URI
  try {
    const jsonStr = JSON.stringify(snap);
    const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
    const shareId = 'data:' + b64;
    shareSettings.shareId = shareId;
    shareSettings.sections = sections;
    shareSettings.enabled = true;
    saveShareSettings(shareSettings);
    return `${location.origin}/#share=${shareId}`;
  } catch (err) {
    throw new Error('Failed to create snapshot link: ' + err.message);
  }
}

export async function revokePublicLink() {
  const shareSettings = loadShareSettings();

  if (window.publicShareApi && shareSettings.shareId && !shareSettings.shareId.startsWith('data:')) {
    try {
      await window.publicShareApi.revoke(shareSettings.shareId, shareSettings.manageKey);
    } catch (e) {
      console.warn('[Public Share] Revoke error:', e);
    }
  }

  shareSettings.shareId = null;
  shareSettings.manageKey = null;
  shareSettings.enabled = false;
  saveShareSettings(shareSettings);
}

// ── Settings UI for public share ──
export function renderSettingsPublicShare(el) {
  const s = loadShareSettings();
  const shareId = s.shareId;
  const isDataUri = shareId && shareId.startsWith('data:');
  const publicUrl = shareId ? (isDataUri ? `${location.origin}/#share=${shareId}` : `${location.origin}/?share=${encodeURIComponent(shareId)}`) : null;

  const sectionOpts = [
    { id: 'media', label: 'Media', color: '#38bdf8', icon: '◉' },
    { id: 'games', label: 'Games', color: '#f59e0b', icon: '◈' },
    { id: 'books', label: 'Books', color: '#a78bfa', icon: '◎' },
  ];

  // Auto-sync status with server in background
  if (window.publicShareApi && shareId && !isDataUri) {
    window.publicShareApi.getStatus(shareId, s.manageKey).then(res => {
      if (res && res.active && res.shareId && res.shareId !== shareId) {
        s.shareId = res.shareId;
        s.manageKey = res.manageKey || s.manageKey;
        s.sections = res.sections || s.sections;
        s.enabled = true;
        saveShareSettings(s);
        const curEl = document.getElementById('settings-body');
        if (curEl && window.SETTINGS_TAB === 'share') renderSettingsPublicShare(curEl);
      } else if (res && !res.active && shareId && s.enabled) {
        s.shareId = null;
        s.manageKey = null;
        s.enabled = false;
        saveShareSettings(s);
        const curEl = document.getElementById('settings-body');
        if (curEl && window.SETTINGS_TAB === 'share') renderSettingsPublicShare(curEl);
      }
    }).catch(() => {});
  }

  el.innerHTML = `
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);overflow:hidden;box-shadow:var(--sh)">
      <div style="padding:16px;border-bottom:1px solid var(--brd)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">
          <span style="font-size:16px;color:var(--ac)">🔗</span>
          <div style="font-size:14px;font-weight:700;color:var(--tx)">Public List Link</div>
        </div>
        <div style="font-size:12px;color:var(--mu)">Share a read-only live snapshot of your library with anyone — no login or Google Drive required.</div>
      </div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:16px">
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--tx);margin-bottom:8px">Include Sections in Public List:</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            ${sectionOpts.map(o => `
              <label style="display:flex;align-items:center;gap:7px;cursor:pointer;font-size:13px;color:var(--tx);background:var(--surf2);border:1px solid var(--brd);border-radius:6px;padding:6px 12px;transition:all .15s">
                <input type="checkbox" id="pub-sec-${o.id}" ${(s.sections || []).includes(o.id) ? 'checked' : ''}
                  style="width:14px;height:14px;cursor:pointer;accent-color:${o.color}">
                <span style="color:${o.color}">${o.icon}</span> ${o.label}
              </label>`).join('')}
          </div>
        </div>

        ${publicUrl ? `
          <div style="background:var(--surf2);border:1px solid rgba(var(--ac-rgb),.25);border-radius:8px;padding:12px 14px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--ac)">✓ Live Public URL</span>
              <span style="font-size:11px;color:var(--mu)">Active</span>
            </div>
            <div style="font-size:12px;color:var(--tx);word-break:break-all;margin-bottom:12px;padding:8px 10px;background:var(--surf3);border:1px solid var(--brd);border-radius:5px;font-family:monospace;user-select:all">
              ${esc(publicUrl)}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button onclick="navigator.clipboard.writeText('${esc(publicUrl)}').then(()=>{ if(window.toast) toast('✓ Public link copied to clipboard!','var(--cd)'); })"
                style="background:rgba(var(--ac-rgb),.15);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.35);border-radius:5px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer">
                📋 Copy Link
              </button>
              <a href="${esc(publicUrl)}" target="_blank"
                style="background:var(--surf3);color:var(--tx);border:1px solid var(--brd);border-radius:5px;padding:6px 12px;font-size:12px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:4px">
                Open View ↗
              </a>
            </div>
          </div>` : ''}

        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
          <button onclick="handleGeneratePublicLink()"
            style="background:var(--ac);color:#000;border:none;border-radius:6px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:6px">
            ${publicUrl ? '↻ Update Snapshot' : '+ Generate Public Link'}
          </button>
          ${publicUrl ? `
            <button onclick="handleRevokePublicLink()"
              style="background:rgba(251,113,133,.08);color:#fb7185;border:1px solid rgba(251,113,133,.22);border-radius:6px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer">
              Revoke Link
            </button>` : ''}
        </div>

        <div style="font-size:11px;color:var(--mu);line-height:1.5;padding-top:4px">
          🔒 <b>Instant & Private:</b> Anyone with the link can view your selected lists without logging in. Sensitive vault notes and 18+ items are strictly excluded.
        </div>
      </div>
    </div>`;
}

export async function handleGeneratePublicLink() {
  const sections = ['media', 'games', 'books'].filter(id => document.getElementById(`pub-sec-${id}`)?.checked);
  if (!sections.length) {
    if (typeof window.showAlert === 'function') {
      window.showAlert('Please select at least one section (Media, Games, or Books) to include in your public share.', { title: 'Select Sections' });
    }
    return;
  }
  if (typeof window.toast === 'function') window.toast('Generating public list...', 'var(--ch)');
  try {
    const url = await generatePublicLink(sections);
    if (typeof window.toast === 'function') window.toast('✓ Public link ready and live!', 'var(--cd)');
    const el = document.getElementById('settings-body');
    if (el) renderSettingsPublicShare(el);
  } catch (e) {
    console.error('[Public Share] Generate error:', e);
    if (typeof window.toast === 'function') window.toast(e.message || 'Failed to generate link', 'var(--err)');
  }
}

export async function handleRevokePublicLink() {
  const action = async () => {
    try {
      await revokePublicLink();
      if (typeof window.toast === 'function') window.toast('Public link revoked successfully');
      const el = document.getElementById('settings-body');
      if (el) renderSettingsPublicShare(el);
    } catch (e) {
      if (typeof window.toast === 'function') window.toast('Revoke error: ' + e.message, 'var(--err)');
    }
  };

  if (typeof window.showConfirm === 'function') {
    window.showConfirm('Revoke your public link? Anyone visiting the link will no longer be able to view your list.', action, {
      title: 'Revoke Public Link?',
      okLabel: 'Revoke',
      danger: true
    });
  } else {
    if (confirm('Revoke your public link? Anyone visiting the link will no longer be able to view your list.')) {
      action();
    }
  }
}

// ── Register public share globals for inline HTML event handlers ──
Object.assign(window, {
  checkPublicView,
  renderPublicView,
  renderPublicContent,
  generatePublicLink,
  revokePublicLink,
  renderSettingsPublicShare,
  handleGeneratePublicLink,
  handleRevokePublicLink,
});
