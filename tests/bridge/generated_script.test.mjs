// ═══════════════════════════════════════════════════════════════════
//  tests/bridge/generated_script.test.mjs
//  Programmatically tests the browser-side bridge script generation:
//  - Replaces placeholders: token, origin, port, default settings
//  - Asserts no unresolved placeholders remain
//  - Asserts it passes python -m py_compile
// ═══════════════════════════════════════════════════════════════════

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');

test('Bridge script generation from template', async (t) => {
  const templatePath = path.join(REPO_ROOT, 'bridge', 'aether-bridge.template.py');
  assert.ok(fs.existsSync(templatePath), 'Template file must exist at bridge/aether-bridge.template.py');

  const templateContent = fs.readFileSync(templatePath, 'utf-8');

  // Parameters to substitute (as the browser will do)
  const testToken = 'ac_bridge_test_token_' + Math.random().toString(36).substring(2, 15);
  const testOrigin = 'https://aethercodex.pages.dev';
  const testPort = 47619;
  const testSettings = {
    player: 'mpv',
    quality: 'best',
    audio: 'sub',
    autoSelect: true,
  };

  // Substitution logic matching js/plugins/ani-launcher.js
  let generated = templateContent;
  generated = generated.replace('__BAKED_TOKEN__', testToken);
  generated = generated.replace('__ALLOWED_ORIGIN__', testOrigin);
  generated = generated.replace('47619  # __CONFIGURED_PORT__', `${testPort}`);
  generated = generated.replace(/__CONFIGURED_PORT__/g, `${testPort}`);
  generated = generated.replace('__DEFAULT_SETTINGS_JSON__', JSON.stringify(testSettings));

  await t.test('Contains baked parameters', () => {
    assert.ok(generated.includes(testToken), 'Generated script must contain the baked token');
    assert.ok(generated.includes(testOrigin), 'Generated script must contain the allowed origin');
    assert.ok(generated.includes(String(testPort)), 'Generated script must contain the configured port');
    assert.ok(generated.includes('"player"'), 'Generated script must contain the default settings');
  });

  await t.test('No unresolved template placeholders remain', () => {
    const placeholderPattern = /__[A-Z0-9_]+__/g;
    const matches = generated.match(placeholderPattern) || [];
    assert.deepEqual(matches, [], `Unresolved template placeholders found: ${matches.join(', ')}`);
  });

  await t.test('Compiles and executes cleanly with python', () => {
    const outPath = path.join(REPO_ROOT, 'aether-bridge.py');
    fs.writeFileSync(outPath, generated, 'utf-8');

    try {
      execSync(`python -m py_compile "${outPath}"`, { stdio: 'pipe' });
      const verOut = execSync(`python "${outPath}" --version`, { encoding: 'utf-8', stdio: 'pipe' });
      assert.ok(verOut.includes('aether-bridge 1.0.0'), 'Must output bridge version');
      const cfgOut = execSync(`python "${outPath}" --print-config`, { encoding: 'utf-8', stdio: 'pipe' });
      assert.ok(cfgOut.includes('ani_cli_path'), 'Must output config');
    } catch (err) {
      assert.fail(`Execution failed: ${err.message}`);
    }
  });
});
