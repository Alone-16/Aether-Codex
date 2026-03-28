// ═══════════════════════════════
//  TOOLS SECTION — Instagram Downloader
// ═══════════════════════════════

let TOOLS_API_KEY = localStorage.getItem('ac_tools_rapidapi_key') || '';

function renderTools(c) {
  c.innerHTML = `
    <div class="tools-wrap">

      <!-- Header -->
      <div class="tools-header">
        <div class="tools-header-inner">
          <div class="tools-icon">⬇</div>
          <div>
            <div class="tools-title">Instagram Downloader</div>
            <div class="tools-sub">Paste a post link and download full-quality images</div>
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
            placeholder="Paste your X-RapidAPI-Key here..."
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

  // Extract shortcode from URL e.g. instagram.com/p/DV9cq63kd3u/ → DV9cq63kd3u
  const match     = raw.match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
  const shortcode = match ? match[1] : (/^[A-Za-z0-9_-]{9,14}$/.test(raw) ? raw : null);
  if (!shortcode) return toolsError("Could not find a shortcode in that URL. Make sure it's a valid Instagram post link.");

  errorDiv.style.display  = 'none';
  resultDiv.style.display = 'none';
  fetchBtn.disabled       = true;
  fetchLabel.textContent  = '...';

  try {
    const res = await fetch('https://instagram120.p.rapidapi.com/mediaByShortcode', {
      method: 'POST',
      headers: {
        'Content-Type':   'application/json',
        'X-RapidAPI-Key':  TOOLS_API_KEY,
        'X-RapidAPI-Host': 'instagram120.p.rapidapi.com'
      },
      body: JSON.stringify({ shortcode })
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`API error ${res.status}: ${txt.slice(0, 120)}`);
    }

    const data = await res.json();
    const node = data?.result?.edges?.[0]?.node;
    if (!node) throw new Error('Could not parse response. Check the URL and try again.');

    toolsRenderResult(node);
  } catch (e) {
    toolsError(e.message || 'Something went wrong. Check your API key and URL.');
  } finally {
    fetchBtn.disabled      = false;
    fetchLabel.textContent = 'Fetch';
  }
}

function toolsError(msg) {
  const el = document.getElementById('tools-error');
  el.textContent    = '⚠ ' + msg;
  el.style.display  = 'block';
}

function toolsRenderResult(node) {
  const resultDiv = document.getElementById('tools-result');

  // Collect all images
  let images = [];

  // Check if it's a carousel
  if (node.carousel_media && node.carousel_media.length > 0) {
    node.carousel_media.forEach((item, i) => {
      if (item.media_type === 1) { // image
        const candidates = item.image_versions2?.candidates;
        if (candidates && candidates.length > 0) {
          images.push({ url: candidates[0].url, w: candidates[0].width, h: candidates[0].height, index: i + 1 });
        }
      }
    });
  }

  // Also add cover image (candidates[0] is highest quality)
  const coverCandidates = node.image_versions2?.candidates;
  if (coverCandidates && coverCandidates.length > 0) {
    // Only add if not already captured from carousel
    if (images.length === 0) {
      images.push({ url: coverCandidates[0].url, w: coverCandidates[0].width, h: coverCandidates[0].height, index: 1 });
    }
  }

  const username   = node.user?.username   || node.owner?.username   || 'unknown';
  const fullName   = node.user?.full_name  || node.owner?.full_name  || '';
  const caption    = node.caption?.text    || '';
  const likes      = node.like_count       || 0;
  const isCarousel = images.length > 1;

  resultDiv.style.display = 'block';
  resultDiv.innerHTML = `
    <div class="tools-card tools-result-card">
      <!-- User row -->
      <div class="tools-user-row">
        <img
          src="${node.user?.profile_pic_url || node.owner?.profile_pic_url || ''}"
          class="tools-avatar"
          onerror="this.style.display='none'"
          alt=""
        />
        <div>
          <div class="tools-username">@${username}${fullName ? ` · ${fullName}` : ''}</div>
          <div class="tools-meta-row">
            <span class="stag st-watching" style="font-size:9px">
              ${isCarousel ? `◈ ${images.length} images` : '◉ Single image'}
            </span>
            <span style="font-size:11px;color:var(--mu)">♥ ${likes.toLocaleString()}</span>
            ${node.original_width ? `<span style="font-size:11px;color:var(--mu)">${node.original_width}×${node.original_height}</span>` : ''}
          </div>
        </div>
      </div>

      ${caption ? `
        <div class="tools-caption">
          ${caption.slice(0, 200)}${caption.length > 200 ? '...' : ''}
        </div>
      ` : ''}

      <!-- Image grid -->
      <div class="tools-img-grid" id="tools-img-grid" style="--cols:${Math.min(images.length, 3)}">
        ${images.map((img, i) => `
          <div class="tools-img-item" id="tools-img-${i}">
            <img
              src="${img.url}"
              class="tools-img-preview"
              alt="Image ${img.index}"
              loading="lazy"
              onerror="this.parentElement.querySelector('.tools-img-error').style.display='flex';this.style.display='none'"
            />
            <div class="tools-img-error" style="display:none">
              <span style="font-size:11px;color:var(--mu);text-align:center">Preview blocked by Instagram.<br>Download still works.</span>
            </div>
            <div class="tools-img-overlay">
              <span style="font-size:10px;color:rgba(255,255,255,.7);font-weight:600">${img.w}×${img.h}</span>
              <div style="display:flex;gap:6px">
                <button class="tools-dl-btn" onclick="toolsDownload('${encodeURIComponent(img.url)}', '${username}_${i + 1}.jpg')" title="Download">⬇ Download</button>
                <button class="tools-open-btn" onclick="window.open('${img.url}','_blank')" title="Open full size">⤢</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      ${images.length > 1 ? `
        <div style="margin-top:10px">
          <button class="tools-fetch-btn" style="width:100%;justify-content:center" onclick="toolsDownloadAll(${JSON.stringify(images.map(img => ({ url: encodeURIComponent(img.url), name: `${username}_${img.index}.jpg` })))})">
            ⬇ Download All (${images.length})
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

async function toolsDownload(encodedUrl, filename) {
  const url = decodeURIComponent(encodedUrl);
  try {
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
    const res = await fetch(proxyUrl);
    if (!res.ok) throw new Error('proxy fail');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    // Fallback: open in new tab for manual save
    window.open(url, '_blank');
  }
}

async function toolsDownloadAll(images) {
  for (let i = 0; i < images.length; i++) {
    await new Promise(r => setTimeout(r, 600 * i));
    toolsDownload(images[i].url, images[i].name);
  }
}
