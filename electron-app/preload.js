'use strict';

// Preload runs in renderer context with access to Node/Electron APIs.
// It exposes a safe bridge on window.electronBridge for the web app to use.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronBridge', {
  isElectron: true,

  // Open Google OAuth popup and get back { code, state } or { error }
  openOAuth: (oauthUrl) => {
    return new Promise((resolve) => {
      ipcRenderer.once('oauth-result', (_, result) => resolve(result));
      ipcRenderer.send('open-oauth', oauthUrl);
    });
  },

  // Returns Promise<{ mainKey: string, miniKey: string }>
  getShortcuts: () => ipcRenderer.invoke('shortcuts:get'),

  // type: 'main' | 'mini',  key: single letter/digit e.g. 'A'
  // Returns Promise<{ success: boolean, mainKey?, miniKey?, error? }>
  setShortcut: (type, key) => ipcRenderer.invoke('shortcuts:set', { type, key }),
});
