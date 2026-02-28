const path = require('path');
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

async function launchApp() {
  const appRoot = path.join(__dirname, '..', '..');
  const launchArgs = [path.join(appRoot, 'src', 'main.js')];
  if (process.platform === 'linux') {
    launchArgs.unshift('--no-sandbox', '--disable-setuid-sandbox');
  }
  const app = await electron.launch({
    args: launchArgs,
    cwd: appRoot,
    env: {
      ...process.env,
      CURSORCINE_TEST_MODE: '1',
      CURSORCINE_TEST_CAPTURE_MODE: 'mock',
      CURSORCINE_TEST_EXPORT_MODE: 'mock',
      CURSORCINE_DISABLE_CLICK_HOOK: '1',
      CURSORCINE_E2E_FORCE_POINTER_INSIDE: '1',
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

async function waitForOverlayWindows(app, timeoutMs = 15000) {
  const started = Date.now();
  while ((Date.now() - started) < timeoutMs) {
    const windows = app.windows();
    const overlayWindows = [];
    for (const win of windows) {
      const title = await win.title().catch(() => '');
      if (String(title).includes('CursorCine Overlay')) {
        await win.waitForSelector('#overlayCanvas', { timeout: 5000 });
        overlayWindows.push(win);
      }
    }
    if (overlayWindows.length > 0) {
      return overlayWindows;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Overlay window not found');
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

  test('pen can draw by direct mouse drag and overlay bounds match target display', async ({}, testInfo) => {
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
      const penEnableResult = await page.evaluate(async () => window.electronAPI.overlaySetEnabled(true));
      expect(penEnableResult && penEnableResult.ok).toBeTruthy();
      await page.waitForFunction(async () => {
        const state = await window.electronAPI.overlayGetState();
        return Boolean(state && state.ok && state.penEnabled);
      }, {}, { timeout: 10000 });
      if (penEnableResult && penEnableResult.toggleMode) {
        await page.bringToFront();
        await page.keyboard.press('Control');
        await page.waitForFunction(async () => {
          const state = await window.electronAPI.overlayGetState();
          return Boolean(state && state.ok && state.drawToggled);
        }, {}, { timeout: 10000 });
      }

      const overlayState = await page.evaluate(async () => window.electronAPI.overlayGetState());
      expect(overlayState && overlayState.ok).toBeTruthy();
      expect(overlayState.penEnabled).toBe(true);
      if (penEnableResult && penEnableResult.toggleMode) {
        expect(overlayState.drawToggled).toBe(true);
      }
      expect(overlayState.overlayBounds).toEqual(overlayState.targetDisplayBounds);
      expect(overlayState.overlayWindowBounds).toEqual(overlayState.targetDisplayBounds);

      const overlayPages = await waitForOverlayWindows(app);
      let chosenOverlayPage = null;
      let drawnAlpha = 0;
      let alphaBefore = 0;

      for (const candidate of overlayPages) {
        const canvas = candidate.locator('#overlayCanvas');
        const box = await canvas.boundingBox().catch(() => null);
        if (!box || box.width < 5 || box.height < 5) {
          continue;
        }

        const startX = box.x + Math.max(20, Math.floor(box.width * 0.2));
        const startY = box.y + Math.max(20, Math.floor(box.height * 0.3));
        const endX = box.x + Math.max(40, Math.floor(box.width * 0.6));
        const endY = box.y + Math.max(40, Math.floor(box.height * 0.65));

        const before = await candidate.evaluate(() => {
          const canvasEl = document.getElementById('overlayCanvas');
          if (!canvasEl) {
            return 0;
          }
          const ctx = canvasEl.getContext('2d');
          if (!ctx) {
            return 0;
          }
          const data = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height).data;
          let alphaCount = 0;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0) {
              alphaCount += 1;
            }
          }
          return alphaCount;
        });

        await candidate.mouse.move(startX, startY);
        await candidate.mouse.down();
        await candidate.mouse.move(endX, endY, { steps: 15 });
        await candidate.mouse.up();
        await candidate.waitForTimeout(240);

        const after = await candidate.evaluate(() => {
          const canvasEl = document.getElementById('overlayCanvas');
          if (!canvasEl) {
            return 0;
          }
          const ctx = canvasEl.getContext('2d');
          if (!ctx) {
            return 0;
          }
          const data = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height).data;
          let alphaCount = 0;
          for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 0) {
              alphaCount += 1;
            }
          }
          return alphaCount;
        });

        if (after > before + 20) {
          chosenOverlayPage = candidate;
          alphaBefore = before;
          drawnAlpha = after;
          break;
        }
      }

      expect(chosenOverlayPage).not.toBeNull();
      expect(drawnAlpha).toBeGreaterThan(alphaBefore + 20);

      const overlayCanvasPngBase64 = await chosenOverlayPage.evaluate(() => {
        const canvasEl = document.getElementById('overlayCanvas');
        if (!canvasEl) {
          return '';
        }
        const dataUrl = canvasEl.toDataURL('image/png');
        const idx = dataUrl.indexOf(',');
        return idx >= 0 ? dataUrl.slice(idx + 1) : '';
      });
      if (overlayCanvasPngBase64) {
        await testInfo.attach('overlay-canvas-after-draw', {
          contentType: 'image/png',
          body: Buffer.from(overlayCanvasPngBase64, 'base64')
        });
      }

      await page.click('#stopBtn');
      await expect(page.locator('#timelinePanel')).toBeVisible({ timeout: 20000 });
    } finally {
      await app.close();
    }
  });
});
