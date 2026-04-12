'use strict';

export function _b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

export function _unb64(s) {
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

export async function _deriveKey(password, salt) {
  const km = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256' },
    km,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
}

export let VAULT_CRYPTO_KEY  = null;
export let VAULT_CRYPTO_SALT = null;
export let VAULT_UNLOCKED    = false;

export function setVaultCryptoKey(v)  { VAULT_CRYPTO_KEY = v; }
export function setVaultCryptoSalt(v) { VAULT_CRYPTO_SALT = v; }
export function setVaultUnlocked(v)   { VAULT_UNLOCKED = v; }

/** Clears in-memory vault crypto only (key, salt, unlocked). */
export function lockVaultCrypto() {
  VAULT_CRYPTO_KEY  = null;
  VAULT_CRYPTO_SALT = null;
  VAULT_UNLOCKED    = false;
}
