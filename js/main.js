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

// ── Single instance lock ──
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

// ── Your GitHub Pages URL ──
const APP_URL = 'https://alone-16.github.io/Aether-Codex/';

// ── Spoof a real Chrome user-agent so Google OAuth doesn't reject Electron ──
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── URLs that are allowed to load inside the app window ──
const ALLOWED_INTERNAL = [
  'https://alone-16.github.io/',
  'https://accounts.google.com/',
  'https://oauth2.googleapis.com/',
  'https://www.googleapis.com/',
];

function isAllowedInternal(url) {
  return ALLOWED_INTERNAL.some(prefix => url.startsWith(prefix));
}

let mainWindow = null;
let miniWindow = null;
let tray       = null;
let isQuitting = false;

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
//  MAIN WINDOW
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
    icon:            path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      spellcheck:       true,
    },
  });

  // ── Spoof user-agent so Google OAuth accepts the request ──
  mainWindow.webContents.setUserAgent(CHROME_UA);

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

  // ── Navigation guard ──
  // Allow: your app + all Google OAuth/API pages (needed for Drive login flow)
  // Block: everything else → open in system browser
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!isAllowedInternal(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // ── Also catch HTTP 301/302 redirects in the main window ──
  // Google redirects back to alone-16.github.io after Allow — let it through
  mainWindow.webContents.on('will-redirect', (e, url) => {
    if (!isAllowedInternal(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // ── New-window handler ──
  // Any popup Google opens (e.g. account picker) → open inside Electron child window
  // Everything else → system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedInternal(url)) {
      const authWin = new BrowserWindow({
        width: 520,
        height: 660,
        parent: mainWindow,
        modal: false,
        show: true,
        backgroundColor: '#ffffff',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      // Same Chrome UA spoof for the popup
      authWin.webContents.setUserAgent(CHROME_UA);
      authWin.loadURL(url);

      let handled = false;
      function handleRedirect(e2, redirectUrl) {
        if (handled) return;
        if (redirectUrl.startsWith('https://alone-16.github.io/')) {
          handled = true;
          if (e2 && e2.preventDefault) e2.preventDefault();
          mainWindow.show();
          mainWindow.focus();
          mainWindow.loadURL(redirectUrl);
          setTimeout(() => { if (!authWin.isDestroyed()) authWin.close(); }, 500);
        }
      }

      authWin.webContents.on('will-navigate',  (e2, u) => handleRedirect(e2, u));
      authWin.webContents.on('will-redirect',  (e2, u) => handleRedirect(e2, u));
      authWin.webContents.on('did-navigate',   (e2, u) => handleRedirect(null, u));

      return { action: 'deny' };
    }

    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ═══════════════════════════════════════════════════════
//  MINI WINDOW
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
    icon:            path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration:  true,
      contextIsolation: false,
    },
  });

  miniWindow.loadFile(path.join(__dirname, 'mini.html'));

  miniWindow.on('blur', () => {
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
    { label: 'Open App',        click: toggleMain, accelerator: 'CommandOrControl+Alt+Space' },
    { label: 'Quick Clipboard', click: toggleMini, accelerator: 'CommandOrControl+Alt+N'     },
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
  tray = new Tray(path.join(__dirname, 'icon.ico'));
  tray.setToolTip('The Aether Codex  •  Ctrl+Alt+Space');
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

function toggleMini() {
  if (!miniWindow || miniWindow.isDestroyed()) return;
  if (miniWindow.isVisible()) {
    miniWindow.hide();
  } else {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    miniWindow.setPosition(width - 450, height - 390);
    miniWindow.show();
    miniWindow.focus();
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
//  APP LIFECYCLE
// ═══════════════════════════════════════════════════════
app.whenReady().then(() => {
  if (app.isPackaged && !isAutoStartEnabled()) {
    setAutoStart(true);
  }

  createMainWindow();
  createMiniWindow();
  createTray();

  globalShortcut.register('CommandOrControl+Alt+Space', toggleMain);
  globalShortcut.register('CommandOrControl+Alt+N',     toggleMini);
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show(); mainWindow.focus();
  }
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('activate', () => mainWindow && (mainWindow.show(), mainWindow.focus()));
app.on('will-quit', () => globalShortcut.unregisterAll());
