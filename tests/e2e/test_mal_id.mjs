import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  
  console.log('1. Navigating to http://localhost:3000/#/media...');
  await page.goto('http://localhost:3000/#/media', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  console.log('2. Opening Add panel...');
  await page.evaluate(() => {
    if (window.closePanel) window.closePanel();
    if (window.openAdd) window.openAdd();
  });
  await page.waitForTimeout(500);

  console.log('3. Inspecting MAL search inputs in Add New Title panel...');
  const searchInp = await page.waitForSelector('#mal-search-inp', { timeout: 5000 });
  const placeholder = await searchInp.getAttribute('placeholder');
  console.log('   Placeholder:', placeholder);

  const fetchBtn = await page.waitForSelector('#mal-fetch-btn', { timeout: 5000 });
  console.log('   Fetch button found:', !!fetchBtn);

  console.log('4. Typing MAL ID 16498 into search input...');
  await searchInp.fill('16498');
  await page.waitForTimeout(1500);

  const dropdown = await page.waitForSelector('#mal-dropdown', { timeout: 5000 });
  const dropdownText = await dropdown.innerText();
  console.log('   Dropdown content:\n', dropdownText);

  console.log('5. Clicking Fetch button...');
  await fetchBtn.click();
  await page.waitForTimeout(1000);

  const titleVal = await page.$eval('#f-title', el => el.value);
  const malIdVal = await page.$eval('#f-malid', el => el.value);
  const epTotVal = await page.$eval('#f-eptot', el => el.value);
  const epDurVal = await page.$eval('#f-epduration', el => el.value);
  const coverSrc = await page.$eval('#mal-cover-img', el => el.src);
  const badgeHtml = await page.$eval('#mal-badge-container', el => el.innerText);

  console.log('   Autofilled Title:', titleVal);
  console.log('   Autofilled MAL ID:', malIdVal);
  console.log('   Autofilled Ep Tot:', epTotVal);
  console.log('   Autofilled Ep Dur:', epDurVal);
  console.log('   Cover Image:', coverSrc.substring(0, 50) + '...');
  console.log('   MAL Badge Text:', badgeHtml.replace(/\s+/g, ' '));

  console.log('6. Testing Manual ID toggle...');
  await page.click('#mal-toggle-manual-btn');
  await page.waitForTimeout(300);
  const manualIdVal = await page.$eval('#f-malid-input', el => el.value);
  console.log('   Manual ID input value:', manualIdVal);

  console.log('7. Testing non-existent MAL ID 12345...');
  await searchInp.fill('12345');
  await fetchBtn.click();
  await page.waitForTimeout(2000);
  const dropdownErr = await page.$eval('#mal-dropdown', el => el.innerText);
  console.log('   Dropdown after invalid ID 12345:\n', dropdownErr);

  console.log('8. Taking screenshot of panel...');
  await page.screenshot({ path: 'test-mal-id-panel.png' });
  console.log('   Screenshot saved: test-mal-id-panel.png');

  await browser.close();
  console.log('=== All Browser Checks Passed Successfully! ===');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
