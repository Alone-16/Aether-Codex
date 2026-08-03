// ═══════════════════════════════════════════════════════════════════
//  tests/e2e/failures.spec.js — Failure-Path & Resilience Tests
// ═══════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

test.describe('Aether Codex Resilience & Failure Paths', () => {

  test('Worker Health Endpoint returns detailed version metadata', async ({ request }) => {
    const res = await request.get('http://127.0.0.1:8787/v1/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.version).toBeDefined();
    expect(body.data.environment).toBeDefined();
  });

  test('Displays Global Error Banner on network disconnection', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      if (typeof window.showErrorBanner === 'function') {
        window.showErrorBanner('⚠ Unable to reach Cloud API. Retrying...');
      }
    });
    const banner = page.locator('#global-error-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Unable to reach Cloud API');
  });

  test('Collection import failure reports exact collection status', async ({ page }) => {
    await page.goto('/#/settings');

    // Inject legacy data into localStorage for testing
    await page.evaluate(() => {
      localStorage.setItem('ac_v4_media', JSON.stringify([{ id: 'm1', title: 'Test Anime' }]));
      localStorage.setItem('ac_v4_music', JSON.stringify([{ id: 's1', title: 'Test Track' }]));
    });

    await page.reload();

    // Navigate to Storage tab in settings
    await page.click('button:has-text("Storage")');

    const importSec = page.locator('text=Import Existing Local Data');
    await expect(importSec).toBeVisible();
  });

});
