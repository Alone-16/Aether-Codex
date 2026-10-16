// ═══════════════════════════════════════════════════════════════════
//  js/plugins/ani-launcher.js — ani-cli Launcher Plugin Implementation
// ═══════════════════════════════════════════════════════════════════

import { toast } from '../shared/ui.js';
import { esc } from '../shared/utils.js';

export const id = 'aniLauncher';
export const name = 'ani-cli Launcher';
export const description = 'Launch anime directly in a local terminal using ani-cli';

export const defaultSettings = {
  bridgeUrl: 'http://127.0.0.1:47619',
  token: null,
  player: 'mpv',
  quality: 'best',
  audio: 'sub',
  searchTitle: 'english',
  autoSelect: true,
  episodeMode: 'none',
};

export const settingsSchema = {
  bridgeUrl: {
    type: 'string',
    label: 'Bridge URL',
    default: 'http://127.0.0.1:47619',
    description: 'Local loopback URL for the Python bridge',
  },
  token: {
    type: 'token',
    label: 'Authentication Token',
    description: 'Secret token used to authenticate requests to the local bridge',
  },
  player: {
    type: 'select',
    label: 'Player',
    options: [
      { value: 'mpv', label: 'MPV (Default)' },
      { value: 'vlc', label: 'VLC' },
    ],
    default: 'mpv',
  },
  quality: {
    type: 'select',
    label: 'Quality',
    options: [
      { value: 'auto', label: 'Auto' },
      { value: 'best', label: 'Best' },
      { value: '1080', label: '1080p' },
      { value: '720', label: '720p' },
      { value: '480', label: '480p' },
      { value: '360', label: '360p' },
      { value: 'worst', label: 'Worst' },
    ],
    default: 'best',
  },
  audio: {
    type: 'select',
    label: 'Audio',
    options: [
      { value: 'sub', label: 'Sub (Japanese audio with subtitles)' },
      { value: 'dub', label: 'Dub (English audio)' },
    ],
    default: 'sub',
  },
  searchTitle: {
    type: 'select',
    label: 'Search Title',
    options: [
      { value: 'english', label: 'English Title' },
      { value: 'romaji', label: 'Romaji Title' },
      { value: 'native', label: 'Native / Japanese Title' },
    ],
    default: 'english',
  },
  autoSelect: {
    type: 'boolean',
    label: 'Auto-select first result (-S 1)',
    default: true,
    description: 'Bypasses interactive search menu in terminal',
  },
  episodeMode: {
    type: 'select',
    label: 'Episode Mode',
    options: [
      { value: 'none', label: 'None (select or resume in terminal)' },
      { value: 'next', label: 'Start at next unwatched episode' },
    ],
    default: 'none',
    description: 'Uses card progress data when reliable to jump directly to next episode',
  },
};

// ── State ────────────────────────────────────────────────────────────
let activeSettings = { ...defaultSettings };
let delegatedClickListener = null;
let lastTestedCapabilities = null;
let lastConnectionStatus = null; // null | { ok: boolean, version?: string, error?: string }

// ── Utilities ────────────────────────────────────────────────────────
export function generateSecureToken() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function isSupportedPlatform() {
  if (typeof window === 'undefined') return true;
  const isPwa = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.innerWidth && window.innerWidth < 640);
  return !isPwa && !isMobile;
}

// ── Fallback Toast with Action ───────────────────────────────────────
export function showLaunchFailureToast(entry, errorMessage) {
  const el = document.createElement('div');
  el.className = 'toast-el toast-ani-fallback';
  el.style.borderLeftColor = '#fb7185';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.gap = '10px';
  el.style.maxWidth = '420px';
  el.style.padding = '10px 14px';

  const textWrap = document.createElement('div');
  textWrap.style.flex = '1';
  textWrap.style.lineHeight = '1.3';

  const titleEl = document.createElement('div');
  titleEl.style.fontWeight = '600';
  titleEl.style.fontSize = '12px';
  titleEl.style.color = '#fff';
  titleEl.textContent = 'Bridge Unreachable';

  const subEl = document.createElement('div');
  subEl.style.fontSize = '11px';
  subEl.style.color = 'rgba(255,255,255,0.7)';
  subEl.textContent = errorMessage || 'Could not connect to local bridge.';

  textWrap.appendChild(titleEl);
  textWrap.appendChild(subEl);
  el.appendChild(textWrap);

  if (entry && entry.watchUrl) {
    const btn = document.createElement('button');
    btn.textContent = 'Open Stream ↗';
    btn.style.cssText = 'background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);color:#fff;border-radius:4px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap;transition:background .2s;';
    btn.onmouseover = () => { btn.style.background = 'rgba(255,255,255,0.25)'; };
    btn.onmouseout = () => { btn.style.background = 'rgba(255,255,255,0.15)'; };
    btn.onclick = (e) => {
      e.stopPropagation();
      window.open(entry.watchUrl, '_blank');
      el.remove();
    };
    el.appendChild(btn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✕';
  closeBtn.style.cssText = 'background:none;border:none;color:rgba(255,255,255,0.5);font-size:12px;cursor:pointer;padding:0 2px;';
  closeBtn.onclick = () => el.remove();
  el.appendChild(closeBtn);

  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 6000);
}

// ── Bridge Communication ─────────────────────────────────────────────
export async function testBridgeConnection(bridgeUrl, token) {
  const url = (bridgeUrl || activeSettings.bridgeUrl || 'http://127.0.0.1:47619').replace(/\/+$/, '');
  const authToken = token || activeSettings.token;

  try {
    const pingRes = await fetch(`${url}/ping`, {
      method: 'GET',
      headers: {
        'X-Aether-Token': authToken || '',
      },
    });

    if (!pingRes.ok) {
      if (pingRes.status === 401) throw new Error('Authentication failed: Invalid token');
      if (pingRes.status === 403) throw new Error('Forbidden: Origin or Host rejected by bridge');
      throw new Error(`Bridge returned HTTP ${pingRes.status}`);
    }

    const pingData = await pingRes.json();

    // Fetch capabilities
    let caps = null;
    try {
      const capsRes = await fetch(`${url}/capabilities`, {
        method: 'GET',
        headers: { 'X-Aether-Token': authToken || '' },
      });
      if (capsRes.ok) {
        caps = await capsRes.json();
      }
    } catch (e) {
      console.warn('[ani-launcher] Capabilities fetch warning:', e);
    }

    lastTestedCapabilities = caps;
    lastConnectionStatus = { ok: true, version: pingData.version, os: pingData.os, capabilities: caps };
    return lastConnectionStatus;
  } catch (err) {
    lastConnectionStatus = { ok: false, error: err.message || 'Connection failed' };
    return lastConnectionStatus;
  }
}

// ── Launch Anime Action ──────────────────────────────────────────────
export async function launchAnime(entry) {
  if (!entry) return;

  if (!isSupportedPlatform()) {
    toast('Terminal launcher is not supported on mobile/PWA environments.', '#fbbf24');
    return;
  }

  const settings = activeSettings;
  const bridgeUrl = (settings.bridgeUrl || 'http://127.0.0.1:47619').replace(/\/+$/, '');
  const token = settings.token;

  if (!token) {
    toast('Please configure your bridge token in Settings → Plugins', '#fb7185');
    return;
  }

  // 1. Title Variant Resolution
  let title = entry.title || '';
  const searchPref = settings.searchTitle || 'english';
  if (searchPref === 'english') {
    title = entry.title_en || entry.title_english || entry.title;
  } else if (searchPref === 'romaji') {
    title = entry.title_romaji || entry.title;
  } else if (searchPref === 'native') {
    title = entry.title_native || entry.title_ja || entry.title_japanese || entry.title;
  }
  title = (title || entry.title || '').trim();

  // 2. Episode Mode Resolution
  let episode = undefined;
  if (settings.episodeMode === 'next') {
    // Only use if reliable progress data is available
    const isCompleted = entry.status === 'completed' || entry.status === 'dropped';
    const cur = parseInt(entry.epCur, 10);
    const tot = parseInt(entry.epTot || 0, 10);
    const hasValidCur = !isNaN(cur) && cur >= 0;

    if (!isCompleted && hasValidCur && (!tot || cur < tot)) {
      episode = cur + 1;
    }
  }

  // 3. Prepare Payload
  const payload = {
    title,
    settings: {
      player: settings.player || 'mpv',
      quality: settings.quality || 'best',
      audio: settings.audio || 'sub',
      autoSelect: settings.autoSelect !== false,
    },
  };
  if (typeof episode === 'number') {
    payload.episode = episode;
  }

  toast(`▶ Launching "${title}" in terminal...`, '#38bdf8');

  try {
    const res = await fetch(`${bridgeUrl}/play`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Aether-Token': token,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let errText = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson && errJson.error) errText = errJson.error;
      } catch (e) {}
      throw new Error(errText);
    }

    const data = await res.json();
    toast(`✓ Launched in terminal: ${title}`, '#4ade80');
  } catch (err) {
    console.warn('[ani-launcher] Terminal launch failed:', err);
    showLaunchFailureToast(entry, err.message);
  }
}

// ── Download Bridge Script ───────────────────────────────────────────
export async function downloadBridgeScript(settings) {
  let template = '';
  try {
    const res = await fetch('/bridge/aether-bridge.template.py');
    if (res.ok) {
      template = await res.text();
    }
  } catch (e) {
    console.warn('[ani-launcher] Template fetch failed:', e);
  }

  if (!template) {
    toast('Unable to read bridge template. Ensure the site is running locally or check network.', '#fb7185');
    return;
  }

  let port = 47619;
  try {
    const parsed = new URL(settings.bridgeUrl || 'http://127.0.0.1:47619');
    if (parsed.port) port = parseInt(parsed.port, 10);
  } catch (e) {}

  const origin = window.location.origin;
  const token = settings.token || generateSecureToken();

  let script = template;
  script = script.replace('__BAKED_TOKEN__', token);
  script = script.replace('__ALLOWED_ORIGIN__', origin);
  script = script.replace('47619  # __CONFIGURED_PORT__', `${port}`);
  script = script.replace('{}     # __DEFAULT_SETTINGS_JSON__', JSON.stringify({
    player: settings.player || 'mpv',
    quality: settings.quality || 'best',
    audio: settings.audio || 'sub',
    autoSelect: settings.autoSelect !== false,
  }, null, 2));

  // Also replace direct placeholders if present
  script = script.replace(/__CONFIGURED_PORT__/g, `${port}`);
  script = script.replace(/__DEFAULT_SETTINGS_JSON__/g, JSON.stringify(settings));

  const blob = new Blob([script], { type: 'text/x-python;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = 'aether-bridge.py';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }, 100);

  toast('✓ aether-bridge.py downloaded', '#4ade80');
}

// ── Settings Panel UI ────────────────────────────────────────────────
export function renderSettingsPanel(container, settings, saveFn) {
  if (!container) return;

  const caps = lastTestedCapabilities;
  const status = lastConnectionStatus;

  const aniFlags = caps?.ani_cli?.flags || {};
  const players = caps?.players || {};

  const vlcSupported = !caps || (aniFlags.vlc && players.vlc);
  const qualitySupported = !caps || aniFlags.quality;
  const dubSupported = !caps || aniFlags.dub;

  container.innerHTML = `
    <div style="background:var(--surf);border:1px solid var(--brd);border-radius:var(--cr);padding:18px 20px;margin-bottom:14px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--brd)">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--tx);display:flex;align-items:center;gap:8px">
            <span style="color:#38bdf8">⌨</span> ani-cli Launcher Bridge
          </div>
          <div style="font-size:11px;color:var(--mu);margin-top:2px">
            Connects Aether Codex to your local terminal to stream anime directly via ani-cli
          </div>
        </div>
        <div id="bridge-status-indicator" style="font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px">
          ${status
            ? (status.ok
                ? `<span style="color:#4ade80">● Connected</span> <span style="font-size:10px;opacity:0.6">(v${status.version})</span>`
                : `<span style="color:#f87171">● Disconnected</span>`)
            : `<span style="color:var(--mu)">● Unknown</span>`}
        </div>
      </div>

      <!-- Bridge URL -->
      <div style="margin-bottom:14px">
        <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--mu);margin-bottom:5px">Bridge URL</label>
        <div style="display:flex;gap:8px">
          <input class="fin" id="ani-bridge-url" value="${esc(settings.bridgeUrl || 'http://127.0.0.1:47619')}" style="flex:1" placeholder="http://127.0.0.1:47619">
          <button class="btn" id="ani-test-btn" style="padding:0 14px;white-space:nowrap;font-size:12px;font-weight:600">Test Connection</button>
        </div>
        <div style="font-size:10px;color:var(--mu);margin-top:4px">Binds to local loopback 127.0.0.1 only. Never exposes port to network.</div>
      </div>

      <!-- Authentication Token -->
      <div style="margin-bottom:14px">
        <label style="display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--mu);margin-bottom:5px">Authentication Token</label>
        <div style="display:flex;gap:8px">
          <input class="fin" id="ani-token" type="password" value="${esc(settings.token || '')}" style="flex:1;font-family:monospace;letter-spacing:1px" readonly>
          <button class="btn" id="ani-toggle-token-btn" style="padding:0 10px;font-size:12px" title="Show/Hide Token">👁</button>
          <button class="btn" id="ani-copy-token-btn" style="padding:0 12px;font-size:12px;font-weight:600">Copy</button>
          <button class="btn" id="ani-regen-token-btn" style="padding:0 12px;font-size:12px;color:#fb7185" title="Regenerate Token">Regen</button>
        </div>
        <div style="font-size:10px;color:var(--mu);margin-top:4px">Stored locally on this device. Never sent to cloud database or serverless worker.</div>
      </div>

      <!-- Quick Action: Download Script -->
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:18px;padding:12px;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.2);border-radius:8px">
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:var(--tx)">Download Configured Bridge</div>
          <div style="font-size:11px;color:var(--mu)">Generates ready-to-run aether-bridge.py with your token and settings baked in.</div>
        </div>
        <button class="btn" id="ani-download-btn" style="background:#38bdf8;color:#000;font-weight:700;padding:8px 14px;border:none;border-radius:6px;cursor:pointer">
          ⬇ Download Bridge
        </button>
      </div>

      <div style="border-top:1px solid var(--brd);padding-top:14px;margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:var(--tx);margin-bottom:10px">Playback & Launch Options</div>
        
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <!-- Player -->
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--mu);margin-bottom:4px">Player</label>
            <select class="fsel" id="ani-player" style="width:100%">
              <option value="mpv" ${settings.player === 'mpv' ? 'selected' : ''}>MPV (Default)</option>
              <option value="vlc" ${settings.player === 'vlc' ? 'selected' : ''} ${!vlcSupported ? 'disabled title="VLC not detected or unsupported by ani-cli"' : ''}>VLC ${!vlcSupported ? '(Unavailable)' : ''}</option>
            </select>
          </div>

          <!-- Quality -->
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--mu);margin-bottom:4px">Quality</label>
            <select class="fsel" id="ani-quality" style="width:100%" ${!qualitySupported ? 'disabled title="Quality flag unsupported by installed ani-cli"' : ''}>
              <option value="auto" ${settings.quality === 'auto' ? 'selected' : ''}>Auto</option>
              <option value="best" ${settings.quality === 'best' ? 'selected' : ''}>Best</option>
              <option value="1080" ${settings.quality === '1080' ? 'selected' : ''}>1080p</option>
              <option value="720" ${settings.quality === '720' ? 'selected' : ''}>720p</option>
              <option value="480" ${settings.quality === '480' ? 'selected' : ''}>480p</option>
              <option value="360" ${settings.quality === '360' ? 'selected' : ''}>360p</option>
              <option value="worst" ${settings.quality === 'worst' ? 'selected' : ''}>Worst</option>
            </select>
          </div>

          <!-- Audio -->
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--mu);margin-bottom:4px">Audio</label>
            <select class="fsel" id="ani-audio" style="width:100%">
              <option value="sub" ${settings.audio === 'sub' ? 'selected' : ''}>Sub (Japanese)</option>
              <option value="dub" ${settings.audio === 'dub' ? 'selected' : ''} ${!dubSupported ? 'disabled title="--dub flag unsupported by installed ani-cli"' : ''}>Dub (English) ${!dubSupported ? '(Unavailable)' : ''}</option>
            </select>
          </div>

          <!-- Search Title Variant -->
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--mu);margin-bottom:4px">Search Title</label>
            <select class="fsel" id="ani-search-title" style="width:100%">
              <option value="english" ${settings.searchTitle === 'english' ? 'selected' : ''}>English Title</option>
              <option value="romaji" ${settings.searchTitle === 'romaji' ? 'selected' : ''}>Romaji Title</option>
              <option value="native" ${settings.searchTitle === 'native' ? 'selected' : ''}>Native Title</option>
            </select>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">
          <!-- Auto-select first result -->
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--mu);margin-bottom:4px">Auto-Select First Result</label>
            <select class="fsel" id="ani-autoselect" style="width:100%">
              <option value="true" ${settings.autoSelect !== false ? 'selected' : ''}>On (-S 1)</option>
              <option value="false" ${settings.autoSelect === false ? 'selected' : ''}>Off (Interactive menu)</option>
            </select>
          </div>

          <!-- Episode Mode -->
          <div>
            <label style="display:block;font-size:11px;font-weight:600;color:var(--mu);margin-bottom:4px">Episode Mode</label>
            <select class="fsel" id="ani-ep-mode" style="width:100%">
              <option value="none" ${settings.episodeMode === 'none' ? 'selected' : ''}>None (Choose in terminal)</option>
              <option value="next" ${settings.episodeMode === 'next' ? 'selected' : ''}>Start at next unwatched</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Collapsible Setup Guides -->
      <details style="margin-top:14px;background:rgba(255,255,255,0.02);border:1px solid var(--brd);border-radius:8px;padding:10px 14px">
        <summary style="cursor:pointer;font-weight:600;font-size:12px;color:var(--tx)">📖 Windows Setup Instructions</summary>
        <div style="font-size:11px;color:var(--mu);line-height:1.6;margin-top:10px">
          <b>Prerequisites:</b>
          <ul style="margin:4px 0 10px 20px">
            <li>Install Python 3.8+ (from python.org or <code>winget install Python.Python.3</code>)</li>
            <li>Install ani-cli (via Scoop: <code>scoop install ani-cli</code> or Git Bash)</li>
            <li>Install mpv (<code>scoop install mpv</code> or winget)</li>
          </ul>
          <b>Starting the Bridge:</b>
          <pre style="background:var(--surf2);padding:8px 12px;border-radius:6px;overflow-x:auto;margin:6px 0">python aether-bridge.py</pre>
          <b>Auto-start on Windows Boot:</b>
          <p>Press <kbd>Win+R</kbd>, type <code>shell:startup</code>, and create a shortcut to <code>pythonw.exe "C:\\path\\to\\aether-bridge.py"</code>, or configure a Task Scheduler task on user logon.</p>
        </div>
      </details>

      <details style="margin-top:8px;background:rgba(255,255,255,0.02);border:1px solid var(--brd);border-radius:8px;padding:10px 14px">
        <summary style="cursor:pointer;font-weight:600;font-size:12px;color:var(--tx)">📖 Arch Linux Setup Instructions</summary>
        <div style="font-size:11px;color:var(--mu);line-height:1.6;margin-top:10px">
          <b>Prerequisites:</b>
          <pre style="background:var(--surf2);padding:8px 12px;border-radius:6px;overflow-x:auto;margin:6px 0">sudo pacman -S ani-cli mpv kitty  # or alacritty/foot/wezterm</pre>
          <b>Starting the Bridge:</b>
          <pre style="background:var(--surf2);padding:8px 12px;border-radius:6px;overflow-x:auto;margin:6px 0">chmod +x aether-bridge.py && ./aether-bridge.py</pre>
          <b>Hyprland <code>exec-once</code>:</b>
          <p>Add to <code>~/.config/hypr/hyprland.conf</code>:</p>
          <pre style="background:var(--surf2);padding:8px 12px;border-radius:6px;overflow-x:auto;margin:6px 0">exec-once = python ~/.config/aether-bridge/aether-bridge.py</pre>
          <b>Systemd User Service:</b>
          <p>Create <code>~/.config/systemd/user/aether-bridge.service</code>:</p>
          <pre style="background:var(--surf2);padding:8px 12px;border-radius:6px;overflow-x:auto;margin:6px 0">[Unit]
Description=Aether Codex ani-cli Local Bridge
After=network.target

[Service]
ExecStart=/usr/bin/python %h/.config/aether-bridge/aether-bridge.py
Restart=always

[Install]
WantedBy=default.target</pre>
          <p>Enable and start: <code>systemctl --user enable --now aether-bridge.service</code></p>
        </div>
      </details>

      <details style="margin-top:8px;background:rgba(255,255,255,0.02);border:1px solid var(--brd);border-radius:8px;padding:10px 14px">
        <summary style="cursor:pointer;font-weight:600;font-size:12px;color:var(--tx)">ℹ️ Browser Compatibility & Limitations</summary>
        <div style="font-size:11px;color:var(--mu);line-height:1.6;margin-top:10px">
          <ul style="margin:4px 0 0 20px">
            <li><b>Chromium / Zen Browser:</b> Fully supported. If prompted for "Local Network Access", allow it.</li>
            <li><b>Brave:</b> If Brave Shields blocks loopback connections, disable "Block fingerprinting" or allow localhost in Shields for Aether Codex.</li>
            <li><b>Safari:</b> Mixed-content security policies may block plain HTTP loopback if accessing via HTTPS. Run Aether Codex locally or via development origins.</li>
          </ul>
        </div>
      </details>
    </div>
  `;

  // Attach event handlers
  const urlInp = container.querySelector('#ani-bridge-url');
  const testBtn = container.querySelector('#ani-test-btn');
  const tokenInp = container.querySelector('#ani-token');
  const toggleTokenBtn = container.querySelector('#ani-toggle-token-btn');
  const copyTokenBtn = container.querySelector('#ani-copy-token-btn');
  const regenTokenBtn = container.querySelector('#ani-regen-token-btn');
  const downloadBtn = container.querySelector('#ani-download-btn');

  const playerSel = container.querySelector('#ani-player');
  const qualitySel = container.querySelector('#ani-quality');
  const audioSel = container.querySelector('#ani-audio');
  const searchTitleSel = container.querySelector('#ani-search-title');
  const autoSelectSel = container.querySelector('#ani-autoselect');
  const epModeSel = container.querySelector('#ani-ep-mode');

  function update() {
    const updated = {
      bridgeUrl: urlInp.value.trim(),
      token: tokenInp.value.trim(),
      player: playerSel.value,
      quality: qualitySel.value,
      audio: audioSel.value,
      searchTitle: searchTitleSel.value,
      autoSelect: autoSelectSel.value === 'true',
      episodeMode: epModeSel.value,
    };
    activeSettings = { ...activeSettings, ...updated };
    if (typeof saveFn === 'function') {
      saveFn(updated);
    }
  }

  urlInp.onchange = update;
  playerSel.onchange = update;
  qualitySel.onchange = update;
  audioSel.onchange = update;
  searchTitleSel.onchange = update;
  autoSelectSel.onchange = update;
  epModeSel.onchange = update;

  // Toggle token visibility
  toggleTokenBtn.onclick = () => {
    tokenInp.type = tokenInp.type === 'password' ? 'text' : 'password';
  };

  // Copy token
  copyTokenBtn.onclick = () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tokenInp.value);
      toast('✓ Token copied to clipboard', '#4ade80');
    } else {
      tokenInp.select();
      document.execCommand('copy');
      toast('✓ Token copied', '#4ade80');
    }
  };

  // Regenerate token
  regenTokenBtn.onclick = () => {
    if (window.confirm('Regenerate authentication token? You will need to download and restart the bridge script.')) {
      const newToken = generateSecureToken();
      tokenInp.value = newToken;
      update();
      toast('✓ New token generated. Remember to download updated bridge!', '#fbbf24');
    }
  };

  // Download bridge
  downloadBtn.onclick = () => {
    downloadBridgeScript(activeSettings);
  };

  // Test connection
  testBtn.onclick = async () => {
    testBtn.disabled = true;
    testBtn.textContent = 'Testing...';
    const res = await testBridgeConnection(urlInp.value.trim(), tokenInp.value.trim());
    testBtn.disabled = false;
    testBtn.textContent = 'Test Connection';

    const indicator = container.querySelector('#bridge-status-indicator');
    if (res.ok) {
      indicator.innerHTML = `<span style="color:#4ade80">● Connected</span> <span style="font-size:10px;opacity:0.6">(v${res.version})</span>`;
      toast('✓ Bridge connection successful!', '#4ade80');
      // Re-render settings to reflect any newly discovered capabilities
      renderSettingsPanel(container, activeSettings, saveFn);
    } else {
      indicator.innerHTML = `<span style="color:#f87171">● Disconnected</span>`;
      toast(`Bridge error: ${res.error}`, '#fb7185');
    }
  };

  // Run a single test on panel open (without repeated background polling)
  if (lastConnectionStatus === null) {
    testBridgeConnection(settings.bridgeUrl, settings.token).then(res => {
      const indicator = container.querySelector('#bridge-status-indicator');
      if (!indicator) return;
      if (res.ok) {
        indicator.innerHTML = `<span style="color:#4ade80">● Connected</span> <span style="font-size:10px;opacity:0.6">(v${res.version})</span>`;
      } else {
        indicator.innerHTML = `<span style="color:#f87171">● Disconnected</span>`;
      }
    });
  }
}

// ── Plugin Lifecycle: init & destroy ─────────────────────────────────
export function init(settings) {
  activeSettings = { ...defaultSettings, ...(settings || {}) };

  // Ensure token exists
  if (!activeSettings.token) {
    activeSettings.token = generateSecureToken();
    if (typeof window.AetherPlugins?.savePluginSettings === 'function') {
      window.AetherPlugins.savePluginSettings(id, { token: activeSettings.token });
    }
  }

  // Delegated click listener on anime cards
  if (!delegatedClickListener) {
    delegatedClickListener = (e) => {
      const btn = e.target.closest('.m-act-ani-launcher, [data-action="ani-launcher"]');
      if (!btn) return;

      e.preventDefault();
      e.stopPropagation();

      const entryId = btn.dataset.id || btn.closest('.m-card')?.id?.replace('row-', '');
      if (!entryId) return;

      const entry = (window.DATA || []).find(x => x.id === entryId);
      if (!entry) return;

      launchAnime(entry);
    };

    document.addEventListener('click', delegatedClickListener, true);
  }
}

export function destroy() {
  if (delegatedClickListener) {
    document.removeEventListener('click', delegatedClickListener, true);
    delegatedClickListener = null;
  }
  lastTestedCapabilities = null;
  lastConnectionStatus = null;
}

export function onSettingsChange(newSettings) {
  activeSettings = { ...activeSettings, ...(newSettings || {}) };
}

export default {
  id,
  name,
  description,
  defaultSettings,
  settingsSchema,
  init,
  destroy,
  onSettingsChange,
  launchAnime,
  testBridgeConnection,
  downloadBridgeScript,
  renderSettingsPanel,
  isSupportedPlatform,
};
