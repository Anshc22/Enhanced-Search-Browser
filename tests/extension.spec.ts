import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

test('extension loads and overlay opens', async () => {
  const extensionPath = path.resolve(__dirname, '..');
  // ensure extension manifest exists
  if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
    test.skip(true, 'Extension manifest not found');
    return;
  }

  // create a temporary user data dir
  const userDataDir = path.join(process.cwd(), 'tmp-user-data');
  if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });
  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    const page = context.pages()[0] || await context.newPage();
    await page.goto('https://example.com');

    // Trigger Ctrl+F (platform-agnostic)
    const isMac = process.platform === 'darwin';
    if (isMac) {
      await page.keyboard.down('Meta');
      await page.keyboard.press('f');
      await page.keyboard.up('Meta');
    } else {
      await page.keyboard.down('Control');
      await page.keyboard.press('f');
      await page.keyboard.up('Control');
    }

    // Wait for overlay to appear
    // Wait for overlay to appear; allow a bit more time on CI
    const overlay = await page.waitForSelector('#enhanced-search-overlay', { timeout: 10000 });
    expect(overlay).toBeTruthy();
  } catch (err) {
    if (context) {
      try { const page = context.pages()[0]; if (page) await page.screenshot({ path: 'tmp-failure.png', fullPage: true }); } catch (e) {}
    }
    throw err;
  } finally {
    if (context) await context.close();
    // cleanup userDataDir
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  }
});


