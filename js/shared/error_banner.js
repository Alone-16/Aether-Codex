// ═══════════════════════════════════════════════════════════════════
//  js/shared/error_banner.js — Global Error & Offline Banner UI
// ═══════════════════════════════════════════════════════════════════

let bannerEl = null;

function ensureBanner() {
  if (bannerEl) return bannerEl;
  bannerEl = document.createElement('div');
  bannerEl.id = 'global-error-banner';
  bannerEl.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10000;
    background: #dc2626;
    color: #ffffff;
    font-family: var(--fd, sans-serif);
    font-size: 13px;
    font-weight: 600;
    padding: 8px 16px;
    text-align: center;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    display: none;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: transform 0.2s ease-in-out;
  `;
  document.body.appendChild(bannerEl);
  return bannerEl;
}

export function showErrorBanner(msg = '⚠ Unable to reach Cloud API. Retrying...') {
  const el = ensureBanner();
  el.innerHTML = `<span>${msg}</span> <button onclick="window.hideErrorBanner()" style="background:rgba(255,255,255,0.2);border:none;color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer">Dismiss</button>`;
  el.style.display = 'flex';
}

export function hideErrorBanner() {
  if (bannerEl) bannerEl.style.display = 'none';
}

if (typeof window !== 'undefined') {
  window.showErrorBanner = showErrorBanner;
  window.hideErrorBanner = hideErrorBanner;
}
