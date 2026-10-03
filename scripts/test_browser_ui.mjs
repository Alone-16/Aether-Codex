import { chromium } from '@playwright/test';

const secret = 'aether-codex-jwt-secret-key-change-in-prod-vars';
const enc = new TextEncoder();
const b64url = (buf) => {
  const bytes = new Uint8Array(buf);
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function createToken() {
  const header = { alg: 'HS256', typ: 'JWT' };
  const claims = {
    sub: 'usr_bmFkZWVtcHViZ21vYmlsZUBnbWFpbC5jb20',
    email: 'nadeempubgmobile@gmail.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  };
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const encHeader = b64url(enc.encode(JSON.stringify(header)));
  const encClaims = b64url(enc.encode(JSON.stringify(claims)));
  const dataToSign = encHeader + '.' + encClaims;
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(dataToSign));
  return dataToSign + '.' + b64url(signature);
}

async function run() {
  const token = await createToken();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', msg => {
    console.log('PAGE LOG [' + msg.type() + ']:', msg.text());
  });
  page.on('pageerror', err => {
    console.log('PAGE UNCAUGHT ERROR:', err.message);
  });
  page.on('requestfailed', req => {
    console.log('PAGE REQ FAILED:', req.url(), req.failure()?.errorText);
  });
  page.on('response', async res => {
    if (res.url().endsWith('/v1/notifications')) {
      console.log('NOTIF RES STATUS:', res.status());
      try {
        const json = await res.json();
        console.log('NOTIF DATA unreadCount:', json?.data?.unreadCount, 'notifications len:', json?.data?.notifications?.length);
      } catch (e) {}
    }
  });

  const url = 'https://aether-codex-production.nadeempubgmobile2-0.workers.dev';

  // Inject token before navigation so service workers or initial boot have token immediately
  await context.addInitScript((tok) => {
    localStorage.setItem('ac_v5_access_token', tok);
    sessionStorage.setItem('ac_v5_access_token', tok);
    const user = { id: 'usr_bmFkZWVtcHViZ21vYmlsZUBnbWFpbC5jb20', email: 'nadeempubgmobile@gmail.com', name: 'Nadeem' };
    localStorage.setItem('ac_v5_user_profile', JSON.stringify(user));
    sessionStorage.setItem('ac_v5_user_profile', JSON.stringify(user));
  }, token);

  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Check notification button
  const notifBtn = await page.waitForSelector('#notif-btn', { timeout: 10000 });
  console.log('Notification button found:', !!notifBtn);

  // Check badge (visible only if unreadCount > 0)
  const badgeEl = await page.waitForSelector('#notif-badge', { state: 'attached', timeout: 10000 });
  const badgeVisible = await badgeEl.isVisible();
  const badgeText = badgeVisible ? await badgeEl.textContent() : '0 (hidden)';
  console.log('Badge text:', badgeText, 'Visible:', badgeVisible);

  // Click notification bell
  console.log('Clicking notification bell...');
  await page.click('#notif-btn');

  // Wait for dropdown
  const dropdown = await page.waitForSelector('#notif-dropdown', { state: 'visible', timeout: 5000 });
  console.log('Dropdown visible:', !!dropdown);

  // Wait for cards to render
  await page.waitForTimeout(1500);
  const ddHtml = await page.evaluate(() => document.getElementById('notif-dropdown')?.innerHTML);
  console.log('Dropdown HTML length:', ddHtml?.length);
  console.log('Dropdown HTML snippet:', ddHtml?.slice(0, 400));
  const cards = await page.$$('.notif-card');
  console.log('Found notification cards:', cards.length);

  if (cards.length > 0) {
    const firstTitle = await page.evaluate(el => el.querySelector('.notif-title')?.textContent, cards[0]);
    const firstRel = await page.evaluate(el => el.querySelector('.notif-rel')?.textContent, cards[0]);
    console.log('First notification card title:', firstTitle);
    console.log('First notification relation:', firstRel);
  }

  // Check shortcuts link in dropdown footer
  const shortcutsLink = await page.$('.notif-shortcuts-link');
  console.log('Shortcuts link found:', !!shortcutsLink);
  if (shortcutsLink) {
    await shortcutsLink.click();
    await page.waitForTimeout(500);
    const kbModal = await page.$('#kb-help-modal');
    console.log('Keyboard shortcuts modal opened:', !!kbModal);
    if (kbModal) {
      await page.click('#kb-help-modal button');
      await page.waitForTimeout(300);
    }
  }

  // Re-open notification dropdown to test 1-click Add to Upcoming
  await page.click('#notif-btn');
  await page.waitForSelector('#notif-dropdown', { state: 'visible' });
  await page.waitForTimeout(500);

  // Click "+ Add to Upcoming" on first notification card using selector
  const hasAddBtn = await page.$('.notif-card button:has-text("+ Add to Upcoming")');
  console.log('Add to Upcoming button found:', !!hasAddBtn);
  if (hasAddBtn) {
    console.log('Clicking "+ Add to Upcoming" on first notification card...');
    await page.click('.notif-card button:has-text("+ Add to Upcoming")');
    await page.waitForTimeout(2000);
    const addedBadge = await page.$('.notif-card:has-text("✓ In Library")');
    console.log('Card successfully updated to "✓ In Library":', !!addedBadge);
  }

  // Test Fix 1: Click "Unread" tab - dropdown must NOT close!
  console.log('Clicking "Unread" filter tab...');
  await page.click('#notif-dropdown button:has-text("Unread")');
  await page.waitForTimeout(500);
  const isStillOpen1 = await page.evaluate(() => {
    const dd = document.getElementById('notif-dropdown');
    return dd && dd.style.display !== 'none';
  });
  console.log('Dropdown still open after clicking Unread tab:', isStillOpen1);

  // Click "All" tab - dropdown must NOT close!
  console.log('Clicking "All" filter tab...');
  await page.click('#notif-dropdown button:has-text("All")');
  await page.waitForTimeout(500);
  const isStillOpen2 = await page.evaluate(() => {
    const dd = document.getElementById('notif-dropdown');
    return dd && dd.style.display !== 'none';
  });
  console.log('Dropdown still open after clicking All tab:', isStillOpen2);

  // Close dropdown
  await page.evaluate(() => window.closeNotifDropdown && window.closeNotifDropdown());
  await page.waitForTimeout(300);

  // Test Fix 2: Navigate to Media, open an anime detail panel with malId
  console.log('Navigating to Media section...');
  await page.evaluate(() => window.nav && window.nav('media'));
  await page.waitForTimeout(1000);

  // Find an anime card with malId
  const malAnime = await page.evaluate(() => {
    return window.DATA?.find(x => x.genreId === 'anime' && x.malId);
  });
  console.log('Found anime with malId:', malAnime?.title, malAnime?.malId);

  if (malAnime) {
    await page.evaluate((id) => window.openDetail && window.openDetail(id), malAnime.id);
    await page.waitForTimeout(800);

    const malLinkHref = await page.evaluate(() => {
      const link = document.querySelector('#rpanel a[title*="MyAnimeList"]');
      return link ? link.getAttribute('href') : null;
    });
    console.log('MAL link href in detail panel:', malLinkHref);

    // Open Edit modal
    await page.evaluate((id) => window.openEdit && window.openEdit(id), malAnime.id);
    await page.waitForTimeout(800);

    const editMalLinkHref = await page.evaluate(() => {
      const link = document.querySelector('#rpanel a[title*="MyAnimeList"]');
      return link ? link.getAttribute('href') : null;
    });
    console.log('MAL link href in edit modal:', editMalLinkHref);
  }

  // Take screenshot
  await page.screenshot({ path: 'scratch_ui.png' });
  console.log('Screenshot saved to scratch_ui.png');

  await browser.close();
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
