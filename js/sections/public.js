// ═══════════════════════════════════════════════════════
//  PUBLIC LIST SHARE
// ═══════════════════════════════════════════════════════
const SHARE_KEY = 'ac_v4_share';

function loadShareSettings() {
  return ls.get(SHARE_KEY) || { fileId: null, sections: ['media'], enabled: false };
}
function saveShareSettings(s) { ls.set(SHARE_KEY, s); }

// ── Check if we're in public view mode ──
function checkPublicView() {
  const params = new URLSearchParams(window.location.search);
  const shareId = params.get('share');
  if (shareId) {
    renderPublicView(shareId);
    return true;
  }
  return false;
}

async function renderPublicView(fileId) {
  document.body.innerHTML = `
    <style>html,body{height:auto!important;overflow:auto!important;display:block!important}</style>
    <div style="min-height:100vh;background:#070d0b;color:#e8f5f0;font-family:'Outfit',sans-serif;display:flex;flex-direction:column">
      <div style="background:#0d1512;border-bottom:1px solid #1e3329;padding:14px 20px;display:flex;align-items:center;gap:12px;position:sticky;top:0;z-index:10">
        <div style="font-family:'Cinzel',serif;font-size:18px;font-weight:700;color:#34d399">The Aether Codex</div>
        <div style="font-size:12px;color:#3a5a4a;padding:2px 8px;background:rgba(52,211,153,.08);border:1px solid rgba(52,211,153,.15);border-radius:10px">Public List</div>
      </div>
      <div id="pub-content" style="flex:1;max-width:860px;margin:0 auto;width:100%;padding:24px 16px">
        <div style="text-align:center;padding:40px;color:#3a5a4a">Loading...</div>
      </div>
      <div style="padding:16px;text-align:center;border-top:1px solid #1e3329;font-size:12px;color:#3a5a4a">
        Powered by <span style="color:#34d399">The Aether Codex</span>
      </div>
    </div>`;
  // Fix scroll on public view - override app CSS
  document.documentElement.style.cssText = 'height:auto!important;overflow:auto!important';
  document.body.style.cssText = 'height:auto!important;overflow:auto!important;display:block!important';

  // Load Google Fonts
  const link = document.createElement('link');
  link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Outfit:wght@400;500;600&display=swap";
  link.rel = 'stylesheet';
  document.head.appendChild(link);

  try {
    const res = await fetch(`https://aether-codex-ai.nadeempubgmobile2-0.workers.dev?fileId=${fileId}`);
    if (!res.ok) throw new Error('File not found or not public');
    const text = await res.text();
    // Handle Google Drive virus scan warning page
    const jsonStart = text.indexOf('{');
    if (jsonStart === -1) throw new Error('Invalid response from Drive');
    const data = JSON.parse(text.slice(jsonStart));
    renderPublicContent(data);
  } catch(e) {
    document.getElementById('pub-content').innerHTML = `
      <div style="text-align:center;padding:60px 20px">
        <div style="font-size:32px;margin-bottom:12px">🔒</div>
        <div style="font-size:16px;font-weight:600;color:#e8f5f0;margin-bottom:6px">List not available</div>
        <div style="font-size:13px;color:#3a5a4a">This list may have been revoked or the link is invalid.</div>
      </div>`;
  }
}

function renderPublicContent(snap) {
  const el = document.getElementById('pub-content'); if (!el) return;
  const sections = snap.sections || [];
  const owner = snap.owner || 'Someone';
  const generated = snap.generatedAt ? new Date(snap.generatedAt).toLocaleDateString() : '';

  const STATUS_COLORS = { watching:'#38bdf8', completed:'#4ade80', plan:'#a78bfa', on_hold:'#fbbf24', dropped:'#fb7185' };
  const STATUS_LABELS = { watching:'Watching', completed:'Completed', plan:'Plan', on_hold:'On Hold', dropped:'Dropped' };

  let html = `
    <div style="margin-bottom:24px">
      <div style="font-family:'Cinzel',serif;font-size:22px;font-weight:700;color:#34d399;margin-bottom:4px">${esc(owner)}'s List</div>
      ${generated ? `<div style="font-size:12px;color:#3a5a4a">Last updated: ${generated}</div>` : ''}
    </div>`;

  // Media section
  if (sections.includes('media') && snap.media?.length) {
    const byStatus = {};
    snap.media.forEach(e => { if(!byStatus[e.status]) byStatus[e.status] = []; byStatus[e.status].push(e); });
    const order = ['watching','completed','plan','on_hold','dropped'];

    html += `<div style="margin-bottom:28px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#e879a0;margin-bottom:12px;display:flex;align-items:center;gap:8px">
        <span>◉ Media</span><div style="flex:1;height:1px;background:rgba(232,121,160,.2)"></div>
        <span style="font-size:11px;color:#3a5a4a">${snap.media.length} entries</span>
      </div>`;

    order.forEach(s => {
      const rows = byStatus[s]; if (!rows?.length) return;
      html += `<div style="margin-bottom:16px">
        <div style="font-size:11px;font-weight:700;color:${STATUS_COLORS[s]};margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">${STATUS_LABELS[s]} (${rows.length})</div>
        <div style="display:flex;flex-direction:column;gap:4px">
        ${rows.map(e => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0d1512;border:1px solid #1e3329;border-radius:6px">
            <div style="width:3px;height:32px;background:${STATUS_COLORS[s]||'#34d399'};border-radius:2px;flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:#e8f5f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.title)}</div>
              <div style="font-size:11px;color:#3a5a4a;margin-top:1px">${e.genre||''}</div>
            </div>
            ${e.rating ? `<span style="font-size:12px;font-weight:700;color:#fbbf24">★ ${e.rating}</span>` : ''}
            ${e.progress ? `<span style="font-size:11px;color:#3a5a4a">${e.progress}</span>` : ''}
          </div>`).join('')}
        </div>
      </div>`;
    });
    html += `</div>`;
  }

  // Games section
  if (sections.includes('games') && snap.games?.length) {
    html += `<div style="margin-bottom:28px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#f59e0b;margin-bottom:12px;display:flex;align-items:center;gap:8px">
        <span>◈ Games</span><div style="flex:1;height:1px;background:rgba(245,158,11,.2)"></div>
        <span style="font-size:11px;color:#3a5a4a">${snap.games.length} entries</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
      ${snap.games.map(g => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0d1512;border:1px solid #1e3329;border-radius:6px">
          <div style="width:3px;height:32px;background:${STATUS_COLORS[g.status]||'#f59e0b'};border-radius:2px;flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:#e8f5f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.title)}</div>
            <div style="font-size:11px;color:#3a5a4a">${g.platform||''}</div>
          </div>
          ${g.rating ? `<span style="font-size:12px;font-weight:700;color:#fbbf24">★ ${g.rating}</span>` : ''}
          ${g.totalHours ? `<span style="font-size:11px;color:#3a5a4a">${g.totalHours}h</span>` : ''}
        </div>`).join('')}
      </div>
    </div>`;
  }

  // Books section
  if (sections.includes('books') && snap.books?.length) {
    html += `<div style="margin-bottom:28px">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#a78bfa;margin-bottom:12px;display:flex;align-items:center;gap:8px">
        <span>◎ Books</span><div style="flex:1;height:1px;background:rgba(167,139,250,.2)"></div>
        <span style="font-size:11px;color:#3a5a4a">${snap.books.length} entries</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:4px">
      ${snap.books.map(b => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#0d1512;border:1px solid #1e3329;border-radius:6px">
          <div style="width:3px;height:32px;background:${STATUS_COLORS[b.status]||'#a78bfa'};border-radius:2px;flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:#e8f5f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(b.title)}</div>
            <div style="font-size:11px;color:#3a5a4a">${b.author||''}</div>
          </div>
          ${b.rating ? `<span style="font-size:12px;font-weight:700;color:#fbbf24">★ ${b.rating}</span>` : ''}
        </div>`).join('')}
      </div>
    </div>`;
  }

  el.innerHTML = html;
}

// ── Generate / Update public snapshot ──
async function generatePublicLink(sections) {
  if (!_isConnected()) { showAlert('Please connect Google Drive first.', {title:'Drive Required'}); return; }

  const shareSettings = loadShareSettings();

  // Build snapshot — exclude private/locked data
  const snap = {
    owner: 'Aether Codex User',
    generatedAt: Date.now(),
    sections,
    media: sections.includes('media') ? DATA.filter(e=>e.status!=='dropped').map(e => ({
      title: e.title, status: e.status, rating: e.rating,
      genre: gbyid(e.genreId)?.name,
      progress: (() => { const s=entryStats(e); return s.tot?`${s.cur}/${s.tot}ep`:null; })()
    })) : [],
    games: sections.includes('games') ? window.GDATA.filter(g=>!g.adult18).map(g => ({
      title: g.title, status: g.status, rating: g.rating,
      platform: PLAT_LABEL[g.platform], totalHours: g.totalHours
    })) : [],
    books: sections.includes('books') ? window.BDATA.map(b => ({
      title: b.title, status: b.status, rating: b.rating, author: b.author
    })) : [],
  };

  try {
    const folderId = await _getOrCreateFolder(); if (!folderId) throw new Error('No Drive folder');
    const payload = JSON.stringify(snap);
    let fileId = shareSettings.fileId;

    if (fileId) {
      // Update existing file
      const r = await _req(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
        method:'PATCH', headers:{'Content-Type':'application/json'}, body:payload
      });
      if (!r?.ok) fileId = null; // File gone, create new
    }

    if (!fileId) {
      // Create new file
      const cr = await _req('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method:'POST',
        headers:{'Content-Type':'multipart/related; boundary=boundary'},
        body:`--boundary\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({name:'AetherCodex_public.json',parents:[folderId]})}\r\n--boundary\r\nContent-Type: application/json\r\n\r\n${payload}\r\n--boundary--`
      });
      if (!cr?.ok) throw new Error('Failed to create file');
      fileId = (await cr.json()).id;
    }

    // Make file publicly readable
    await _req(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({role:'reader', type:'anyone'})
    });

    shareSettings.fileId = fileId;
    shareSettings.sections = sections;
    shareSettings.enabled = true;
    saveShareSettings(shareSettings);

    const publicUrl = `https://alone-16.github.io/Aether-Codex/?share=${fileId}`;
    return publicUrl;
  } catch(e) {
    throw new Error('Failed to generate link: ' + e.message);
  }
}

async function revokePublicLink() {
  const shareSettings = loadShareSettings();
  if (!shareSettings.fileId) return;
  // Delete permissions (make private again)
  await _req(`https://www.googleapis.com/drive/v3/files/${shareSettings.fileId}/permissions/anyoneWithLink`, {
    method:'DELETE'
  });
  shareSettings.fileId = null;
  shareSettings.enabled = false;
  saveShareSettings(shareSettings);
}

// ── Settings UI for public share ──
function renderSettingsPublicShare(el) {
  const s = loadShareSettings();
  const publicUrl = s.fileId ? `https://alone-16.github.io/Aether-Codex/?share=${s.fileId}` : null;
  const sectionOpts = [
    {id:'media', label:'Media', color:'#e879a0'},
    {id:'games', label:'Games', color:'#f59e0b'},
    {id:'books', label:'Books', color:'#a78bfa'},
  ];

  el.innerHTML = `
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);overflow:hidden">
      <div style="padding:14px 16px;border-bottom:1px solid var(--brd)">
        <div style="font-size:13px;font-weight:700;color:var(--tx);margin-bottom:2px">🔗 Public List Link</div>
        <div style="font-size:12px;color:var(--mu)">Share a read-only snapshot of your lists</div>
      </div>
      <div style="padding:14px 16px;display:flex;flex-direction:column;gap:12px">
        <div>
          <div style="font-size:12px;font-weight:600;color:var(--tx);margin-bottom:8px">Include sections:</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${sectionOpts.map(o => `
              <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;color:var(--tx2)">
                <input type="checkbox" id="pub-sec-${o.id}" ${(s.sections||[]).includes(o.id)?'checked':''}
                  style="width:14px;height:14px;cursor:pointer;accent-color:${o.color}">
                ${o.label}
              </label>`).join('')}
          </div>
        </div>
        ${publicUrl ? `
          <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:5px;padding:10px 12px">
            <div style="font-size:11px;color:var(--mu);margin-bottom:4px">Public URL</div>
            <div style="font-size:12px;color:var(--ac);word-break:break-all;margin-bottom:8px">${publicUrl}</div>
            <button onclick="navigator.clipboard.writeText('${publicUrl}').then(()=>toast('✓ Link copied','var(--cd)'))"
              style="background:rgba(var(--ac-rgb),.12);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3);border-radius:4px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer">Copy Link</button>
          </div>` : ''}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button onclick="handleGeneratePublicLink()" style="background:var(--ac);color:#000;border:none;border-radius:5px;padding:8px 16px;font-size:12px;font-weight:700;cursor:pointer">
            ${publicUrl ? '↻ Update Link' : '+ Generate Link'}
          </button>
          ${publicUrl ? `<button onclick="handleRevokePublicLink()" style="background:rgba(251,113,133,.08);color:#fb7185;border:1px solid rgba(251,113,133,.2);border-radius:5px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer">Revoke Link</button>` : ''}
        </div>
        <div style="font-size:11px;color:var(--mu)">Note: 18+ games and private vault links are never included. Anyone with the link can view your list — no login required.</div>
      </div>
    </div>`;
}

async function handleGeneratePublicLink() {
  const sections = ['media','games','books'].filter(id => document.getElementById(`pub-sec-${id}`)?.checked);
  if (!sections.length) { showAlert('Select at least one section to share.', {title:'No Sections'}); return; }
  toast('Generating public link...', 'var(--ch)');
  try {
    const url = await generatePublicLink(sections);
    toast('✓ Public link generated!', 'var(--cd)');
    renderSettingsPublicShare(document.getElementById('settings-body'));
  } catch(e) {
    toast('Failed: ' + e.message, 'var(--cr)');
  }
}

async function handleRevokePublicLink() {
  showConfirm('Revoke your public link? Anyone with the link will no longer be able to view your list.', async () => {
    await revokePublicLink();
    toast('Public link revoked');
    renderSettingsPublicShare(document.getElementById('settings-body'));
  }, {title:'Revoke Link?', okLabel:'Revoke', danger:false});
}

// ── Register all public/share functions as globals ───────────────────────
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
