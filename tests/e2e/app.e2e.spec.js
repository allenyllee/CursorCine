const path = require('path');
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

async function launchApp() {
  const app = await electron.launch({
    args: [path.join(__dirname, '..', '..')],
    env: {
      ...process.env,
      CURSORCINE_TEST_MODE: '1',
      CURSORCINE_TEST_CAPTURE_MODE: 'mock',
      CURSORCINE_TEST_EXPORT_MODE: 'mock',
      CURSORCINE_ENABLE_HDR_NATIVE_IPC: '0',
      CURSORCINE_ENABLE_HDR_NATIVE_LIVE: '0',
      CURSORCINE_ENABLE_HDR_WGC: '0'
    }
  });
  const page = await app.firstWindow();
  await page.waitForSelector('#recordBtn');
  return { app, page };
}

test.describe('CursorCine e2e (mock capture)', () => {
  test('loads controls and desktop source options', async () => {
    const { app, page } = await launchApp();
    try {
      await expect(page.locator('#sourceSelect option')).toHaveCount(1);
      await expect(page.locator('#status')).toContainText('已載入');
    } finally {
      await app.close();
    }
  });

  test('can start and stop recording to timeline', async () => {
    const { app, page } = await launchApp();
    try {
      await page.click('#recordBtn');
      await expect(page.locator('#stopBtn')).toBeEnabled({ timeout: 20000 });
      await page.waitForTimeout(1800);
      await page.click('#stopBtn');
      await expect(page.locator('#timelinePanel')).toBeVisible({ timeout: 20000 });
    } finally {
      await app.close();
    }
  });

  test('auto export falls back and finishes without dialog interaction', async () => {
    const { app, page } = await launchApp();
    try {
      await page.click('#recordBtn');
      await expect(page.locator('#stopBtn')).toBeEnabled({ timeout: 20000 });
      await page.waitForTimeout(1400);
      await page.click('#stopBtn');
      await expect(page.locator('#timelinePanel')).toBeVisible({ timeout: 20000 });
      await page.click('#saveClipBtn');
      await expect(page.locator('#status')).toContainText('儲存完成', { timeout: 40000 });
    } finally {
      await app.close();
    }
  });

  test('overlay interaction mode updates UI labels', async () => {
    const { app, page } = await launchApp();
    try {
      await page.selectOption('#penInteractionModeSelect', 'smooth');
      await page.click('#penToggleBtn');
      await expect(page.locator('#penToggleBtn')).toContainText('滾輪暫停', { timeout: 10000 });
    } finally {
      await app.close();
    }
  });

  test('hdr diagnostics controls remain available under fallback', async () => {
    const { app, page } = await launchApp();
    try {
      await expect(page.locator('#hdrMappingRuntime')).toContainText('Fallback', { timeout: 10000 });
      await page.click('#runHdrSmokeBtn');
      await expect(page.locator('#status')).toContainText('Native smoke', { timeout: 15000 });
    } finally {
      await app.close();
    }
  });
});
