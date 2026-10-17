// ═══════════════════════════════════════════════════════════════════
//  js/plugins/registry.js — Minimal Plugin Registry for Aether Codex
// ═══════════════════════════════════════════════════════════════════

const STORAGE_PREFIX = 'aether.plugins.';
const registeredPlugins = new Map();
const loadedInstances = new Map();
const listeners = new Set();

/**
 * Register a plugin definition.
 * Plugins define metadata, defaults, schema, and an async loader for their implementation.
 */
export function registerPlugin(def) {
  if (!def || !def.id) throw new Error('Invalid plugin definition: missing id');
  registeredPlugins.set(def.id, def);
}

/**
 * Storage key helper for a plugin id.
 */
export function getPluginStorageKey(id) {
  return `${STORAGE_PREFIX}${id}`;
}

/**
 * Read plugin state from localStorage.
 * Guaranteed to stay local on device; never sent to D1 or Cloudflare Worker.
 */
export function getStoredPluginData(id) {
  try {
    const raw = localStorage.getItem(getPluginStorageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch (e) {
    console.warn(`[Plugins] Failed to read localStorage for plugin ${id}:`, e);
    return null;
  }
}

/**
 * Save plugin state to localStorage.
 */
export function saveStoredPluginData(id, data) {
  try {
    localStorage.setItem(getPluginStorageKey(id), JSON.stringify(data));
  } catch (e) {
    console.warn(`[Plugins] Failed to write localStorage for plugin ${id}:`, e);
  }
}

/**
 * Check if a plugin is currently enabled.
 */
export function isPluginEnabled(id) {
  const data = getStoredPluginData(id);
  if (data && typeof data.enabled === 'boolean') {
    return data.enabled;
  }
  const def = registeredPlugins.get(id);
  return !!def?.defaultEnabled;
}

/**
 * Retrieve effective settings for a plugin (defaults + user overrides).
 */
export function getPluginSettings(id) {
  const def = registeredPlugins.get(id);
  const defaults = def?.defaultSettings || {};
  const stored = getStoredPluginData(id)?.settings || {};
  return { ...defaults, ...stored };
}

/**
 * Save user settings for a plugin.
 */
export function savePluginSettings(id, newSettings) {
  const cur = getStoredPluginData(id) || { enabled: isPluginEnabled(id), settings: {} };
  cur.settings = { ...(cur.settings || {}), ...newSettings };
  saveStoredPluginData(id, cur);

  // Notify active instance if loaded
  const instance = loadedInstances.get(id);
  if (instance && typeof instance.onSettingsChange === 'function') {
    try {
      instance.onSettingsChange(getPluginSettings(id));
    } catch (e) {
      console.warn(`[Plugins] onSettingsChange error in ${id}:`, e);
    }
  }

  notifyListeners(id, 'settings');
}

/**
 * Enable or disable a plugin.
 * Dynamically loads the plugin module ONLY when enabling.
 */
export async function setPluginEnabled(id, enabled) {
  const def = registeredPlugins.get(id);
  if (!def) throw new Error(`Plugin not found: ${id}`);

  const cur = getStoredPluginData(id) || { enabled: false, settings: {} };
  cur.enabled = !!enabled;
  saveStoredPluginData(id, cur);

  if (enabled) {
    try {
      const module = await def.loader();
      const instance = module.default || module;
      loadedInstances.set(id, instance);
      if (typeof instance.init === 'function') {
        await instance.init(getPluginSettings(id));
      }
    } catch (e) {
      console.error(`[Plugins] Failed to load/init plugin ${id}:`, e);
    }
  } else {
    const instance = loadedInstances.get(id);
    if (instance) {
      try {
        if (typeof instance.destroy === 'function') {
          await instance.destroy();
        }
      } catch (e) {
        console.warn(`[Plugins] Error destroying plugin ${id}:`, e);
      }
      loadedInstances.delete(id);
    }
  }

  notifyListeners(id, 'toggle');

  // Trigger app re-render if current section is media or settings
  if (typeof window.render === 'function') {
    window.render();
  }
}

/**
 * Subscribe to plugin changes.
 */
export function onPluginChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notifyListeners(id, type) {
  listeners.forEach(fn => {
    try {
      fn(id, type);
    } catch (e) {
      console.error('[Plugins] Listener error:', e);
    }
  });
}

/**
 * Get registered plugin definition.
 */
export function getPlugin(id) {
  return registeredPlugins.get(id);
}

/**
 * Get all registered plugin definitions.
 */
export function getAllPlugins() {
  return Array.from(registeredPlugins.values());
}

/**
 * Initialize all plugins that are enabled in localStorage.
 * Called once during application boot.
 * Plugins that are disabled will NOT have their modules imported or loaded.
 */
export async function initPlugins() {
  for (const [id, def] of registeredPlugins.entries()) {
    if (isPluginEnabled(id)) {
      try {
        const module = await def.loader();
        const instance = module.default || module;
        loadedInstances.set(id, instance);
        if (typeof instance.init === 'function') {
          await instance.init(getPluginSettings(id));
        }
      } catch (e) {
        console.error(`[Plugins] Boot initialization failed for ${id}:`, e);
      }
    }
  }
}

// ── Register Built-in Optional Plugins ──────────────────────────────
registerPlugin({
  id: 'aniLauncher',
  name: 'ani-cli Launcher',
  description: 'Launch anime directly in a local terminal using ani-cli',
  defaultEnabled: false,
  loader: () => import('./ani-launcher.js'),
  defaultSettings: {
    bridgeUrl: 'http://127.0.0.1:47619',
    token: null, // Generated on first enablement or access
    player: 'mpv',
    quality: 'best',
    audio: 'sub',
    searchTitle: 'english',
    autoSelect: true,
    episodeMode: 'next',
  },
  settingsSchema: {
    bridgeUrl: {
      type: 'string',
      label: 'Bridge URL',
      default: 'http://127.0.0.1:47619',
    },
    token: {
      type: 'token',
      label: 'Authentication Token',
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
        { value: 'sub', label: 'Sub (Japanese)' },
        { value: 'dub', label: 'Dub (English)' },
      ],
      default: 'sub',
    },
    searchTitle: {
      type: 'select',
      label: 'Search Title',
      options: [
        { value: 'english', label: 'English Title' },
        { value: 'romaji', label: 'Romaji Title' },
        { value: 'native', label: 'Native Title' },
      ],
      default: 'english',
    },
    autoSelect: {
      type: 'boolean',
      label: 'Auto-select first result (-S 1)',
      default: true,
    },
    episodeMode: {
      type: 'select',
      label: 'Episode Mode',
      options: [
        { value: 'none', label: 'None (select or resume in terminal)' },
        { value: 'next', label: 'Start at next unwatched episode' },
      ],
      default: 'next',
    },
  },
});

/**
 * Determine if current device is a desktop/laptop environment (PC, Mac, Linux).
 * Terminal plugins require a local desktop shell and are disabled on Android and mobile.
 */
export function isDesktopEnvironment() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return true;
  const ua = navigator.userAgent || '';
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  const isIPadOS = (navigator.maxTouchPoints || 0) > 2 && /Macintosh/i.test(ua);
  const isSmallScreen = (window.innerWidth || 0) > 0 && window.innerWidth < 768;
  return !isMobileUA && !isIPadOS && !isSmallScreen;
}

// Expose on window for easy access across the app
if (typeof window !== 'undefined') {
  window.AetherPlugins = {
    isPluginEnabled,
    setPluginEnabled,
    getPluginSettings,
    savePluginSettings,
    getPlugin,
    getAllPlugins,
    initPlugins,
    onPluginChange,
    isDesktopEnvironment,
  };
}

