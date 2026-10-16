// ═══════════════════════════════════════════════════════════════════
//  playwright.config.js — E2E Test Suite Configuration
// ═══════════════════════════════════════════════════════════════════

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: 'html',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx serve ./ -l tcp://127.0.0.1:3000',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 15000,
  },
});
