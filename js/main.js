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

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

const APP_URL   = 'https://alone-16.github.io/Aether-Codex/';
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

let mainWindow = null;
let miniWindow = null;
let tray       = null;
let isQuitting = false;

// ── Auto-start ──
function setAutoStart(enable) {
  app.setLoginItemSettings({ openAtLogin: enable, path: process.execPath, args: ['--hidden'] });
}
function isAutoStartEnabled() { return app.getLoginItemSettings().openAtLogin; }

// ── OAuth popup — opened by IPC from renderer via preload bridge ──
function openOAuthPopup(oauthUrl) {
  const authWin = new BrowserWindow({
    width: 520, height: 700,
    parent: mainWindow,
    modal: false,
    show: true,
    title: 'Sign in with Google',
    backgroundColor: '#ffffff',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  authWin.webContents.setUserAgent(CHROME_UA);
  authWin.loadURL(oauthUrl);
  authWin.setMenuBarVisibility(false);

  let handled = false;

  function tryHandle(url, canPrevent, e) {
    if (handled) return;
    if (!url || !url.startsWith('https://alone-16.github.io/')) return;
    handled = true;
    if (canPrevent && e) e.preventDefault();

    try {
      const u     = new URL(url);
      const code  = u.searchParams.get('code');
      const state = u.searchParams.get('state');
      const error = u.searchParams.get('error');
      mainWindow.webContents.send('oauth-result', error ? { error } : { code, state });
    } catch(_) {
      mainWindow.webContents.send('oauth-result', { error: 'parse_error' });
    }

    setTimeout(() => { if (!authWin.isDestroyed()) authWin.close(); }, 400);
  }

  authWin.webContents.on('will-navigate', (e, u) => tryHandle(u, true, e));
  authWin.webContents.on('will-redirect', (e, u) => tryHandle(u, true, e));
  authWin.webContents.on('did-navigate',  (e, u) => tryHandle(u, false));

  authWin.on('closed', () => {
    if (!handled) mainWindow.webContents.send('oauth-result', { error: 'popup_closed' });
  });
}

ipcMain.on('open-oauth', (_, url) => openOAuthPopup(url));

// ── Main window ──
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820,
    minWidth: 900, minHeight: 600,
    show: false,
    backgroundColor: '#070d0b',
    title: 'The Aether Codex',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload:          path.join(__dirname, 'preload.js'),  // <-- bridge
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

  // Block external links — open in browser instead
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── Mini window ──
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

// ── Tray ──
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

ipcMain.on('mini:hide',      () => miniWindow && !miniWindow.isDestroyed() && miniWindow.hide());
ipcMain.on('mini:open-main', () => { miniWindow && miniWindow.hide(); toggleMain(); });

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
