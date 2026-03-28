// ═══════════════════════════════════════════════════════
//  TOOLS SECTION — Instagram Toolkit (4 modules)
// ═══════════════════════════════════════════════════════

let TOOLS_API_KEY   = localStorage.getItem('ac_tools_rapidapi_key') || '';
let TOOLS_ACTIVE_TAB = 'post';
let TOOLS_PROFILE_ABORT  = false;  // cancels in-flight profile fetch
let TOOLS_PROFILE_RESULTS = [];    // last fetched profile files cache

const TOOLS_API_HOST = 'instagram120.p.rapidapi.com';
const TOOLS_API_BASE = 'https://instagram120.p.rapidapi.com';

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

/** Try each CORS proxy in order; return a displayable blob URL on the img element. */
const TOOLS_PREVIEW_PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://proxy.cors.sh/${u}`,
];

async function toolsLoadPreview(imgEl) {
  const url = decodeURIComponent(imgEl.dataset.url);
  const idx = imgEl.dataset.idx;
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
  const errEl = document.getElementById('tools-img-error-' + idx);
  if (errEl) errEl.style.display = 'flex';
}

/** Fetch a file as a blob via CORS proxy and trigger browser download. Falls back to window.open. */
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

/** Download multiple files sequentially with a delay between each. */
async function toolsDownloadAll(files) {
  for (let i = 0; i < files.length; i++) {
    await new Promise(r => setTimeout(r, 700 * i));
    toolsDownload(files[i].url, files[i].name);
  }
}

/** Extract a clean username from a username, @handle, or instagram.com URL. */
function toolsExtractUsername(input) {
  const t = (input || '').trim();
  const m = t.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  if (m) return m[1].replace(/\/$/, '');
  if (t.startsWith('@')) return t.slice(1);
  return t.replace(/\/$/, '');
}

/** Standard RapidAPI request headers. */
function toolsApiHeaders() {
  return {
    'Content-Type':    'application/json',
    'x-rapidapi-key':  TOOLS_API_KEY,
    'x-rapidapi-host': TOOLS_API_HOST,
  };
}

/** Dynamically load JSZip from CDN. Returns the constructor. */
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

/** Defensive helper — walks common RapidAPI response shapes to find user data. */
function toolsParseUser(data) {
  return data?.user
    || data?.data?.user
    || data?.graphql?.user
    || (data?.username ? data : null);
}

/** Defensive helper — returns edges array + page_info from various response shapes. */
function toolsParsePostsPage(data) {
  const edges    = data?.edges
    || data?.data?.edges
    || data?.posts
    || data?.items
    || data?.data?.user?.edge_owner_to_timeline_media?.edges
    || [];
  const pageInfo = data?.page_info
    || data?.data?.page_info
    || data?.data?.user?.edge_owner_to_timeline_media?.page_info
    || {};
  return { edges, pageInfo };
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
            <div class="tools-sub">Download posts, profile pictures &amp; full profile archives</div>
          </div>
        </div>
      </div>

      <!-- ── API Key ── -->
      <div class="tools-card" id="tools-apikey-card">
        <div class="tools-card-head">
          <span class="tools-card-label">⚙ RapidAPI Key</span>
          <span class="tools-card-hint" id="tools-key-status">${TOOLS_API_KEY ? '✓ Key saved' : 'Not set'}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input class="fin tools-key-input" id="tools-apikey-input" type="password"
            placeholder="Paste your x-rapidapi-key here…"
            value="${TOOLS_API_KEY}" autocomplete="off">
          <button class="tools-save-btn" onclick="toolsSaveKey()">Save</button>
        </div>
        <div style="font-size:11px;color:var(--mu);margin-top:6px">
          Get from <span style="color:var(--ac);font-weight:600">rapidapi.com</span>
          → search <em>Instagram120</em> → Subscribe → Copy <code>x-rapidapi-key</code>
        </div>
      </div>

      <!-- ── Module Tabs ── -->
      <div class="sub-tabs" id="tools-tabs" style="width:fit-content;flex-wrap:nowrap;overflow-x:auto">
        ${[
          ['post',       '⬇ Post DL'],
          ['dp',         '👤 DP'],
          ['profilepic', '🖼 Profile Pic'],
          ['profile',    '📁 Profile DL'],
        ].map(([id, label]) =>
          `<button class="stab${TOOLS_ACTIVE_TAB === id ? ' active' : ''}"
              data-tab="${id}" onclick="setToolsTab('${id}')">${label}</button>`
        ).join('')}
      </div>

      <!-- ── Active module content ── -->
      <div id="tools-tab-content"></div>

    </div>`;

  renderToolsTabContent();
}

function setToolsTab(tab) {
  TOOLS_PROFILE_ABORT = true;           // cancel any running profile fetch
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
  if      (TOOLS_ACTIVE_TAB === 'post')       renderToolsPost(el);
  else if (TOOLS_ACTIVE_TAB === 'dp')         renderToolsDP(el);
  else if (TOOLS_ACTIVE_TAB === 'profilepic') renderToolsProfilePic(el);
  else if (TOOLS_ACTIVE_TAB === 'profile')    renderToolsProfile(el);
}

function toolsSaveKey() {
  const val = document.getElementById('tools-apikey-input')?.value?.trim();
  TOOLS_API_KEY = val;
  localStorage.setItem('ac_tools_rapidapi_key', val);
  const st = document.getElementById('tools-key-status');
  if (st) {
    st.textContent  = val ? '✓ Key saved' : 'Cleared';
    st.style.color  = val ? 'var(--ac)' : 'var(--mu)';
    setTimeout(() => { st.textContent = val ? '✓ Key saved' : 'Not set'; st.style.color = ''; }, 2200);
  }
}

// ──────────────────────────────────────────────────────
//  TAB 1 — POST DOWNLOADER  (original, adapted to tab)
// ──────────────────────────────────────────────────────

function renderToolsPost(el) {
  el.innerHTML = `
    <div class="tools-card">
      <div class="tools-card-head">
        <span class="tools-card-label">◉ Post URL</span>
        <span class="tools-card-hint">Single post, reel, or carousel</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <div class="srch-wrap" style="max-width:100%;flex:1;margin:0">
          <span class="srch-ico">◉</span>
          <input class="srch tools-url-input" id="tools-url-input"
            placeholder="https://www.instagram.com/p/…"
            onkeydown="if(event.key==='Enter')toolsFetch()"
            style="padding-left:30px;border-radius:var(--cr)">
        </div>
        <button class="tools-fetch-btn" id="tools-fetch-btn" onclick="toolsFetch()">
          <span id="tools-fetch-label">Fetch</span>
        </button>
      </div>
    </div>
    <div id="tools-error"  style="display:none" class="tools-error"></div>
    <div id="tools-result" style="display:none"></div>`;
}

async function toolsFetch() {
  const urlInput   = document.getElementById('tools-url-input');
  const fetchBtn   = document.getElementById('tools-fetch-btn');
  const fetchLabel = document.getElementById('tools-fetch-label');
  const errorDiv   = document.getElementById('tools-error');
  const resultDiv  = document.getElementById('tools-result');

  const raw = urlInput?.value?.trim();
  if (!raw)           return toolsPostError('Please paste an Instagram post URL.');
  if (!TOOLS_API_KEY) return toolsPostError('API key not set — enter your RapidAPI key above first.');

  const match     = raw.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = match ? match[1] : (/^[A-Za-z0-9_-]{9,14}$/.test(raw) ? raw : null);
  if (!shortcode) return toolsPostError("Could not find a shortcode. Make sure it's a valid Instagram post link.");

  errorDiv.style.display  = 'none';
  resultDiv.style.display = 'none';
  fetchBtn.disabled       = true;
  fetchLabel.textContent  = '…';

  try {
    const res = await fetch(`${TOOLS_API_BASE}/api/instagram/mediaByShortcode`, {
      method:  'POST',
      headers: toolsApiHeaders(),
      body:    JSON.stringify({ shortcode }),
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`API error ${res.status}: ${txt.slice(0, 120)}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || !data.length) throw new Error('No media found for that post.');
    toolsRenderResult(data);
  } catch(e) {
    toolsPostError(e.message || 'Something went wrong. Check your API key and URL.');
  } finally {
    fetchBtn.disabled      = false;
    fetchLabel.textContent = 'Fetch';
  }
}

function toolsPostError(msg) {
  const el = document.getElementById('tools-error');
  if (el) { el.textContent = '⚠ ' + msg; el.style.display = 'block'; }
}

function toolsRenderResult(items) {
  const resultDiv = document.getElementById('tools-result');
  const meta      = items[0]?.meta || {};
  const title     = meta.title || '';
  const likes     = meta.likeCount || 0;
  const shortcode = meta.shortcode || '';

  const files = [];
  items.forEach(item => {
    (item.urls || []).forEach(u => {
      files.push({ url: u.url, ext: u.extension || 'jpg', name: u.name || '', index: files.length + 1 });
    });
  });

  const isVideo    = files.some(f => f.ext === 'mp4');
  const filesHTML  = files.map((f, i) => {
    const encodedUrl = encodeURIComponent(f.url);
    const dlName     = shortcode + '_' + f.index + '.' + f.ext;

    const mediaHTML = f.ext === 'mp4'
      ? `<div class="tools-img-loading" id="tools-loading-${i}" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;flex-direction:column;gap:6px">
           <span style="font-size:24px;opacity:.5">▶</span>
           <span style="font-size:11px;color:var(--tx2)">Video</span>
         </div>
         <video id="tools-preview-${i}" class="tools-img-preview" style="display:none;object-fit:cover;width:100%;height:100%"
           muted playsinline preload="metadata" data-url="${encodedUrl}" data-idx="${i}"></video>`
      : `<div class="tools-img-loading" id="tools-loading-${i}" style="display:flex;align-items:center;justify-content:center;width:100%;height:100%">
           <div class="tools-spinner"></div>
         </div>
         <img id="tools-preview-${i}" class="tools-img-preview" alt="Image ${f.index}"
           style="display:none" data-url="${encodedUrl}" data-idx="${i}"/>
         <div class="tools-img-error" id="tools-img-error-${i}" style="display:none;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:6px">
           <span style="font-size:24px;opacity:.3">◉</span>
           <span style="font-size:11px;color:var(--mu);text-align:center;padding:0 12px">Preview unavailable<br>Download still works</span>
         </div>`;

    return `<div class="tools-img-item">
      ${mediaHTML}
      <div class="tools-img-overlay">
        <span style="font-size:10px;color:rgba(255,255,255,.8);font-weight:700;text-transform:uppercase">${f.ext}</span>
        <div style="display:flex;gap:6px">
          <button class="tools-dl-btn" onclick="toolsDownload('${encodedUrl}','${dlName}')">⬇ Download</button>
          <button class="tools-open-btn" onclick="window.open('${f.url}','_blank')">⤢</button>
        </div>
      </div>
    </div>`;
  }).join('');

  const dlAllData = JSON.stringify(
    files.map(f => ({ url: encodeURIComponent(f.url), name: shortcode + '_' + f.index + '.' + f.ext }))
  ).replace(/"/g, '&quot;');

  resultDiv.style.display = 'block';
  resultDiv.innerHTML = `
    <div class="tools-card tools-result-card">
      <div class="tools-user-row">
        <div style="width:42px;height:42px;border-radius:10px;background:rgba(var(--ac-rgb),.12);border:1px solid rgba(var(--ac-rgb),.25);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">
          ${isVideo ? '▶' : '◉'}
        </div>
        <div>
          <div class="tools-username">${shortcode}</div>
          <div class="tools-meta-row">
            <span class="stag st-watching" style="font-size:9px">${files.length} file${files.length > 1 ? 's' : ''}</span>
            <span style="font-size:11px;color:var(--mu)">♥ ${Number(likes).toLocaleString()}</span>
          </div>
        </div>
      </div>
      ${title ? `<div class="tools-caption">${esc(title.slice(0, 200))}${title.length > 200 ? '…' : ''}</div>` : ''}
      <div class="tools-img-grid" style="--cols:${Math.min(files.length, 3)}">${filesHTML}</div>
      ${files.length > 1 ? `
        <button class="tools-fetch-btn" style="width:100%;justify-content:center;margin-top:6px"
          onclick="toolsDownloadAll(JSON.parse(this.dataset.files))"
          data-files="${dlAllData}">⬇ Download All (${files.length})</button>` : ''}
    </div>`;

  requestAnimationFrame(() => {
    files.forEach((f, i) => {
      const loader = document.getElementById('tools-loading-' + i);
      if (f.ext === 'mp4') {
        const vid = document.getElementById('tools-preview-' + i);
        if (vid) { vid.src = f.url; vid.style.display = 'block'; if (loader) loader.style.display = 'none'; }
      } else {
        const img = document.getElementById('tools-preview-' + i);
        if (img) toolsLoadPreview(img).finally(() => { if (loader) loader.style.display = 'none'; });
      }
    });
  });
}

// ──────────────────────────────────────────────────────
//  TAB 2 — DP DOWNLOADER
// ──────────────────────────────────────────────────────

function renderToolsDP(el) {
  el.innerHTML = `
    <div class="tools-card">
      <div class="tools-card-head">
        <span class="tools-card-label">👤 Profile Picture (DP)</span>
        <span class="tools-card-hint">Enter username or profile URL</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <div class="srch-wrap" style="max-width:100%;flex:1;margin:0">
          <span class="srch-ico" style="font-size:11px;font-weight:700">@</span>
          <input class="srch tools-url-input" id="dp-input"
            placeholder="username  or  instagram.com/username/"
            onkeydown="if(event.key==='Enter')toolsFetchDP()"
            style="padding-left:30px;border-radius:var(--cr)">
        </div>
        <button class="tools-fetch-btn" id="dp-btn" onclick="toolsFetchDP()">
          <span id="dp-label">Fetch</span>
        </button>
      </div>
    </div>
    <div id="dp-error"  style="display:none" class="tools-error"></div>
    <div id="dp-result" style="display:none"></div>`;
}

async function toolsFetchDP() {
  const input   = document.getElementById('dp-input')?.value?.trim();
  const btn     = document.getElementById('dp-btn');
  const label   = document.getElementById('dp-label');
  const errDiv  = document.getElementById('dp-error');
  const resDiv  = document.getElementById('dp-result');

  if (!input)           return toolsDPError('Please enter a username or profile URL.');
  if (!TOOLS_API_KEY)   return toolsDPError('API key not set — enter your RapidAPI key above first.');

  const username = toolsExtractUsername(input);
  if (!username)        return toolsDPError('Could not extract a username. Please check the input.');

  errDiv.style.display = 'none';
  resDiv.style.display = 'none';
  btn.disabled         = true;
  label.textContent    = '…';

  try {
    const res  = await fetch(`${TOOLS_API_BASE}/api/instagram/userByUsername?username=${encodeURIComponent(username)}`, {
      headers: toolsApiHeaders(),
    });
    if (!res.ok) throw new Error(`API error ${res.status} — check your key or try again.`);

    const data = await res.json();
    const user = toolsParseUser(data);
    if (!user) throw new Error('Unexpected API response. The endpoint may have changed.');

    const dpUrl = user.profile_pic_url_hd || user.hd_profile_pic_url_info?.url || user.profile_pic_url;
    if (!dpUrl) throw new Error('No profile picture URL found in response.');

    toolsRenderDP(user, dpUrl, resDiv);
  } catch(e) {
    toolsDPError(e.message);
  } finally {
    btn.disabled      = false;
    label.textContent = 'Fetch';
  }
}

function toolsDPError(msg) {
  const el = document.getElementById('dp-error');
  if (el) { el.textContent = '⚠ ' + msg; el.style.display = 'block'; }
}

function toolsRenderDP(user, dpUrl, resDiv) {
  const username  = user.username || 'unknown';
  const fullName  = user.full_name || '';
  const followers = user.follower_count ?? user.edge_followed_by?.count ?? '';
  const encoded   = encodeURIComponent(dpUrl);

  resDiv.style.display = 'block';
  resDiv.innerHTML = `
    <div class="tools-card">
      <div class="tools-user-row" style="margin-bottom:16px">
        <div>
          <div class="tools-username">@${esc(username)}</div>
          ${fullName ? `<div style="font-size:12px;color:var(--tx2);margin-top:1px">${esc(fullName)}</div>` : ''}
          ${followers !== '' ? `<div style="font-size:11px;color:var(--mu);margin-top:2px">${Number(followers).toLocaleString()} followers</div>` : ''}
        </div>
      </div>

      <!-- Circular DP preview -->
      <div style="text-align:center;margin-bottom:16px">
        <div style="display:inline-block;border-radius:50%;overflow:hidden;width:200px;height:200px;border:3px solid rgba(var(--ac-rgb),.3);background:var(--surf2);position:relative">
          <div id="dp-spinner" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
            <div class="tools-spinner"></div>
          </div>
          <img id="dp-preview" alt="DP"
            style="width:200px;height:200px;object-fit:cover;display:none;border-radius:50%"
            data-url="${encoded}" data-idx="dp">
        </div>
      </div>

      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        <button class="tools-fetch-btn" onclick="toolsDownload('${encoded}','${esc(username)}_dp.jpg')">
          ⬇ Download DP
        </button>
        <button class="tools-fetch-btn"
          style="background:var(--surf2);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3)"
          onclick="window.open('${esc(dpUrl)}','_blank')">
          ⤢ Open Original
        </button>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    const img     = document.getElementById('dp-preview');
    const spinner = document.getElementById('dp-spinner');
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
//  TAB 3 — PROFILE PIC DOWNLOADER (HD emphasis)
// ──────────────────────────────────────────────────────

function renderToolsProfilePic(el) {
  el.innerHTML = `
    <div class="tools-card">
      <div class="tools-card-head">
        <span class="tools-card-label">🖼 Profile Picture — HD</span>
        <span class="tools-card-hint">Highest available resolution</span>
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
          <span id="pp-label">Fetch HD</span>
        </button>
      </div>
      <div style="font-size:11px;color:var(--mu);margin-top:6px">
        Shows HD and SD versions side-by-side when both are available
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

  if (!input)         return toolsPPError('Please enter a username or profile URL.');
  if (!TOOLS_API_KEY) return toolsPPError('API key not set — enter your RapidAPI key above first.');

  const username = toolsExtractUsername(input);
  errDiv.style.display = 'none';
  resDiv.style.display = 'none';
  btn.disabled         = true;
  label.textContent    = '…';

  try {
    const res  = await fetch(`${TOOLS_API_BASE}/api/instagram/userByUsername?username=${encodeURIComponent(username)}`, {
      headers: toolsApiHeaders(),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);

    const data = await res.json();
    const user = toolsParseUser(data);
    if (!user) throw new Error('Unexpected API response.');

    // Collect every URL variant
    const hdUrl    = user.profile_pic_url_hd || user.hd_profile_pic_url_info?.url || null;
    const sdUrl    = user.profile_pic_url || null;
    const hdInfos  = user.hd_profile_pic_versions || [];        // array of {width,height,url}

    if (!hdUrl && !sdUrl) throw new Error('No profile picture URL found in response.');

    toolsRenderProfilePic(user, hdUrl, sdUrl, hdInfos, resDiv);
  } catch(e) {
    toolsPPError(e.message);
  } finally {
    btn.disabled      = false;
    label.textContent = 'Fetch HD';
  }
}

function toolsPPError(msg) {
  const el = document.getElementById('pp-error');
  if (el) { el.textContent = '⚠ ' + msg; el.style.display = 'block'; }
}

function toolsRenderProfilePic(user, hdUrl, sdUrl, hdVersions, resDiv) {
  const username = user.username || 'unknown';
  const bestUrl  = hdUrl || sdUrl;
  const isHD     = !!hdUrl;

  // Build resolution variant buttons if multiple are available
  const variantsHtml = hdVersions.length > 1
    ? hdVersions.map((v, i) =>
        `<button class="tools-fetch-btn" style="font-size:11px;padding:4px 10px;background:var(--surf2);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3)"
          onclick="toolsDownload('${encodeURIComponent(v.url)}','${esc(username)}_profile_${v.width}x${v.height}.jpg')">
          ⬇ ${v.width}×${v.height}
        </button>`).join('')
    : '';

  resDiv.style.display = 'block';
  resDiv.innerHTML = `
    <div class="tools-card">
      <div class="tools-user-row" style="margin-bottom:16px">
        <div>
          <div class="tools-username">@${esc(username)}</div>
          ${user.full_name ? `<div style="font-size:12px;color:var(--tx2);margin-top:1px">${esc(user.full_name)}</div>` : ''}
          <div style="display:flex;gap:5px;margin-top:5px;flex-wrap:wrap">
            ${isHD
              ? `<span class="stag st-completed" style="font-size:9px">✓ HD Available</span>`
              : `<span class="stag st-on_hold"   style="font-size:9px">SD Only</span>`}
            ${user.is_verified ? `<span class="stag st-watching" style="font-size:9px">✓ Verified</span>` : ''}
            ${user.follower_count ? `<span style="font-size:11px;color:var(--mu)">${Number(user.follower_count).toLocaleString()} followers</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Side-by-side: square HD preview -->
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:16px">
        ${hdUrl ? `
          <div style="text-align:center">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#4ade80;margin-bottom:6px">HD</div>
            <div style="border-radius:10px;overflow:hidden;border:2px solid rgba(74,222,128,.3);background:var(--surf2);position:relative;width:220px;height:220px">
              <div id="pp-spinner-hd" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
                <div class="tools-spinner"></div>
              </div>
              <img id="pp-hd" alt="HD" style="width:220px;height:220px;object-fit:cover;display:none"
                data-url="${encodeURIComponent(hdUrl)}" data-idx="pp-hd">
            </div>
          </div>` : ''}
        ${sdUrl && sdUrl !== hdUrl ? `
          <div style="text-align:center">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--mu);margin-bottom:6px">SD</div>
            <div style="border-radius:10px;overflow:hidden;border:2px solid var(--brd);background:var(--surf2);position:relative;width:160px;height:160px">
              <div id="pp-spinner-sd" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
                <div class="tools-spinner"></div>
              </div>
              <img id="pp-sd" alt="SD" style="width:160px;height:160px;object-fit:cover;display:none"
                data-url="${encodeURIComponent(sdUrl)}" data-idx="pp-sd">
            </div>
          </div>` : ''}
      </div>

      <!-- Download buttons -->
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        ${hdUrl ? `<button class="tools-fetch-btn" onclick="toolsDownload('${encodeURIComponent(hdUrl)}','${esc(username)}_profile_hd.jpg')">⬇ Download HD</button>` : ''}
        ${sdUrl && sdUrl !== hdUrl ? `<button class="tools-fetch-btn" style="background:var(--surf2);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3)" onclick="toolsDownload('${encodeURIComponent(sdUrl)}','${esc(username)}_profile_sd.jpg')">⬇ Download SD</button>` : ''}
        ${variantsHtml}
        <button class="tools-fetch-btn" style="background:var(--surf2);color:var(--tx2);border:1px solid var(--brd)" onclick="window.open('${esc(bestUrl)}','_blank')">⤢ Open</button>
      </div>
    </div>`;

  requestAnimationFrame(() => {
    [['pp-hd', hdUrl, 'pp-spinner-hd'], ['pp-sd', sdUrl !== hdUrl ? sdUrl : null, 'pp-spinner-sd']].forEach(([imgId, src, spinnerId]) => {
      if (!src) return;
      const img     = document.getElementById(imgId);
      const spinner = document.getElementById(spinnerId);
      if (!img) return;
      img.onload  = () => { img.style.display = 'block'; if (spinner) spinner.style.display = 'none'; };
      img.onerror = () => {
        if (spinner) spinner.style.display = 'none';
        toolsLoadPreview(img).then(() => img.style.display = 'block');
      };
      img.src = src;
    });
  });
}

// ──────────────────────────────────────────────────────
//  TAB 4 — PROFILE DOWNLOADER  (all posts + ZIP)
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

      <!-- Options row -->
      <div style="display:flex;gap:14px;align-items:center;margin-top:10px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx2);cursor:pointer">
          Max posts:
          <input type="number" id="prof-limit" value="50" min="1" max="500"
            style="width:64px;background:var(--surf2);border:1px solid var(--brd);border-radius:4px;padding:4px 7px;font-size:12px;color:var(--tx);outline:none;text-align:center">
        </label>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tx2);cursor:pointer">
          <input type="checkbox" id="prof-videos" checked style="accent-color:var(--ac);cursor:pointer;width:13px;height:13px">
          Include videos
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
  const includeVideos  = document.getElementById('prof-videos')?.checked   ?? true;
  const expandCarousel = document.getElementById('prof-carousel')?.checked ?? true;

  if (!input)         return toolsProfError('Please enter a username or profile URL.');
  if (!TOOLS_API_KEY) return toolsProfError('API key not set — enter your RapidAPI key above first.');

  const username = toolsExtractUsername(input);
  errDiv.style.display    = 'none';
  resDiv.style.display    = 'none';
  progressDiv.style.display = 'none';

  TOOLS_PROFILE_ABORT   = false;
  btn.disabled           = true;
  label.textContent      = '…';
  progressDiv.style.display = 'block';
  progressDiv.innerHTML    = toolsProfProgressHtml(0, limit, 'Connecting…');

  const allFiles = [];
  let user       = null;

  try {
    // ── Step 1: fetch user info ──
    const userRes = await fetch(
      `${TOOLS_API_BASE}/api/instagram/userByUsername?username=${encodeURIComponent(username)}`,
      { headers: toolsApiHeaders() }
    );
    if (!userRes.ok) throw new Error(`User lookup failed (${userRes.status}). Check username / API key.`);
    const userData = await userRes.json();
    user = toolsParseUser(userData);
    if (!user) throw new Error('Unexpected user response shape. The API may have changed.');

    progressDiv.innerHTML = toolsProfProgressHtml(0, limit, `Found @${user.username || username} — fetching posts…`);

    // ── Step 2: paginate through posts ──
    let endCursor  = null;
    let fetched    = 0;

    do {
      if (TOOLS_PROFILE_ABORT) break;

      // Build URL — try both common endpoint patterns
      const params = new URLSearchParams({ username, count: String(Math.min(12, limit - fetched)) });
      if (endCursor) params.set('end_cursor', endCursor);

      const postsRes = await fetch(
        `${TOOLS_API_BASE}/api/instagram/userPosts?${params.toString()}`,
        { headers: toolsApiHeaders() }
      );
      if (!postsRes.ok) throw new Error(`Posts fetch failed (${postsRes.status}).`);

      const postsData = await postsRes.json();
      const { edges, pageInfo } = toolsParsePostsPage(postsData);

      if (!edges.length && !allFiles.length) {
        throw new Error('No posts returned. The account may be private or the endpoint differs.');
      }

      for (const edge of edges) {
        if (TOOLS_PROFILE_ABORT || fetched >= limit) break;
        const node    = edge.node || edge;
        const isVideo = node.__typename === 'GraphVideo' || node.is_video || node.media_type === 2;

        if (!includeVideos && isVideo) { fetched++; continue; }

        // Carousel / sidecar
        const sidecarEdges = node.edge_sidecar_to_children?.edges || node.carousel_media || [];
        if (expandCarousel && sidecarEdges.length) {
          for (const s of sidecarEdges) {
            const sn      = s.node || s;
            const snVideo = sn.is_video || sn.media_type === 2;
            if (!includeVideos && snVideo) continue;
            const mUrl = snVideo
              ? (sn.video_url || sn.video_versions?.[0]?.url)
              : (sn.display_url || sn.image_versions2?.candidates?.[0]?.url || sn.thumbnail_src);
            if (mUrl) allFiles.push({ url: mUrl, ext: snVideo ? 'mp4' : 'jpg', id: sn.id || uid() });
          }
        } else {
          const mUrl = isVideo
            ? (node.video_url || node.video_versions?.[0]?.url)
            : (node.display_url || node.image_versions2?.candidates?.[0]?.url || node.thumbnail_src);
          if (mUrl) allFiles.push({ url: mUrl, ext: isVideo ? 'mp4' : 'jpg', id: node.id || uid(), shortcode: node.shortcode });
        }
        fetched++;
      }

      endCursor = pageInfo?.has_next_page ? (pageInfo.end_cursor || null) : null;
      progressDiv.innerHTML = toolsProfProgressHtml(fetched, limit, `Fetched ${fetched} post${fetched !== 1 ? 's' : ''}, ${allFiles.length} file${allFiles.length !== 1 ? 's' : ''}…`);

      // Polite pause between pages to avoid rate-limiting
      if (endCursor && fetched < limit && !TOOLS_PROFILE_ABORT) {
        await new Promise(r => setTimeout(r, 600));
      }

    } while (endCursor && fetched < limit && !TOOLS_PROFILE_ABORT);

    if (TOOLS_PROFILE_ABORT) {
      progressDiv.style.display = 'none';
      label.textContent = 'Fetch';
      btn.disabled = false;
      return;
    }

    TOOLS_PROFILE_RESULTS = allFiles;
    progressDiv.style.display = 'none';

    if (!allFiles.length) throw new Error('No downloadable media found on this profile (it may be private).');
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
          style="font-size:11px;color:#fb7185;background:none;border:none;cursor:pointer;padding:2px 6px">
          ✕ Cancel
        </button>
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
  const preview = files.slice(0, 36);  // preview grid capped at 36 tiles

  // Build serialised download list for data-files attributes
  const dlFiles = files.map((f, i) => ({
    url:  encodeURIComponent(f.url),
    name: `${username}_${String(i + 1).padStart(4, '0')}.${f.ext}`,
  }));
  const dlData = JSON.stringify(dlFiles).replace(/"/g, '&quot;');

  // Build grid tiles
  const tilesHtml = preview.map((f, i) => {
    const enc  = encodeURIComponent(f.url);
    const name = `${username}_${String(i + 1).padStart(4, '0')}.${f.ext}`;

    if (f.ext === 'mp4') {
      return `<div class="tools-img-item" style="aspect-ratio:1">
        <div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--surf2);gap:4px">
          <span style="font-size:22px;opacity:.45">▶</span>
          <span style="font-size:9px;color:var(--mu)">VIDEO</span>
        </div>
        <div class="tools-img-overlay">
          <span style="font-size:9px;color:rgba(255,255,255,.7);font-weight:700">#${i + 1}</span>
          <button class="tools-dl-btn" onclick="toolsDownload('${enc}','${name}')">⬇</button>
        </div>
      </div>`;
    }

    return `<div class="tools-img-item" style="aspect-ratio:1">
      <div id="ptile-load-${i}" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:var(--surf2)">
        <div class="tools-spinner"></div>
      </div>
      <img id="ptile-img-${i}" alt="${i + 1}"
        style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none"
        data-url="${enc}" data-idx="${i}">
      <div id="ptile-err-${i}" class="tools-img-error" style="display:none;position:absolute;inset:0;flex-direction:column;align-items:center;justify-content:center;gap:4px">
        <span style="font-size:18px;opacity:.3">◉</span>
        <span style="font-size:9px;color:var(--mu)">No preview</span>
      </div>
      <div class="tools-img-overlay">
        <span style="font-size:9px;color:rgba(255,255,255,.7);font-weight:700">#${i + 1}</span>
        <button class="tools-dl-btn" onclick="toolsDownload('${enc}','${name}')">⬇</button>
      </div>
    </div>`;
  }).join('');

  resDiv.style.display = 'block';
  resDiv.innerHTML = `
    <div class="tools-card tools-result-card">

      <!-- User summary -->
      <div class="tools-user-row" style="margin-bottom:14px">
        <div>
          <div class="tools-username">@${esc(user.username || username)}</div>
          ${user.full_name ? `<div style="font-size:12px;color:var(--tx2)">${esc(user.full_name)}</div>` : ''}
          <div class="tools-meta-row" style="margin-top:5px">
            <span class="stag st-watching"   style="font-size:9px">${files.length} files</span>
            <span class="stag st-completed"  style="font-size:9px">${imgs.length} images</span>
            ${vids.length ? `<span class="stag st-plan" style="font-size:9px">${vids.length} videos</span>` : ''}
          </div>
        </div>
      </div>

      <!-- Download actions -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <button id="prof-zip-btn" class="tools-fetch-btn"
          onclick="toolsDownloadZIP('${esc(username)}', JSON.parse(this.dataset.files))"
          data-files="${dlData}">
          📦 Download All as ZIP (${files.length})
        </button>
        <button class="tools-fetch-btn"
          style="background:var(--surf2);color:var(--ac);border:1px solid rgba(var(--ac-rgb),.3)"
          onclick="toolsDownloadAllSequential(JSON.parse(this.dataset.files))"
          data-files="${dlData}">
          ⬇ Download Individually
        </button>
      </div>

      <!-- ZIP progress (hidden until used) -->
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

  // Lazy-load preview images (batched to avoid hammering proxies)
  requestAnimationFrame(() => {
    const BATCH = 6;
    let idx = 0;
    function loadBatch() {
      const end = Math.min(idx + BATCH, preview.length);
      for (; idx < end; idx++) {
        if (preview[idx].ext === 'mp4') continue;
        const img    = document.getElementById(`ptile-img-${idx}`);
        const loader = document.getElementById(`ptile-load-${idx}`);
        const errEl  = document.getElementById(`ptile-err-${idx}`);
        if (!img) continue;
        const i = idx; // capture
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

/** Download all files as a ZIP archive using JSZip (loaded from CDN on demand). */
async function toolsDownloadZIP(username, files) {
  const btn         = document.getElementById('prof-zip-btn');
  const progressDiv = document.getElementById('prof-zip-progress');

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
        <div style="font-size:11px;color:var(--mu)">${done} / ${total} files  (${pct}%)</div>
      </div>`;
  };

  // Load JSZip
  let JSZip;
  try {
    JSZip = await loadJSZip();
  } catch(e) {
    if (btn) { btn.disabled = false; btn.innerHTML = `📦 Download All as ZIP (${files.length})`; }
    if (progressDiv) progressDiv.style.display = 'none';
    toast('JSZip unavailable — falling back to individual download', 'var(--ch)');
    await toolsDownloadAllSequential(files);
    return;
  }

  const zip    = new JSZip();
  const folder = zip.folder(username + '_instagram');
  let   done   = 0;
  const total  = files.length;

  // Fetch files in parallel batches of 5
  const BATCH = 5;
  for (let i = 0; i < total; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    await Promise.all(batch.map(async (f) => {
      const url = decodeURIComponent(f.url);
      let   blob = null;
      // Try proxies first, then direct
      for (const build of [...TOOLS_PREVIEW_PROXIES, u => u]) {
        try {
          const res = await fetch(build(url));
          if (res.ok) { blob = await res.blob(); break; }
        } catch { /* try next */ }
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
      compressionOptions: { level: 1 },   // level 1 = fastest
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

/** Fall-back: stagger-download each file individually (700 ms apart). */
async function toolsDownloadAllSequential(files) {
  toast(`Starting ${files.length} individual downloads…`, 'var(--ac)');
  for (let i = 0; i < files.length; i++) {
    await new Promise(r => setTimeout(r, 750 * i));
    toolsDownload(files[i].url, files[i].name);
  }
}
