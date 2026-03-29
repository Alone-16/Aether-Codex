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

// ── URLs that are allowed to load inside the app window ──
// Google OAuth + accounts pages must stay inside so the redirect flow works
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
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!isAllowedInternal(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // ── New-window handler ──
  // Google OAuth opens accounts.google.com in a new window — allow it inside Electron.
  // Everything else opens in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedInternal(url)) {
      // Open OAuth / Google pages inside a child BrowserWindow
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

      authWin.loadURL(url);

      // When Google redirects back to our app (the ?code= redirect),
      // hand it off to the main window and close the auth popup.
      authWin.webContents.on('will-navigate', (e2, redirectUrl) => {
        if (redirectUrl.startsWith('https://alone-16.github.io/')) {
          e2.preventDefault();
          mainWindow.loadURL(redirectUrl);
          authWin.close();
        }
      });

      // Also catch did-navigate (some OAuth flows use this instead)
      authWin.webContents.on('did-navigate', (e2, redirectUrl) => {
        if (redirectUrl.startsWith('https://alone-16.github.io/')) {
          mainWindow.loadURL(redirectUrl);
          authWin.close();
        }
      });

      return { action: 'deny' }; // we handle it above
    }

    // Non-Google links → system browser
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
