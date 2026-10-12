import { test, expect } from '@playwright/test';

test.describe('Games and Music Section Rendering', () => {

  test('Games section renders without _cardSlot error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Pre-populate some game data in localStorage
    await page.addInitScript(() => {
      localStorage.setItem('ac_v4_games', JSON.stringify([
        { id: 'g1', title: 'Elden Ring', status: 'playing', platform: 'pc', totalHours: 45 },
        { id: 'g2', title: 'Hollow Knight', status: 'completed', platform: 'pc', totalHours: 30 }
      ]));
    });

    await page.goto('/#/games');
    await page.waitForLoadState('networkidle');

    // Ensure error banner is NOT visible
    const errorEl = page.locator('text=Error rendering games section');
    await expect(errorEl).toHaveCount(0);

    const refError = page.locator('text=_cardSlot is not defined');
    await expect(refError).toHaveCount(0);

    // Verify games content or controls rendered
    await expect(page.locator('text=Elden Ring')).toBeVisible();

    // Verify no unhandled page errors
    const cardErrors = errors.filter(e => e.includes('_cardSlot'));
    expect(cardErrors).toHaveLength(0);
  });

  test('Music section renders without _cardSlot error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    // Pre-populate music data in localStorage and window.MDATA
    await page.addInitScript(() => {
      const songs = [
        { id: 's1', title: 'Never Gonna Give You Up', artist: 'Rick Astley', duration_sec: 213 }
      ];
      localStorage.setItem('ac_v4_music', JSON.stringify(songs));
      window.MDATA = songs;
    });

    await page.goto('/#/music');
    await page.waitForLoadState('networkidle');

    // Ensure error banner is NOT visible
    const errorEl = page.locator('text=Error rendering music section');
    await expect(errorEl).toHaveCount(0);

    const refError = page.locator('text=_cardSlot is not defined');
    await expect(refError).toHaveCount(0);

    // Verify song row rendered
    await expect(page.locator('text=Never Gonna Give You Up')).toBeVisible();

    // Verify no unhandled page errors
    const cardErrors = errors.filter(e => e.includes('_cardSlot'));
    expect(cardErrors).toHaveLength(0);
  });

});
