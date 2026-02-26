const path = require('path');
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

async function launchApp() {
  const appRoot = path.join(__dirname, '..', '..');
  const app = await electron.launch({
    args: [path.join(appRoot, 'src', 'main.js')],
    cwd: appRoot,
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
  await page.waitForFunction(() => {
    const status = document.querySelector('#status');
    const sourceSelect = document.querySelector('#sourceSelect');
    const recordBtn = document.querySelector('#recordBtn');
    const statusText = status ? String(status.textContent || '') : '';
    const sourceCount = sourceSelect ? sourceSelect.querySelectorAll('option').length : 0;
    return Boolean(window.electronAPI) && !statusText.includes('preload 未載入') && sourceCount > 0 && recordBtn && !recordBtn.disabled;
  }, {}, { timeout: 15000 });
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
      await page.click('#recordBtn');
      await expect(page.locator('#stopBtn')).toBeEnabled({ timeout: 20000 });
      const penToolsGroup = page.locator('details.control-group', { has: page.locator('summary', { hasText: '畫筆工具' }) });
      await penToolsGroup.evaluate((el) => {
        if (!el.open) {
          el.open = true;
        }
      });
      await page.selectOption('#penInteractionModeSelect', 'smooth');
      await expect(page.locator('#status')).toContainText('畫筆互動: 流暢優先', { timeout: 10000 });
      await page.click('#stopBtn');
      await expect(page.locator('#timelinePanel')).toBeVisible({ timeout: 20000 });
    } finally {
      await app.close();
    }
  });

  test('hdr diagnostics controls remain available under fallback', async () => {
    const { app, page } = await launchApp();
    try {
      await expect(page.locator('#hdrMappingRuntime')).toContainText('Fallback', { timeout: 10000 });
      await expect(page.locator('#runHdrSmokeBtn')).toBeDisabled();
      await expect(page.locator('#status')).toContainText('已載入', { timeout: 10000 });
    } finally {
      await app.close();
    }
  });
});
