const { app, BrowserWindow, ipcMain, screen, desktopCapturer, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { spawn, spawnSync } = require('child_process');

const CURSOR_POLL_MS = 16;
const BLOB_UPLOAD_CHUNK_MAX_BYTES = 8 * 1024 * 1024;
const EXPORT_QUALITY_PRESETS = {
  smooth: {
    mp4: { preset: 'veryfast', crf: '24', audioBitrate: '160k' },
    webm: { codec: 'libvpx-vp9', cpuUsed: '8', crf: '32', audioBitrate: '96k', deadline: 'realtime' }
  },
  balanced: {
    mp4: { preset: 'fast', crf: '20', audioBitrate: '224k' },
    webm: { codec: 'libvpx-vp9', cpuUsed: '5', crf: '16', audioBitrate: '192k', deadline: 'realtime' }
  },
  high: {
    mp4: { preset: 'medium', crf: '16', audioBitrate: '256k' },
    webm: { codec: 'libvpx-vp9', cpuUsed: '2', crf: '18', audioBitrate: '192k', deadline: 'good' }
  }
};
const DEFAULT_EXPORT_QUALITY_PRESET = 'balanced';

let clickHookEnabled = false;
let clickHookError = '';
let lastGlobalClick = null;
let mouseDown = false;
let overlayWindow = null;
let overlayBorderWindow = null;
let mainWindow = null;
let overlayPenEnabled = false;
let overlayDrawToggle = false;
let overlayAltPressed = false;
let overlayWheelLockUntil = 0;
let overlayWheelResumeTimer = null;

let overlayCtrlToggleArmUntil = 0;
let overlayLastDrawActive = false;
let overlayRecordingActive = false;
let overlayBounds = null;
let blobUploadSessionSeq = 1;
const blobUploadSessions = new Map();
const OVERLAY_WHEEL_PAUSE_MS = 450;
function isOverlayToggleKey(event) {
  const code = Number(event && event.keycode);
  return code === 29 || code === 3613;
}

function scheduleOverlayWheelResume() {
  if (overlayWheelResumeTimer) {
    clearTimeout(overlayWheelResumeTimer);
  }

  overlayWheelResumeTimer = setTimeout(() => {
    const waitMs = overlayWheelLockUntil - Date.now();
    if (waitMs > 10) {
      scheduleOverlayWheelResume();
      return;
    }

    overlayWheelResumeTimer = null;
    applyOverlayMouseMode();
    emitOverlayPointer();
  }, Math.max(20, overlayWheelLockUntil - Date.now() + 20));
}

function pauseOverlayByWheel() {
  if (!overlayDrawEnabled()) {
    return;
  }

  overlayWheelLockUntil = Date.now() + OVERLAY_WHEEL_PAUSE_MS;

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send("overlay:clear");
    overlayWindow.setIgnoreMouseEvents(true);
    if (overlayWindow.isVisible()) {
      overlayWindow.hide();
    }
    overlayWindow.blur();
  }

  scheduleOverlayWheelResume();
  applyOverlayMouseMode();
  emitOverlayPointer();
}


function overlayDrawEnabled() {
  if (!overlayPenEnabled) {
    return false;
  }
  if (!clickHookEnabled) {
    return true;
  }
  return overlayDrawToggle;
}

function overlayDrawActive() {
  return overlayDrawEnabled() && Date.now() >= overlayWheelLockUntil;
}

function emitOverlayPointer() {
  if (!overlayWindow || overlayWindow.isDestroyed() || !overlayBounds) {
    return;
  }

  const p = screen.getCursorScreenPoint();
  const inside =
    p.x >= overlayBounds.x &&
    p.x < overlayBounds.x + overlayBounds.width &&
    p.y >= overlayBounds.y &&
    p.y < overlayBounds.y + overlayBounds.height;

  overlayWindow.webContents.send("overlay:global-pointer", {
    x: p.x - overlayBounds.x,
    y: p.y - overlayBounds.y,
    inside,
    down: mouseDown,
    timestamp: Date.now()
  });
}

function applyOverlayMouseMode() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  const drawEnabled = overlayDrawEnabled();
  const wheelLocked = Date.now() < overlayWheelLockUntil;
  const capturePointer = overlayDrawActive();
  const shouldKeepVisible = drawEnabled && !wheelLocked;

  if (shouldKeepVisible) {
    if (!overlayWindow.isVisible()) {
      if (typeof overlayWindow.showInactive === "function") {
        overlayWindow.showInactive();
      } else {
        overlayWindow.show();
      }

      overlayWindow.webContents.send("overlay:clear");
    }

    overlayWindow.setIgnoreMouseEvents(false);
  } else if (drawEnabled && wheelLocked) {
    overlayWindow.setIgnoreMouseEvents(true);

    if (overlayWindow.isVisible()) {
      overlayWindow.hide();
    }

    overlayWindow.blur();
  } else {
    if (overlayLastDrawActive) {
      overlayWindow.webContents.send("overlay:clear");
    }

    overlayWindow.setIgnoreMouseEvents(true, { forward: true });

    if (overlayWindow.isVisible()) {
      overlayWindow.hide();
    }

    overlayWindow.blur();
  }

  overlayLastDrawActive = drawEnabled;

  overlayWindow.webContents.send("overlay:set-draw-active", {
    active: capturePointer,
    mouseDown,
    toggleEnabled: clickHookEnabled,
    toggled: overlayDrawToggle,
    wheelPaused: wheelLocked
  });
  emitOverlayPointer();
}


function initGlobalClickHook() {
  try {
    const { uIOhook } = require('uiohook-napi');
    uIOhook.on('mousedown', () => {
      mouseDown = true;
      overlayWheelLockUntil = 0;
      const p = screen.getCursorScreenPoint();
      lastGlobalClick = {
        x: p.x,
        y: p.y,
        timestamp: Date.now()
      };
      applyOverlayMouseMode();
      emitOverlayPointer();
    });
    uIOhook.on('mouseup', () => {
      mouseDown = false;
      applyOverlayMouseMode();
      emitOverlayPointer();
    });
    uIOhook.on('mousemove', () => {
      emitOverlayPointer();
    });
    uIOhook.on('keydown', (event) => {
      if (!isOverlayToggleKey(event)) {
        return;
      }
      if (overlayAltPressed) {
        return;
      }
      overlayAltPressed = true;

      if (!overlayPenEnabled) {
        return;
      }

      const now = Date.now();
      if (!overlayDrawToggle) {
        overlayDrawToggle = true;
        overlayWheelLockUntil = 0;
        overlayCtrlToggleArmUntil = 0;
        applyOverlayMouseMode();
        emitOverlayPointer();
        return;
      }

      if (now <= overlayCtrlToggleArmUntil) {
        overlayDrawToggle = false;
        overlayWheelLockUntil = 0;
        overlayCtrlToggleArmUntil = 0;
      } else {
        overlayCtrlToggleArmUntil = now + 420;
        overlayWheelLockUntil = 0;
      }

      applyOverlayMouseMode();
      emitOverlayPointer();
    });
    uIOhook.on('keyup', (event) => {
      if (!isOverlayToggleKey(event)) {
        return;
      }
      overlayAltPressed = false;
    });
    uIOhook.on('wheel', () => {
      pauseOverlayByWheel();
    });
    uIOhook.start();
    clickHookEnabled = true;
  } catch (error) {
    clickHookEnabled = false;
    clickHookError = error && error.message ? error.message : 'uiohook-napi not available';
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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

  const windows = [overlayWindow, overlayBorderWindow];
  for (const win of windows) {
    if (!win || win.isDestroyed()) {
      continue;
    }
    win.close();
  }

  overlayWindow = null;
  overlayBorderWindow = null;
  overlayBounds = null;
}

function createOverlayWindow(displayId) {
  destroyOverlayWindow();

  const targetDisplay = getTargetDisplay(displayId);
  const b = targetDisplay.bounds;
  overlayBounds = { x: b.x, y: b.y, width: b.width, height: b.height };

  overlayBorderWindow = new BrowserWindow({
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
    focusable: false,
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      backgroundThrottling: false
    }
  });

  overlayBorderWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayBorderWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayBorderWindow.setFocusable(false);
  overlayBorderWindow.blur();
  overlayBorderWindow.loadFile(path.join(__dirname, 'overlay.html'));

  overlayBorderWindow.webContents.once('did-finish-load', () => {
    if (!overlayBorderWindow || overlayBorderWindow.isDestroyed()) {
      return;
    }
    overlayBorderWindow.webContents.send('overlay:init', {
      width: b.width,
      height: b.height
    });
    overlayBorderWindow.webContents.send('overlay:set-enabled', false);
    overlayBorderWindow.webContents.send('overlay:set-recording-indicator', overlayRecordingActive);

    if (!overlayBorderWindow.isVisible()) {
      if (typeof overlayBorderWindow.showInactive === 'function') {
        overlayBorderWindow.showInactive();
      } else {
        overlayBorderWindow.show();
      }
    }
    overlayBorderWindow.setIgnoreMouseEvents(true);
  });

  overlayBorderWindow.on('closed', () => {
    overlayBorderWindow = null;
  });

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
    focusable: false,
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      backgroundThrottling: false
    }
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setFocusable(false);
  overlayWindow.blur();
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));

  overlayWindow.webContents.once('did-finish-load', () => {
    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return;
    }
    overlayWindow.webContents.send('overlay:init', {
      width: b.width,
      height: b.height
    });
    overlayWindow.webContents.send('overlay:set-enabled', overlayPenEnabled);
    overlayWindow.webContents.send('overlay:set-recording-indicator', false);
    applyOverlayMouseMode();
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

function quoteShellArg(value) {
  const raw = String(value);
  if (/^[a-zA-Z0-9_./:-]+$/.test(raw)) {
    return raw;
  }
  return '"' + raw.replace(/(["\\$`])/g, '\\$1') + '"';
}

function sanitizeBaseName(value, fallback = 'cursorcine-export') {
  return String(value || fallback).replace(/[^a-zA-Z0-9-_]/g, '_');
}

function sanitizeExt(value, fallback = 'webm') {
  return String(value || fallback).replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || fallback;
}

async function cleanupBlobUploadSession(session, removeOutput) {
  if (!session) {
    return;
  }

  if (session.handle) {
    await session.handle.close().catch(() => {});
  }

  if (removeOutput && session.filePath) {
    await fs.rm(session.filePath, { force: true }).catch(() => {});
  }

  if (removeOutput && session.tempDir) {
    await fs.rm(session.tempDir, { recursive: true, force: true }).catch(() => {});
  }
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
    overlayRecordingActive = true;
    createOverlayWindow(displayId);
    return { ok: true };
  });

  ipcMain.handle('window:should-auto-minimize', (_event, targetDisplayId) => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, shouldMinimize: false, reason: 'NO_MAIN_WINDOW' };
    }

    const mainBounds = mainWindow.getBounds();
    const mainDisplay = screen.getDisplayMatching(mainBounds);
    const targetDisplay = getTargetDisplay(targetDisplayId);

    return {
      ok: true,
      shouldMinimize: String(mainDisplay.id) === String(targetDisplay.id),
      mainDisplayId: mainDisplay.id,
      targetDisplayId: targetDisplay.id
    };
  });

  ipcMain.handle('window:minimize-main', () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { ok: false, reason: 'NO_MAIN_WINDOW' };
    }

    mainWindow.minimize();
    return { ok: true };
  });

  ipcMain.handle('overlay:destroy', () => {
    overlayRecordingActive = false;
    destroyOverlayWindow();
    return { ok: true };
  });

  ipcMain.handle('overlay:set-enabled', (_event, enabled) => {
    overlayPenEnabled = Boolean(enabled);
    overlayLastDrawActive = false;
    overlayDrawToggle = false;
    overlayAltPressed = false;
    overlayWheelLockUntil = 0;
    mouseDown = false;
    overlayCtrlToggleArmUntil = 0;

    if (overlayWheelResumeTimer) {
      clearTimeout(overlayWheelResumeTimer);
      overlayWheelResumeTimer = null;
    }

    if (!overlayWindow || overlayWindow.isDestroyed()) {
      return { ok: false, reason: 'NO_OVERLAY' };
    }

    overlayWindow.webContents.send('overlay:set-enabled', overlayPenEnabled);
    applyOverlayMouseMode();

    return {
      ok: true,
      toggleMode: clickHookEnabled,
      toggleKey: 'Ctrl',
      wheelPauseMs: OVERLAY_WHEEL_PAUSE_MS
    };
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

  ipcMain.handle('overlay:wheel', () => {
    pauseOverlayByWheel();
    return { ok: true };
  });

  ipcMain.handle('overlay:double-click-marker', (_event, payload) => {
    if (!overlayBorderWindow || overlayBorderWindow.isDestroyed()) {
      return { ok: false, reason: 'NO_OVERLAY' };
    }

    overlayBorderWindow.webContents.send('overlay:double-click-marker', payload || {});
    return { ok: true };
  });

  ipcMain.handle('desktop-sources:get', async () => {
    return desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false
    });
  });

  async function runTrimExport(event, payload) {
    if (!hasFfmpeg()) {
      return {
        ok: false,
        reason: 'NO_FFMPEG',
        message: '找不到 ffmpeg，改用內建剪輯器。'
      };
    }

    const inputPath = String(payload && payload.inputPath ? payload.inputPath : '');
    const startSec = Number(payload && payload.startSec);
    const endSec = Number(payload && payload.endSec);
    if (!inputPath || !Number.isFinite(startSec) || !Number.isFinite(endSec) || endSec <= startSec) {
      return {
        ok: false,
        reason: 'INVALID_INPUT',
        message: '剪輯參數無效。'
      };
    }

    const requestedFormat = String(payload && payload.requestedFormat ? payload.requestedFormat : 'webm').toLowerCase() === 'mp4' ? 'mp4' : 'webm';
    const safeBaseName = sanitizeBaseName(payload && payload.baseName ? payload.baseName : 'cursorcine-export');
    const qualityPresetKey = String(payload && payload.qualityPreset ? payload.qualityPreset : DEFAULT_EXPORT_QUALITY_PRESET);
    const exportQualityPreset = EXPORT_QUALITY_PRESETS[qualityPresetKey] || EXPORT_QUALITY_PRESETS[DEFAULT_EXPORT_QUALITY_PRESET];
    const outputExt = requestedFormat === 'mp4' ? 'mp4' : 'webm';

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '儲存剪輯影片',
      defaultPath: `${safeBaseName}.${outputExt}`,
      filters: [{ name: `${outputExt.toUpperCase()} Video`, extensions: [outputExt] }]
    });

    if (canceled || !filePath) {
      return { ok: false, reason: 'CANCELED', message: '使用者取消儲存。' };
    }
    event.sender.send('video:export-phase', {
      phase: 'processing-start',
      route: 'trim-export'
    });

    const durationSec = Math.max(0.05, endSec - startSec);
    const ffmpegArgs = [
      '-y',
      '-ss',
      startSec.toFixed(3),
      '-t',
      durationSec.toFixed(3),
      '-i',
      inputPath
    ];

    try {
      if (outputExt === 'mp4') {
        const mp4Quality = exportQualityPreset.mp4;
        ffmpegArgs.push(
          '-c:v',
          'libx264',
          '-preset',
          mp4Quality.preset,
          '-crf',
          mp4Quality.crf,
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-b:a',
          mp4Quality.audioBitrate
        );
      } else {
        const webmQuality = exportQualityPreset.webm;
        ffmpegArgs.push(
          '-c:v',
          webmQuality.codec || 'libvpx',
          '-deadline',
          webmQuality.deadline || 'good',
          '-cpu-used',
          webmQuality.cpuUsed,
          '-crf',
          webmQuality.crf,
          '-b:v',
          '0',
          '-c:a',
          'libopus',
          '-b:a',
          webmQuality.audioBitrate
        );
        if ((webmQuality.codec || '').toLowerCase() === 'libvpx-vp9') {
          ffmpegArgs.push(
            '-row-mt',
            '1',
            '-tile-columns',
            '2',
            '-frame-parallel',
            '1'
          );
        }
      }

      ffmpegArgs.push(filePath);
      await runFfmpeg(ffmpegArgs);
      return {
        ok: true,
        path: filePath,
        ext: outputExt,
        ffmpegArgs,
        ffmpegCommand: 'ffmpeg ' + ffmpegArgs.map(quoteShellArg).join(' ')
      };
    } catch (error) {
      return {
        ok: false,
        reason: 'TRIM_FAILED',
        message: error.message || 'ffmpeg 剪輯失敗。',
        ffmpegArgs
      };
    } finally {
      if (payload && payload.cleanupTempDir) {
        await fs.rm(payload.cleanupTempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  }

  ipcMain.handle('video:blob-upload-open', async (event, payload) => {
    const mode = String(payload && payload.mode ? payload.mode : 'temp');
    const ext = sanitizeExt(payload && payload.ext ? payload.ext : 'webm');
    const safeBaseName = sanitizeBaseName(payload && payload.baseName ? payload.baseName : 'cursorcine-export');
    const route = String(payload && payload.route ? payload.route : 'save-file');

    let filePath = '';
    let tempDir = '';

    if (mode === 'save') {
      const title = String(payload && payload.title ? payload.title : '儲存影片');
      const { canceled, filePath: selectedPath } = await dialog.showSaveDialog({
        title,
        defaultPath: `${safeBaseName}.${ext}`,
        filters: [{ name: `${ext.toUpperCase()} Video`, extensions: [ext] }]
      });
      if (canceled || !selectedPath) {
        return { ok: false, reason: 'CANCELED', message: '使用者取消儲存。' };
      }
      filePath = selectedPath;
      event.sender.send('video:export-phase', {
        phase: 'processing-start',
        route
      });
    } else {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cursorcine-upload-'));
      filePath = path.join(tempDir, `${safeBaseName}.${ext}`);
    }

    try {
      const handle = await fs.open(filePath, 'w');
      const sessionId = blobUploadSessionSeq++;
      blobUploadSessions.set(sessionId, {
        handle,
        filePath,
        tempDir
      });
      return {
        ok: true,
        sessionId,
        filePath,
        tempDir
      };
    } catch (error) {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      }
      return {
        ok: false,
        reason: 'OPEN_FAILED',
        message: error && error.message ? error.message : '無法建立輸出檔。'
      };
    }
  });

  ipcMain.handle('video:blob-upload-chunk', async (_event, payload) => {
    const sessionId = Number(payload && payload.sessionId);
    const session = blobUploadSessions.get(sessionId);
    if (!session) {
      return { ok: false, reason: 'INVALID_SESSION', message: '找不到上傳工作階段。' };
    }

    const bytes = payload && payload.bytes ? payload.bytes : null;
    const size = Number(bytes && bytes.byteLength ? bytes.byteLength : 0);
    if (!bytes || size <= 0 || size > BLOB_UPLOAD_CHUNK_MAX_BYTES) {
      return { ok: false, reason: 'INVALID_CHUNK', message: '上傳區塊無效。' };
    }

    try {
      await session.handle.write(Buffer.from(bytes));
      return { ok: true, wrote: size };
    } catch (error) {
      return {
        ok: false,
        reason: 'WRITE_FAILED',
        message: error && error.message ? error.message : '寫入區塊失敗。'
      };
    }
  });

  ipcMain.handle('video:blob-upload-close', async (_event, payload) => {
    const sessionId = Number(payload && payload.sessionId);
    const abort = Boolean(payload && payload.abort);
    const session = blobUploadSessions.get(sessionId);
    if (!session) {
      return { ok: false, reason: 'INVALID_SESSION', message: '找不到上傳工作階段。' };
    }
    blobUploadSessions.delete(sessionId);
    await cleanupBlobUploadSession(session, abort);
    return { ok: true, aborted: abort };
  });

  ipcMain.handle('video:convert-webm-to-mp4', async (event, payload) => {
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

    const safeBaseName = sanitizeBaseName(payload && payload.baseName ? payload.baseName : 'cursorcine-export');
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cursorcine-'));
    const inputPath = path.join(tempDir, `${safeBaseName}.webm`);

    try {
      await fs.writeFile(inputPath, Buffer.from(bytes));
      return await (async () => {
        const { canceled, filePath } = await dialog.showSaveDialog({
          title: '另存 MP4',
          defaultPath: `${safeBaseName}.mp4`,
          filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
        });

        if (canceled || !filePath) {
          return { ok: false, reason: 'CANCELED', message: '使用者取消儲存。' };
        }

        event.sender.send('video:export-phase', {
          phase: 'processing-start',
          route: 'convert-webm-to-mp4'
        });

        try {
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
        }
      })();
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  ipcMain.handle('video:convert-webm-to-mp4-path', async (event, payload) => {
    if (!hasFfmpeg()) {
      return {
        ok: false,
        reason: 'NO_FFMPEG',
        message: '找不到 ffmpeg，請先安裝 ffmpeg 並加入 PATH。'
      };
    }

    const inputPath = String(payload && payload.inputPath ? payload.inputPath : '');
    if (!inputPath) {
      return {
        ok: false,
        reason: 'INVALID_INPUT',
        message: '缺少影片資料。'
      };
    }

    const safeBaseName = sanitizeBaseName(payload && payload.baseName ? payload.baseName : 'cursorcine-export');
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '另存 MP4',
      defaultPath: `${safeBaseName}.mp4`,
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    });

    if (canceled || !filePath) {
      return { ok: false, reason: 'CANCELED', message: '使用者取消儲存。' };
    }

    event.sender.send('video:export-phase', {
      phase: 'processing-start',
      route: 'convert-webm-to-mp4'
    });

    try {
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
      if (payload && payload.cleanupTempDir) {
        await fs.rm(payload.cleanupTempDir, { recursive: true, force: true }).catch(() => {});
      }
    }
  });

  ipcMain.handle('video:trim-export', async (event, payload) => {
    const bytes = payload && payload.bytes ? payload.bytes : null;
    const inputExt = sanitizeExt(payload && payload.inputExt ? payload.inputExt : 'webm');
    const safeBaseName = sanitizeBaseName(payload && payload.baseName ? payload.baseName : 'cursorcine-export');
    if (!bytes) {
      return {
        ok: false,
        reason: 'INVALID_INPUT',
        message: '缺少影片資料。'
      };
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cursorcine-trim-'));
    const inputPath = path.join(tempDir, `${safeBaseName}.${inputExt}`);
    try {
      await fs.writeFile(inputPath, Buffer.from(bytes));
      return await runTrimExport(event, {
        ...payload,
        inputPath,
        cleanupTempDir: tempDir
      });
    } catch (error) {
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      return {
        ok: false,
        reason: 'TRIM_FAILED',
        message: error && error.message ? error.message : 'ffmpeg 剪輯失敗。'
      };
    }
  });

  ipcMain.handle('video:trim-export-from-path', async (event, payload) => {
    return runTrimExport(event, payload || {});
  });

  ipcMain.handle('video:save-file', async (event, payload) => {
    const bytes = payload && payload.bytes ? payload.bytes : null;
    if (!bytes) {
      return {
        ok: false,
        reason: 'INVALID_INPUT',
        message: '缺少影片資料。'
      };
    }

    const ext = sanitizeExt(payload && payload.ext ? payload.ext : 'webm');
    const safeBaseName = sanitizeBaseName(payload && payload.baseName ? payload.baseName : 'cursorcine-export');
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '儲存影片',
      defaultPath: `${safeBaseName}.${ext}`,
      filters: [{ name: `${ext.toUpperCase()} Video`, extensions: [ext] }]
    });

    if (canceled || !filePath) {
      return { ok: false, reason: 'CANCELED', message: '使用者取消儲存。' };
    }
    event.sender.send('video:export-phase', {
      phase: 'processing-start',
      route: 'save-file'
    });

    try {
      await fs.writeFile(filePath, Buffer.from(bytes));
      return { ok: true, path: filePath };
    } catch (error) {
      return {
        ok: false,
        reason: 'WRITE_FAILED',
        message: error.message || '儲存失敗。'
      };
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
  for (const [sessionId, session] of blobUploadSessions) {
    blobUploadSessions.delete(sessionId);
    cleanupBlobUploadSession(session, true).catch(() => {});
  }
  destroyOverlayWindow();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
