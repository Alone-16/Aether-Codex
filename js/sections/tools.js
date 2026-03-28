// ═══════════════════════════════
//  TOOLS SECTION — Instagram Downloader
// ═══════════════════════════════

let TOOLS_API_KEY = localStorage.getItem('ac_tools_rapidapi_key') || '';

// ── Fetch image as blob then display as object URL (bypasses CORP) ──
const TOOLS_PREVIEW_PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://proxy.cors.sh/${u}`,
];

async function toolsLoadPreview(imgEl) {
  const url = decodeURIComponent(imgEl.dataset.url);
  const idx = imgEl.dataset.idx;

  for (const buildProxy of TOOLS_PREVIEW_PROXIES) {
    try {
      const res = await fetch(buildProxy(url));
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob || blob.size === 0) continue;
      if (imgEl._blobUrl) URL.revokeObjectURL(imgEl._blobUrl);
      imgEl._blobUrl = URL.createObjectURL(blob);
      imgEl.src = imgEl._blobUrl;
      imgEl.style.display = 'block';
      return; // success — stop trying proxies
    } catch { /* try next */ }
  }

  // All proxies failed — show placeholder
  imgEl.style.display = 'none';
  const errEl = document.getElementById('tools-img-error-' + idx);
  if (errEl) errEl.style.display = 'flex';
}

function renderTools(c) {
  c.innerHTML = `
    <div class="tools-wrap">

      <!-- Header -->
      <div class="tools-header">
        <div class="tools-header-inner">
          <div class="tools-icon">⬇</div>
          <div>
            <div class="tools-title">Instagram Downloader</div>
            <div class="tools-sub">Paste a post link and download full-quality images &amp; videos</div>
          </div>
        </div>
      </div>

      <!-- API Key Config -->
      <div class="tools-card" id="tools-apikey-card">
        <div class="tools-card-head">
          <span class="tools-card-label">⚙ RapidAPI Key</span>
          <span class="tools-card-hint" id="tools-key-status">${TOOLS_API_KEY ? '✓ Key saved' : 'Not set'}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input
            class="fin tools-key-input"
            id="tools-apikey-input"
            type="password"
            placeholder="Paste your x-rapidapi-key here..."
            value="${TOOLS_API_KEY}"
            autocomplete="off"
          />
          <button class="tools-save-btn" onclick="toolsSaveKey()">Save</button>
        </div>
        <div style="font-size:11px;color:var(--mu);margin-top:6px">
          Get your key from <span style="color:var(--ac);font-weight:600">rapidapi.com</span> → Instagram120 API → Headers tab
        </div>
      </div>

      <!-- URL Input -->
      <div class="tools-card">
        <div class="tools-card-head">
          <span class="tools-card-label">◉ Post URL</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <div class="srch-wrap" style="max-width:100%;flex:1;margin:0">
            <span class="srch-ico">◉</span>
            <input
              class="srch tools-url-input"
              id="tools-url-input"
              placeholder="https://www.instagram.com/p/..."
              onkeydown="if(event.key==='Enter')toolsFetch()"
              style="padding-left:30px;border-radius:var(--cr)"
            />
          </div>
          <button class="tools-fetch-btn" id="tools-fetch-btn" onclick="toolsFetch()">
            <span id="tools-fetch-label">Fetch</span>
          </button>
        </div>
      </div>

      <!-- Error -->
      <div id="tools-error" style="display:none" class="tools-error"></div>

      <!-- Result -->
      <div id="tools-result" style="display:none"></div>

    </div>
  `;
}

function toolsSaveKey() {
  const val = document.getElementById('tools-apikey-input').value.trim();
  TOOLS_API_KEY = val;
  localStorage.setItem('ac_tools_rapidapi_key', val);
  const status = document.getElementById('tools-key-status');
  status.textContent = val ? '✓ Key saved' : 'Cleared';
  status.style.color = val ? 'var(--ac)' : 'var(--mu)';
  setTimeout(() => { status.textContent = val ? '✓ Key saved' : 'Not set'; status.style.color = ''; }, 2000);
}

async function toolsFetch() {
  const urlInput   = document.getElementById('tools-url-input');
  const fetchBtn   = document.getElementById('tools-fetch-btn');
  const fetchLabel = document.getElementById('tools-fetch-label');
  const errorDiv   = document.getElementById('tools-error');
  const resultDiv  = document.getElementById('tools-result');

  const raw = urlInput.value.trim();
  if (!raw)           return toolsError('Please paste an Instagram post URL.');
  if (!TOOLS_API_KEY) return toolsError('API key not set. Enter your RapidAPI key above first.');

  const match     = raw.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = match ? match[1] : (/^[A-Za-z0-9_-]{9,14}$/.test(raw) ? raw : null);
  if (!shortcode) return toolsError("Could not find a shortcode. Make sure it's a valid Instagram post link.");

  errorDiv.style.display  = 'none';
  resultDiv.style.display = 'none';
  fetchBtn.disabled       = true;
  fetchLabel.textContent  = '...';

  try {
    const res = await fetch('https://instagram120.p.rapidapi.com/api/instagram/mediaByShortcode', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-rapidapi-key':  TOOLS_API_KEY,
        'x-rapidapi-host': 'instagram120.p.rapidapi.com'
      },
      body: JSON.stringify({ shortcode })
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`API error ${res.status}: ${txt.slice(0, 120)}`);
    }

    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('No media found for that post.');

    toolsRenderResult(data);

  } catch (e) {
    toolsError(e.message || 'Something went wrong. Check your API key and URL.');
  } finally {
    fetchBtn.disabled      = false;
    fetchLabel.textContent = 'Fetch';
  }
}

function toolsError(msg) {
  const el = document.getElementById('tools-error');
  el.textContent   = '⚠ ' + msg;
  el.style.display = 'block';
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
      files.push({
        url:   u.url,
        ext:   u.extension || 'jpg',
        name:  u.name || '',
        index: files.length + 1
      });
    });
  });

  const isVideo = files.some(f => f.ext === 'mp4');

  const filesHTML = files.map((f, i) => {
    const encodedUrl = encodeURIComponent(f.url);
    const dlName     = shortcode + '_' + f.index + '.' + f.ext;

    const mediaHTML = f.ext === 'mp4'
      ? `<div class="tools-img-loading" id="tools-loading-${i}">
           <span style="font-size:24px;opacity:.5">▶</span>
           <span style="font-size:11px;color:var(--tx2);margin-top:6px">Video</span>
         </div>
         <video
           id="tools-preview-${i}"
           class="tools-img-preview"
           style="display:none;object-fit:cover;width:100%;height:100%"
           muted playsinline preload="metadata"
           data-url="${encodedUrl}"
           data-idx="${i}">
         </video>`
      : `<div class="tools-img-loading" id="tools-loading-${i}">
           <div class="tools-img-spinner"></div>
         </div>
         <img
           id="tools-preview-${i}"
           class="tools-img-preview"
           alt="Image ${f.index}"
           style="display:none"
           data-url="${encodedUrl}"
           data-idx="${i}"/>
         <div class="tools-img-error" id="tools-img-error-${i}" style="display:none;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:6px">
           <span style="font-size:24px;opacity:.3">◉</span>
           <span style="font-size:11px;color:var(--mu);text-align:center;padding:0 12px">Preview unavailable<br>Download still works</span>
         </div>`;

    return `
      <div class="tools-img-item">
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
            <span style="font-size:11px;color:var(--mu)">♥ ${likes.toLocaleString()}</span>
          </div>
        </div>
      </div>

      ${title ? `<div class="tools-caption">${title.slice(0, 200)}${title.length > 200 ? '...' : ''}</div>` : ''}

      <div class="tools-img-grid" style="--cols:${Math.min(files.length, 3)}">
        ${filesHTML}
      </div>

      ${files.length > 1 ? `
        <button class="tools-fetch-btn" style="width:100%;justify-content:center;margin-top:4px"
          onclick="toolsDownloadAll(JSON.parse(this.dataset.files))"
          data-files="${dlAllData}">
          ⬇ Download All (${files.length})
        </button>
      ` : ''}

    </div>
  `;

  // Kick off blob-fetch preview loading after DOM is painted
  requestAnimationFrame(() => {
    files.forEach((f, i) => {
      const loader = document.getElementById('tools-loading-' + i);

      if (f.ext === 'mp4') {
        const vid = document.getElementById('tools-preview-' + i);
        if (vid) {
          vid.src = f.url;
          vid.style.display = 'block';
          if (loader) loader.style.display = 'none';
        }
      } else {
        const imgEl = document.getElementById('tools-preview-' + i);
        if (imgEl) {
          toolsLoadPreview(imgEl).finally(() => {
            if (loader) loader.style.display = 'none';
          });
        }
      }
    });
  });
}

async function toolsDownload(encodedUrl, filename) {
  const url = decodeURIComponent(encodedUrl);
  try {
    const res = await fetch('https://corsproxy.io/?' + encodeURIComponent(url));
    if (!res.ok) throw new Error('fail');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, '_blank');
  }
}

async function toolsDownloadAll(images) {
  for (let i = 0; i < images.length; i++) {
    await new Promise(r => setTimeout(r, 700 * i));
    toolsDownload(images[i].url, images[i].name);
  }
}
