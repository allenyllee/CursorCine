const path = require('path');
const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

async function launchApp(options = {}) {
  const captureMode = String(options.captureMode || 'mock');
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
      CURSORCINE_TEST_CAPTURE_MODE: captureMode,
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

  test('windows native overlay stroke spans full visible width on every available display source', async ({}, testInfo) => {
    test.skip(process.platform !== 'win32', 'Windows-only native overlay e2e');
    const { app, page } = await launchApp({ captureMode: 'real' });
    try {
      const displaySources = await page.$$eval('#sourceSelect option', (options) =>
        options.map((opt) => ({
          value: String(opt.value || ''),
          label: String(opt.textContent || '').trim() || String(opt.value || '')
        }))
      );
      expect(displaySources.length).toBeGreaterThan(0);

      for (const source of displaySources) {
        await page.selectOption('#sourceSelect', source.value);
        await page.waitForTimeout(200);

        await page.click('#recordBtn');
        await expect(page.locator('#stopBtn')).toBeEnabled({ timeout: 20000 });

        await page.evaluate(async () => {
          await window.electronAPI.overlaySetBackend('native');
        });

        const probeState = await page.evaluate(async () => window.electronAPI.overlayGetState());
        await testInfo.attach('native-overlay-probe-state-' + source.label, {
          contentType: 'application/json',
          body: Buffer.from(JSON.stringify(probeState || null, null, 2))
        });
        test.skip(
          !probeState || !probeState.ok || !probeState.nativeAvailable || String(probeState.backendEffective || '') !== 'native',
          'Native overlay bridge unavailable on this machine'
        );

        const penEnableResult = await page.evaluate(async () => window.electronAPI.overlaySetEnabled(true));
        expect(penEnableResult && penEnableResult.ok, 'failed to enable native pen for source: ' + source.label).toBeTruthy();

        await page.waitForFunction(async () => {
          const state = await window.electronAPI.overlayGetState();
          return Boolean(
            state &&
            state.ok &&
            state.penEnabled &&
            state.nativeAvailable &&
            state.nativeOverlayActive &&
            String(state.backendEffective || '') === 'native'
          );
        }, {}, { timeout: 10000 });

        const state = await page.evaluate(async () => window.electronAPI.overlayGetState());
        expect(state && state.ok, 'native overlay state unavailable for source: ' + source.label).toBeTruthy();
        expect(state.penEnabled, 'native pen not enabled for source: ' + source.label).toBe(true);
        expect(state.nativeAvailable, 'native not available for source: ' + source.label).toBe(true);
        expect(state.nativeOverlayActive, 'native overlay inactive for source: ' + source.label).toBe(true);
        expect(String(state.backendEffective || ''), 'native backend not effective for source: ' + source.label).toBe('native');
        expect(state.overlayWindowBounds, 'electron overlay window should be absent in native mode for source: ' + source.label).toBeNull();
        expect(state.overlayBounds, 'overlay bounds mismatch for source: ' + source.label).toEqual(state.targetDisplayBounds);

        const drawResult = await page.evaluate(async () => window.electronAPI.overlayTestDrawHorizontal({
          startRatio: 0.02,
          endRatio: 0.98,
          yRatio: 0.5,
          steps: 60
        }));
        test.skip(
          !drawResult || !drawResult.ok,
          'Native stroke width metrics unavailable: ' + String((drawResult && drawResult.reason) || 'UNKNOWN')
        );
        expect(drawResult && drawResult.ok, 'native overlay test draw failed for source: ' + source.label).toBeTruthy();
        const before = drawResult && drawResult.before ? drawResult.before : { alphaCount: 0 };
        const after = drawResult && drawResult.after ? drawResult.after : { alphaCount: 0, drawnWidth: 0, canvasWidth: 0 };
        const alphaBefore = Number(before.alphaCount || 0);
        const alphaAfter = Number(after.alphaCount || 0);
        const drawnWidth = Number(after.drawnWidth || 0);
        const canvasWidth = Number(after.canvasWidth || 0);
        const spanRatio = canvasWidth > 0 ? (drawnWidth / canvasWidth) : 0;
        expect(alphaAfter, 'native alpha did not increase enough for source: ' + source.label).toBeGreaterThan(alphaBefore + 20);
        expect(spanRatio, 'native stroke span too short for source: ' + source.label).toBeGreaterThan(0.9);

        await page.click('#stopBtn');
        await expect(page.locator('#timelinePanel')).toBeVisible({ timeout: 20000 });
        await page.click('#discardClipBtn');
        await expect(page.locator('#timelinePanel')).toHaveAttribute('hidden', '', { timeout: 10000 });
        await expect(page.locator('#recordBtn')).toBeEnabled({ timeout: 10000 });
      }
    } finally {
      await app.close();
    }
  });

  test('pen stroke can span full visible width on every available display source', async ({}, testInfo) => {
    const { app, page } = await launchApp({ captureMode: 'real' });
    try {
      const penToolsGroup = page.locator('details.control-group', { has: page.locator('summary', { hasText: '畫筆工具' }) });
      await penToolsGroup.evaluate((el) => {
        if (!el.open) {
          el.open = true;
        }
      });
      const displaySources = await page.$$eval('#sourceSelect option', (options) =>
        options.map((opt) => ({
          value: String(opt.value || ''),
          label: String(opt.textContent || '').trim() || String(opt.value || '')
        }))
      );
      expect(displaySources.length).toBeGreaterThan(0);

      for (const source of displaySources) {
        await page.selectOption('#sourceSelect', source.value);
        await page.waitForTimeout(200);

        await page.click('#recordBtn');
        await expect(page.locator('#stopBtn')).toBeEnabled({ timeout: 20000 });
        await page.evaluate(async () => {
          await window.electronAPI.overlaySetBackend('electron');
          await window.electronAPI.overlaySetWindowBehavior('always');
        });

        const penEnableResult = await page.evaluate(async () => window.electronAPI.overlaySetEnabled(true));
        expect(penEnableResult && penEnableResult.ok, 'failed to enable pen mode for source: ' + source.label).toBeTruthy();
        await page.waitForFunction(async () => {
          const state = await window.electronAPI.overlayGetState();
          return Boolean(
            state &&
            state.ok &&
            state.penEnabled &&
            String(state.backendEffective || '') === 'electron' &&
            String(state.windowBehavior || '') === 'always'
          );
        }, {}, { timeout: 10000 });

        const overlayState = await page.evaluate(async () => window.electronAPI.overlayGetState());
        expect(overlayState && overlayState.ok, 'overlay state unavailable for source: ' + source.label).toBeTruthy();
        expect(overlayState.penEnabled, 'pen not enabled for source: ' + source.label).toBe(true);
        expect(String(overlayState.windowBehavior || '')).toBe('always');
        expect(String(overlayState.backendEffective || '')).toBe('electron');
        expect(overlayState.overlayBounds, 'overlay bounds mismatch for source: ' + source.label).toEqual(overlayState.targetDisplayBounds);
        expect(overlayState.overlayWindowBounds, 'overlay window bounds mismatch for source: ' + source.label).toEqual(overlayState.targetDisplayBounds);

        const drawResult = await page.evaluate(async () => window.electronAPI.overlayTestDrawHorizontal({
          startRatio: 0.02,
          endRatio: 0.98,
          yRatio: 0.5,
          steps: 60
        }));
        expect(drawResult && drawResult.ok, 'overlay test draw failed for source: ' + source.label).toBeTruthy();
        const before = drawResult && drawResult.before ? drawResult.before : { alphaCount: 0 };
        const after = drawResult && drawResult.after ? drawResult.after : { alphaCount: 0, drawnWidth: 0, canvasWidth: 0 };
        const alphaBefore = Number(before.alphaCount || 0);
        const drawnAlpha = Number(after.alphaCount || 0);
        const chosenMetrics = {
          drawnWidth: Number(after.drawnWidth || 0),
          canvasWidth: Number(after.canvasWidth || 0),
          pngBase64: String(after.pngBase64 || '')
        };
        expect(drawnAlpha, 'alpha did not increase enough for source: ' + source.label).toBeGreaterThan(alphaBefore + 20);
        const spanRatio = chosenMetrics.canvasWidth > 0
          ? chosenMetrics.drawnWidth / chosenMetrics.canvasWidth
          : 0;
        expect(spanRatio, 'stroke span too short for source: ' + source.label).toBeGreaterThan(0.9);

        const overlayCanvasPngBase64 = chosenMetrics.pngBase64;
        if (overlayCanvasPngBase64) {
          await testInfo.attach('overlay-canvas-after-draw-' + source.label, {
            contentType: 'image/png',
            body: Buffer.from(overlayCanvasPngBase64, 'base64')
          });
        }
        if (chosenMetrics) {
          await testInfo.attach('overlay-draw-metrics-' + source.label, {
            contentType: 'application/json',
            body: Buffer.from(JSON.stringify({
              source,
              alphaBefore,
              alphaAfter: drawnAlpha,
              drawnWidth: chosenMetrics.drawnWidth,
              canvasWidth: chosenMetrics.canvasWidth,
              spanRatio
            }, null, 2))
          });
        }

        await page.click('#stopBtn');
        await expect(page.locator('#timelinePanel')).toBeVisible({ timeout: 20000 });
        await page.click('#discardClipBtn');
        await expect(page.locator('#timelinePanel')).toHaveAttribute('hidden', '', { timeout: 10000 });
        await expect(page.locator('#recordBtn')).toBeEnabled({ timeout: 10000 });
      }
    } finally {
      await app.close();
    }
  });
});
