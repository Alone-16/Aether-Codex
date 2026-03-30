'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  ipcMain,
  screen,
  shell,
} = require('electron');

const path = require('path');
const fs   = require('fs');

// ── Single instance lock — only one copy ever runs ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

// ── Your GitHub Pages URL ──
const APP_URL = 'https://alone-16.github.io/Aether-Codex/';

let mainWindow = null;
let miniWindow = null;
let tray       = null;
let isQuitting = false;

// FIX (Bug 3): blur race-condition guard for mini window
let miniJustShown = false;

// ═══════════════════════════════════════════════════════
//  SHORTCUT CONFIG — persisted to userData/config.json
//  Users can customise the last key; Ctrl+Alt is fixed.
// ═══════════════════════════════════════════════════════
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

const DEFAULT_CONFIG = {
  mainKey: 'A',   // Ctrl+Alt+A  (Space conflicts with Windows IME — Bug 2 fix)
  miniKey: 'N',   // Ctrl+Alt+N
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw  = fs.readFileSync(CONFIG_PATH, 'utf8');
      const data = JSON.parse(raw);
      return {
        mainKey: (data.mainKey || DEFAULT_CONFIG.mainKey).toUpperCase().charAt(0),
        miniKey: (data.miniKey || DEFAULT_CONFIG.miniKey).toUpperCase().charAt(0),
      };
    }
  } catch (e) {
    console.warn('[Config] Failed to load config, using defaults:', e.message);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('[Config] Failed to save config:', e.message);
  }
}

let config = loadConfig();

// ── Build the accelerator string from a single key letter ──
function accel(key) {
  return `CommandOrControl+Alt+${key}`;
}

// ── Re-register both global shortcuts (called on startup & after any change) ──
function registerShortcuts() {
  globalShortcut.unregisterAll();

  const ok1 = globalShortcut.register(accel(config.mainKey), toggleMain);
  const ok2 = globalShortcut.register(accel(config.miniKey), toggleMini);

  // FIX (Bug 1): log registration results so failures are visible
  console.log(`[Shortcuts] Ctrl+Alt+${config.mainKey} (main):`, ok1 ? 'OK' : 'FAILED — key may be taken by another app');
  console.log(`[Shortcuts] Ctrl+Alt+${config.miniKey} (mini):`, ok2 ? 'OK' : 'FAILED — key may be taken by another app');

  // Refresh tray menu labels to match current shortcuts
  if (tray) tray.setContextMenu(buildTrayMenu());
  if (tray) tray.setToolTip(`The Aether Codex  •  Ctrl+Alt+${config.mainKey}`);
}

// ═══════════════════════════════════════════════════════
//  AUTO-START ON WINDOWS LOGIN
// ═══════════════════════════════════════════════════════
function setAutoStart(enable) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: process.execPath,
    args: ['--hidden'],
  });
}

function isAutoStartEnabled() {
  return app.getLoginItemSettings().openAtLogin;
}

// ═══════════════════════════════════════════════════════
//  MAIN WINDOW — full Aether Codex app
// ═══════════════════════════════════════════════════════
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width:           1280,
    height:          820,
    minWidth:        900,
    minHeight:       600,
    show:            false,
    backgroundColor: '#070d0b',
    title:           'The Aether Codex',
    icon:            path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      spellcheck:       true,
      preload:          path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Hide to tray instead of closing
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  // Open all external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ═══════════════════════════════════════════════════════
//  MINI WINDOW — frameless clipboard scratchpad
// ═══════════════════════════════════════════════════════
function createMiniWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  miniWindow = new BrowserWindow({
    width:           430,
    height:          360,
    x:               width  - 450,
    y:               height - 390,
    frame:           false,
    alwaysOnTop:     true,
    show:            false,
    skipTaskbar:     true,
    resizable:       true,
    backgroundColor: '#070d0b',
    icon:            path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration:  true,
      contextIsolation: false,
    },
  });

  miniWindow.loadFile(path.join(__dirname, 'mini.html'));

  // FIX (Bug 3): Ignore blur events fired during the show/focus transition.
  // Without this, the OS fires blur immediately after show(), hiding the
  // window before the user ever sees it.
  miniWindow.on('blur', () => {
    if (miniJustShown) return;
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.hide();
  });

  miniWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); miniWindow.hide(); }
  });
}

// ═══════════════════════════════════════════════════════
//  SYSTEM TRAY
// ═══════════════════════════════════════════════════════
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'The Aether Codex', enabled: false },
    { type: 'separator' },
    {
      label:       `Open App  (Ctrl+Alt+${config.mainKey})`,
      click:       toggleMain,
      accelerator: accel(config.mainKey),
    },
    {
      label:       `Quick Clipboard  (Ctrl+Alt+${config.miniKey})`,
      click:       toggleMini,
      accelerator: accel(config.miniKey),
    },
    { type: 'separator' },
    {
      label: `Start with Windows: ${isAutoStartEnabled() ? 'ON ✓' : 'OFF'}`,
      click() {
        setAutoStart(!isAutoStartEnabled());
        tray.setContextMenu(buildTrayMenu());
      },
    },
    {
      label: 'Reload App',
      click: () => mainWindow && !mainWindow.isDestroyed() && mainWindow.reload(),
    },
    { type: 'separator' },
    { label: 'Quit', click: quitApp },
  ]);
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.png'));
  tray.setToolTip(`The Aether Codex  •  Ctrl+Alt+${config.mainKey}`);
  tray.setContextMenu(buildTrayMenu());
  tray.on('click',        toggleMain);
  tray.on('double-click', toggleMain);
}

// ═══════════════════════════════════════════════════════
//  TOGGLE HELPERS
// ═══════════════════════════════════════════════════════
function toggleMain() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) mainWindow.hide();
  else { mainWindow.show(); mainWindow.focus(); }
}

// FIX (Bug 3): Set miniJustShown = true during show/focus so the blur
// handler ignores the spurious blur that fires during the transition.
function toggleMini() {
  if (!miniWindow || miniWindow.isDestroyed()) return;
  if (miniWindow.isVisible()) {
    miniWindow.hide();
  } else {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    miniWindow.setPosition(width - 450, height - 390);
    miniJustShown = true;
    miniWindow.show();
    miniWindow.focus();
    setTimeout(() => { miniJustShown = false; }, 300); // 300ms grace period
  }
}

function quitApp() {
  isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  if (miniWindow  && !miniWindow.isDestroyed())  miniWindow.destroy();
  app.quit();
}

// ═══════════════════════════════════════════════════════
//  IPC — from mini.html
// ═══════════════════════════════════════════════════════
ipcMain.on('mini:hide',      () => miniWindow && !miniWindow.isDestroyed() && miniWindow.hide());
ipcMain.on('mini:open-main', () => { miniWindow && miniWindow.hide(); toggleMain(); });

// ═══════════════════════════════════════════════════════
//  IPC — shortcut settings (called from settings.js via preload)
// ═══════════════════════════════════════════════════════

// GET current shortcut keys → renderer can read them to populate UI
ipcMain.handle('shortcuts:get', () => ({
  mainKey: config.mainKey,
  miniKey: config.miniKey,
}));

// SET a new key for either 'main' or 'mini'
// payload: { type: 'main' | 'mini', key: 'A' }
ipcMain.handle('shortcuts:set', (_, { type, key }) => {
  // Validate: must be a single alphanumeric character
  const sanitised = String(key).toUpperCase().replace(/[^A-Z0-9]/g, '').charAt(0);
  if (!sanitised) {
    return { success: false, error: 'Invalid key — must be a single letter or digit.' };
  }

  // Prevent both shortcuts from using the same key
  if (type === 'main' && sanitised === config.miniKey) {
    return { success: false, error: `Key "${sanitised}" is already used for Quick Clipboard.` };
  }
  if (type === 'mini' && sanitised === config.mainKey) {
    return { success: false, error: `Key "${sanitised}" is already used for Open App.` };
  }

  // Apply
  if (type === 'main') config.mainKey = sanitised;
  if (type === 'mini') config.miniKey = sanitised;

  saveConfig(config);
  registerShortcuts();   // re-registers with the new key

  return { success: true, mainKey: config.mainKey, miniKey: config.miniKey };
});

// ═══════════════════════════════════════════════════════
//  APP LIFECYCLE
// ═══════════════════════════════════════════════════════
app.whenReady().then(() => {
  if (app.isPackaged && !isAutoStartEnabled()) {
    setAutoStart(true);
  }

  createMainWindow();
  createMiniWindow();
  createTray();

  registerShortcuts(); // uses config.mainKey / config.miniKey
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  }
});

// Keep alive when all windows are hidden (tray app)
app.on('window-all-closed', (e) => e.preventDefault());

// macOS dock click
app.on('activate', () => mainWindow && (mainWindow.show(), mainWindow.focus()));

app.on('will-quit', () => globalShortcut.unregisterAll());
