// ═══════════════════════════════════════════════════════
//  TOOLS SECTION — Instagram Toolkit (4 modules)
// ═══════════════════════════════════════════════════════

let TOOLS_API_KEY     = localStorage.getItem('ac_tools_rapidapi_key') || '';
let TOOLS_ACTIVE_TAB  = 'posts';
let TOOLS_PROFILE_ABORT   = false;
let TOOLS_PROFILE_RESULTS = [];

const TOOLS_API_HOST    = 'instagram120.p.rapidapi.com';
const TOOLS_API_BASE    = 'https://instagram120.p.rapidapi.com';
const TOOLS_DEFAULT_KEY = '9225bde298mshab57009efa4a5a2p124916jsnfcf9acceb394';

// ── Inject spinner keyframe once ──
(function _injectToolsStyles() {
  if (document.getElementById('tools-extra-styles')) return;
  const s = document.createElement('style');
  s.id = 'tools-extra-styles';
  s.textContent = `
    @keyframes tools-spin { to { transform: rotate(360deg); } }
    .tools-spinner { width:22px;height:22px;border:2px solid var(--brd);border-top-color:var(--ac);border-radius:50%;animation:tools-spin .6s linear infinite; }
    .tools-grid-4 { display:grid;grid-template-columns:repeat(4,1fr);gap:5px; }
    @media(max-width:640px){ .tools-grid-4{grid-template-columns:repeat(2,1fr)} }
  `;
  document.head.appendChild(s);
})();

// ──────────────────────────────────────────────────────
//  SHARED HELPERS
// ──────────────────────────────────────────────────────

/** Standard POST headers — uses saved key with built-in key as fallback. */
function toolsApiHeaders() {
  return {
    'Content-Type':    'application/json',
    'x-rapidapi-key':  TOOLS_API_KEY || TOOLS_DEFAULT_KEY,
    'x-rapidapi-host': TOOLS_API_HOST,
  };
}

/** Try each CORS proxy in order; loads an image via blob URL. */
const TOOLS_PREVIEW_PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://proxy.cors.sh/${u}`,
];

async function toolsLoadPreview(imgEl) {
  const url = decodeURIComponent(imgEl.dataset.url);
  for (const build of TOOLS_PREVIEW_PROXIES) {
    try {
      const res = await fetch(build(url));
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob || blob.size === 0) continue;
      if (imgEl._blobUrl) URL.revokeObjectURL(imgEl._blobUrl);
      imgEl._blobUrl = URL.createObjectURL(blob);
      imgEl.src = imgEl._blobUrl;
      imgEl.style.display = 'block';
      return;
    } catch { /* next proxy */ }
  }
  imgEl.style.display = 'none';
  const errEl = document.getElementById('tools-img-error-' + imgEl.dataset.idx);
  if (errEl) errEl.style.display = 'flex';
}

/** Download a file via CORS proxy; falls back to window.open. */
async function toolsDownload(encodedUrl, filename) {
  const url = decodeURIComponent(encodedUrl);
  for (const build of TOOLS_PREVIEW_PROXIES) {
    try {
      const res = await fetch(build(url));
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob || blob.size === 0) continue;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    } catch { /* next */ }
  }
  window.open(url, '_blank');
}

/** Download multiple files sequentially. */
async function toolsDownloadAll(files) {
  for (let i = 0; i < files.length; i++) {
    await new Promise(r => setTimeout(r, 700 * i));
    toolsDownload(files[i].url, files[i].name);
  }
}

/** Extract a clean username from @handle or instagram.com URL. */
function toolsExtractUsername(input) {
  const t = (input || '').trim();
  const m = t.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  if (m) return m[1].replace(/\/$/, '');
  if (t.startsWith('@')) return t.slice(1);
  return t.replace(/\/$/, '');
}

/** Dynamically load JSZip from CDN. */
async function loadJSZip() {
  if (window.JSZip) return window.JSZip;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    s.onload  = () => resolve(window.JSZip);
    s.onerror = () => reject(new Error('Failed to load JSZip from CDN'));
    document.head.appendChild(s);
  });
}

/**
 * Extract all downloadable file URLs from a /posts API response.
 * Always reads candidates[0] (highest quality) from image_versions2.
 */
function toolsExtractPostFiles(data) {
  const files = [];
  const edges = data?.result?.edges || data?.edges || data?.data?.edges || data?.items || [];

  for (const edge of edges) {
    const node    = edge.node || edge;
    const carousel = node.carousel_media
      || node.edge_sidecar_to_children?.edges?.map(e => e.node)
      || [];

    if (carousel.length) {
      for (const item of carousel) {
        const url = item.image_versions2?.candidates?.[0]?.url
          || item.display_url
          || item.thumbnail_src;
        if (url) files.push({ url, ext: 'jpg', id: item.id || uid() });
      }
    } else {
      const isVideo = node.is_video || node.media_type === 2;
      const url = isVideo
        ? (node.video_url || node.video_versions?.[0]?.url)
        : (node.image_versions2?.candidates?.[0]?.url || node.display_url || node.thumbnail_src);
      if (url) files.push({ url, ext: isVideo ? 'mp4' : 'jpg', id: node.id || uid() });
    }
  }
  return files;
}

// ──────────────────────────────────────────────────────
//  MAIN RENDER & TAB SWITCHING
// ──────────────────────────────────────────────────────

function renderTools(c) {
  c.innerHTML = `
    <div class="tools-wrap">

      <!-- ── Header ── -->
      <div class="tools-header">
        <div class="tools-header-inner">
          <div class="tools-icon" style="font-size:22px">◉</div>
          <div>
            <div class="tools-title">Instagram Toolkit</div>
            <div class="tools-sub">Download posts, stories, profile pictures &amp; archives</div>
          </div>
        </div>
      </div>

      <!-- ── API Key ── -->
      <div class="tools-card" id="tools-apikey-card">
        <div class="tools-card-head">
          <span class="tools-card-label">⚙ RapidAPI Key</span>
          <span class="tools-card-hint" id="tools-key-status">${TOOLS_API_KEY ? '✓ Custom key saved' : 'Using built-in key'}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="fin tools-key-input" id="tools-apikey-input" type="password"
            placeholder="Optional: paste your own x-rapidapi-key for higher limits…"
            value="${TOOLS_API_KEY}" autocomplete="off">
          <button class="tools-save-btn" onclick="toolsSaveKey()">Save</button>
        </div>
        <div style="font-size:11px;color:var(--mu);margin-top:6px">
          A built-in key is pre-loaded. Get your own from
          <span style="color:var(--ac);font-weight:600">rapidapi.com</span>
          → search <em>Instagram120</em> → Subscribe → copy <code>x-rapidapi-key</code>.
        </div>
      </div>

      <!-- ── Module Tabs ── -->
      <div class="sub-tabs" id="tools-tabs" style="width:fit-content;flex-wrap:nowrap;overflow-x:auto">
        ${[
          ['posts',      '⬇ Posts'],
          ['profilepic', '👤 Profile Pic'],
          ['profile',    '📁 Profile DL'],
          ['story',      '📖 Story'],
        ].map(([id, label]) =>
          `<button class="stab${TOOLS_ACTIVE_TAB === id ? ' active' : ''}"
              data-tab="${id}" onclick="setToolsTab('${id}')">${label}</button>`
        ).join('')}
      </div>

      <!-- ── Active module ── -->
      <div id="tools-tab-content"></div>

    </div>`;

  renderToolsTabContent();
}

function setToolsTab(tab) {
  TOOLS_PROFILE_ABORT = true;
  TOOLS_ACTIVE_TAB    = tab;
  document.querySelectorAll('#tools-tabs .stab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
  renderToolsTabContent();
}

function renderToolsTabContent() {
  const el = document.getElementById('tools-tab-content');
  if (!el) return;
  TOOLS_PROFILE_ABORT = false;
  if      (TOOLS_ACTIVE_TAB === 'posts')      renderToolsPosts(el);
  else if (TOOLS_ACTIVE_TAB === 'profilepic') renderToolsProfilePicTab(el);
  else if (TOOLS_ACTIVE_TAB === 'profile')    renderToolsProfile(el);
  else if (TOOLS_ACTIVE_TAB === 'story')      renderToolsStory(el);
}

function toolsSaveKey() {
  const val = document.getElementById('tools-apikey-input')?.value?.trim();
  TOOLS_API_KEY = val;
  localStorage.setItem('ac_tools_rapidapi_key', val || '');
  const st = document.getElementById('tools-key-status');
  if (st) {
    st.textContent = val ? '✓ Custom key saved' : 'Using built-in key';
    st.style.color = val ? 'var(--ac)' : '';
  }
  toast(val ? '✓ API key saved' : 'Key cleared — using built-in key');
}

// ──────────────────────────────────────────────────────
//  TAB 1 — POSTS DOWNLOADER
//  POST /api/instagram/posts  { username, maxId: "" }
//  Response: edges[].node → image_versions2.candidates[0].url
// ──────────────────────────────────────────────────────

function renderToolsPosts(el) {
  el.innerHTML = `
    <div class="tools-card">
      <div class="tools-card-head">
        <span class="tools-card-label">⬇ Posts by Username</span>
        <span class="tools-card-hint">Fetches latest posts from a public account</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <div class="srch-wrap" style="max-width:100%;flex:1;margin:0">
          <span class="srch-ico" style="font-size:11px;font-weight:700">@</span>
          <input class="srch tools-url-input" id="posts-input"
            placeholder="username  or  instagram.com/username/"
            onkeydown="if(event.key==='Enter')toolsFetchPosts()"
            style="padding-left:30px;border-radius:var(--cr)">
        </div>
        <button class="tools-fetch-btn" id="posts-btn" onclick="toolsFetchPosts()">
          <span id="posts-label">Fetch</span>
        </button>
      </div>
    </div>
    <div id="posts-error"  style="display:none" class="tools-error"></div>
    <div id="posts-result" style="display:none"></div>`;
}

async function toolsFetchPosts() {
  const input  = document.getElementById('posts-input')?.value?.trim();
  const btn    = document.getElementById('posts-btn');
  const label  = document.getElementById('posts-label');
  const errDiv = document.getElementById('posts-error');
  const resDiv = document.getElementById('posts-result');

  if (!input) return toolsPostsError('Please enter a username or profile URL.');

  const username = toolsExtractUsername(input);
  if (!username) return toolsPostsError('Could not extract a username. Please check the input.');

  errDiv.style.display = 'none';
  resDiv.style.display = 'none';
  btn.disabled         = true;
  label.textContent    = '…';

  try {
    const res = await fetch(`${TOOLS_API_BASE}/api/instagram/posts`, {
      method:  'POST',
      headers: toolsApiHeaders(),
      body:    JSON.stringify({ username, maxId: '' }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`API error ${res.status}: ${txt.slice(0, 160)}`);
    }

    const data  = await res.json();
    const files = toolsExtractPostFiles(data);
    if (!files.length) throw new Error('No media found — account may be private or have no posts.');
    toolsRenderPostsResult(files, username, resDiv);
  } catch(e) {
    toolsPostsError(e.message || 'Something went wrong. Check the username and try again.');
  } finally {
    btn.disabled      = false;
    label.textContent = 'Fetch';
  }
}

function toolsPostsError(msg) {
  const el = document.getElementById('posts-error');
  if (el) { el.textContent = '⚠ ' + msg; el.style.display = 'block'; }
}

function toolsRenderPostsResult(files, username, resDiv) {
  const preview = files.slice(0, 36);
  const dlFiles = files.map((f, i) => ({
    url:  encodeURIComponent(f.url),
    name: `${username}_${String(i + 1).padStart(4, '0')}.${f.ext}`,
  }));
  const dlData = JSON.stringify(dlFiles).replace(/"/g, '&quot;');

  const tilesHtml = preview.map((f, i) => {
    const enc  = encodeURIComponent(f.url);
    const name = dlFiles[i].name;
    if (f.ext === 'mp4') {
      return `<div class="tools-img-item" style="aspect-ratio:1">
        <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--surf2);gap:4px">
          <span style="font-size:22px;opacity:.45">▶</span>
          <span style="font-size:9px;color:var(--mu)">VIDEO</span>
        </div>
        <div class="tools-img-overlay">
          <span style="font-size:9px;color:rgba(255,255,255,.7)">#${i + 1}</span>
          <button class="tools-dl-btn" onclick="toolsDownload('${enc}','${name}')">⬇</button>
        </div>
      </div>`;
    }
    return `<div class="tools-img-item" style="aspect-ratio:1">
      <div id="ptile-load-${i}" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--surf2)">
        <div class="tools-spinner"></div>
      </div>
      <img id="ptile-img-${i}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none"
        data-url="${enc}" data-idx="${i}">
      <div id="ptile-err-${i}" style="display:none;position:absolute;inset:0;flex-direction:column;align-items:center;justify-content:center;gap:4px">
        <span style="font-size:18px;opacity:.3">◉</span>
        <span style="font-size:9px;color:var(--mu)">No preview</span>
      </div>
      <div class="tools-img-overlay">
        <span style="font-size:9px;color:rgba(255,255,255,.7)">#${i + 1}</span>
        <button class="tools-dl-btn" onclick="toolsDownload('${enc}','${name}')">⬇</button>
      </div>
    </div>`;
  }).join('');

  resDiv.style.display = 'block';
  resDiv.innerHTML = `
    <div class="tools-card tools-result-card">
      <div class="tools-user-row">
        <div>
          <div class="tools-username">@${esc(username)}</div>
          <div class="tools-meta-row">
            <span class="stag st-watching" style="font-size:9px">${files.length} file${files.length !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="posts-zip-btn" class="tools-fetch-btn"
          onclick="toolsDownloadZIP('${esc(username)}', JSON.parse(this.dataset.files), 'posts-zip-btn', 'posts-zip-progress')"
          data-files="${dlData}">📦 Download All as ZIP (${files.length})</button>
        <button class="tools-fetch-btn"
          style="background:var(--surf2);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3)"
          onclick="toolsDownloadAll(JSON.parse(this.dataset.files))"
          data-files="${dlData}">⬇ Download Individually</button>
      </div>
      <div id="posts-zip-progress" style="display:none"></div>
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--mu);margin-bottom:8px">
        Preview — ${preview.length} of ${files.length} files
      </div>
      <div class="tools-grid-4" style="position:relative">${tilesHtml}</div>
      ${files.length > 36
        ? `<div style="font-size:12px;color:var(--mu);text-align:center;margin-top:10px;padding:8px;background:var(--surf2);border-radius:5px">
             +${files.length - 36} more — use ZIP to get everything
           </div>`
        : ''}
    </div>`;

  _toolsLazyLoadGrid(preview, 'ptile');
}

// ──────────────────────────────────────────────────────
//  TAB 2 — PROFILE PIC (renamed from DP)
//  POST /api/instagram/profile  { username }
//  Response: profile_pic_url_hd  (always highest quality)
// ──────────────────────────────────────────────────────

function renderToolsProfilePicTab(el) {
  el.innerHTML = `
    <div class="tools-card">
      <div class="tools-card-head">
        <span class="tools-card-label">👤 Profile Picture</span>
        <span class="tools-card-hint">HD quality when available</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <div class="srch-wrap" style="max-width:100%;flex:1;margin:0">
          <span class="srch-ico" style="font-size:11px;font-weight:700">@</span>
          <input class="srch tools-url-input" id="pp-input"
            placeholder="username  or  instagram.com/username/"
            onkeydown="if(event.key==='Enter')toolsFetchProfilePic()"
            style="padding-left:30px;border-radius:var(--cr)">
        </div>
        <button class="tools-fetch-btn" id="pp-btn" onclick="toolsFetchProfilePic()">
          <span id="pp-label">Fetch</span>
        </button>
      </div>
    </div>
    <div id="pp-error"  style="display:none" class="tools-error"></div>
    <div id="pp-result" style="display:none"></div>`;
}

async function toolsFetchProfilePic() {
  const input  = document.getElementById('pp-input')?.value?.trim();
  const btn    = document.getElementById('pp-btn');
  const label  = document.getElementById('pp-label');
  const errDiv = document.getElementById('pp-error');
  const resDiv = document.getElementById('pp-result');

  if (!input) return toolsPPError('Please enter a username or profile URL.');

  const username = toolsExtractUsername(input);
  if (!username) return toolsPPError('Could not extract a username. Please check the input.');

  errDiv.style.display = 'none';
  resDiv.style.display = 'none';
  btn.disabled         = true;
  label.textContent    = '…';

  try {
    const res = await fetch(`${TOOLS_API_BASE}/api/instagram/profile`, {
      method:  'POST',
      headers: toolsApiHeaders(),
      body:    JSON.stringify({ username }),
    });
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`API error ${res.status}: ${txt.slice(0, 160)}`);
    }

    const data = await res.json();
    // Defensive parse — handle result wrapper (new API) and legacy shapes
    const user = data?.result || data?.user || data?.data || data;
    if (!user) throw new Error('Unexpected API response shape.');

    // Always prefer HD; fall back to SD
    const dpUrl = user.profile_pic_url_hd
      || user.hd_profile_pic_url_info?.url
      || user.profile_pic_url;
    if (!dpUrl) throw new Error('No profile picture URL found in response.');

    toolsRenderProfilePicResult(user, dpUrl, resDiv, username);
  } catch(e) {
    toolsPPError(e.message);
  } finally {
    btn.disabled      = false;
    label.textContent = 'Fetch';
  }
}

function toolsPPError(msg) {
  const el = document.getElementById('pp-error');
  if (el) { el.textContent = '⚠ ' + msg; el.style.display = 'block'; }
}

function toolsRenderProfilePicResult(user, dpUrl, resDiv, username) {
  const uname     = user.username || username;
  const fullName  = user.full_name || '';
  const followers = user.edge_followed_by?.count ?? user.follower_count ?? '';
  const isHD      = !!(user.profile_pic_url_hd || user.hd_profile_pic_url_info?.url);
  const encoded   = encodeURIComponent(dpUrl);

  resDiv.style.display = 'block';
  resDiv.innerHTML = `
    <div class="tools-card">
      <div class="tools-user-row" style="margin-bottom:16px">
        <div>
          <div class="tools-username">@${esc(uname)}</div>
          ${fullName ? `<div style="font-size:12px;color:var(--tx2);margin-top:1px">${esc(fullName)}</div>` : ''}
          <div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap">
            ${isHD
              ? `<span class="stag st-completed" style="font-size:9px">✓ HD Available</span>`
              : `<span class="stag st-on_hold"   style="font-size:9px">SD Only</span>`}
            ${user.is_verified ? `<span class="stag st-watching" style="font-size:9px">✓ Verified</span>` : ''}
            ${followers !== '' ? `<span style="font-size:11px;color:var(--mu)">${Number(followers).toLocaleString()} followers</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Circular DP preview -->
      <div style="text-align:center;margin-bottom:16px">
        <div style="display:inline-block;border-radius:50%;overflow:hidden;width:200px;height:200px;border:3px solid rgba(var(--ac-rgb),.3);background:var(--surf2);position:relative">
          <div id="pp-spinner" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
            <div class="tools-spinner"></div>
          </div>
          <img id="pp-preview" alt="Profile Picture"
            style="width:200px;height:200px;object-fit:cover;display:none"
            data-url="${encoded}" data-idx="pp">
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="tools-fetch-btn"
          onclick="toolsDownload('${encoded}','${esc(uname)}_profile${isHD ? '_hd' : ''}.jpg')">
          ⬇ Download${isHD ? ' HD' : ''}
        </button>
        <button class="tools-fetch-btn"
          style="background:var(--surf2);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3)"
          onclick="window.open('${esc(dpUrl)}','_blank')">
          ⤢ Open Original
        </button>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    const img     = document.getElementById('pp-preview');
    const spinner = document.getElementById('pp-spinner');
    if (!img) return;
    img.onload  = () => { img.style.display = 'block'; if (spinner) spinner.style.display = 'none'; };
    img.onerror = () => {
      if (spinner) spinner.style.display = 'none';
      toolsLoadPreview(img).then(() => img.style.display = 'block');
    };
    img.src = dpUrl;
  });
}

// ──────────────────────────────────────────────────────
//  TAB 3 — PROFILE DOWNLOADER
//  Step 1: POST /api/instagram/profile { username }
//          → id, username, full_name, biography,
//            edge_followed_by.count, edge_follow.count,
//            edge_owner_to_timeline_media.count, is_private
//  Step 2: POST /api/instagram/posts { username, maxId }  (paginate)
//          → edges[].node → image_versions2.candidates[0].url
// ──────────────────────────────────────────────────────

function renderToolsProfile(el) {
  el.innerHTML = `
    <div class="tools-card">
      <div class="tools-card-head">
        <span class="tools-card-label">📁 Profile Downloader</span>
        <span class="tools-card-hint" style="color:#fb7185">Download responsibly</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <div class="srch-wrap" style="max-width:100%;flex:1;margin:0">
          <span class="srch-ico" style="font-size:11px;font-weight:700">@</span>
          <input class="srch tools-url-input" id="prof-input"
            placeholder="username  or  instagram.com/username/"
            onkeydown="if(event.key==='Enter')toolsFetchProfile()"
            style="padding-left:30px;border-radius:var(--cr)">
        </div>
        <button class="tools-fetch-btn" id="prof-btn" onclick="toolsFetchProfile()">
          <span id="prof-label">Fetch</span>
        </button>
      </div>
      <div style="display:flex;gap:14px;align-items:center;margin-top:10px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx2);cursor:pointer">
          Max posts:
          <input type="number" id="prof-limit" value="50" min="1" max="500"
            style="width:64px;background:var(--surf2);border:1px solid var(--brd);border-radius:4px;padding:4px 7px;font-size:12px;color:var(--tx);outline:none;text-align:center">
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx2);cursor:pointer">
          <input type="checkbox" id="prof-carousel" checked style="accent-color:var(--ac);cursor:pointer;width:13px;height:13px">
          Expand carousels
        </label>
      </div>
    </div>
    <div id="prof-error"    style="display:none" class="tools-error"></div>
    <div id="prof-progress" style="display:none"></div>
    <div id="prof-result"   style="display:none"></div>`;
}

async function toolsFetchProfile() {
  const input          = document.getElementById('prof-input')?.value?.trim();
  const btn            = document.getElementById('prof-btn');
  const label          = document.getElementById('prof-label');
  const errDiv         = document.getElementById('prof-error');
  const resDiv         = document.getElementById('prof-result');
  const progressDiv    = document.getElementById('prof-progress');
  const limit          = Math.max(1, parseInt(document.getElementById('prof-limit')?.value) || 50);
  const expandCarousel = document.getElementById('prof-carousel')?.checked ?? true;

  if (!input) return toolsProfError('Please enter a username or profile URL.');

  const username = toolsExtractUsername(input);
  errDiv.style.display      = 'none';
  resDiv.style.display      = 'none';
  progressDiv.style.display = 'none';

  TOOLS_PROFILE_ABORT        = false;
  btn.disabled                = true;
  label.textContent           = '…';
  progressDiv.style.display   = 'block';
  progressDiv.innerHTML       = toolsProfProgressHtml(0, limit, 'Connecting…');

  const allFiles = [];
  let user       = null;

  try {
    // ── Step 1: profile info ──
    const profileRes = await fetch(`${TOOLS_API_BASE}/api/instagram/profile`, {
      method:  'POST',
      headers: toolsApiHeaders(),
      body:    JSON.stringify({ username }),
    });
    if (!profileRes.ok) throw new Error(`Profile lookup failed (${profileRes.status}). Check username / API key.`);
    const profileData = await profileRes.json();
    user = profileData?.result || profileData?.user || profileData?.data || profileData;
    if (!user?.username && !user?.id) throw new Error('Unexpected profile response. The API may have changed.');

    // Check if private
    if (user.is_private) throw new Error(`@${user.username || username} is a private account — cannot download posts.`);

    progressDiv.innerHTML = toolsProfProgressHtml(0, limit, `Found @${user.username || username} — fetching posts…`);

    // ── Step 2: paginate posts ──
    let maxId   = '';
    let fetched = 0;

    do {
      if (TOOLS_PROFILE_ABORT) break;

      const postsRes = await fetch(`${TOOLS_API_BASE}/api/instagram/posts`, {
        method:  'POST',
        headers: toolsApiHeaders(),
        body:    JSON.stringify({ username, maxId }),
      });
      if (!postsRes.ok) throw new Error(`Posts fetch failed (${postsRes.status}).`);

      const postsData = await postsRes.json();
      const edges     = postsData?.result?.edges || postsData?.edges || postsData?.data?.edges || postsData?.items || [];
      const pageInfo  = postsData?.result?.page_info || postsData?.page_info || postsData?.data?.page_info || {};

      if (!edges.length && !allFiles.length) {
        throw new Error('No posts returned. The account may be private or the endpoint is unavailable.');
      }

      for (const edge of edges) {
        if (TOOLS_PROFILE_ABORT || fetched >= limit) break;
        const node     = edge.node || edge;
        const carousel = expandCarousel
          ? (node.carousel_media || node.edge_sidecar_to_children?.edges?.map(e => e.node) || [])
          : [];

        if (carousel.length) {
          for (const item of carousel) {
            // candidates[0] = highest resolution
            const url = item.image_versions2?.candidates?.[0]?.url || item.display_url;
            if (url) allFiles.push({ url, ext: 'jpg', id: item.id || uid() });
          }
        } else {
          const isVideo = node.is_video || node.media_type === 2;
          const url = isVideo
            ? (node.video_url || node.video_versions?.[0]?.url)
            : (node.image_versions2?.candidates?.[0]?.url || node.display_url || node.thumbnail_src);
          if (url) allFiles.push({ url, ext: isVideo ? 'mp4' : 'jpg', id: node.id || uid() });
        }
        fetched++;
      }

      maxId = pageInfo?.has_next_page ? (pageInfo.end_cursor || '') : '';
      progressDiv.innerHTML = toolsProfProgressHtml(
        fetched, limit,
        `Fetched ${fetched} post${fetched !== 1 ? 's' : ''}, ${allFiles.length} file${allFiles.length !== 1 ? 's' : ''}…`
      );

      if (maxId && fetched < limit && !TOOLS_PROFILE_ABORT) {
        await new Promise(r => setTimeout(r, 600));
      }
    } while (maxId && fetched < limit && !TOOLS_PROFILE_ABORT);

    if (TOOLS_PROFILE_ABORT) {
      progressDiv.style.display = 'none';
      return;
    }

    TOOLS_PROFILE_RESULTS     = allFiles;
    progressDiv.style.display = 'none';

    if (!allFiles.length) throw new Error('No downloadable media found (account may be private).');
    toolsRenderProfileResult(user, allFiles, username, resDiv);
  } catch(e) {
    progressDiv.style.display = 'none';
    toolsProfError(e.message || 'Failed to fetch profile. Check the username and API key.');
  } finally {
    btn.disabled      = false;
    label.textContent = 'Fetch';
  }
}

function toolsProfProgressHtml(done, total, msg) {
  const pct = total ? Math.min(100, Math.round(done / total * 100)) : 0;
  return `
    <div class="tools-card" style="margin-top:0">
      <div style="font-size:13px;color:var(--tx);margin-bottom:8px">${esc(msg)}</div>
      <div style="height:5px;background:var(--surf3);border-radius:3px;overflow:hidden;margin-bottom:6px">
        <div style="height:100%;width:${pct}%;background:var(--ac);border-radius:3px;transition:width .3s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11px;color:var(--mu)">${done} / ${total} posts</span>
        <button onclick="TOOLS_PROFILE_ABORT=true"
          style="font-size:11px;color:#fb7185;background:none;border:none;cursor:pointer;padding:2px 6px">✕ Cancel</button>
      </div>
    </div>`;
}

function toolsProfError(msg) {
  const el = document.getElementById('prof-error');
  if (el) { el.textContent = '⚠ ' + msg; el.style.display = 'block'; }
}

function toolsRenderProfileResult(user, files, username, resDiv) {
  if (!files.length) {
    resDiv.style.display = 'block';
    resDiv.innerHTML = `<div class="tools-card"><div style="color:var(--mu);text-align:center;padding:20px">No downloadable media found.</div></div>`;
    return;
  }

  const imgs    = files.filter(f => f.ext !== 'mp4');
  const vids    = files.filter(f => f.ext === 'mp4');
  const preview = files.slice(0, 36);

  const dlFiles = files.map((f, i) => ({
    url:  encodeURIComponent(f.url),
    name: `${username}_${String(i + 1).padStart(4, '0')}.${f.ext}`,
  }));
  const dlData = JSON.stringify(dlFiles).replace(/"/g, '&quot;');

  const followers = user.edge_followed_by?.count ?? user.follower_count ?? '';
  const following = user.edge_follow?.count ?? user.following_count ?? '';
  const postCount = user.edge_owner_to_timeline_media?.count ?? user.media_count ?? '';
  const bio       = user.biography || '';

  const tilesHtml = preview.map((f, i) => {
    const enc  = encodeURIComponent(f.url);
    const name = dlFiles[i].name;
    if (f.ext === 'mp4') {
      return `<div class="tools-img-item" style="aspect-ratio:1">
        <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--surf2);gap:4px">
          <span style="font-size:22px;opacity:.45">▶</span>
          <span style="font-size:9px;color:var(--mu)">VIDEO</span>
        </div>
        <div class="tools-img-overlay">
          <span style="font-size:9px;color:rgba(255,255,255,.7)">#${i + 1}</span>
          <button class="tools-dl-btn" onclick="toolsDownload('${enc}','${name}')">⬇</button>
        </div>
      </div>`;
    }
    return `<div class="tools-img-item" style="aspect-ratio:1">
      <div id="ptile-load-${i}" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--surf2)">
        <div class="tools-spinner"></div>
      </div>
      <img id="ptile-img-${i}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none"
        data-url="${enc}" data-idx="${i}">
      <div id="ptile-err-${i}" style="display:none;position:absolute;inset:0;flex-direction:column;align-items:center;justify-content:center;gap:4px">
        <span style="font-size:18px;opacity:.3">◉</span>
        <span style="font-size:9px;color:var(--mu)">No preview</span>
      </div>
      <div class="tools-img-overlay">
        <span style="font-size:9px;color:rgba(255,255,255,.7)">#${i + 1}</span>
        <button class="tools-dl-btn" onclick="toolsDownload('${enc}','${name}')">⬇</button>
      </div>
    </div>`;
  }).join('');

  resDiv.style.display = 'block';
  resDiv.innerHTML = `
    <div class="tools-card tools-result-card">
      <!-- User summary -->
      <div class="tools-user-row" style="margin-bottom:12px">
        <div style="flex:1;min-width:0">
          <div class="tools-username">@${esc(user.username || username)}${user.is_verified ? ' <span style="color:#38bdf8;font-size:12px">✓</span>' : ''}</div>
          ${user.full_name ? `<div style="font-size:12px;color:var(--tx2);margin-top:1px">${esc(user.full_name)}</div>` : ''}
          ${bio ? `<div style="font-size:11px;color:var(--mu);margin-top:4px;line-height:1.4;white-space:pre-line">${esc(bio.slice(0,120))}${bio.length > 120 ? '…' : ''}</div>` : ''}
          <div class="tools-meta-row" style="margin-top:6px">
            ${followers !== '' ? `<span style="font-size:11px;color:var(--tx2)"><b>${Number(followers).toLocaleString()}</b> <span style="color:var(--mu)">followers</span></span>` : ''}
            ${following !== '' ? `<span style="font-size:11px;color:var(--mu)">· ${Number(following).toLocaleString()} following</span>` : ''}
            ${postCount !== '' ? `<span style="font-size:11px;color:var(--mu)">· ${Number(postCount).toLocaleString()} posts</span>` : ''}
          </div>
          <div class="tools-meta-row" style="margin-top:5px">
            <span class="stag st-watching"  style="font-size:9px">${files.length} files</span>
            <span class="stag st-completed" style="font-size:9px">${imgs.length} images</span>
            ${vids.length ? `<span class="stag st-plan" style="font-size:9px">${vids.length} videos</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Download actions -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <button id="prof-zip-btn" class="tools-fetch-btn"
          onclick="toolsDownloadZIP('${esc(username)}', JSON.parse(this.dataset.files), 'prof-zip-btn', 'prof-zip-progress')"
          data-files="${dlData}">📦 Download All as ZIP (${files.length})</button>
        <button class="tools-fetch-btn"
          style="background:var(--surf2);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3)"
          onclick="toolsDownloadAll(JSON.parse(this.dataset.files))"
          data-files="${dlData}">⬇ Download Individually</button>
      </div>
      <div id="prof-zip-progress" style="display:none;margin-bottom:14px"></div>

      <!-- Grid preview -->
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--mu);margin-bottom:8px">
        Preview — ${preview.length} of ${files.length} files
      </div>
      <div class="tools-grid-4" style="position:relative">${tilesHtml}</div>
      ${files.length > 36
        ? `<div style="font-size:12px;color:var(--mu);text-align:center;margin-top:10px;padding:8px;background:var(--surf2);border-radius:5px">
             +${files.length - 36} more — use ZIP to get everything
           </div>`
        : ''}
    </div>`;

  _toolsLazyLoadGrid(preview, 'ptile');
}

// ──────────────────────────────────────────────────────
//  TAB 4 — STORY DOWNLOADER
//  POST /api/instagram/story  { username, storyId: "" }
//  Response: items[].image_versions2.candidates[0].url
// ──────────────────────────────────────────────────────

function renderToolsStory(el) {
  el.innerHTML = `
    <div class="tools-card">
      <div class="tools-card-head">
        <span class="tools-card-label">📖 Story Downloader</span>
        <span class="tools-card-hint">Active stories from public accounts</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <div class="srch-wrap" style="max-width:100%;flex:1;margin:0">
          <span class="srch-ico" style="font-size:11px;font-weight:700">@</span>
          <input class="srch tools-url-input" id="story-input"
            placeholder="username  or  instagram.com/username/"
            onkeydown="if(event.key==='Enter')toolsFetchStory()"
            style="padding-left:30px;border-radius:var(--cr)">
        </div>
        <button class="tools-fetch-btn" id="story-btn" onclick="toolsFetchStory()">
          <span id="story-label">Fetch</span>
        </button>
      </div>
      <div style="font-size:11px;color:var(--mu);margin-top:6px">
        Only works for public accounts. Stories expire after 24 hours.
      </div>
    </div>
    <div id="story-error"  style="display:none" class="tools-error"></div>
    <div id="story-result" style="display:none"></div>`;
}

async function toolsFetchStory() {
  const input  = document.getElementById('story-input')?.value?.trim();
  const btn    = document.getElementById('story-btn');
  const label  = document.getElementById('story-label');
  const errDiv = document.getElementById('story-error');
  const resDiv = document.getElementById('story-result');

  if (!input) return toolsStoryError('Please enter a username or profile URL.');

  const username = toolsExtractUsername(input);
  if (!username) return toolsStoryError('Could not extract a username. Please check the input.');

  errDiv.style.display = 'none';
  resDiv.style.display = 'none';
  btn.disabled         = true;
  label.textContent    = '…';

  try {
    // Step 1: get user ID (storyId must be the numeric user ID)
    const profileRes = await fetch(`${TOOLS_API_BASE}/api/instagram/profile`, {
      method:  'POST',
      headers: toolsApiHeaders(),
      body:    JSON.stringify({ username }),
    });
    if (!profileRes.ok) throw new Error(`Profile lookup failed (${profileRes.status}).`);
    const profileData = await profileRes.json();
    const profileUser = profileData?.result || profileData?.user || profileData?.data || profileData;
    const userId = profileUser?.id || profileUser?.pk;
    if (!userId) throw new Error('Could not get user ID for story fetch.');

    // Step 2: fetch stories using numeric user ID as storyId
    const res = await fetch(`${TOOLS_API_BASE}/api/instagram/story`, {
      method:  'POST',
      headers: toolsApiHeaders(),
      body:    JSON.stringify({ username, storyId: userId }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`API error ${res.status}: ${txt.slice(0, 160)}`);
    }

    const data = await res.json();
    // Defensive parse — handle multiple response shapes
    const items = data?.result?.items
      || data?.items
      || data?.data?.items
      || data?.reels_media?.[0]?.items
      || (Array.isArray(data) ? data : []);

    if (!items.length) throw new Error('No active stories found — account may be private or have no active stories.');
    toolsRenderStoryResult(items, username, resDiv);
  } catch(e) {
    toolsStoryError(e.message || 'Could not fetch stories. Check the username and try again.');
  } finally {
    btn.disabled      = false;
    label.textContent = 'Fetch';
  }
}

function toolsStoryError(msg) {
  const el = document.getElementById('story-error');
  if (el) { el.textContent = '⚠ ' + msg; el.style.display = 'block'; }
}

function toolsRenderStoryResult(items, username, resDiv) {
  // Always pick candidates[0] — highest resolution
  const files = items.map((item, i) => {
    const isVideo = item.media_type === 2 || item.is_video;
    const url = isVideo
      ? (item.video_versions?.[0]?.url || item.video_url)
      : (item.image_versions2?.candidates?.[0]?.url || item.display_url);
    return { url, ext: isVideo ? 'mp4' : 'jpg', idx: i };
  }).filter(f => f.url);

  if (!files.length) {
    resDiv.style.display = 'block';
    resDiv.innerHTML = `<div class="tools-card"><div style="color:var(--mu);text-align:center;padding:20px">No downloadable story media found.</div></div>`;
    return;
  }

  const tilesHtml = files.map((f, i) => {
    const enc  = encodeURIComponent(f.url);
    const name = `${username}_story_${i + 1}.${f.ext}`;
    if (f.ext === 'mp4') {
      return `<div class="tools-img-item">
        <video src="${esc(f.url)}" class="tools-img-preview"
          style="object-fit:cover;width:100%;height:100%" muted playsinline preload="metadata"></video>
        <div class="tools-img-overlay">
          <span style="font-size:10px;color:rgba(255,255,255,.8);font-weight:700">MP4</span>
          <div style="display:flex;gap:6px">
            <button class="tools-dl-btn" onclick="toolsDownload('${enc}','${name}')">⬇ Download</button>
            <button class="tools-open-btn" onclick="window.open('${esc(f.url)}','_blank')">⤢</button>
          </div>
        </div>
      </div>`;
    }
    return `<div class="tools-img-item">
      <div id="stile-load-${i}" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--surf2)">
        <div class="tools-spinner"></div>
      </div>
      <img id="stile-img-${i}" class="tools-img-preview" style="display:none"
        data-url="${enc}" data-idx="s${i}">
      <div class="tools-img-overlay">
        <span style="font-size:10px;color:rgba(255,255,255,.8);font-weight:700">JPG</span>
        <div style="display:flex;gap:6px">
          <button class="tools-dl-btn" onclick="toolsDownload('${enc}','${name}')">⬇ Download</button>
          <button class="tools-open-btn" onclick="window.open('${esc(f.url)}','_blank')">⤢</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const dlFiles = files.map((f, i) => ({
    url:  encodeURIComponent(f.url),
    name: `${username}_story_${i + 1}.${f.ext}`,
  }));
  const dlData = JSON.stringify(dlFiles).replace(/"/g, '&quot;');

  resDiv.style.display = 'block';
  resDiv.innerHTML = `
    <div class="tools-card tools-result-card">
      <div class="tools-user-row">
        <div>
          <div class="tools-username">@${esc(username)}'s Stories</div>
          <div class="tools-meta-row">
            <span class="stag st-watching" style="font-size:9px">
              ${files.length} story item${files.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
      ${files.length > 1 ? `
        <button class="tools-fetch-btn" style="align-self:flex-start"
          onclick="toolsDownloadAll(JSON.parse(this.dataset.files))"
          data-files="${dlData}">⬇ Download All (${files.length})</button>` : ''}
      <div class="tools-img-grid" style="--cols:${Math.min(files.length, 3)}">${tilesHtml}</div>
    </div>`;

  requestAnimationFrame(() => {
    files.forEach((f, i) => {
      if (f.ext === 'mp4') return;
      const img    = document.getElementById(`stile-img-${i}`);
      const loader = document.getElementById(`stile-load-${i}`);
      if (!img) return;
      toolsLoadPreview(img).then(() => {
        img.style.display = 'block';
        if (loader) loader.style.display = 'none';
      }).catch(() => {
        if (loader) loader.style.display = 'none';
      });
    });
  });
}

// ──────────────────────────────────────────────────────
//  SHARED — LAZY-LOAD GRID TILES
// ──────────────────────────────────────────────────────

function _toolsLazyLoadGrid(preview, prefix) {
  requestAnimationFrame(() => {
    const BATCH = 6;
    let idx = 0;
    function loadBatch() {
      const end = Math.min(idx + BATCH, preview.length);
      for (; idx < end; idx++) {
        if (preview[idx].ext === 'mp4') continue;
        const img    = document.getElementById(`${prefix}-img-${idx}`);
        const loader = document.getElementById(`${prefix}-load-${idx}`);
        const errEl  = document.getElementById(`${prefix}-err-${idx}`);
        if (!img) continue;
        toolsLoadPreview(img).then(() => {
          img.style.display = 'block';
          if (loader) loader.style.display = 'none';
        }).catch(() => {
          if (loader) loader.style.display = 'none';
          if (errEl)  errEl.style.display  = 'flex';
        });
      }
      if (idx < preview.length) setTimeout(loadBatch, 400);
    }
    loadBatch();
  });
}

// ──────────────────────────────────────────────────────
//  ZIP DOWNLOAD  (shared across Posts + Profile DL tabs)
// ──────────────────────────────────────────────────────

async function toolsDownloadZIP(username, files, btnId, progressId) {
  const btn         = document.getElementById(btnId);
  const progressDiv = document.getElementById(progressId);

  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Building ZIP…'; }
  if (progressDiv) progressDiv.style.display = 'block';

  const updateProgress = (done, total, msg) => {
    if (!progressDiv) return;
    const pct = total ? Math.round(done / total * 100) : 0;
    progressDiv.innerHTML = `
      <div style="background:var(--surf2);border:1px solid var(--brd);border-radius:6px;padding:10px 12px">
        <div style="font-size:12px;color:var(--tx2);margin-bottom:6px">${esc(msg)}</div>
        <div style="height:4px;background:var(--surf3);border-radius:2px;overflow:hidden;margin-bottom:5px">
          <div style="height:100%;width:${pct}%;background:var(--ac);transition:width .25s;border-radius:2px"></div>
        </div>
        <div style="font-size:11px;color:var(--mu)">${done} / ${total} files (${pct}%)</div>
      </div>`;
  };

  let JSZip;
  try {
    JSZip = await loadJSZip();
  } catch(e) {
    if (btn) { btn.disabled = false; btn.innerHTML = `📦 Download All as ZIP (${files.length})`; }
    if (progressDiv) progressDiv.style.display = 'none';
    toast('JSZip unavailable — falling back to individual downloads', 'var(--ch)');
    await toolsDownloadAll(files);
    return;
  }

  const zip    = new JSZip();
  const folder = zip.folder(username + '_instagram');
  let   done   = 0;
  const total  = files.length;
  const BATCH  = 5;

  for (let i = 0; i < total; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    await Promise.all(batch.map(async (f) => {
      const url = decodeURIComponent(f.url);
      let blob = null;
      for (const build of [...TOOLS_PREVIEW_PROXIES, u => u]) {
        try {
          const res = await fetch(build(url));
          if (res.ok) { blob = await res.blob(); break; }
        } catch { /* next */ }
      }
      if (blob && blob.size > 0) folder.file(f.name, blob);
      done++;
      updateProgress(done, total, 'Downloading files…');
    }));
  }

  updateProgress(total, total, 'Generating ZIP file…');

  try {
    const zipBlob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 1 },
    });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(zipBlob);
    a.download = `${username}_instagram_${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`✓ ZIP ready — ${total} file${total !== 1 ? 's' : ''}`, 'var(--cd)');
  } catch(e) {
    toast('ZIP creation failed: ' + e.message, 'var(--cr)');
  } finally {
    if (progressDiv) progressDiv.style.display = 'none';
    if (btn) { btn.disabled = false; btn.innerHTML = `📦 Download All as ZIP (${total})`; }
  }
}
