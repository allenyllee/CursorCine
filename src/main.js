const { app, BrowserWindow, ipcMain, screen, desktopCapturer, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const CURSOR_POLL_MS = 16;

let clickHookEnabled = false;
let clickHookError = '';
let lastGlobalClick = null;
let mouseDown = false;
let overlayWindow = null;

function initGlobalClickHook() {
  try {
    const { uIOhook } = require('uiohook-napi');
    uIOhook.on('mousedown', () => {
      mouseDown = true;
      const p = screen.getCursorScreenPoint();
      lastGlobalClick = {
        x: p.x,
        y: p.y,
        timestamp: Date.now()
      };
    });
    uIOhook.on('mouseup', () => {
      mouseDown = false;
    });
    uIOhook.start();
    clickHookEnabled = true;
  } catch (error) {
    clickHookEnabled = false;
    clickHookError = error && error.message ? error.message : 'uiohook-napi not available';
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

function getTargetDisplay(displayId) {
  if (displayId) {
    const found = screen
      .getAllDisplays()
      .find((d) => String(d.id) === String(displayId));
    if (found) {
      return found;
    }
  }
  return screen.getPrimaryDisplay();
}

function destroyOverlayWindow() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    overlayWindow = null;
    return;
  }
  overlayWindow.close();
  overlayWindow = null;
}

function createOverlayWindow(displayId) {
  destroyOverlayWindow();

  const targetDisplay = getTargetDisplay(displayId);
  const b = targetDisplay.bounds;

  overlayWindow = new BrowserWindow({
    x: b.x,
    y: b.y,
    width: b.width,
    height: b.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    focusable: true,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });

  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

  overlayWindow.webContents.once('did-finish-load', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return;
    }
    overlayWindow.webContents.send('overlay:init', {
      width: b.width,
      height: b.height
    });
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function hasFfmpeg() {
  const result = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  return result.status === 0;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { windowsHide: true });
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr || `ffmpeg exited with code ${code}`));
    });
  });
}

app.whenReady().then(() => {
  initGlobalClickHook();

  ipcMain.handle('cursor:get', (_event, displayId) => {
    const p = screen.getCursorScreenPoint();

    if (!displayId) {
      return { x: p.x, y: p.y, inside: true, timestamp: Date.now() };
    }

    const targetDisplay = getTargetDisplay(displayId);
    const b = targetDisplay.bounds;
    const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height;
    const relX = p.x - b.x;
    const relY = p.y - b.y;

    return {
      x: relX,
      y: relY,
      nx: b.width > 0 ? relX / b.width : 0,
      ny: b.height > 0 ? relY / b.height : 0,
      inside,
      timestamp: Date.now(),
      intervalMs: CURSOR_POLL_MS
    };
  });

  ipcMain.handle('click:get-latest', (_event, displayId, lastSeenTimestamp = 0) => {
    if (!clickHookEnabled) {
      return {
        enabled: false,
        hasNew: false,
        mouseDown: false,
        reason: clickHookError
      };
    }

    if (!lastGlobalClick || lastGlobalClick.timestamp <= Number(lastSeenTimestamp || 0)) {
      return { enabled: true, hasNew: false, mouseDown };
    }

    const targetDisplay = getTargetDisplay(displayId);
    const b = targetDisplay.bounds;
    const inside =
      lastGlobalClick.x >= b.x &&
      lastGlobalClick.x < b.x + b.width &&
      lastGlobalClick.y >= b.y &&
      lastGlobalClick.y < b.y + b.height;

    if (!inside) {
      return { enabled: true, hasNew: false, mouseDown };
    }

    const relX = lastGlobalClick.x - b.x;
    const relY = lastGlobalClick.y - b.y;

    return {
      enabled: true,
      hasNew: true,
      timestamp: lastGlobalClick.timestamp,
      x: relX,
      y: relY,
      nx: b.width > 0 ? relX / b.width : 0,
      ny: b.height > 0 ? relY / b.height : 0,
      inside: true,
      mouseDown
    };
  });

  ipcMain.handle('overlay:create', (_event, displayId) => {
    createOverlayWindow(displayId);
    return { ok: true };
  });

  ipcMain.handle('overlay:destroy', () => {
    destroyOverlayWindow();
    return { ok: true };
  });

  ipcMain.handle('overlay:set-enabled', (_event, enabled) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return { ok: false, reason: 'NO_OVERLAY' };
    }

    const drawEnabled = Boolean(enabled);
    overlayWindow.setIgnoreMouseEvents(!drawEnabled, { forward: true });
    overlayWindow.webContents.send('overlay:set-enabled', drawEnabled);
    return { ok: true };
  });

  ipcMain.handle('overlay:set-pen-style', (_event, style) => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return { ok: false, reason: 'NO_OVERLAY' };
    }
    overlayWindow.webContents.send('overlay:set-pen-style', style || {});
    return { ok: true };
  });

  ipcMain.handle('overlay:undo', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return { ok: false, reason: 'NO_OVERLAY' };
    }
    overlayWindow.webContents.send('overlay:undo');
    return { ok: true };
  });

  ipcMain.handle('overlay:clear', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return { ok: false, reason: 'NO_OVERLAY' };
    }
    overlayWindow.webContents.send('overlay:clear');
    return { ok: true };
  });

  ipcMain.handle('desktop-sources:get', async () => {
    return desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false
    });
  });

  ipcMain.handle('video:convert-webm-to-mp4', async (_event, payload) => {
    if (!hasFfmpeg()) {
      return {
        ok: false,
        reason: 'NO_FFMPEG',
        message: '找不到 ffmpeg，請先安裝 ffmpeg 並加入 PATH。'
      };
    }

    const bytes = payload && payload.bytes ? payload.bytes : null;
    if (!bytes) {
      return {
        ok: false,
        reason: 'INVALID_INPUT',
        message: '缺少影片資料。'
      };
    }

    const safeBaseName = String(payload.baseName || 'cursorcine-export').replace(/[^a-zA-Z0-9-_]/g, '_');
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '另存 MP4',
      defaultPath: `${safeBaseName}.mp4`,
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    });

    if (canceled || !filePath) {
      return { ok: false, reason: 'CANCELED', message: '使用者取消儲存。' };
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cursorcine-'));
    const inputPath = path.join(tempDir, `${safeBaseName}.webm`);

    try {
      await fs.writeFile(inputPath, Buffer.from(bytes));

      await runFfmpeg([
        '-y',
        '-i',
        inputPath,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '21',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        filePath
      ]);

      return { ok: true, path: filePath };
    } catch (error) {
      return {
        ok: false,
        reason: 'CONVERT_FAILED',
        message: error.message || 'MP4 轉檔失敗。'
      };
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  destroyOverlayWindow();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
