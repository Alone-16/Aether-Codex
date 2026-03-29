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

const APP_URL     = 'https://alone-16.github.io/Aether-Codex/';
const CHROME_UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let mainWindow = null;
let miniWindow = null;
let tray       = null;
let isQuitting = false;

// ═══════════════════════════════════════════════════════
//  AUTO-START
// ═══════════════════════════════════════════════════════
function setAutoStart(enable) {
  app.setLoginItemSettings({ openAtLogin: enable, path: process.execPath, args: ['--hidden'] });
}
function isAutoStartEnabled() { return app.getLoginItemSettings().openAtLogin; }

// ═══════════════════════════════════════════════════════
//  OAUTH POPUP — opens Google login in a child window,
//  intercepts the redirect, and sends just the code+state
//  back to the main window via IPC (no full app reload).
// ═══════════════════════════════════════════════════════
function openOAuthPopup(oauthUrl) {
  const authWin = new BrowserWindow({
    width:           520,
    height:          680,
    parent:          mainWindow,
    modal:           false,
    show:            true,
    title:           'Sign in with Google',
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
    },
  });

  authWin.webContents.setUserAgent(CHROME_UA);
  authWin.loadURL(oauthUrl);
  authWin.setMenuBarVisibility(false);

  let handled = false;

  function tryHandle(url, preventDefault) {
    if (handled) return;
    if (!url || !url.startsWith('https://alone-16.github.io/')) return;

    handled = true;
    if (preventDefault) preventDefault();

    // Parse the code and state out of the redirect URL
    try {
      const u      = new URL(url);
      const code   = u.searchParams.get('code');
      const state  = u.searchParams.get('state');
      const error  = u.searchParams.get('error');

      if (error) {
        mainWindow.webContents.send('oauth-result', { error });
      } else if (code) {
        mainWindow.webContents.send('oauth-result', { code, state });
      }
    } catch(e) {
      mainWindow.webContents.send('oauth-result', { error: 'parse_error' });
    }

    setTimeout(() => { if (!authWin.isDestroyed()) authWin.close(); }, 300);
  }

  authWin.webContents.on('will-navigate',  (e, u) => tryHandle(u, () => e.preventDefault()));
  authWin.webContents.on('will-redirect',  (e, u) => tryHandle(u, () => e.preventDefault()));
  authWin.webContents.on('did-navigate',   (_, u) => tryHandle(u, null));

  // If user closes popup manually
  authWin.on('closed', () => {
    if (!handled) mainWindow.webContents.send('oauth-result', { error: 'popup_closed' });
  });
}

// IPC: renderer asks main to open the OAuth popup
ipcMain.on('open-oauth', (_, oauthUrl) => openOAuthPopup(oauthUrl));

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
      contextIsolation: false,   // needed so renderer can use ipcRenderer
      spellcheck:       true,
    },
  });

  mainWindow.webContents.setUserAgent(CHROME_UA);
  mainWindow.loadURL(APP_URL);

  mainWindow.once('ready-to-show', () => {
    if (!process.argv.includes('--hidden')) { mainWindow.show(); mainWindow.focus(); }
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });

  // Block external navigation (but allow app + google domains)
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const allowed = [
      'https://alone-16.github.io/',
      'https://accounts.google.com/',
      'https://oauth2.googleapis.com/',
      'https://www.googleapis.com/',
    ];
    if (!allowed.some(p => url.startsWith(p))) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });

  // All new windows → system browser (OAuth is handled via IPC popup now)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
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
    width: 430, height: 360,
    x: width - 450, y: height - 390,
    frame: false, alwaysOnTop: true, show: false,
    skipTaskbar: true, resizable: true,
    backgroundColor: '#070d0b',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  miniWindow.loadFile(path.join(__dirname, 'mini.html'));
  miniWindow.on('blur', () => { if (!miniWindow.isDestroyed()) miniWindow.hide(); });
  miniWindow.on('close', (e) => { if (!isQuitting) { e.preventDefault(); miniWindow.hide(); } });
}

// ═══════════════════════════════════════════════════════
//  TRAY
// ═══════════════════════════════════════════════════════
function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: 'The Aether Codex', enabled: false },
    { type: 'separator' },
    { label: 'Open App',        click: toggleMain, accelerator: 'CommandOrControl+Alt+Space' },
    { label: 'Quick Clipboard', click: toggleMini, accelerator: 'CommandOrControl+Alt+N' },
    { type: 'separator' },
    {
      label: `Start with Windows: ${isAutoStartEnabled() ? 'ON ✓' : 'OFF'}`,
      click() { setAutoStart(!isAutoStartEnabled()); tray.setContextMenu(buildTrayMenu()); },
    },
    { label: 'Reload App', click: () => mainWindow && !mainWindow.isDestroyed() && mainWindow.reload() },
    { type: 'separator' },
    { label: 'Quit', click: quitApp },
  ]);
}

function createTray() {
  tray = new Tray(path.join(__dirname, 'icon.ico'));
  tray.setToolTip('The Aether Codex  •  Ctrl+Alt+Space');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', toggleMain);
  tray.on('double-click', toggleMain);
}

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
    miniWindow.show(); miniWindow.focus();
  }
}

function quitApp() {
  isQuitting = true;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
  if (miniWindow  && !miniWindow.isDestroyed()) miniWindow.destroy();
  app.quit();
}

// ═══════════════════════════════════════════════════════
//  IPC
// ═══════════════════════════════════════════════════════
ipcMain.on('mini:hide',      () => miniWindow && !miniWindow.isDestroyed() && miniWindow.hide());
ipcMain.on('mini:open-main', () => { miniWindow && miniWindow.hide(); toggleMain(); });

// ═══════════════════════════════════════════════════════
//  APP LIFECYCLE
// ═══════════════════════════════════════════════════════
app.whenReady().then(() => {
  if (app.isPackaged && !isAutoStartEnabled()) setAutoStart(true);
  createMainWindow();
  createMiniWindow();
  createTray();
  globalShortcut.register('CommandOrControl+Alt+Space', toggleMain);
  globalShortcut.register('CommandOrControl+Alt+N',     toggleMini);
});

app.on('second-instance', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus(); }
});

app.on('window-all-closed', (e) => e.preventDefault());
app.on('activate', () => mainWindow && (mainWindow.show(), mainWindow.focus()));
app.on('will-quit', () => globalShortcut.unregisterAll());
