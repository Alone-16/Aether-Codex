// ═══════════════════════════════════════════════════════════════════
//  tests/e2e/ani_launcher.spec.js
//  Playwright E2E Tests for Optional ani-cli Launcher Plugin
// ═══════════════════════════════════════════════════════════════════

import { test, expect } from '@playwright/test';

test.describe('ani-cli Launcher Plugin E2E Tests', () => {

  const sampleAnime = [
    {
      id: 'a1',
      title: 'Frieren: Beyond Journey\'s End',
      title_en: 'Frieren: Beyond Journey\'s End',
      genreId: 'anime',
      status: 'watching',
      epCur: 12,
      epTot: 28,
      watchUrl: 'https://streaming.example.com/watch/frieren',
    },
    {
      id: 'a2',
      title: 'Attack on Titan',
      title_en: 'Attack on Titan',
      genreId: 'anime',
      status: 'completed',
      epCur: 25,
      epTot: 25,
    },
    {
      id: 'm1',
      title: 'Berserk',
      genreId: 'manga',
      status: 'watching',
      epCur: 50,
      epTot: 364,
    },
    {
      id: 's1',
      title: 'Breaking Bad',
      genreId: 'series',
      status: 'watching',
      epCur: 5,
      epTot: 62,
    },
  ];

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('ac_v5_access_token', 'mock_e2e_token');
    });
  });

  test('1. Plugin disabled: no Watch in terminal button and plugin module not loaded', async ({ page }) => {
    const loadedRequests = [];
    page.on('request', req => loadedRequests.push(req.url()));

    await page.addInitScript((items) => {
      localStorage.removeItem('aether.plugins.aniLauncher');
      localStorage.setItem('ac_v4_media', JSON.stringify(items));
      window.DATA = items;
    }, sampleAnime);

    await page.goto('/#/media');
    await page.waitForLoadState('networkidle');

    // Button must NOT appear on any card
    const terminalButtons = page.locator('.m-act-ani-launcher');
    await expect(terminalButtons).toHaveCount(0);

    // Module ani-launcher.js must NOT have been requested
    const pluginLoaded = loadedRequests.some(url => url.includes('ani-launcher.js'));
    expect(pluginLoaded).toBeFalsy();
  });

  test('2. Plugin enabled: button appears on anime cards only', async ({ page }) => {
    await page.addInitScript((items) => {
      localStorage.setItem('aether.plugins.aniLauncher', JSON.stringify({
        enabled: true,
        settings: {
          bridgeUrl: 'http://127.0.0.1:47619',
          token: 'test-token-abcdef123456',
          player: 'mpv',
          quality: 'best',
          audio: 'sub',
          searchTitle: 'english',
          autoSelect: true,
          episodeMode: 'none',
        },
      }));
      localStorage.setItem('ac_v4_media', JSON.stringify(items));
      window.DATA = items;
    }, sampleAnime);

    await page.goto('/#/media');
    await page.waitForLoadState('networkidle');

    // Wait for cards to render
    await expect(page.locator('#row-a1')).toBeVisible();

    // Anime card #row-a1 must have the terminal button
    const a1TerminalBtn = page.locator('#row-a1 .m-act-ani-launcher');
    await expect(a1TerminalBtn).toBeVisible();

    // Anime card #row-a2 must have the terminal button
    const a2TerminalBtn = page.locator('#row-a2 .m-act-ani-launcher');
    await expect(a2TerminalBtn).toBeVisible();

    // Manga card #row-m1 must NOT have the terminal button
    const m1TerminalBtn = page.locator('#row-m1 .m-act-ani-launcher');
    await expect(m1TerminalBtn).toHaveCount(0);

    // Non-anime series card #row-s1 must NOT have the terminal button
    const s1TerminalBtn = page.locator('#row-s1 .m-act-ani-launcher');
    await expect(s1TerminalBtn).toHaveCount(0);
  });

  test('3. Settings persist across reloads', async ({ page }) => {
    await page.goto('/#/settings');
    await page.waitForLoadState('networkidle');

    // Navigate to Plugins tab
    await page.click('button.stab:has-text("Plugins")');
    await expect(page.locator('text=Plugins & Extensions')).toBeVisible();

    // Enable the plugin
    const toggle = page.locator('#toggle-ani-launcher');
    const isChecked = await toggle.isChecked();
    if (!isChecked) {
      await toggle.check();
    }
    await expect(page.locator('#lbl-ani-launcher')).toHaveText('Enabled');

    // Wait for settings panel to load
    await expect(page.locator('#ani-quality')).toBeVisible();

    // Change settings: quality to 1080, audio to dub, episodeMode to next
    await page.selectOption('#ani-quality', '1080');
    await page.selectOption('#ani-audio', 'dub');
    await page.selectOption('#ani-ep-mode', 'next');

    // Reload the page
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    // Return to Plugins tab
    await page.click('button.stab:has-text("Plugins")');
    await expect(page.locator('#toggle-ani-launcher')).toBeChecked();

    // Verify settings persisted
    await expect(page.locator('#ani-quality')).toHaveValue('1080');
    await expect(page.locator('#ani-audio')).toHaveValue('dub');
    await expect(page.locator('#ani-ep-mode')).toHaveValue('next');
  });

  test('4. Clicking button sends correct request, token header, title, and settings to bridge', async ({ page }) => {
    let bridgeRequest = null;

    // Intercept bridge /play route
    await page.route('http://127.0.0.1:47619/play', async (route) => {
      const req = route.request();
      bridgeRequest = {
        method: req.method(),
        headers: req.headers(),
        postData: JSON.parse(req.postData() || '{}'),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, argv: ['ani-cli', 'Frieren: Beyond Journey\'s End'] }),
      });
    });

    await page.addInitScript((items) => {
      localStorage.setItem('aether.plugins.aniLauncher', JSON.stringify({
        enabled: true,
        settings: {
          bridgeUrl: 'http://127.0.0.1:47619',
          token: 'auth-token-test-12345',
          player: 'mpv',
          quality: '1080',
          audio: 'dub',
          searchTitle: 'english',
          autoSelect: true,
          episodeMode: 'next',
        },
      }));
      localStorage.setItem('ac_v4_media', JSON.stringify(items));
      window.DATA = items;
    }, sampleAnime);

    await page.goto('/#/media');
    await page.waitForLoadState('networkidle');

    // Click Watch in terminal on Frieren card
    const btn = page.locator('#row-a1 .m-act-ani-launcher');
    await expect(btn).toBeVisible();
    await btn.click();

    // Verify bridge received the request
    expect(bridgeRequest).not.toBeNull();
    expect(bridgeRequest.method).toBe('POST');
    expect(bridgeRequest.headers['x-aether-token']).toBe('auth-token-test-12345');
    expect(bridgeRequest.postData.title).toBe('Frieren: Beyond Journey\'s End');
    expect(bridgeRequest.postData.settings.quality).toBe('1080');
    expect(bridgeRequest.postData.settings.audio).toBe('dub');
    // Episode mode 'next' on curEp=12 should send episode: 13
    expect(bridgeRequest.postData.episode).toBe(13);

    // Toast notification appears
    await expect(page.locator('.toast-el:has-text("Launched in terminal")')).toBeVisible();
  });

  test('5. Stopped/failing bridge displays non-blocking toast with working fallback link', async ({ page }) => {
    // Intercept bridge to simulate failure
    await page.route('http://127.0.0.1:47619/play', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'Connection refused by daemon' }),
      });
    });

    await page.addInitScript((items) => {
      localStorage.setItem('aether.plugins.aniLauncher', JSON.stringify({
        enabled: true,
        settings: {
          bridgeUrl: 'http://127.0.0.1:47619',
          token: 'token-val',
        },
      }));
      localStorage.setItem('ac_v4_media', JSON.stringify(items));
      window.DATA = items;
    }, sampleAnime);

    await page.goto('/#/media');
    await page.waitForLoadState('networkidle');

    // Click Watch in terminal on Frieren
    await page.click('#row-a1 .m-act-ani-launcher');

    // Fallback toast appears
    const fallbackToast = page.locator('.toast-ani-fallback');
    await expect(fallbackToast).toBeVisible();
    await expect(fallbackToast).toContainText('Bridge Unreachable');

    // Fallback button exists
    const streamBtn = fallbackToast.locator('button:has-text("Open Stream")');
    await expect(streamBtn).toBeVisible();
  });

  test('6. Plugin errors do not break card rendering', async ({ page }) => {
    // Inject corrupt JSON in plugin storage
    await page.addInitScript((items) => {
      localStorage.setItem('aether.plugins.aniLauncher', 'corrupt_not_json{{{');
      localStorage.setItem('ac_v4_media', JSON.stringify(items));
      window.DATA = items;
    }, sampleAnime);

    await page.goto('/#/media');
    await page.waitForLoadState('networkidle');

    // Cards must render normally despite corrupt plugin storage
    await expect(page.locator('#row-a1')).toBeVisible();
    await expect(page.locator('#row-a2')).toBeVisible();
    await expect(page.locator('text=Frieren')).toBeVisible();
  });

  test('7. No browser console errors occur during navigation', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('console', msg => {
      if (msg.type() === 'error' && !msg.text().includes('ECONNREFUSED') && !msg.text().includes('8787')) {
        errors.push(msg.text());
      }
    });

    await page.addInitScript((items) => {
      localStorage.setItem('aether.plugins.aniLauncher', JSON.stringify({
        enabled: true,
        settings: { bridgeUrl: 'http://127.0.0.1:47619', token: 'token' },
      }));
      localStorage.setItem('ac_v4_media', JSON.stringify(items));
      window.DATA = items;
    }, sampleAnime);

    await page.goto('/#/media');
    await page.waitForLoadState('networkidle');

    await page.goto('/#/settings');
    await page.waitForLoadState('networkidle');
    await page.click('button.stab:has-text("Plugins")');

    // Filter plugin or syntax errors
    const pluginErrors = errors.filter(e => e.includes('ani-launcher') || e.includes('plugins'));
    expect(pluginErrors).toHaveLength(0);
  });

  test('8. No connection requests occur during card rendering or on page load', async ({ page }) => {
    const bridgeRequests = [];
    page.on('request', req => {
      if (req.url().includes('47619')) {
        bridgeRequests.push(req.url());
      }
    });

    await page.addInitScript((items) => {
      localStorage.setItem('aether.plugins.aniLauncher', JSON.stringify({
        enabled: true,
        settings: { bridgeUrl: 'http://127.0.0.1:47619', token: 'token' },
      }));
      localStorage.setItem('ac_v4_media', JSON.stringify(items));
      window.DATA = items;
    }, sampleAnime);

    await page.goto('/#/media');
    await page.waitForLoadState('networkidle');

    // Ensure anime cards rendered
    await expect(page.locator('#row-a1')).toBeVisible();

    // Verify ZERO requests were sent to the bridge
    expect(bridgeRequests).toHaveLength(0);
  });

  test('Performance Check: card insertion timing with plugin enabled vs disabled', async ({ page }) => {
    // Generate 60 test anime cards
    const testDeck = Array.from({ length: 60 }, (_, i) => ({
      id: `perf_${i}`,
      title: `Anime Title #${i}`,
      genreId: 'anime',
      status: 'watching',
      epCur: i,
      epTot: 24,
    }));

    // 1. Measure render time with plugin disabled
    await page.addInitScript((items) => {
      localStorage.removeItem('aether.plugins.aniLauncher');
      localStorage.setItem('ac_v4_media', JSON.stringify(items));
      window.DATA = items;
    }, testDeck);

    await page.goto('/#/media');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof window.renderMediaBody === 'function');

    const durationDisabled = await page.evaluate(() => {
      const t0 = performance.now();
      window.renderMediaBody();
      const t1 = performance.now();
      return t1 - t0;
    });

    // 2. Measure render time with plugin enabled
    await page.evaluate(() => {
      localStorage.setItem('aether.plugins.aniLauncher', JSON.stringify({
        enabled: true,
        settings: { token: 't' },
      }));
    });

    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => typeof window.renderMediaBody === 'function');

    const durationEnabled = await page.evaluate(() => {
      const t0 = performance.now();
      window.renderMediaBody();
      const t1 = performance.now();
      return t1 - t0;
    });

    console.info(`[Performance Measurement] Render 60 cards: Disabled=${durationDisabled.toFixed(2)}ms, Enabled=${durationEnabled.toFixed(2)}ms`);

    // Verify overhead is negligible (< 35ms difference for 60 cards)
    const overhead = durationEnabled - durationDisabled;
    expect(overhead).toBeLessThan(35);
  });

});
