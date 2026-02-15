const { app, BrowserWindow, ipcMain, screen, desktopCapturer, dialog, utilityProcess, session, clipboard } = require('electron');
const path = require('path');
const fsNative = require('fs');
const fs = require('fs/promises');
const os = require('os');
const { pathToFileURL } = require('url');
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const crypto = require('crypto');

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
const HDR_RUNTIME_MAX_READ_FAILURES = 8;
const HDR_RUNTIME_MAX_FRAME_BYTES = 1536 * 1024;
const HDR_NATIVE_PUSH_IPC_ENABLED = String(process.env.CURSORCINE_ENABLE_HDR_NATIVE_IPC || '1') !== '0';
const HDR_NATIVE_LIVE_ROUTE_ENABLED = String(process.env.CURSORCINE_ENABLE_HDR_NATIVE_LIVE || '1') !== '0';
const HDR_WGC_ROUTE_ENABLED = String(process.env.CURSORCINE_ENABLE_HDR_WGC || '1') !== '0';
const HDR_ROUTE_PREFERENCE = String(process.env.CURSORCINE_HDR_ROUTE_PREFERENCE || 'auto').trim().toLowerCase();
const HDR_NATIVE_PIPELINE_STAGE = HDR_NATIVE_PUSH_IPC_ENABLED ? 'experimental-http-pull' : 'control-plane-only';
const HDR_WGC_PIPELINE_STAGE = HDR_WGC_ROUTE_ENABLED ? 'wgc-worker-latest-frame-v1' : 'wgc-disabled';
const HDR_TRACE_LIMIT = 120;
const HDR_SHARED_POLL_INTERVAL_MS = 16;
const HDR_SHARED_CONTROL = {
  STATUS: 0,
  FRAME_SEQ: 1,
  WIDTH: 2,
  HEIGHT: 3,
  STRIDE: 4,
  BYTE_LENGTH: 5,
  TS_LOW: 6,
  TS_HIGH: 7,
  PIXEL_FORMAT: 8
};

function encodeHdrPixelFormat(value) {
  const fmt = String(value || '').trim().toUpperCase();
  if (fmt === 'BGRA8') {
    return 2;
  }
  return 1; // RGBA8 default
}

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
let overlayCtrlChordActive = false;
let overlayWheelLockUntil = 0;
let overlayWheelResumeTimer = null;
let overlayReentryGraceTimer = null;

let overlayCtrlToggleArmUntil = 0;
let overlayLastDrawActive = false;
let overlayLastPointerInside = null;
let overlayReentryGraceUntil = 0;
let overlaySafeArmUntil = 0;
let overlayRecordingActive = false;
let overlayBounds = null;
let blobUploadSessionSeq = 1;
const blobUploadSessions = new Map();
const trackedUploadTempDirs = new Set();
let exportTaskSeq = 1;
const exportTasks = new Map();
let quitCleanupStarted = false;
let windowsHdrNativeBridge = null;
let windowsHdrNativeLoadError = '';
let windowsHdrWgcBridge = null;
let windowsHdrWgcLoadError = '';
let hdrCaptureSessionSeq = 1;
const hdrCaptureSessions = new Map();
let hdrSharedSessionSeq = 1;
const hdrSharedSessions = new Map();
let hdrWorkerProcess = null;
let hdrWorkerState = 'stopped';
let hdrWorkerLastError = '';
let hdrWorkerLastExitCode = null;
let hdrWorkerLastExitSignal = '';
let hdrWorkerLastMessage = '';
let hdrWorkerRequestSeq = 1;
const hdrWorkerPendingRequests = new Map();
const hdrTrace = [];
let hdrFrameServer = null;
let hdrFrameServerPort = 0;
const hdrFrameTokens = new Map();
let hdrNativeSmokeState = {
  ran: false,
  ok: false,
  timestamp: 0,
  sourceId: '',
  displayId: '',
  startOk: false,
  readOk: false,
  stopOk: false,
  startReason: '',
  readReason: '',
  stopReason: ''
};
const OVERLAY_WHEEL_PAUSE_MS = 450;
const OVERLAY_REENTRY_GRACE_MS = 1200;
const OVERLAY_SAFE_MODE = String(process.env.CURSORCINE_OVERLAY_SAFE_MODE || '0') === '1';
const OVERLAY_SAFE_ARM_MS = 320;
let crossOriginIsolationHeadersInstalled = false;

function pushHdrTrace(type, detail = {}) {
  hdrTrace.push({
    ts: Date.now(),
    type: String(type || 'unknown'),
    detail: detail && typeof detail === 'object' ? detail : { value: String(detail || '') }
  });
  if (hdrTrace.length > HDR_TRACE_LIMIT) {
    hdrTrace.splice(0, hdrTrace.length - HDR_TRACE_LIMIT);
  }
}

function ewma(prev, sample, alpha = 0.2) {
  const p = Number(prev || 0);
  const s = Number(sample || 0);
  if (!Number.isFinite(s) || s <= 0) {
    return p;
  }
  return p > 0 ? (p * (1 - alpha) + s * alpha) : s;
}

function ensureHdrFrameServer() {
  if (hdrFrameServer && hdrFrameServerPort > 0) {
    return Promise.resolve({ ok: true, port: hdrFrameServerPort });
  }

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(String(req.url || '/'), 'http://127.0.0.1');
        const pathMatch = /^\/hdr-frame\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
        if (!pathMatch) {
          res.statusCode = 404;
          res.end('not-found');
          return;
        }
        const token = pathMatch[1];
        const sessionId = Number(hdrFrameTokens.get(token) || 0);
        if (!sessionId || !hdrSharedSessions.has(sessionId)) {
          res.statusCode = 404;
          res.end('invalid-session');
          return;
        }
        const session = hdrSharedSessions.get(sessionId);
        if (!session || !session.latestFrameBytes || !Buffer.isBuffer(session.latestFrameBytes)) {
          res.statusCode = 204;
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end();
          return;
        }
        const minSeq = Number(url.searchParams.get('minSeq') || 0);
        const frameSeq = Number(session.latestFrameSeq || 0);
        if (minSeq > 0 && frameSeq <= minSeq) {
          res.statusCode = 204;
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.end();
          return;
        }

        const frame = session.latestFrameBytes;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('X-Hdr-Frame-Seq', String(frameSeq));
        res.setHeader('X-Hdr-Width', String(Number(session.latestWidth || session.width || 0)));
        res.setHeader('X-Hdr-Height', String(Number(session.latestHeight || session.height || 0)));
        res.setHeader('X-Hdr-Stride', String(Number(session.latestStride || session.stride || 0)));
        res.setHeader('X-Hdr-Pixel-Format', String(session.latestPixelFormat || 'RGBA8'));
        res.setHeader('X-Hdr-Timestamp-Ms', String(Number(session.latestTimestampMs || 0)));
        res.end(frame);
      } catch (_error) {
        res.statusCode = 500;
        res.end('server-error');
      }
    });

    server.on('error', () => {
      resolve({ ok: false, port: 0 });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      hdrFrameServer = server;
      hdrFrameServerPort = addr && typeof addr === 'object' ? Number(addr.port || 0) : 0;
      pushHdrTrace('frame-server-start', { port: hdrFrameServerPort });
      resolve({ ok: hdrFrameServerPort > 0, port: hdrFrameServerPort });
    });
  });
}

function getHdrWorkerStatus() {
  return {
    ok: true,
    state: hdrWorkerState,
    hasProcess: Boolean(hdrWorkerProcess),
    lastError: hdrWorkerLastError || '',
    lastExitCode: hdrWorkerLastExitCode,
    lastExitSignal: hdrWorkerLastExitSignal || '',
    lastMessage: hdrWorkerLastMessage || ''
  };
}

function wireHdrWorkerProcess(proc) {
  proc.on('message', (message) => {
    if (!message || typeof message !== 'object') {
      return;
    }
    const type = String(message.type || '');
    if (type === 'ready') {
      hdrWorkerState = 'running';
      hdrWorkerLastError = '';
      hdrWorkerLastMessage = 'ready';
      return;
    }
    if (type === 'error') {
      hdrWorkerState = 'error';
      hdrWorkerLastError = String(message.error || 'worker error');
      hdrWorkerLastMessage = hdrWorkerLastError;
      return;
    }
    if (type === 'log') {
      hdrWorkerLastMessage = String(message.message || '');
      return;
    }
    if (type === 'response') {
      const requestId = Number(message.requestId || 0);
      const pending = hdrWorkerPendingRequests.get(requestId);
      if (!pending) {
        return;
      }
      hdrWorkerPendingRequests.delete(requestId);
      clearTimeout(pending.timer);
      if (message.ok) {
        pending.resolve(message);
      } else {
        pending.reject(new Error(String(message.message || message.reason || 'Worker request failed')));
      }
    }
  });

  proc.on('exit', (code, signal) => {
    hdrWorkerLastExitCode = Number.isFinite(code) ? code : null;
    hdrWorkerLastExitSignal = signal ? String(signal) : '';
    if (hdrWorkerState !== 'stopped') {
      hdrWorkerState = code === 0 ? 'stopped' : 'error';
    }
    if (code !== 0) {
      hdrWorkerLastError = 'HDR worker exited unexpectedly (' + String(code) + ')';
    }
    for (const [requestId, pending] of hdrWorkerPendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('HDR worker exited before response'));
      hdrWorkerPendingRequests.delete(requestId);
    }
    hdrWorkerProcess = null;
  });
}

async function hdrWorkerRequest(command, payload = {}, timeoutMs = 5000) {
  if (!hdrWorkerProcess) {
    const start = await startHdrWorker();
    if (!start || !start.hasProcess) {
      throw new Error((start && start.lastError) || 'HDR worker unavailable');
    }
  }

  const proc = hdrWorkerProcess;
  if (!proc || typeof proc.postMessage !== 'function') {
    throw new Error('HDR worker process unavailable');
  }

  const requestId = hdrWorkerRequestSeq++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      hdrWorkerPendingRequests.delete(requestId);
      reject(new Error('HDR worker request timeout: ' + command));
    }, Math.max(100, Number(timeoutMs || 5000)));

    hdrWorkerPendingRequests.set(requestId, {
      resolve,
      reject,
      timer
    });

    proc.postMessage({
      type: 'request',
      requestId,
      command,
      payload
    });
  });
}

async function startHdrWorker(payload = {}) {
  if (hdrWorkerProcess) {
    return {
      ...getHdrWorkerStatus(),
      started: false,
      reason: 'ALREADY_RUNNING'
    };
  }

  if (!utilityProcess || typeof utilityProcess.fork !== 'function') {
    hdrWorkerState = 'error';
    hdrWorkerLastError = 'utilityProcess API unavailable';
    return {
      ...getHdrWorkerStatus(),
      started: false,
      reason: 'UNAVAILABLE'
    };
  }

  try {
    const workerPath = path.join(__dirname, 'hdr-worker.js');
    const proc = utilityProcess.fork(workerPath, {
      serviceName: 'cursorcine-hdr-worker'
    });

    hdrWorkerProcess = proc;
    hdrWorkerState = 'starting';
    hdrWorkerLastError = '';
    hdrWorkerLastExitCode = null;
    hdrWorkerLastExitSignal = '';
    hdrWorkerLastMessage = 'spawned';
    wireHdrWorkerProcess(proc);

    if (typeof proc.postMessage === 'function') {
      proc.postMessage({
        type: 'init',
        payload
      });
    }

    return {
      ...getHdrWorkerStatus(),
      started: true
    };
  } catch (error) {
    hdrWorkerState = 'error';
    hdrWorkerLastError = error && error.message ? error.message : 'Failed to start HDR worker';
    hdrWorkerProcess = null;
    return {
      ...getHdrWorkerStatus(),
      started: false,
      reason: 'START_FAILED'
    };
  }
}

async function stopHdrWorker() {
  if (!hdrWorkerProcess) {
    hdrWorkerState = 'stopped';
    return {
      ...getHdrWorkerStatus(),
      stopped: true,
      reason: 'NO_PROCESS'
    };
  }

  const proc = hdrWorkerProcess;
  hdrWorkerState = 'stopping';
  try {
    for (const [requestId, pending] of hdrWorkerPendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('HDR worker stopping'));
      hdrWorkerPendingRequests.delete(requestId);
    }
    if (typeof proc.postMessage === 'function') {
      proc.postMessage({ type: 'stop' });
    }
    proc.kill();
  } catch (_error) {
  } finally {
    hdrWorkerProcess = null;
    hdrWorkerState = 'stopped';
  }

  return {
    ...getHdrWorkerStatus(),
    stopped: true
  };
}

function loadWindowsHdrNativeBridge() {
  if (process.platform !== 'win32') {
    return null;
  }
  if (windowsHdrNativeBridge) {
    return windowsHdrNativeBridge;
  }
  if (windowsHdrNativeLoadError) {
    return null;
  }

  try {
    const mod = require(path.join(__dirname, '..', 'native', 'windows-hdr-capture'));
    windowsHdrNativeBridge = mod;
    return windowsHdrNativeBridge;
  } catch (error) {
    windowsHdrNativeLoadError = error && error.message ? error.message : 'load failed';
    return null;
  }
}

function getDisplayHdrHint(displayId) {
  const display = getTargetDisplay(displayId);
  const colorDepth = Number(display && display.colorDepth ? display.colorDepth : 0);
  const colorSpace = String(display && display.colorSpace ? display.colorSpace : '');
  const hdrByDepth = colorDepth >= 30;
  const hdrByColorSpace = /hdr|pq|hlg|2020|scRGB/i.test(colorSpace);
  const bounds = display && display.bounds ? display.bounds : { x: 0, y: 0, width: 0, height: 0 };

  return {
    displayId: String(display && display.id ? display.id : ''),
    scaleFactor: Number(display && display.scaleFactor ? display.scaleFactor : 1),
    bounds: {
      x: Number(bounds.x || 0),
      y: Number(bounds.y || 0),
      width: Number(bounds.width || 0),
      height: Number(bounds.height || 0)
    },
    colorDepth,
    colorSpace,
    isHdrLikely: hdrByDepth || hdrByColorSpace
  };
}

function loadWindowsHdrWgcBridge() {
  if (process.platform !== 'win32') {
    return null;
  }
  if (windowsHdrWgcBridge) {
    return windowsHdrWgcBridge;
  }
  if (windowsHdrWgcLoadError) {
    return null;
  }

  try {
    const mod = require(path.join(__dirname, '..', 'native', 'windows-wgc-hdr-capture'));
    windowsHdrWgcBridge = mod;
    return windowsHdrWgcBridge;
  } catch (error) {
    windowsHdrWgcLoadError = error && error.message ? error.message : 'load failed';
    return null;
  }
}

function normalizeHdrRoutePreference(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'wgc' || v === 'legacy' || v === 'auto') {
    return v;
  }
  return 'auto';
}

function selectHdrBridge(requestedRoute) {
  const preference = normalizeHdrRoutePreference(requestedRoute || HDR_ROUTE_PREFERENCE);
  const tries = preference === 'legacy'
    ? ['legacy', 'wgc']
    : (preference === 'wgc' ? ['wgc', 'legacy'] : ['wgc', 'legacy']);
  const errors = [];

  for (const candidate of tries) {
    if (candidate === 'wgc') {
      if (!HDR_WGC_ROUTE_ENABLED) {
        errors.push('WGC_ROUTE_DISABLED');
        continue;
      }
      const bridge = loadWindowsHdrWgcBridge();
      if (bridge && typeof bridge.startCapture === 'function' && typeof bridge.readFrame === 'function') {
        return {
          route: 'wgc-v1',
          fallbackLevel: 1,
          bridge,
          backendLabel: String(bridge.backendName || 'windows-wgc-hdr-capture')
        };
      }
      errors.push(windowsHdrWgcLoadError || 'WGC_UNAVAILABLE');
      continue;
    }

    const bridge = loadWindowsHdrNativeBridge();
    if (bridge && typeof bridge.startCapture === 'function' && typeof bridge.readFrame === 'function') {
      return {
        route: 'native-legacy',
        fallbackLevel: 2,
        bridge,
        backendLabel: String(bridge.backendName || 'windows-hdr-capture')
      };
    }
    errors.push(windowsHdrNativeLoadError || 'LEGACY_UNAVAILABLE');
  }

  return {
    route: 'builtin-desktop',
    fallbackLevel: 3,
    bridge: null,
    backendLabel: '',
    reason: errors.length > 0 ? errors.join('|') : 'NATIVE_UNAVAILABLE'
  };
}

async function runHdrNativeRouteSmoke(payload = {}) {
  const sourceId = String(payload && payload.sourceId ? payload.sourceId : '');
  const displayId = payload && payload.displayId ? payload.displayId : undefined;
  const result = {
    ok: false,
    sourceId,
    displayId: displayId ? String(displayId) : '',
    startOk: false,
    readOk: false,
    stopOk: false,
    startReason: '',
    readReason: '',
    stopReason: '',
    width: 0,
    height: 0,
    stride: 0,
    pixelFormat: '',
    hasFrame: false
  };

  if (process.platform !== 'win32') {
    result.startReason = 'NOT_WINDOWS';
    result.readReason = 'NOT_WINDOWS';
    result.stopReason = 'NOT_WINDOWS';
    pushHdrTrace('native-smoke-not-windows', { sourceId });
    hdrNativeSmokeState = { ...hdrNativeSmokeState, ...result, ran: true, ok: false, timestamp: Date.now() };
    return result;
  }
  if (!sourceId) {
    result.startReason = 'INVALID_INPUT';
    result.readReason = 'SKIPPED';
    result.stopReason = 'SKIPPED';
    pushHdrTrace('native-smoke-invalid-input', {});
    hdrNativeSmokeState = { ...hdrNativeSmokeState, ...result, ran: true, ok: false, timestamp: Date.now() };
    return result;
  }

  const bridge = loadWindowsHdrNativeBridge();
  if (!bridge || typeof bridge.startCapture !== 'function' || typeof bridge.readFrame !== 'function' || typeof bridge.stopCapture !== 'function') {
    result.startReason = 'NATIVE_UNAVAILABLE';
    result.readReason = 'SKIPPED';
    result.stopReason = 'SKIPPED';
    pushHdrTrace('native-smoke-native-unavailable', {
      message: windowsHdrNativeLoadError || 'NATIVE_UNAVAILABLE'
    });
    hdrNativeSmokeState = { ...hdrNativeSmokeState, ...result, ran: true, ok: false, timestamp: Date.now() };
    return result;
  }

  let nativeSessionId = 0;
  try {
    const displayHint = getDisplayHdrHint(displayId);
    const physicalW = Math.max(1, Math.round(Number(displayHint.bounds.width || 1) * Number(displayHint.scaleFactor || 1)));
    const physicalH = Math.max(1, Math.round(Number(displayHint.bounds.height || 1) * Number(displayHint.scaleFactor || 1)));
    const start = await Promise.resolve(bridge.startCapture({
      sourceId,
      displayId: displayHint.displayId,
      maxFps: 30,
      maxOutputPixels: Math.max(640 * 360, physicalW * physicalH),
      toneMap: { profile: 'rec709-rolloff-v1', rolloff: 0.0, saturation: 1.0 },
      displayHint
    }));
    if (!start || !start.ok) {
      result.startReason = String((start && start.reason) || 'START_FAILED');
      result.readReason = 'SKIPPED';
      result.stopReason = 'SKIPPED';
      pushHdrTrace('native-smoke-start-failed', {
        reason: result.startReason,
        message: String((start && start.message) || '')
      });
      hdrNativeSmokeState = { ...hdrNativeSmokeState, ...result, ran: true, ok: false, timestamp: Date.now() };
      return result;
    }

    nativeSessionId = Number(start.nativeSessionId || 0);
    result.startOk = true;
    result.startReason = 'OK';
    result.width = Number(start.width || 0);
    result.height = Number(start.height || 0);
    result.stride = Number(start.stride || 0);
    result.pixelFormat = String(start.pixelFormat || 'RGBA8');

    try {
      const frame = await Promise.resolve(bridge.readFrame({
        nativeSessionId,
        timeoutMs: 200
      }));
      if (frame && frame.ok) {
        result.readOk = true;
        result.readReason = 'OK';
        result.hasFrame = Boolean(frame.bytes && frame.bytes.length > 0);
        result.width = Number(frame.width || result.width || 0);
        result.height = Number(frame.height || result.height || 0);
        result.stride = Number(frame.stride || result.stride || 0);
        result.pixelFormat = String(frame.pixelFormat || result.pixelFormat || 'RGBA8');
      } else {
        result.readOk = false;
        result.readReason = String((frame && frame.reason) || 'READ_FAILED');
      }
    } catch (error) {
      result.readOk = false;
      result.readReason = error && error.message ? error.message : 'READ_EXCEPTION';
    }
  } catch (error) {
    result.startReason = error && error.message ? error.message : 'START_EXCEPTION';
    result.readReason = 'SKIPPED';
  } finally {
    if (nativeSessionId > 0) {
      try {
        await Promise.resolve(bridge.stopCapture({ nativeSessionId }));
        result.stopOk = true;
        result.stopReason = 'OK';
      } catch (error) {
        result.stopOk = false;
        result.stopReason = error && error.message ? error.message : 'STOP_EXCEPTION';
      }
    } else {
      result.stopOk = false;
      result.stopReason = 'SKIPPED';
    }
  }

  result.ok = Boolean(result.startOk && result.stopOk);
  hdrNativeSmokeState = {
    ...hdrNativeSmokeState,
    ...result,
    ran: true,
    ok: Boolean(result.ok),
    timestamp: Date.now()
  };
  pushHdrTrace('native-smoke-finished', {
    sourceId: result.sourceId,
    displayId: result.displayId,
    ok: result.ok,
    startOk: result.startOk,
    readOk: result.readOk,
    stopOk: result.stopOk,
    readReason: result.readReason
  });
  return result;
}

async function stopHdrCaptureSession(sessionId) {
  const session = hdrCaptureSessions.get(sessionId);
  if (!session) {
    return { ok: false, reason: 'INVALID_SESSION', message: '找不到 HDR 擷取工作階段。' };
  }

  hdrCaptureSessions.delete(sessionId);

  if (!session.bridge || typeof session.bridge.stopCapture !== 'function') {
    return { ok: true, stopped: true };
  }

  try {
    await Promise.resolve(session.bridge.stopCapture({
      nativeSessionId: session.nativeSessionId
    }));
    return { ok: true, stopped: true };
  } catch (error) {
    return {
      ok: false,
      reason: 'STOP_FAILED',
      message: error && error.message ? error.message : '停止 HDR 擷取失敗。'
    };
  }
}
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

function scheduleOverlayReentryGraceEnd() {
  if (overlayReentryGraceTimer) {
    clearTimeout(overlayReentryGraceTimer);
    overlayReentryGraceTimer = null;
  }
  const waitMs = Math.max(0, overlayReentryGraceUntil - Date.now());
  if (waitMs <= 0) {
    applyOverlayMouseMode();
    return;
  }
  overlayReentryGraceTimer = setTimeout(() => {
    overlayReentryGraceTimer = null;
    applyOverlayMouseMode();
  }, waitMs + 10);
}

function isPointerInsideOverlayBounds() {
  if (!overlayBounds) {
    return false;
  }
  const p = screen.getCursorScreenPoint();
  return (
    p.x >= overlayBounds.x &&
    p.x < overlayBounds.x + overlayBounds.width &&
    p.y >= overlayBounds.y &&
    p.y < overlayBounds.y + overlayBounds.height
  );
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

  if (overlayLastPointerInside === null || overlayLastPointerInside !== inside) {
    const wasInside = overlayLastPointerInside;
    overlayLastPointerInside = inside;

    // Re-entering target display can leave HDR video composition in a bad state on some GPUs.
    // Perform a short overlay pause/resume cycle (same mechanism as wheel pause) automatically.
    if (inside && wasInside === false && overlayDrawEnabled()) {
      overlayWheelLockUntil = Date.now() + 140;
      overlayReentryGraceUntil = Date.now() + OVERLAY_REENTRY_GRACE_MS;
      if (OVERLAY_SAFE_MODE) {
        overlaySafeArmUntil = overlayReentryGraceUntil + OVERLAY_SAFE_ARM_MS;
      }
      scheduleOverlayWheelResume();
      scheduleOverlayReentryGraceEnd();
    }

    applyOverlayMouseMode();
  }
}

function applyOverlayMouseMode() {
  if (!overlayWindow || overlayWindow.isDestroyed()) {
    return;
  }

  const now = Date.now();
  const drawEnabled = overlayDrawEnabled();
  const wheelLocked = now < overlayWheelLockUntil;
  const pointerInside = isPointerInsideOverlayBounds();
  const capturePointer = overlayDrawActive() && pointerInside;
  const shouldKeepVisible = drawEnabled && !wheelLocked && pointerInside;
  const pausedByOutside = drawEnabled && !wheelLocked && !pointerInside;
  const inReentryGrace = shouldKeepVisible && now < overlayReentryGraceUntil;
  const inSafeArm = shouldKeepVisible && OVERLAY_SAFE_MODE && now < overlaySafeArmUntil;
  const shouldBlockBackground = shouldKeepVisible && !inReentryGrace &&
    (OVERLAY_SAFE_MODE ? (Boolean(mouseDown) || inSafeArm) : true);

  if (shouldKeepVisible) {
    if (!overlayWindow.isVisible()) {
      if (typeof overlayWindow.showInactive === "function") {
        overlayWindow.showInactive();
      } else {
        overlayWindow.show();
      }

      overlayWindow.webContents.send("overlay:clear");
    }

    // In draw-active mode, default behavior blocks background interactions.
    // Safe mode only blocks while actively drawing (mouse down).
    overlayWindow.setAlwaysOnTop(true, 'pop-up-menu');
    if (!shouldBlockBackground) {
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    } else {
      overlayWindow.setIgnoreMouseEvents(false);
    }
  } else if ((drawEnabled && wheelLocked) || pausedByOutside) {
    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    overlayWindow.setIgnoreMouseEvents(true);

    if (overlayWindow.isVisible()) {
      overlayWindow.hide();
    }

    overlayWindow.blur();
  } else {
    if (overlayLastDrawActive) {
      overlayWindow.webContents.send("overlay:clear");
    }

    overlayWindow.setAlwaysOnTop(true, 'screen-saver');
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
      const isCtrlKey = isOverlayToggleKey(event);
      if (!isCtrlKey) {
        if (overlayAltPressed) {
          // Ctrl+<key> chord (for example Ctrl+C) should not toggle overlay draw mode.
          overlayCtrlChordActive = true;
        }
        return;
      }
      if (overlayAltPressed) {
        return;
      }
      overlayAltPressed = true;
      overlayCtrlChordActive = false;

      if (!overlayPenEnabled) {
        return;
      }
    });
    uIOhook.on('keyup', (event) => {
      if (!isOverlayToggleKey(event)) {
        return;
      }
      if (!overlayAltPressed) {
        return;
      }
      overlayAltPressed = false;

      if (!overlayPenEnabled) {
        return;
      }
      if (overlayCtrlChordActive) {
        overlayCtrlChordActive = false;
        return;
      }

      const now = Date.now();
      if (!overlayDrawToggle) {
        overlayDrawToggle = true;
        overlayWheelLockUntil = 0;
        overlayCtrlToggleArmUntil = 0;
        if (OVERLAY_SAFE_MODE) {
          overlaySafeArmUntil = Date.now() + OVERLAY_SAFE_ARM_MS;
        }
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
      overlayCtrlChordActive = false;
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

  mainWindow.on('close', () => {
    if (process.platform === 'darwin' || quitCleanupStarted) {
      return;
    }
    quitCleanupStarted = true;
    runQuitCleanupSync();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    overlayRecordingActive = false;
    destroyOverlayWindow();
    if (process.platform !== 'darwin') {
      app.quit();
    }
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
  overlayLastPointerInside = null;
  overlayReentryGraceUntil = 0;
  overlaySafeArmUntil = 0;

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

function createExportAbortedError() {
  const error = new Error('輸出已由使用者中斷。');
  error.code = 'EXPORT_ABORTED';
  return error;
}

function runFfmpeg(args, taskId) {
  const parsedTaskId = Number(taskId);
  const hasTask = Number.isFinite(parsedTaskId) && parsedTaskId > 0;
  const task = hasTask ? exportTasks.get(parsedTaskId) : null;

  return new Promise((resolve, reject) => {
    if (task && task.canceled) {
      reject(createExportAbortedError());
      return;
    }

    const proc = spawn('ffmpeg', args, { windowsHide: true });
    let stderr = '';

    if (task) {
      task.proc = proc;
    }

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', (error) => {
      if (task && task.proc === proc) {
        task.proc = null;
      }
      reject(error);
    });
    proc.on('close', (code) => {
      if (task && task.proc === proc) {
        task.proc = null;
      }
      if (task && task.canceled) {
        reject(createExportAbortedError());
        return;
      }
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

function isSafeCursorcineTempDir(tempDir) {
  const dir = String(tempDir || '');
  if (!dir) {
    return false;
  }
  const resolved = path.resolve(dir);
  const tmpRoot = path.resolve(os.tmpdir());
  const expectedPrefix = tmpRoot.endsWith(path.sep) ? tmpRoot : tmpRoot + path.sep;
  return resolved.startsWith(expectedPrefix) && path.basename(resolved).startsWith('cursorcine-upload-');
}

function trackUploadTempDir(tempDir) {
  if (isSafeCursorcineTempDir(tempDir)) {
    trackedUploadTempDirs.add(path.resolve(tempDir));
  }
}

function untrackUploadTempDir(tempDir) {
  if (!tempDir) {
    return;
  }
  trackedUploadTempDirs.delete(path.resolve(String(tempDir)));
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
    untrackUploadTempDir(session.tempDir);
    await fs.rm(session.tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function cleanupTrackedUploadTempDirs() {
  for (const tempDir of trackedUploadTempDirs) {
    trackedUploadTempDirs.delete(tempDir);
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function cleanupUploadTempDirsByScan() {
  const tmpRoot = os.tmpdir();
  const entries = await fs.readdir(tmpRoot, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry || !entry.isDirectory()) {
      continue;
    }
    if (!String(entry.name || '').startsWith('cursorcine-upload-')) {
      continue;
    }
    const dirPath = path.join(tmpRoot, entry.name);
    if (!isSafeCursorcineTempDir(dirPath)) {
      continue;
    }
    trackedUploadTempDirs.delete(path.resolve(dirPath));
    await fs.rm(dirPath, { recursive: true, force: true }).catch(() => {});
  }
}

async function runQuitCleanup() {
  if (hdrFrameServer) {
    try {
      await new Promise((resolve) => hdrFrameServer.close(() => resolve()));
    } catch (_error) {
    }
    hdrFrameServer = null;
    hdrFrameServerPort = 0;
    hdrFrameTokens.clear();
  }
  for (const sessionId of Array.from(hdrSharedSessions.keys())) {
    stopHdrSharedSession(sessionId);
  }
  await stopHdrWorker().catch(() => {});
  for (const sessionId of Array.from(hdrCaptureSessions.keys())) {
    await stopHdrCaptureSession(sessionId).catch(() => {});
  }
  for (const [sessionId, session] of blobUploadSessions) {
    blobUploadSessions.delete(sessionId);
    await cleanupBlobUploadSession(session, true).catch(() => {});
  }
  for (const [taskId, task] of exportTasks) {
    exportTasks.delete(taskId);
    if (task && task.proc && !task.proc.killed) {
      try {
        task.proc.kill('SIGKILL');
      } catch (_error) {
      }
    }
  }
  await cleanupTrackedUploadTempDirs();
  await cleanupUploadTempDirsByScan();
  destroyOverlayWindow();
}

function cleanupBlobUploadSessionSync(session, removeOutput) {
  if (!session) {
    return;
  }

  const fd = Number(session && session.handle ? session.handle.fd : -1);
  if (Number.isFinite(fd) && fd >= 0) {
    try {
      fsNative.closeSync(fd);
    } catch (_error) {
    }
  }

  if (removeOutput && session.filePath) {
    try {
      fsNative.rmSync(session.filePath, { force: true });
    } catch (_error) {
    }
  }

  if (removeOutput && session.tempDir) {
    untrackUploadTempDir(session.tempDir);
    try {
      fsNative.rmSync(session.tempDir, { recursive: true, force: true });
    } catch (_error) {
    }
  }
}

function cleanupUploadTempDirsByScanSync() {
  const tmpRoot = os.tmpdir();
  let entries = [];
  try {
    entries = fsNative.readdirSync(tmpRoot, { withFileTypes: true });
  } catch (_error) {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry || !entry.isDirectory()) {
      continue;
    }
    if (!String(entry.name || '').startsWith('cursorcine-upload-')) {
      continue;
    }
    const dirPath = path.join(tmpRoot, entry.name);
    if (!isSafeCursorcineTempDir(dirPath)) {
      continue;
    }
    trackedUploadTempDirs.delete(path.resolve(dirPath));
    try {
      fsNative.rmSync(dirPath, { recursive: true, force: true });
    } catch (_error) {
    }
  }
}

function runQuitCleanupSync() {
  if (hdrFrameServer) {
    try {
      hdrFrameServer.close();
    } catch (_error) {
    }
    hdrFrameServer = null;
    hdrFrameServerPort = 0;
    hdrFrameTokens.clear();
  }
  if (hdrWorkerProcess) {
    try {
      hdrWorkerProcess.kill();
    } catch (_error) {
    }
    hdrWorkerProcess = null;
  }
  hdrWorkerState = 'stopped';
  for (const sessionId of Array.from(hdrSharedSessions.keys())) {
    stopHdrSharedSession(sessionId);
  }
  hdrCaptureSessions.clear();
  for (const [sessionId, session] of blobUploadSessions) {
    blobUploadSessions.delete(sessionId);
    cleanupBlobUploadSessionSync(session, true);
  }
  for (const [taskId, task] of exportTasks) {
    exportTasks.delete(taskId);
    if (task && task.proc && !task.proc.killed) {
      try {
        task.proc.kill('SIGKILL');
      } catch (_error) {
      }
    }
  }
  for (const tempDir of trackedUploadTempDirs) {
    trackedUploadTempDirs.delete(tempDir);
    try {
      fsNative.rmSync(tempDir, { recursive: true, force: true });
    } catch (_error) {
    }
  }
  cleanupUploadTempDirsByScanSync();
  destroyOverlayWindow();
}

function stopHdrSharedSession(sessionId) {
  const session = hdrSharedSessions.get(sessionId);
  if (!session) {
    return { ok: false, reason: 'INVALID_SESSION', message: '找不到 HDR 共享工作階段。' };
  }
  hdrSharedSessions.delete(sessionId);
  clearTimeout(session.pumpTimer);
  if (session.frameToken) {
    hdrFrameTokens.delete(String(session.frameToken));
  }
  pushHdrTrace('shared-stop', {
    sessionId,
    nativeSessionId: Number(session.nativeSessionId || 0),
    frameSeq: Number(session.frameSeq || 0),
    totalReadFailures: Number(session.totalReadFailures || 0),
    lastReason: String(session.lastReason || '')
  });

  if (session.workerMode) {
    hdrWorkerRequest('capture-stop', {}, 4000).catch(() => {});
    return {
      ok: true,
      stopped: true,
      diagnostics: {
        sessionId,
        workerMode: true,
        frameSeq: Number(session.frameSeq || 0),
        totalReadFailures: Number(session.totalReadFailures || 0),
        readFailures: Number(session.readFailures || 0),
        lastError: String(session.lastError || ''),
        lastReason: String(session.lastReason || ''),
        startedAt: Number(session.startedAt || 0),
        lastFrameAt: Number(session.lastFrameAt || 0),
        bytesPumped: Number(session.bytesPumped || 0)
      }
    };
  }

  if (!session.bridge || typeof session.bridge.stopCapture !== 'function') {
    return { ok: true, stopped: true };
  }
  try {
    session.bridge.stopCapture({
      nativeSessionId: session.nativeSessionId
    });
    return {
      ok: true,
      stopped: true,
      diagnostics: {
        sessionId,
        frameSeq: Number(session.frameSeq || 0),
        totalReadFailures: Number(session.totalReadFailures || 0),
        readFailures: Number(session.readFailures || 0),
        lastError: String(session.lastError || ''),
        lastReason: String(session.lastReason || ''),
        startedAt: Number(session.startedAt || 0),
        lastFrameAt: Number(session.lastFrameAt || 0),
        bytesPumped: Number(session.bytesPumped || 0)
      }
    };
  } catch (error) {
    session.lastError = error && error.message ? error.message : 'STOP_FAILED';
    return {
      ok: false,
      reason: 'STOP_FAILED',
      message: error && error.message ? error.message : '停止 HDR 共享擷取失敗。'
    };
  }
}

function pumpHdrSharedSession(sessionId) {
  const session = hdrSharedSessions.get(sessionId);
  if (!session) {
    return;
  }
  if (session.workerMode) {
    return;
  }
  const loopStartMs = Number(process.hrtime.bigint()) / 1e6;
  if (session.perf && session.perf.lastPumpAt > 0) {
    const expected = HDR_SHARED_POLL_INTERVAL_MS;
    const actual = Math.max(0, loopStartMs - session.perf.lastPumpAt);
    session.perf.pumpJitterMsAvg = ewma(session.perf.pumpJitterMsAvg, Math.abs(actual - expected));
  }
  if (session.perf) {
    session.perf.lastPumpAt = loopStartMs;
  }
  try {
    const readStartMs = Number(process.hrtime.bigint()) / 1e6;
    const frameResult = session.bridge.readFrame({
      nativeSessionId: session.nativeSessionId,
      timeoutMs: 80
    });
    const readEndMs = Number(process.hrtime.bigint()) / 1e6;
    if (session.perf) {
      session.perf.readMsAvg = ewma(session.perf.readMsAvg, readEndMs - readStartMs);
    }

    if (frameResult && frameResult.ok && frameResult.bytes) {
      const bytes = frameResult.bytes;
      const src = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      const copyStartMs = Number(process.hrtime.bigint()) / 1e6;
      session.frameSeq += 1;
      session.lastFrameAt = Date.now();
      const ts = Number(frameResult.timestampMs || Date.now());
      const tsLow = ts >>> 0;
      const tsHigh = Math.floor(ts / 4294967296) >>> 0;
      const width = Number(frameResult.width || session.width);
      const height = Number(frameResult.height || session.height);
      const stride = Number(frameResult.stride || session.stride);
      session.latestFrameSeq = session.frameSeq;
      session.latestTimestampMs = ts;
      session.latestWidth = width;
      session.latestHeight = height;
      session.latestStride = stride;
      session.latestPixelFormat = String(frameResult.pixelFormat || 'RGBA8');
      session.latestFrameBytes = src;
      const copyEndMs = Number(process.hrtime.bigint()) / 1e6;
      if (session.perf) {
        session.perf.copyMsAvg = ewma(session.perf.copyMsAvg, copyEndMs - copyStartMs);
      }

      if (session.frameView && session.controlView) {
        const sabStartMs = Number(process.hrtime.bigint()) / 1e6;
        const len = Math.min(src.length, session.frameView.length);
        session.frameView.set(src.subarray(0, len), 0);
        session.bytesPumped += len;

        Atomics.store(session.controlView, HDR_SHARED_CONTROL.WIDTH, width);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.HEIGHT, height);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.STRIDE, stride);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.BYTE_LENGTH, len);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.TS_LOW, tsLow);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.TS_HIGH, tsHigh);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.PIXEL_FORMAT, encodeHdrPixelFormat(session.latestPixelFormat));
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.FRAME_SEQ, session.frameSeq);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.STATUS, 1);
        const sabEndMs = Number(process.hrtime.bigint()) / 1e6;
        if (session.perf) {
          session.perf.sabWriteMsAvg = ewma(session.perf.sabWriteMsAvg, sabEndMs - sabStartMs);
        }
      }

      if (session.perf) {
        const bytesLen = Number(src.length || 0);
        session.perf.bytesPerFrameAvg = ewma(session.perf.bytesPerFrameAvg, bytesLen);
        if (session.perf.lastFrameAt > 0) {
          const deltaMs = Math.max(1, session.lastFrameAt - session.perf.lastFrameAt);
          session.perf.frameIntervalMsAvg = ewma(session.perf.frameIntervalMsAvg, deltaMs);
          session.perf.bytesPerSec = ewma(session.perf.bytesPerSec, (bytesLen * 1000) / deltaMs);
        }
        session.perf.lastFrameAt = session.lastFrameAt;
      }

      session.readFailures = 0;
      session.noFrameStreak = 0;
      session.lastReason = 'FRAME_OK';
      session.lastError = '';
    } else {
      session.readFailures += 1;
      session.totalReadFailures += 1;
      session.noFrameStreak = Number(session.noFrameStreak || 0) + 1;
      session.lastReason = 'NO_FRAME';
      if (session.controlView && session.readFailures >= HDR_RUNTIME_MAX_READ_FAILURES) {
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.STATUS, 2);
      }
    }
  } catch (error) {
    session.readFailures += 1;
    session.totalReadFailures += 1;
    session.lastReason = 'READ_EXCEPTION';
    session.lastError = error && error.message ? error.message : 'READ_EXCEPTION';
    pushHdrTrace('shared-read-exception', {
      sessionId,
      message: session.lastError
    });
    if (session.controlView && session.readFailures >= HDR_RUNTIME_MAX_READ_FAILURES) {
      Atomics.store(session.controlView, HDR_SHARED_CONTROL.STATUS, 2);
    }
  } finally {
    if (hdrSharedSessions.has(sessionId)) {
      const backoffMs = session.lastReason === 'FRAME_OK'
        ? 0
        : Math.min(48, Math.max(0, Number(session.noFrameStreak || 0)) * 2);
      session.pumpTimer = setTimeout(() => {
        pumpHdrSharedSession(sessionId);
      }, HDR_SHARED_POLL_INTERVAL_MS + backoffMs);
    }
  }
}

async function pumpHdrWorkerSession(sessionId) {
  const session = hdrSharedSessions.get(sessionId);
  if (!session || !session.workerMode) {
    return;
  }
  if (session.workerDirectShared) {
    clearTimeout(session.pumpTimer);
    session.pumpTimer = 0;
    return;
  }
  const loopStartMs = Number(process.hrtime.bigint()) / 1e6;
  if (session.perf && session.perf.lastPumpAt > 0) {
    const expected = HDR_SHARED_POLL_INTERVAL_MS;
    const actual = Math.max(0, loopStartMs - session.perf.lastPumpAt);
    session.perf.pumpJitterMsAvg = ewma(session.perf.pumpJitterMsAvg, Math.abs(actual - expected));
  }
  if (session.perf) {
    session.perf.lastPumpAt = loopStartMs;
  }

  try {
    const readStartMs = Number(process.hrtime.bigint()) / 1e6;
    const frameResult = await hdrWorkerRequest('frame-read', {}, 1000);
    const readEndMs = Number(process.hrtime.bigint()) / 1e6;
    if (session.perf) {
      session.perf.readMsAvg = ewma(session.perf.readMsAvg, readEndMs - readStartMs);
    }
    if (frameResult && frameResult.ok && frameResult.hasFrame && frameResult.bytes) {
      const bytes = frameResult.bytes;
      const src = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
      const copyStartMs = Number(process.hrtime.bigint()) / 1e6;
      const nextSeq = Number(frameResult.frameSeq || 0);
      session.frameSeq = nextSeq > session.frameSeq ? nextSeq : (session.frameSeq + 1);
      session.lastFrameAt = Date.now();
      const ts = Number(frameResult.lastFrameAt || Date.now());
      const width = Number(frameResult.width || session.width);
      const height = Number(frameResult.height || session.height);
      const stride = Number(frameResult.stride || session.stride);
      session.latestFrameSeq = session.frameSeq;
      session.latestTimestampMs = ts;
      session.latestWidth = width;
      session.latestHeight = height;
      session.latestStride = stride;
      session.latestPixelFormat = String(frameResult.pixelFormat || 'RGBA8');
      session.latestFrameBytes = src;
      const copyEndMs = Number(process.hrtime.bigint()) / 1e6;
      if (session.perf) {
        session.perf.copyMsAvg = ewma(session.perf.copyMsAvg, copyEndMs - copyStartMs);
      }
      session.bytesPumped += src.length;
      if (session.frameView && session.controlView) {
        const tsLow = ts >>> 0;
        const tsHigh = Math.floor(ts / 4294967296) >>> 0;
        const len = Math.min(src.length, session.frameView.length);
        const sabStartMs = Number(process.hrtime.bigint()) / 1e6;
        session.frameView.set(src.subarray(0, len), 0);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.WIDTH, width);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.HEIGHT, height);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.STRIDE, stride);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.BYTE_LENGTH, len);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.TS_LOW, tsLow);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.TS_HIGH, tsHigh);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.PIXEL_FORMAT, encodeHdrPixelFormat(session.latestPixelFormat));
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.FRAME_SEQ, session.frameSeq);
        Atomics.store(session.controlView, HDR_SHARED_CONTROL.STATUS, 1);
        const sabEndMs = Number(process.hrtime.bigint()) / 1e6;
        if (session.perf) {
          session.perf.sabWriteMsAvg = ewma(session.perf.sabWriteMsAvg, sabEndMs - sabStartMs);
        }
      }
      if (session.perf) {
        const bytesLen = Number(src.length || 0);
        session.perf.bytesPerFrameAvg = ewma(session.perf.bytesPerFrameAvg, bytesLen);
        if (session.perf.lastFrameAt > 0) {
          const deltaMs = Math.max(1, session.lastFrameAt - session.perf.lastFrameAt);
          session.perf.frameIntervalMsAvg = ewma(session.perf.frameIntervalMsAvg, deltaMs);
          session.perf.bytesPerSec = ewma(session.perf.bytesPerSec, (bytesLen * 1000) / deltaMs);
        }
        session.perf.lastFrameAt = session.lastFrameAt;
      }
      session.readFailures = 0;
      session.noFrameStreak = 0;
      session.lastReason = 'FRAME_OK';
      session.lastError = '';
    } else {
      session.readFailures += 1;
      session.totalReadFailures += 1;
      session.noFrameStreak = Number(session.noFrameStreak || 0) + 1;
      session.lastReason = 'NO_FRAME';
    }
  } catch (error) {
    session.readFailures += 1;
    session.totalReadFailures += 1;
    session.lastReason = 'READ_EXCEPTION';
    session.lastError = error && error.message ? error.message : 'WORKER_FRAME_READ_FAILED';
    pushHdrTrace('shared-worker-read-exception', {
      sessionId,
      message: session.lastError
    });
  } finally {
    if (hdrSharedSessions.has(sessionId)) {
      const backoffMs = session.lastReason === 'FRAME_OK'
        ? 0
        : Math.min(48, Math.max(0, Number(session.noFrameStreak || 0)) * 2);
      session.pumpTimer = setTimeout(() => {
        pumpHdrWorkerSession(sessionId).catch(() => {});
      }, HDR_SHARED_POLL_INTERVAL_MS + backoffMs);
    }
  }
}

function installCrossOriginIsolationHeaders() {
  if (crossOriginIsolationHeadersInstalled) {
    return;
  }
  const defaultSession = session && session.defaultSession ? session.defaultSession : null;
  if (!defaultSession || !defaultSession.webRequest) {
    return;
  }

  crossOriginIsolationHeadersInstalled = true;
  defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...(details.responseHeaders || {}) };
    responseHeaders['Cross-Origin-Opener-Policy'] = ['same-origin'];
    responseHeaders['Cross-Origin-Embedder-Policy'] = ['require-corp'];
    responseHeaders['Cross-Origin-Resource-Policy'] = ['cross-origin'];
    callback({
      responseHeaders
    });
  });
}

app.whenReady().then(() => {
  installCrossOriginIsolationHeaders();
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
    overlayLastPointerInside = null;
    overlayReentryGraceUntil = 0;
    overlaySafeArmUntil = 0;
    if (overlayReentryGraceTimer) {
      clearTimeout(overlayReentryGraceTimer);
      overlayReentryGraceTimer = null;
    }
    destroyOverlayWindow();
    return { ok: true };
  });

  ipcMain.handle('overlay:set-enabled', (_event, enabled) => {
    overlayPenEnabled = Boolean(enabled);
    overlayLastDrawActive = false;
    overlayLastPointerInside = null;
    overlayReentryGraceUntil = 0;
    overlaySafeArmUntil = 0;
    if (overlayReentryGraceTimer) {
      clearTimeout(overlayReentryGraceTimer);
      overlayReentryGraceTimer = null;
    }
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
      safeMode: OVERLAY_SAFE_MODE,
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

  ipcMain.handle('hdr:worker-status', async () => {
    return getHdrWorkerStatus();
  });

  ipcMain.handle('hdr:worker-start', async (_event, payload) => {
    return startHdrWorker(payload || {});
  });

  ipcMain.handle('hdr:worker-stop', async () => {
    return stopHdrWorker();
  });

  ipcMain.handle('hdr:worker-capture-start', async (_event, payload) => {
    try {
      const displayId = payload && payload.displayId ? payload.displayId : undefined;
      const displayHint = getDisplayHdrHint(displayId);
      const workerPayload = {
        ...(payload || {}),
        displayId: displayHint.displayId,
        displayHint
      };
      const result = await hdrWorkerRequest('capture-start', workerPayload, 8000);
      return {
        ok: true,
        width: Number(result.width || 0),
        height: Number(result.height || 0),
        stride: Number(result.stride || 0),
        pixelFormat: String(result.pixelFormat || 'RGBA8'),
        sharedFrameBuffer: result.sharedFrameBuffer || null,
        sharedControlBuffer: result.sharedControlBuffer || null
      };
    } catch (error) {
      return {
        ok: false,
        reason: 'WORKER_CAPTURE_START_FAILED',
        message: error && error.message ? error.message : 'Worker capture start failed'
      };
    }
  });

  ipcMain.handle('hdr:worker-capture-stop', async () => {
    try {
      await hdrWorkerRequest('capture-stop', {}, 4000);
      return { ok: true, stopped: true };
    } catch (error) {
      return {
        ok: false,
        reason: 'WORKER_CAPTURE_STOP_FAILED',
        message: error && error.message ? error.message : 'Worker capture stop failed'
      };
    }
  });

  ipcMain.handle('hdr:worker-frame-meta', async () => {
    try {
      const result = await hdrWorkerRequest('frame-meta', {}, 2000);
      return {
        ok: true,
        frameSeq: Number(result.frameSeq || 0),
        lastFrameAt: Number(result.lastFrameAt || 0),
        hasFrame: Boolean(result.hasFrame),
        meta: result.meta || {}
      };
    } catch (error) {
      return {
        ok: false,
        reason: 'WORKER_FRAME_META_FAILED',
        message: error && error.message ? error.message : 'Worker frame meta failed'
      };
    }
  });

  ipcMain.handle('hdr:worker-frame-read', async () => {
    try {
      const result = await hdrWorkerRequest('frame-read', {}, 3000);
      const frameBytes = result.bytes || null;
      let safeBytes = null;
      if (Buffer.isBuffer(frameBytes)) {
        safeBytes = Buffer.from(frameBytes);
      } else if (frameBytes instanceof Uint8Array) {
        safeBytes = Buffer.from(frameBytes);
      } else if (frameBytes instanceof ArrayBuffer) {
        safeBytes = Buffer.from(frameBytes);
      }
      return {
        ok: true,
        hasFrame: Boolean(result.hasFrame),
        frameSeq: Number(result.frameSeq || 0),
        lastFrameAt: Number(result.lastFrameAt || 0),
        width: Number(result.width || 0),
        height: Number(result.height || 0),
        stride: Number(result.stride || 0),
        pixelFormat: String(result.pixelFormat || 'RGBA8'),
        bytes: safeBytes
          ? safeBytes.buffer.slice(safeBytes.byteOffset, safeBytes.byteOffset + safeBytes.byteLength)
          : null
      };
    } catch (error) {
      return {
        ok: false,
        reason: 'WORKER_FRAME_READ_FAILED',
        message: error && error.message ? error.message : 'Worker frame read failed'
      };
    }
  });

  ipcMain.handle('hdr:shared-start', async (_event, payload) => {
    if (process.platform !== 'win32') {
      return { ok: false, reason: 'NOT_WINDOWS', message: '僅支援 Windows。' };
    }
    const sourceId = String(payload && payload.sourceId ? payload.sourceId : '');
    const displayId = payload && payload.displayId ? payload.displayId : undefined;
    if (!sourceId) {
      pushHdrTrace('shared-start-invalid-input', {});
      return { ok: false, reason: 'INVALID_INPUT', message: '缺少來源識別碼。' };
    }

    const requestedRoute = normalizeHdrRoutePreference(payload && payload.routePreference ? payload.routePreference : '');
    const bridgeSelection = selectHdrBridge(requestedRoute);
    let activeSelection = bridgeSelection;
    let bridge = activeSelection.bridge;
    if (!bridge || typeof bridge.startCapture !== 'function' || typeof bridge.readFrame !== 'function') {
      pushHdrTrace('shared-start-native-unavailable', {
        message: activeSelection.reason || 'NATIVE_UNAVAILABLE',
        requestedRoute
      });
      return {
        ok: false,
        reason: 'NATIVE_UNAVAILABLE',
        message: activeSelection.reason || windowsHdrWgcLoadError || windowsHdrNativeLoadError || 'Windows HDR 原生模組不可用。',
        requestedRoute,
        runtimeRoute: activeSelection.route,
        fallbackLevel: activeSelection.fallbackLevel
      };
    }

    try {
      const displayHint = getDisplayHdrHint(displayId);
      const physicalW = Math.max(1, Math.round(Number(displayHint.bounds.width || 1) * Number(displayHint.scaleFactor || 1)));
      const physicalH = Math.max(1, Math.round(Number(displayHint.bounds.height || 1) * Number(displayHint.scaleFactor || 1)));
      let workerMode = activeSelection.route === 'wgc-v1';
      let startResult = null;
      if (workerMode) {
        const workerStartPayload = {
          sourceId,
          displayId: displayHint.displayId,
          maxFps: Number(payload && payload.maxFps ? payload.maxFps : 60),
          maxOutputPixels: Math.max(640 * 360, physicalW * physicalH),
          toneMap: payload && payload.toneMap ? payload.toneMap : {},
          routePreference: requestedRoute,
          displayHint
        };
        startResult = await hdrWorkerRequest('capture-start', workerStartPayload, 8000);
        if (startResult && startResult.nativeSessionId) {
          startResult.ok = true;
        }
      } else {
        startResult = await Promise.resolve(bridge.startCapture({
          sourceId,
          displayId: displayHint.displayId,
          maxFps: Number(payload && payload.maxFps ? payload.maxFps : 60),
          maxOutputPixels: Math.max(640 * 360, physicalW * physicalH),
          toneMap: payload && payload.toneMap ? payload.toneMap : {},
          routePreference: requestedRoute,
          displayHint
        }));
      }

      if ((!startResult || !startResult.ok) && workerMode && requestedRoute !== 'legacy') {
        const legacySelection = selectHdrBridge('legacy');
        if (legacySelection.bridge &&
            typeof legacySelection.bridge.startCapture === 'function' &&
            typeof legacySelection.bridge.readFrame === 'function') {
          const previousReason = String((startResult && startResult.reason) || 'START_FAILED');
          const previousMessage = String((startResult && startResult.message) || '');
          pushHdrTrace('shared-start-wgc-fallback-legacy', {
            wgcReason: previousReason,
            wgcMessage: previousMessage
          });
          activeSelection = legacySelection;
          bridge = legacySelection.bridge;
          workerMode = false;
          startResult = await Promise.resolve(bridge.startCapture({
            sourceId,
            displayId: displayHint.displayId,
            maxFps: Number(payload && payload.maxFps ? payload.maxFps : 60),
            maxOutputPixels: Math.max(640 * 360, physicalW * physicalH),
            toneMap: payload && payload.toneMap ? payload.toneMap : {},
            routePreference: 'legacy',
            displayHint
          }));
        }
      }

      if (!startResult || !startResult.ok) {
        pushHdrTrace('shared-start-failed', {
          reason: String((startResult && startResult.reason) || 'START_FAILED'),
          message: String((startResult && startResult.message) || '')
        });
        return {
          ok: false,
          reason: String((startResult && startResult.reason) || 'START_FAILED'),
          message: String((startResult && startResult.message) || '啟動 HDR 共享擷取失敗。')
        };
      }

      const width = Math.max(1, Number(startResult.width || 1));
      const height = Math.max(1, Number(startResult.height || 1));
      const stride = Math.max(width * 4, Number(startResult.stride || width * 4));
      const allowSharedBuffer = !payload || payload.allowSharedBuffer !== false;
      const frameServer = await ensureHdrFrameServer();
      const port = Number(frameServer && frameServer.port ? frameServer.port : 0);

      const sessionId = hdrSharedSessionSeq++;
      const frameToken = crypto.randomBytes(12).toString('base64url');
      const frameEndpoint = frameToken && port > 0
        ? 'http://127.0.0.1:' + String(port) + '/hdr-frame/' + frameToken
        : '';
      hdrSharedSessions.set(sessionId, {
        bridge,
        sender: _event.sender,
        workerMode,
        workerDirectShared: false,
        runtimeRoute: activeSelection.route,
        fallbackLevel: activeSelection.fallbackLevel,
        pipelineStage: activeSelection.route === 'wgc-v1' ? HDR_WGC_PIPELINE_STAGE : HDR_NATIVE_PIPELINE_STAGE,
        requestedRoute,
        nativeBackend: String(startResult.nativeBackend || activeSelection.backendLabel || 'windows-hdr-capture'),
        nativeSessionId: Number(startResult.nativeSessionId || 0),
        width,
        height,
        stride,
        frameView: null,
        controlView: null,
        frameSeq: 0,
        readFailures: 0,
        bindAttempts: 0,
        bindFailures: 0,
        lastBindReason: '',
        lastBindError: '',
        noFrameStreak: 0,
        totalReadFailures: 0,
        bytesPumped: 0,
        startedAt: Date.now(),
        lastFrameAt: 0,
        lastError: '',
        lastReason: 'STARTED',
        frameToken,
        frameEndpoint,
        latestFrameSeq: 0,
        latestTimestampMs: 0,
        latestWidth: width,
        latestHeight: height,
        latestStride: stride,
        latestPixelFormat: String(startResult.pixelFormat || 'RGBA8'),
        latestFrameBytes: null,
        pumpTimer: 0,
        perf: {
          readMsAvg: 0,
          copyMsAvg: 0,
          sabWriteMsAvg: 0,
          bytesPerFrameAvg: 0,
          bytesPerSec: 0,
          pumpJitterMsAvg: 0,
          frameIntervalMsAvg: 0,
          lastPumpAt: 0,
          lastFrameAt: 0
        }
      });
      if (frameToken) {
        hdrFrameTokens.set(frameToken, sessionId);
      }
      // Worker mode already maintains a non-blocking pump and exposes SAB directly.
      if (workerMode) {
        pumpHdrWorkerSession(sessionId).catch(() => {});
      } else {
        pumpHdrSharedSession(sessionId);
      }
      pushHdrTrace('shared-start-ok', {
        sessionId,
        nativeSessionId: Number(startResult.nativeSessionId || 0),
        width,
        height,
        stride,
        runtimeRoute: activeSelection.route
      });
      return {
        ok: true,
        sessionId,
        width,
        height,
        stride,
        sharedFrameBuffer: null,
        sharedControlBuffer: null,
        supportsSharedFrameRead: Boolean(allowSharedBuffer),
        transportMode: allowSharedBuffer ? 'shared-buffer' : 'http-fallback',
        pixelFormat: String(startResult.pixelFormat || 'RGBA8'),
        runtimeRoute: activeSelection.route,
        fallbackLevel: activeSelection.fallbackLevel,
        pipelineStage: activeSelection.route === 'wgc-v1' ? HDR_WGC_PIPELINE_STAGE : HDR_NATIVE_PIPELINE_STAGE,
        requestedRoute,
        frameEndpoint,
        frameToken,
        nativeBackend: String(startResult.nativeBackend || activeSelection.backendLabel || 'windows-hdr-capture')
      };
    } catch (error) {
      pushHdrTrace('shared-start-exception', {
        message: error && error.message ? error.message : 'START_FAILED'
      });
      return {
        ok: false,
        reason: 'START_FAILED',
        message: error && error.message ? error.message : '啟動 HDR 共享擷取失敗。'
      };
    }
  });

  async function bindHdrSharedBuffers(payload) {
    const sessionId = Number(payload && payload.sessionId);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      pushHdrTrace('shared-bind-invalid-session', { sessionId });
      return { ok: false, bound: false, reason: 'INVALID_SESSION', message: '工作階段識別碼無效。' };
    }
    const session = hdrSharedSessions.get(sessionId);
    if (!session) {
      pushHdrTrace('shared-bind-missing-session', { sessionId });
      return { ok: false, bound: false, reason: 'INVALID_SESSION', message: '找不到 HDR 共享工作階段。' };
    }
    session.bindAttempts = Number(session.bindAttempts || 0) + 1;
    const sharedFrameBuffer = payload && payload.sharedFrameBuffer;
    const sharedControlBuffer = payload && payload.sharedControlBuffer;
    if (!(sharedFrameBuffer instanceof SharedArrayBuffer) || !(sharedControlBuffer instanceof SharedArrayBuffer)) {
      session.bindFailures = Number(session.bindFailures || 0) + 1;
      session.lastBindReason = 'INVALID_SHARED_BUFFER';
      session.lastBindError = '共享記憶體建立失敗或環境不支援。';
      pushHdrTrace('shared-bind-invalid-buffer', { sessionId });
      return {
        ok: false,
        bound: false,
        reason: 'INVALID_SHARED_BUFFER',
        message: '共享記憶體建立失敗或環境不支援。'
      };
    }

    session.frameView = new Uint8Array(sharedFrameBuffer);
    session.controlView = new Int32Array(sharedControlBuffer);
    session.controlView.fill(0);
    session.frameSeq = 0;
    session.readFailures = 0;
    clearTimeout(session.pumpTimer);
    session.pumpTimer = 0;
    if (session.workerMode) {
      const bindResult = await hdrWorkerRequest('bind-shared', {
        sharedFrameBuffer,
        sharedControlBuffer
      }, 2000).catch(() => null);
      if (!bindResult || !bindResult.ok) {
        session.workerDirectShared = false;
        session.bindFailures = Number(session.bindFailures || 0) + 1;
        session.lastBindReason = 'WORKER_BIND_SHARED_FAILED';
        session.lastBindError = bindResult && bindResult.message ? bindResult.message : 'worker shared bind failed';
        pumpHdrWorkerSession(sessionId).catch(() => {});
        return {
          ok: false,
          bound: false,
          reason: 'WORKER_BIND_SHARED_FAILED',
          message: bindResult && bindResult.message ? bindResult.message : 'worker shared bind failed'
        };
      }
      session.workerDirectShared = true;
    } else {
      pumpHdrSharedSession(sessionId);
    }
    session.lastBindReason = 'OK';
    session.lastBindError = '';
    pushHdrTrace('shared-bind-ok', {
      sessionId,
      frameBytes: Number(sharedFrameBuffer.byteLength || 0),
      controlBytes: Number(sharedControlBuffer.byteLength || 0)
    });

    return { ok: true, bound: true };
  }

  ipcMain.handle('hdr:shared-bind', async (_event, payload) => {
    return bindHdrSharedBuffers(payload);
  });

  ipcMain.on('hdr:shared-bind-async', async (event, payload) => {
    const requestId = String(payload && payload.requestId ? payload.requestId : '');
    const result = await bindHdrSharedBuffers(payload).catch((error) => ({
      ok: false,
      bound: false,
      reason: 'BIND_EXCEPTION',
      message: error && error.message ? error.message : 'bind exception'
    }));
    event.reply('hdr:shared-bind-async:result', { requestId, result });
  });

  ipcMain.handle('hdr:shared-stop', async (_event, payload) => {
    const sessionId = Number(payload && payload.sessionId);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return { ok: false, reason: 'INVALID_SESSION', message: '工作階段識別碼無效。' };
    }
    return stopHdrSharedSession(sessionId);
  });

  ipcMain.handle('hdr:experimental-state', async (_event, payload) => {
    const requestedSourceId = String(payload && payload.sourceId ? payload.sourceId : '');
    const requestedDisplayId = String(payload && payload.displayId ? payload.displayId : '');
    const smokeSourceId = String(hdrNativeSmokeState.sourceId || '');
    const smokeDisplayId = String(hdrNativeSmokeState.displayId || '');
    const smokeMatchesRequestedSource = requestedSourceId
      ? (
        smokeSourceId === requestedSourceId &&
        (!requestedDisplayId || !smokeDisplayId || smokeDisplayId === requestedDisplayId)
      )
      : Boolean(hdrNativeSmokeState.ok);
    const legacyRouteEnabled = HDR_NATIVE_PUSH_IPC_ENABLED &&
      HDR_NATIVE_LIVE_ROUTE_ENABLED &&
      hdrNativeSmokeState.ok &&
      smokeMatchesRequestedSource;
    const nativeRouteEnabled = HDR_WGC_ROUTE_ENABLED || legacyRouteEnabled;
    const reason = !HDR_WGC_ROUTE_ENABLED && !HDR_NATIVE_PUSH_IPC_ENABLED
      ? 'NATIVE_IPC_GUARD_BAD_MESSAGE_263'
      : (!HDR_WGC_ROUTE_ENABLED && !HDR_NATIVE_LIVE_ROUTE_ENABLED
        ? 'NATIVE_LIVE_ROUTE_DISABLED'
        : (!HDR_WGC_ROUTE_ENABLED && !hdrNativeSmokeState.ran
          ? 'NATIVE_SMOKE_REQUIRED'
          : (!HDR_WGC_ROUTE_ENABLED && !hdrNativeSmokeState.ok
            ? 'NATIVE_SMOKE_FAILED'
            : (!HDR_WGC_ROUTE_ENABLED && !smokeMatchesRequestedSource ? 'NATIVE_SMOKE_STALE' : ''))));

    const sessions = [];
    for (const [sessionId, session] of hdrSharedSessions) {
      sessions.push({
        sessionId,
        runtimeRoute: String(session.runtimeRoute || 'native-legacy'),
        fallbackLevel: Number(session.fallbackLevel || 2),
        pipelineStage: String(session.pipelineStage || HDR_NATIVE_PIPELINE_STAGE),
        supportsSharedFrameRead: Boolean(session.frameView && session.controlView),
        transportMode: session.frameView && session.controlView ? 'shared-buffer' : 'http-fallback',
        requestedRoute: String(session.requestedRoute || 'auto'),
        nativeBackend: String(session.nativeBackend || ''),
        frameSeq: Number(session.frameSeq || 0),
        readFailures: Number(session.readFailures || 0),
        bindAttempts: Number(session.bindAttempts || 0),
        bindFailures: Number(session.bindFailures || 0),
        lastBindReason: String(session.lastBindReason || ''),
        lastBindError: String(session.lastBindError || ''),
        noFrameStreak: Number(session.noFrameStreak || 0),
        totalReadFailures: Number(session.totalReadFailures || 0),
        bytesPumped: Number(session.bytesPumped || 0),
        frameEndpoint: String(session.frameEndpoint || ''),
        lastReason: String(session.lastReason || ''),
        lastError: String(session.lastError || ''),
        startedAt: Number(session.startedAt || 0),
        lastFrameAt: Number(session.lastFrameAt || 0),
        nativeSessionId: Number(session.nativeSessionId || 0),
        perf: {
          readMsAvg: Number(session.perf && session.perf.readMsAvg ? session.perf.readMsAvg : 0),
          copyMsAvg: Number(session.perf && session.perf.copyMsAvg ? session.perf.copyMsAvg : 0),
          sabWriteMsAvg: Number(session.perf && session.perf.sabWriteMsAvg ? session.perf.sabWriteMsAvg : 0),
          bytesPerFrameAvg: Number(session.perf && session.perf.bytesPerFrameAvg ? session.perf.bytesPerFrameAvg : 0),
          bytesPerSec: Number(session.perf && session.perf.bytesPerSec ? session.perf.bytesPerSec : 0),
          pumpJitterMsAvg: Number(session.perf && session.perf.pumpJitterMsAvg ? session.perf.pumpJitterMsAvg : 0),
          frameIntervalMsAvg: Number(session.perf && session.perf.frameIntervalMsAvg ? session.perf.frameIntervalMsAvg : 0)
        }
      });
    }
    return {
      ok: true,
      nativeRouteEnabled,
      stage: HDR_NATIVE_PIPELINE_STAGE,
      wgcRouteEnabled: HDR_WGC_ROUTE_ENABLED,
      wgcStage: HDR_WGC_PIPELINE_STAGE,
      routePreference: normalizeHdrRoutePreference(HDR_ROUTE_PREFERENCE),
      reason,
      envFlag: 'CURSORCINE_ENABLE_HDR_NATIVE_IPC',
      envFlagEnabled: HDR_NATIVE_PUSH_IPC_ENABLED,
      liveEnvFlag: 'CURSORCINE_ENABLE_HDR_NATIVE_LIVE',
      liveEnvFlagEnabled: HDR_NATIVE_LIVE_ROUTE_ENABLED,
      wgcEnvFlag: 'CURSORCINE_ENABLE_HDR_WGC',
      wgcEnvFlagEnabled: HDR_WGC_ROUTE_ENABLED,
      requestedSourceId,
      requestedDisplayId,
      smokeMatchesRequestedSource,
      smoke: { ...hdrNativeSmokeState },
      diagnostics: {
        sharedSessionCount: sessions.length,
        sharedSessions: sessions,
        trace: hdrTrace.slice(-80)
      }
    };
  });

  ipcMain.handle('hdr:diagnostics-snapshot', async () => {
    const experimental = await (async () => {
      const sessions = [];
      for (const [sessionId, sessionObj] of hdrSharedSessions) {
        sessions.push({
          sessionId,
          runtimeRoute: String(sessionObj.runtimeRoute || 'native-legacy'),
          fallbackLevel: Number(sessionObj.fallbackLevel || 2),
          pipelineStage: String(sessionObj.pipelineStage || HDR_NATIVE_PIPELINE_STAGE),
          supportsSharedFrameRead: Boolean(sessionObj.frameView && sessionObj.controlView),
          transportMode: sessionObj.frameView && sessionObj.controlView ? 'shared-buffer' : 'http-fallback',
          requestedRoute: String(sessionObj.requestedRoute || 'auto'),
          nativeBackend: String(sessionObj.nativeBackend || ''),
          frameSeq: Number(sessionObj.frameSeq || 0),
          readFailures: Number(sessionObj.readFailures || 0),
          bindAttempts: Number(sessionObj.bindAttempts || 0),
          bindFailures: Number(sessionObj.bindFailures || 0),
          lastBindReason: String(sessionObj.lastBindReason || ''),
          lastBindError: String(sessionObj.lastBindError || ''),
          noFrameStreak: Number(sessionObj.noFrameStreak || 0),
          totalReadFailures: Number(sessionObj.totalReadFailures || 0),
          bytesPumped: Number(sessionObj.bytesPumped || 0),
          frameEndpoint: String(sessionObj.frameEndpoint || ''),
          lastReason: String(sessionObj.lastReason || ''),
          lastError: String(sessionObj.lastError || ''),
          startedAt: Number(sessionObj.startedAt || 0),
          lastFrameAt: Number(sessionObj.lastFrameAt || 0),
          nativeSessionId: Number(sessionObj.nativeSessionId || 0),
          perf: {
            readMsAvg: Number(sessionObj.perf && sessionObj.perf.readMsAvg ? sessionObj.perf.readMsAvg : 0),
            copyMsAvg: Number(sessionObj.perf && sessionObj.perf.copyMsAvg ? sessionObj.perf.copyMsAvg : 0),
            sabWriteMsAvg: Number(sessionObj.perf && sessionObj.perf.sabWriteMsAvg ? sessionObj.perf.sabWriteMsAvg : 0),
            bytesPerFrameAvg: Number(sessionObj.perf && sessionObj.perf.bytesPerFrameAvg ? sessionObj.perf.bytesPerFrameAvg : 0),
            bytesPerSec: Number(sessionObj.perf && sessionObj.perf.bytesPerSec ? sessionObj.perf.bytesPerSec : 0),
            pumpJitterMsAvg: Number(sessionObj.perf && sessionObj.perf.pumpJitterMsAvg ? sessionObj.perf.pumpJitterMsAvg : 0),
            frameIntervalMsAvg: Number(sessionObj.perf && sessionObj.perf.frameIntervalMsAvg ? sessionObj.perf.frameIntervalMsAvg : 0)
          }
        });
      }
      return {
        nativeRouteEnabled: HDR_NATIVE_PUSH_IPC_ENABLED,
        stage: HDR_NATIVE_PIPELINE_STAGE,
        wgcRouteEnabled: HDR_WGC_ROUTE_ENABLED,
        wgcStage: HDR_WGC_PIPELINE_STAGE,
        routePreference: normalizeHdrRoutePreference(HDR_ROUTE_PREFERENCE),
        reason: HDR_NATIVE_PUSH_IPC_ENABLED ? '' : 'NATIVE_IPC_GUARD_BAD_MESSAGE_263',
        envFlag: 'CURSORCINE_ENABLE_HDR_NATIVE_IPC',
        envFlagEnabled: HDR_NATIVE_PUSH_IPC_ENABLED,
        wgcEnvFlag: 'CURSORCINE_ENABLE_HDR_WGC',
        wgcEnvFlagEnabled: HDR_WGC_ROUTE_ENABLED,
        diagnostics: {
          sharedSessionCount: sessions.length,
          sharedSessions: sessions
        }
      };
    })();

    return {
      ok: true,
      timestamp: Date.now(),
      platform: process.platform,
      appVersion: app.getVersion(),
      worker: getHdrWorkerStatus(),
      experimental
      ,
      trace: hdrTrace.slice(-80)
    };
  });

  ipcMain.handle('hdr:native-route-smoke', async (_event, payload) => {
    return runHdrNativeRouteSmoke(payload || {});
  });

  ipcMain.handle('app:copy-text', async (_event, payload) => {
    const text = String(payload && payload.text ? payload.text : '');
    clipboard.writeText(text);
    return { ok: true, length: text.length };
  });

  ipcMain.handle('hdr:probe', async (_event, payload) => {
    const displayId = payload && payload.displayId ? payload.displayId : undefined;
    const sourceId = String(payload && payload.sourceId ? payload.sourceId : '');
    const displayHint = getDisplayHdrHint(displayId);

    if (process.platform !== 'win32') {
      return {
        ok: true,
        supported: false,
        reason: 'NOT_WINDOWS',
        sourceId,
        display: displayHint
      };
    }

    const bridge = loadWindowsHdrNativeBridge();
    if (!bridge || typeof bridge.probe !== 'function') {
      return {
        ok: true,
        supported: false,
        reason: 'NATIVE_UNAVAILABLE',
        sourceId,
        display: displayHint,
        nativeLoadError: windowsHdrNativeLoadError || ''
      };
    }

    try {
      const result = await Promise.resolve(bridge.probe({
        sourceId,
        displayId: displayHint.displayId,
        displayHint
      }));
      const supported = Boolean(result && result.supported);
      return {
        ok: true,
        supported,
        sourceId,
        display: displayHint,
        hdrActive: Boolean(result && result.hdrActive),
        nativeBackend: String((result && result.nativeBackend) || 'windows-hdr-capture'),
        reason: supported ? '' : String((result && result.reason) || 'NATIVE_UNAVAILABLE'),
        details: result && typeof result === 'object' ? result : {}
      };
    } catch (error) {
      return {
        ok: true,
        supported: false,
        reason: 'PROBE_FAILED',
        sourceId,
        display: displayHint,
        message: error && error.message ? error.message : 'HDR probe failed'
      };
    }
  });

  ipcMain.handle('hdr:start', async (_event, payload) => {
    if (process.platform !== 'win32') {
      return { ok: false, reason: 'NOT_WINDOWS', message: '僅支援 Windows 原生 HDR 擷取。' };
    }

    const sourceId = String(payload && payload.sourceId ? payload.sourceId : '');
    const displayId = payload && payload.displayId ? payload.displayId : undefined;
    if (!sourceId) {
      return { ok: false, reason: 'INVALID_INPUT', message: '缺少來源識別碼。' };
    }

    const bridge = loadWindowsHdrNativeBridge();
    if (!bridge || typeof bridge.startCapture !== 'function') {
      return {
        ok: false,
        reason: 'NATIVE_UNAVAILABLE',
        message: windowsHdrNativeLoadError || 'Windows HDR 原生模組不可用。'
      };
    }

    try {
      const displayHint = getDisplayHdrHint(displayId);
      const startResult = await Promise.resolve(bridge.startCapture({
        sourceId,
        displayId: displayHint.displayId,
        maxFps: Number(payload && payload.maxFps ? payload.maxFps : 60),
        toneMap: payload && payload.toneMap ? payload.toneMap : {},
        displayHint
      }));

      if (!startResult || !startResult.ok) {
        return {
          ok: false,
          reason: String((startResult && startResult.reason) || 'START_FAILED'),
          message: String((startResult && startResult.message) || '啟動 HDR 原生擷取失敗。')
        };
      }

      const sessionId = hdrCaptureSessionSeq++;
      hdrCaptureSessions.set(sessionId, {
        bridge,
        sourceId,
        displayId: displayHint.displayId,
        nativeSessionId: startResult.nativeSessionId,
        readFailures: 0,
        startedAt: Date.now()
      });

      return {
        ok: true,
        sessionId,
        width: Number(startResult.width || 0),
        height: Number(startResult.height || 0),
        pixelFormat: String(startResult.pixelFormat || 'RGBA8'),
        colorSpace: String(startResult.colorSpace || 'Rec.709'),
        toneMap: startResult.toneMap || {},
        hdrActive: Boolean(startResult.hdrActive),
        nativeBackend: String(startResult.nativeBackend || 'windows-hdr-capture')
      };
    } catch (error) {
      return {
        ok: false,
        reason: 'START_FAILED',
        message: error && error.message ? error.message : '啟動 HDR 原生擷取失敗。'
      };
    }
  });

  ipcMain.handle('hdr:read-frame', async (_event, payload) => {
    const sessionId = Number(payload && payload.sessionId);
    const timeoutMs = Math.max(1, Math.min(2000, Number(payload && payload.timeoutMs ? payload.timeoutMs : 40)));
    const session = hdrCaptureSessions.get(sessionId);
    if (!session) {
      return { ok: false, reason: 'INVALID_SESSION', message: '找不到 HDR 擷取工作階段。' };
    }

    if (!session.bridge || typeof session.bridge.readFrame !== 'function') {
      session.readFailures += 1;
      return { ok: false, reason: 'NATIVE_UNAVAILABLE', message: 'HDR 原生模組無法讀取畫面。' };
    }

    try {
      const frameResult = await Promise.resolve(session.bridge.readFrame({
        nativeSessionId: session.nativeSessionId,
        timeoutMs
      }));

      if (!frameResult || !frameResult.ok) {
        session.readFailures += 1;
        const reason = String((frameResult && frameResult.reason) || 'READ_FAILED');
        const hardFallback = reason === 'FRAME_TOO_LARGE' || reason === 'INVALID_SESSION' || reason === 'NATIVE_UNAVAILABLE';
        return {
          ok: false,
          reason,
          message: String((frameResult && frameResult.message) || '讀取 HDR frame 失敗。'),
          readFailures: session.readFailures,
          fallbackRecommended: hardFallback || session.readFailures >= HDR_RUNTIME_MAX_READ_FAILURES
        };
      }

      session.readFailures = 0;
      const frameBytes = frameResult.bytes || null;
      let safeBytes = null;
      if (Buffer.isBuffer(frameBytes)) {
        safeBytes = Buffer.from(frameBytes);
      } else if (frameBytes instanceof Uint8Array) {
        safeBytes = Buffer.from(frameBytes);
      } else if (frameBytes instanceof ArrayBuffer) {
        safeBytes = Buffer.from(frameBytes);
      }
      const frameByteLength = safeBytes ? Number(safeBytes.length) : 0;
      if (frameByteLength <= 0 || frameByteLength > HDR_RUNTIME_MAX_FRAME_BYTES) {
        session.readFailures += 1;
        return {
          ok: false,
          reason: 'FRAME_TOO_LARGE',
          message: 'HDR frame exceeds IPC safety limit.',
          readFailures: session.readFailures,
          fallbackRecommended: true
        };
      }
      return {
        ok: true,
        width: Number(frameResult.width || 0),
        height: Number(frameResult.height || 0),
        stride: Number(frameResult.stride || 0),
        timestampMs: Number(frameResult.timestampMs || Date.now()),
        pixelFormat: String(frameResult.pixelFormat || 'RGBA8'),
        bytes: safeBytes
          ? safeBytes.buffer.slice(safeBytes.byteOffset, safeBytes.byteOffset + safeBytes.byteLength)
          : null
      };
    } catch (error) {
      session.readFailures += 1;
      return {
        ok: false,
        reason: 'READ_FAILED',
        message: error && error.message ? error.message : '讀取 HDR frame 失敗。',
        readFailures: session.readFailures,
        fallbackRecommended: session.readFailures >= HDR_RUNTIME_MAX_READ_FAILURES
      };
    }
  });

  ipcMain.handle('hdr:stop', async (_event, payload) => {
    const sessionId = Number(payload && payload.sessionId);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return { ok: false, reason: 'INVALID_SESSION', message: 'HDR 擷取工作階段識別碼無效。' };
    }
    return stopHdrCaptureSession(sessionId);
  });

  ipcMain.handle('video:export-task-open', async () => {
    const taskId = exportTaskSeq++;
    exportTasks.set(taskId, {
      canceled: false,
      proc: null
    });
    return { ok: true, taskId };
  });

  ipcMain.handle('video:export-task-cancel', async (_event, payload) => {
    const taskId = Number(payload && payload.taskId);
    const task = exportTasks.get(taskId);
    if (!task) {
      return { ok: false, reason: 'INVALID_TASK', message: '找不到輸出工作。' };
    }
    task.canceled = true;
    if (task.proc && !task.proc.killed) {
      try {
        task.proc.kill('SIGKILL');
      } catch (_error) {
      }
    }
    return { ok: true, taskId };
  });

  ipcMain.handle('video:export-task-close', async (_event, payload) => {
    const taskId = Number(payload && payload.taskId);
    if (!Number.isFinite(taskId) || taskId <= 0) {
      return { ok: false, reason: 'INVALID_TASK', message: '輸出工作識別碼無效。' };
    }
    exportTasks.delete(taskId);
    return { ok: true, taskId };
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

    const requestedOutputPath = String(payload && payload.outputPath ? payload.outputPath : '');
    let filePath = requestedOutputPath;
    if (!filePath) {
      const saveDialog = await dialog.showSaveDialog({
        title: '儲存剪輯影片',
        defaultPath: `${safeBaseName}.${outputExt}`,
        filters: [{ name: `${outputExt.toUpperCase()} Video`, extensions: [outputExt] }]
      });
      if (saveDialog.canceled || !saveDialog.filePath) {
        return { ok: false, reason: 'CANCELED', message: '使用者取消儲存。' };
      }
      filePath = saveDialog.filePath;
    }

    event.sender.send('video:export-phase', {
      phase: 'processing-start',
      route: 'trim-export'
    });

    const durationSec = Math.max(0.05, endSec - startSec);
    const taskId = Number(payload && payload.taskId);
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
      await runFfmpeg(ffmpegArgs, taskId);
      return {
        ok: true,
        path: filePath,
        ext: outputExt,
        ffmpegArgs,
        ffmpegCommand: 'ffmpeg ' + ffmpegArgs.map(quoteShellArg).join(' ')
      };
    } catch (error) {
      if (error && error.code === 'EXPORT_ABORTED') {
        await fs.rm(filePath, { force: true }).catch(() => {});
        return {
          ok: false,
          reason: 'EXPORT_ABORTED',
          message: '輸出已中斷。',
          ffmpegArgs
        };
      }
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

    if (mode === 'path') {
      const selectedPath = String(payload && payload.filePath ? payload.filePath : '');
      if (!selectedPath) {
        return { ok: false, reason: 'INVALID_PATH', message: '缺少輸出路徑。' };
      }
      filePath = selectedPath;
      event.sender.send('video:export-phase', {
        phase: 'processing-start',
        route
      });
    } else if (mode === 'save') {
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
      trackUploadTempDir(tempDir);
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
        untrackUploadTempDir(tempDir);
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

  ipcMain.handle('path:to-file-url', async (_event, payload) => {
    const filePath = String(payload && payload.filePath ? payload.filePath : '');
    if (!filePath) {
      return {
        ok: false,
        reason: 'INVALID_PATH',
        message: '缺少檔案路徑。'
      };
    }
    try {
      return {
        ok: true,
        url: pathToFileURL(filePath).toString()
      };
    } catch (error) {
      return {
        ok: false,
        reason: 'PATH_TO_URL_FAILED',
        message: error && error.message ? error.message : '無法轉換檔案路徑。'
      };
    }
  });

  ipcMain.handle('path:cleanup-temp-dir', async (_event, payload) => {
    const tempDir = String(payload && payload.tempDir ? payload.tempDir : '');
    if (!tempDir) {
      return { ok: true, skipped: true };
    }
    if (!isSafeCursorcineTempDir(tempDir)) {
      return {
        ok: false,
        reason: 'UNSAFE_PATH',
        message: '拒絕清理非 CursorCine 臨時資料夾。'
      };
    }
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
      untrackUploadTempDir(tempDir);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: 'CLEANUP_FAILED',
        message: error && error.message ? error.message : '臨時資料夾清理失敗。'
      };
    }
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
    const taskId = Number(payload && payload.taskId);
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
      ], taskId);
      return { ok: true, path: filePath };
    } catch (error) {
      if (error && error.code === 'EXPORT_ABORTED') {
        await fs.rm(filePath, { force: true }).catch(() => {});
        return {
          ok: false,
          reason: 'EXPORT_ABORTED',
          message: '輸出已中斷。'
        };
      }
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

  ipcMain.handle('video:pick-save-path', async (_event, payload) => {
    const ext = sanitizeExt(payload && payload.ext ? payload.ext : 'webm');
    const safeBaseName = sanitizeBaseName(payload && payload.baseName ? payload.baseName : 'cursorcine-export');
    const title = String(payload && payload.title ? payload.title : '儲存影片');
    const { canceled, filePath } = await dialog.showSaveDialog({
      title,
      defaultPath: `${safeBaseName}.${ext}`,
      filters: [{ name: `${ext.toUpperCase()} Video`, extensions: [ext] }]
    });
    if (canceled || !filePath) {
      return { ok: false, reason: 'CANCELED', message: '使用者取消儲存。' };
    }
    return { ok: true, path: filePath };
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (_event) => {
  if (quitCleanupStarted) {
    return;
  }
  quitCleanupStarted = true;
  runQuitCleanupSync();
});

app.on('will-quit', () => {
  cleanupUploadTempDirsByScanSync();
});
