/* global electronAPI */

const sourceSelect = document.getElementById('sourceSelect');
const refreshBtn = document.getElementById('refreshBtn');
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const recordingTimeEl = document.getElementById('recordingTime');
const exportTimeEl = document.getElementById('exportTime');
const previewCanvas = document.getElementById('previewCanvas');
const rawVideo = document.getElementById('rawVideo');
const timelinePanel = document.getElementById('timelinePanel');
const timeInfo = document.getElementById('timeInfo');
const clipDurationInfo = document.getElementById('clipDurationInfo');
const playheadInput = document.getElementById('playheadInput');
const trimStartInput = document.getElementById('trimStartInput');
const trimEndInput = document.getElementById('trimEndInput');
const trimRangeBar = document.getElementById('trimRangeBar');
const trimRangeLabel = document.getElementById('trimRangeLabel');
const playPauseBtn = document.getElementById('playPauseBtn');
const previewRangeBtn = document.getElementById('previewRangeBtn');
const saveClipBtn = document.getElementById('saveClipBtn');
const abortExportBtn = document.getElementById('abortExportBtn');
const discardClipBtn = document.getElementById('discardClipBtn');
const exportDebugRoute = document.getElementById('exportDebugRoute');
const exportDebugCode = document.getElementById('exportDebugCode');
const exportDebugMessage = document.getElementById('exportDebugMessage');
const exportDebugTrace = document.getElementById('exportDebugTrace');
const zoomInput = document.getElementById('zoomInput');
const smoothInput = document.getElementById('smoothInput');
const micInput = document.getElementById('micInput');
const formatSelect = document.getElementById('formatSelect');
const exportEngineSelect = document.getElementById('exportEngineSelect');
const qualitySelect = document.getElementById('qualitySelect');
const outputQualitySelect = document.getElementById('outputQualitySelect');
const hdrMappingModeSelect = document.getElementById('hdrMappingModeSelect');
const hdrMappingRuntimeEl = document.getElementById('hdrMappingRuntime');
const hdrMappingProbeEl = document.getElementById('hdrMappingProbe');
const hdrCompEnable = document.getElementById('hdrCompEnable');
const hdrCompStrengthInput = document.getElementById('hdrCompStrength');
const hdrCompStrengthLabel = document.getElementById('hdrCompStrengthLabel');
const hdrCompHueInput = document.getElementById('hdrCompHue');
const hdrCompHueLabel = document.getElementById('hdrCompHueLabel');
const hdrCompRolloffInput = document.getElementById('hdrCompRolloff');
const hdrCompRolloffLabel = document.getElementById('hdrCompRolloffLabel');
const hdrCompSharpnessInput = document.getElementById('hdrCompSharpness');
const hdrCompSharpnessLabel = document.getElementById('hdrCompSharpnessLabel');
const zoomLabel = document.getElementById('zoomLabel');
const smoothLabel = document.getElementById('smoothLabel');
const glowSizeInput = document.getElementById('glowSizeInput');
const glowSizeLabel = document.getElementById('glowSizeLabel');
const glowCoreInput = document.getElementById('glowCoreInput');
const glowCoreLabel = document.getElementById('glowCoreLabel');
const glowOpacityInput = document.getElementById('glowOpacityInput');
const glowOpacityLabel = document.getElementById('glowOpacityLabel');
const penToggleBtn = document.getElementById('penToggleBtn');
const penColorInput = document.getElementById('penColorInput');
const penSizeInput = document.getElementById('penSizeInput');
const penSizeLabel = document.getElementById('penSizeLabel');
const penUndoBtn = document.getElementById('penUndoBtn');
const penClearBtn = document.getElementById('penClearBtn');

const ctx = previewCanvas.getContext('2d', { alpha: false });

const DESKTOP_GAIN = 3.0;
const MIC_GAIN = 5.5;
const MASTER_GAIN = 1.8;
const CLICK_ZOOM_HOLD_MS = 1800;
const DOUBLE_CLICK_ZOOM_HOLD_MS = 3000;
const CLICK_ZOOM_IN_SLOWDOWN = 0.55;
const PEN_HOLD_ZOOM_RATIO = 0.45;
const PEN_HOLD_DELAY_MS = 180;
const PEN_DRAW_FOLLOW_SLOWDOWN = 0.35;
const PEN_FOLLOW_DEADZONE_RATIO_X = 0.32;
const PEN_FOLLOW_DEADZONE_RATIO_Y = 0.28;
const DOUBLE_CLICK_MAX_WINDOW_MS = 320;
const DOUBLE_CLICK_MARKER_MS = 700;
const DOUBLE_CLICK_UNLOCK_DISTANCE_PX = 20;
const DEFAULT_CURSOR_GLOW_RADIUS = 22;
const DEFAULT_CURSOR_GLOW_CORE_RADIUS = 5;
const DEFAULT_CURSOR_GLOW_OPACITY = 0.9;
const CURSOR_GLOW_LAG = 0.18;
const DEFAULT_PEN_COLOR = '#ff4f70';
const DEFAULT_PEN_SIZE = 4;
const DEFAULT_HDR_COMP_STRENGTH = -0.7;
const DEFAULT_HDR_COMP_HUE = -9;
const DEFAULT_HDR_COMP_ROLLOFF = 0.7;
const DEFAULT_HDR_COMP_SHARPNESS = 1.0;

const QUALITY_PRESETS = {
  smooth: { label: '流暢', videoBitrate: 1500000, audioBitrate: 64000 },
  balanced: { label: '平衡', videoBitrate: 16000000, audioBitrate: 192000 },
  high: { label: '高畫質', videoBitrate: 40000000, audioBitrate: 384000 }
};
const DEFAULT_QUALITY_PRESET = 'balanced';
const MIN_TRIM_GAP_SECONDS = 0.1;
const IPC_UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;
const RECORDING_TIMESLICE_MS = 1000;
const BUILTIN_RECORDER_TIMESLICE_MS = 200;
const BUILTIN_FIRST_CHUNK_TIMEOUT_MS = 2500;
const BUILTIN_OUTPUT_VIDEO_BITRATE_MULTIPLIERS = {
  smooth: 1.0,
  balanced: 1.5,
  high: 2.5
};
const BUILTIN_OUTPUT_VIDEO_BITRATE_MAX = 120000000;
const BUILTIN_OUTPUT_AUDIO_BITRATE_MAX = 512000;
const HDR_NATIVE_READ_TIMEOUT_MS = 50;
const HDR_NATIVE_MAX_READ_FAILURES = 8;
const HDR_NATIVE_MAX_IDLE_MS = 2000;

let sources = [];
let sourceStream;
let micStream;
let outputStream;
let mediaRecorder;
let drawTimer = 0;
const DRAW_INTERVAL_MS = 16;
let cursorTimer = 0;
let selectedSource;
let recordingQualityPreset = QUALITY_PRESETS[DEFAULT_QUALITY_PRESET];
let recordingStartedAtMs = 0;
let recordingDurationEstimateSec = 0;
let recordingTimer = 0;
let recordingChunkCount = 0;
let recordingBytes = 0;
let recordingStopRequestedAtMs = 0;
let recordingUploadSession = null;
let recordingUploadQueue = Promise.resolve();
let recordingUploadFailure = null;
let hdrRuntimeStatusMessage = '尚未探測';
let hdrProbeStatusMessage = '尚未探測';
let exportStartedAtMs = 0;
let exportTimer = 0;
let builtinAudioCompatibility = 'unknown';
let exportCancelRequested = false;
let activeExportTaskId = 0;
let nativeHdrFramePumpTimer = 0;
let nativeHdrFramePumpRunning = false;
let nativeHdrFallbackAttempted = false;
const extraCaptureStreams = [];

let recordingMeta = {
  outputExt: 'webm',
  outputMimeType: 'video/webm',
  requestedFormat: 'webm',
  fallbackFromMp4: false
};

let clickState = {
  enabled: false,
  checkedCapability: false,
  lastClickTimestamp: 0,
  holdDelayUntil: 0,
  lastZoomTriggerTs: 0,
  forceMaxUntil: 0,
  doubleClickLocked: false,
  lockedX: 0,
  lockedY: 0
};

const doubleClickMarkerState = {
  x: 0,
  y: 0,
  activeUntil: 0
};

const glowState = {
  radius: Number(glowSizeInput.value || DEFAULT_CURSOR_GLOW_RADIUS),
  coreRadius: Number(glowCoreInput.value || DEFAULT_CURSOR_GLOW_CORE_RADIUS),
  opacity: Number(glowOpacityInput.value || DEFAULT_CURSOR_GLOW_OPACITY),
  lag: CURSOR_GLOW_LAG,
  x: 0,
  y: 0
};

const annotationState = {
  enabled: true,
  color: penColorInput?.value || DEFAULT_PEN_COLOR,
  size: Number(penSizeInput?.value || DEFAULT_PEN_SIZE)
};

const hdrCompState = {
  enabled: Boolean(hdrCompEnable?.checked),
  strength: Number(hdrCompStrengthInput?.value || DEFAULT_HDR_COMP_STRENGTH),
  hue: Number(hdrCompHueInput?.value || DEFAULT_HDR_COMP_HUE),
  rolloff: Number(hdrCompRolloffInput?.value || DEFAULT_HDR_COMP_ROLLOFF),
  sharpness: Number(hdrCompSharpnessInput?.value || DEFAULT_HDR_COMP_SHARPNESS)
};

const hdrMappingState = {
  mode: (hdrMappingModeSelect && hdrMappingModeSelect.value) || 'auto',
  runtimeRoute: 'fallback',
  probeSupported: false,
  probeHdrActive: false,
  probeReason: 'NOT_PROBED'
};

const nativeHdrState = {
  active: false,
  sessionId: 0,
  width: 0,
  height: 0,
  stride: 0,
  sourceId: '',
  displayId: '',
  readFailures: 0,
  droppedFrames: 0,
  lastFrameAtMs: 0,
  frameCount: 0,
  canvas: null,
  ctx: null,
  frameImageData: null
};

const viewState = {
  sx: 0,
  sy: 0,
  cropW: 1,
  cropH: 1,
  outputW: 1,
  outputH: 1
};

const editorState = {
  active: false,
  exportBusy: false,
  blob: null,
  sourceUrl: '',
  sourcePath: '',
  cleanupTempDir: '',
  duration: 0,
  trimStart: 0,
  trimEnd: 0
};

let audioContext;
let mixedAudioDestination;
let desktopAudioNode;
let desktopGainNode;
let micAudioNode;
let micGainNode;
let masterGainNode;
let compressorNode;

const cameraState = {
  cursorX: 0,
  cursorY: 0,
  targetX: 0,
  targetY: 0,
  viewportX: 0,
  viewportY: 0,
  zoom: 1,
  targetZoom: 1,
  zoomHoldUntil: 0,
  maxZoom: Number(zoomInput.value),
  smoothing: Number(smoothInput.value)
};

function setStatus(message) {
  statusEl.textContent = message;
}

function normalizeHdrMappingMode(value) {
  return value === 'off' || value === 'force-native' ? value : 'auto';
}

function updateHdrMappingStatusUi() {
  if (hdrMappingRuntimeEl) {
    hdrMappingRuntimeEl.textContent = hdrRuntimeStatusMessage;
  }
  if (hdrMappingProbeEl) {
    hdrMappingProbeEl.textContent = hdrProbeStatusMessage;
  }
}

function setHdrRuntimeRoute(route, message) {
  hdrMappingState.runtimeRoute = route === 'native' ? 'native' : 'fallback';
  hdrRuntimeStatusMessage = message || (hdrMappingState.runtimeRoute === 'native' ? '目前路徑: Native HDR' : '目前路徑: Fallback');
  updateHdrMappingStatusUi();
}

function setHdrProbeStatus(message) {
  hdrProbeStatusMessage = message || '尚未探測';
  updateHdrMappingStatusUi();
}

function updateRecordingTimeLabel(seconds = 0) {
  if (!recordingTimeEl) {
    return;
  }
  recordingTimeEl.textContent = '目前錄製時間: ' + formatClock(seconds);
}

function startRecordingTimer() {
  clearInterval(recordingTimer);
  recordingTimer = setInterval(() => {
    if (recordingStartedAtMs <= 0) {
      return;
    }
    const elapsed = Math.max(0, (performance.now() - recordingStartedAtMs) / 1000);
    updateRecordingTimeLabel(elapsed);
  }, 100);
}

function stopRecordingTimer() {
  clearInterval(recordingTimer);
  recordingTimer = 0;
}

function updateExportTimeLabel(seconds = 0) {
  if (!exportTimeEl) {
    return;
  }
  exportTimeEl.textContent = '輸出執行時間: ' + formatClock(seconds);
}

function startExportTimer() {
  exportStartedAtMs = performance.now();
  updateExportTimeLabel(0);
  clearInterval(exportTimer);
  exportTimer = setInterval(() => {
    if (exportStartedAtMs <= 0) {
      return;
    }
    const elapsed = Math.max(0, (performance.now() - exportStartedAtMs) / 1000);
    updateExportTimeLabel(elapsed);
  }, 100);
}

function stopExportTimer(reset = false) {
  if (!reset && exportStartedAtMs > 0) {
    const elapsed = Math.max(0, (performance.now() - exportStartedAtMs) / 1000);
    updateExportTimeLabel(elapsed);
  }
  clearInterval(exportTimer);
  exportTimer = 0;
  exportStartedAtMs = 0;
  if (reset) {
    updateExportTimeLabel(0);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getMediaDuration(video, fallback = 0.1) {
  const direct = Number(video && video.duration);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }

  if (video && video.seekable && video.seekable.length > 0) {
    const end = Number(video.seekable.end(video.seekable.length - 1));
    if (Number.isFinite(end) && end > 0) {
      return end;
    }
  }

  return fallback;
}

function getEstimatedRecordingDurationSec() {
  return Math.max(0.1, toFiniteNumber(recordingDurationEstimateSec, 0.1));
}

function formatClock(seconds) {
  const safe = Math.max(0, toFiniteNumber(seconds, 0));
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe - Math.floor(safe)) * 10);
  return String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0') + '.' + String(tenths);
}

function formatBytes(bytes) {
  const safeBytes = Math.max(0, toFiniteNumber(bytes, 0));
  const mb = safeBytes / (1024 * 1024);
  return mb.toFixed(mb >= 100 ? 0 : 1) + ' MB';
}

function createExportAbortedError() {
  const error = new Error('輸出已中斷。');
  error.code = 'EXPORT_ABORTED';
  return error;
}

function isExportAbortedError(value) {
  return Boolean(
    value &&
    (
      value.code === 'EXPORT_ABORTED' ||
      value.reason === 'EXPORT_ABORTED'
    )
  );
}

function throwIfExportAborted() {
  if (exportCancelRequested) {
    throw createExportAbortedError();
  }
}

function requestExportAbort() {
  if (!editorState.exportBusy || exportCancelRequested) {
    return;
  }
  exportCancelRequested = true;
  setExportDebug(exportDebugRoute?.textContent || '輸出', 'ABORTING', '使用者要求中斷輸出');
  setStatus('正在中斷輸出...');
  if (activeExportTaskId > 0) {
    electronAPI.exportTaskCancel({
      taskId: activeExportTaskId
    }).catch(() => {});
  }
}

function waitForEvent(target, eventName) {
  return new Promise((resolve, reject) => {
    const onDone = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Video load failed'));
    };
    const cleanup = () => {
      target.removeEventListener(eventName, onDone);
      target.removeEventListener('error', onError);
    };

    target.addEventListener(eventName, onDone, { once: true });
    target.addEventListener('error', onError, { once: true });
  });
}

async function seekVideo(video, time) {
  const duration = getMediaDuration(video, 0);
  const maxTime = Math.max(0, duration);
  const targetTime = clamp(Math.max(0, toFiniteNumber(time, 0)), 0, maxTime > 0 ? maxTime : Number.MAX_SAFE_INTEGER);
  const currentTime = Math.max(0, toFiniteNumber(video.currentTime, 0));

  if (Math.abs(currentTime - targetTime) < 0.01) {
    return;
  }
  const seekPromise = waitForEvent(video, 'seeked');
  video.currentTime = targetTime;
  await seekPromise;
}

function getQualityPreset() {
  const key = qualitySelect?.value || DEFAULT_QUALITY_PRESET;
  return QUALITY_PRESETS[key] || QUALITY_PRESETS[DEFAULT_QUALITY_PRESET];
}

function getOutputQualityPresetKey() {
  const key = outputQualitySelect?.value || DEFAULT_QUALITY_PRESET;
  return QUALITY_PRESETS[key] ? key : DEFAULT_QUALITY_PRESET;
}

function getExportEngineMode() {
  const mode = exportEngineSelect?.value || 'auto';
  return mode === 'ffmpeg' || mode === 'builtin' ? mode : 'auto';
}

function setExportDebug(route, code, message) {
  const safeRoute = route || '待命';
  const safeCode = code || '-';
  const safeMessage = message || '尚未輸出';

  if (exportDebugRoute) {
    exportDebugRoute.textContent = safeRoute;
  }
  if (exportDebugCode) {
    exportDebugCode.textContent = safeCode;
  }
  if (exportDebugMessage) {
    exportDebugMessage.textContent = safeMessage;
  }
  console.info('[ExportDebug]', safeRoute, safeCode, safeMessage);
}

function resetExportTrace(message = 'Trace: 尚未輸出') {
  if (exportDebugTrace) {
    exportDebugTrace.textContent = message;
  }
}

function appendExportTrace(message) {
  const stamp = new Date().toISOString().slice(11, 23);
  const line = '[' + stamp + '] ' + String(message || '');
  if (exportDebugTrace) {
    const prev = exportDebugTrace.textContent || '';
    const merged = prev ? prev + '\n' + line : line;
    const lines = merged.split('\n');
    exportDebugTrace.textContent = lines.slice(-60).join('\n');
    exportDebugTrace.scrollTop = exportDebugTrace.scrollHeight;
  }
  console.info('[ExportTrace]', line);
}

function getPenHoldZoom() {
  const extraZoom = Math.max(0, cameraState.maxZoom - 1);
  return 1 + extraZoom * PEN_HOLD_ZOOM_RATIO;
}

function updateHdrCompUi() {
  if (!hdrCompStrengthInput || !hdrCompStrengthLabel || !hdrCompHueInput || !hdrCompHueLabel || !hdrCompRolloffInput || !hdrCompRolloffLabel || !hdrCompSharpnessInput || !hdrCompSharpnessLabel) {
    return;
  }

  hdrCompStrengthInput.disabled = !hdrCompState.enabled;
  hdrCompHueInput.disabled = !hdrCompState.enabled;
  hdrCompRolloffInput.disabled = !hdrCompState.enabled;
  hdrCompSharpnessInput.disabled = !hdrCompState.enabled;

  hdrCompStrengthLabel.textContent = (hdrCompState.strength > 0 ? '+' : '') + hdrCompState.strength.toFixed(2);
  const hue = Math.round(hdrCompState.hue);
  hdrCompHueLabel.textContent = (hue > 0 ? '+' : '') + String(hue) + '°';
  hdrCompRolloffLabel.textContent = hdrCompState.rolloff.toFixed(2);
  hdrCompSharpnessLabel.textContent = hdrCompState.sharpness.toFixed(2);
}

function buildHdrCompensationFilter() {
  if (!hdrCompState.enabled) {
    return 'none';
  }

  const strength = clamp(hdrCompState.strength, -1, 1);
  const rolloff = clamp(hdrCompState.rolloff, 0, 1);
  const sharpness = clamp(hdrCompState.sharpness, 0, 1);

  const brightness = clamp(1.0 + strength * 0.06 - rolloff * 0.12, 0.75, 1.2).toFixed(3);
  const contrast = clamp(1.0 + strength * 0.18 - rolloff * 0.22 + sharpness * 0.10, 0.70, 1.65).toFixed(3);
  const saturation = clamp(1.0 + strength * 0.40 - rolloff * 0.20, 0.55, 1.80).toFixed(3);
  const hue = clamp(hdrCompState.hue, -30, 30).toFixed(0);

  return 'brightness(' + brightness + ') contrast(' + contrast + ') saturate(' + saturation + ') hue-rotate(' + hue + 'deg)';
}

function mapPointToVideo(point) {
  const sw = rawVideo.videoWidth || previewCanvas.width || 1;
  const sh = rawVideo.videoHeight || previewCanvas.height || 1;

  if (typeof point.nx === 'number' && typeof point.ny === 'number') {
    return {
      x: clamp(point.nx * sw, 0, sw),
      y: clamp(point.ny * sh, 0, sh)
    };
  }

  return {
    x: clamp(point.x || 0, 0, sw),
    y: clamp(point.y || 0, 0, sh)
  };
}

function triggerTemporaryZoom(x, y, targetZoom = cameraState.maxZoom, holdMs = CLICK_ZOOM_HOLD_MS) {
  cameraState.targetX = x;
  cameraState.targetY = y;
  cameraState.targetZoom = targetZoom;
  cameraState.zoomHoldUntil = performance.now() + holdMs;
}

function triggerDoubleClickMarker(x, y) {
  doubleClickMarkerState.x = x;
  doubleClickMarkerState.y = y;
  doubleClickMarkerState.activeUntil = performance.now() + DOUBLE_CLICK_MARKER_MS;
}

function drawDoubleClickMarker(now) {
  if (now >= doubleClickMarkerState.activeUntil) {
    return;
  }

  const remaining = doubleClickMarkerState.activeUntil - now;
  const progress = 1 - (remaining / DOUBLE_CLICK_MARKER_MS);
  const alpha = Math.max(0, 0.9 * (1 - progress));
  const ringRadius = 18 + progress * 44;

  const { sx, sy, cropW, cropH, outputW, outputH } = viewState;
  const x = (doubleClickMarkerState.x - sx) * (outputW / cropW);
  const y = (doubleClickMarkerState.y - sy) * (outputH / cropH);

  if (x < -80 || y < -80 || x > outputW + 80 || y > outputH + 80) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "rgba(255, 236, 150, " + alpha.toFixed(3) + ")";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 140, 80, " + Math.max(0, alpha * 0.65).toFixed(3) + ")";
  ctx.beginPath();
  ctx.arc(x, y, 6 + (1 - progress) * 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function resizeCanvasToSource() {
  const dims = getCaptureVideoDimensions();
  const w = dims.width;
  const h = dims.height;
  if (!w || !h) {
    return;
  }

  if (previewCanvas.width !== w || previewCanvas.height !== h) {
    previewCanvas.width = w;
    previewCanvas.height = h;
  }
}

async function loadSources() {
  const previousValue = sourceSelect.value;
  sources = await electronAPI.getDesktopSources();
  sourceSelect.innerHTML = '';

  if (!sources.length) {
    setStatus('找不到可錄製螢幕來源');
    return;
  }

  for (const source of sources) {
    const option = document.createElement('option');
    option.value = source.id;
    option.textContent = source.name;
    sourceSelect.appendChild(option);
  }

  if (sourceSelect.options.length > 0) {
    const restoredIndex = sources.findIndex((s) => s.id === previousValue);
    sourceSelect.selectedIndex = restoredIndex >= 0 ? restoredIndex : 0;
    selectedSource = sources.find((s) => s.id === sourceSelect.value);
  }

  await maybeProbeHdrForUi().catch(() => {});

  setStatus(`已載入 ${sources.length} 個螢幕來源`);
}

function updateCursorFromMain() {
  if (!selectedSource) {
    return;
  }

  electronAPI.getCursorPoint(selectedSource.display_id).then((p) => {
    if (!p.inside) {
      cameraState.targetZoom = 1;
      return;
    }

    const cursorPoint = mapPointToVideo(p);
    cameraState.cursorX = cursorPoint.x;
    cameraState.cursorY = cursorPoint.y;
    if (clickState.doubleClickLocked) {
      cameraState.targetX = clickState.lockedX;
      cameraState.targetY = clickState.lockedY;
      cameraState.targetZoom = cameraState.maxZoom;
    } else if (annotationState.enabled) {
      const penTarget = getPenFollowTarget(cursorPoint.x, cursorPoint.y);
      cameraState.targetX = penTarget.x;
      cameraState.targetY = penTarget.y;
    } else {
      cameraState.targetX = cursorPoint.x;
      cameraState.targetY = cursorPoint.y;
    }

    electronAPI.getLatestClick(selectedSource.display_id, clickState.lastClickTimestamp).then((clickInfo) => {
      if (!clickState.checkedCapability) {
        clickState.checkedCapability = true;
        clickState.enabled = Boolean(clickInfo && clickInfo.enabled);
      }
      if (clickInfo && clickInfo.hasNew && clickInfo.inside) {
        clickState.lastClickTimestamp = clickInfo.timestamp;
        const clickPoint = mapPointToVideo(clickInfo);
        const clickTs = Number(clickInfo.timestamp || Date.now());
        const isDoubleClick = clickState.lastZoomTriggerTs > 0 && (clickTs - clickState.lastZoomTriggerTs) <= DOUBLE_CLICK_MAX_WINDOW_MS;
        const lockDistance = Math.hypot(clickPoint.x - clickState.lockedX, clickPoint.y - clickState.lockedY);
        const clickedOtherPosition = lockDistance >= DOUBLE_CLICK_UNLOCK_DISTANCE_PX;

        clickState.lastZoomTriggerTs = clickTs;
        clickState.holdDelayUntil = performance.now() + PEN_HOLD_DELAY_MS;
        clickState.forceMaxUntil = isDoubleClick ? performance.now() + DOUBLE_CLICK_ZOOM_HOLD_MS : 0;

        if (isDoubleClick) {
          clickState.doubleClickLocked = true;
          clickState.lockedX = clickPoint.x;
          clickState.lockedY = clickPoint.y;
          triggerTemporaryZoom(clickPoint.x, clickPoint.y, cameraState.maxZoom, DOUBLE_CLICK_ZOOM_HOLD_MS);
        } else {
          if (clickState.doubleClickLocked && clickedOtherPosition) {
            clickState.doubleClickLocked = false;
            cameraState.zoomHoldUntil = 0;
            cameraState.targetZoom = 1;
          }
          if (!clickState.doubleClickLocked) {
            triggerTemporaryZoom(clickPoint.x, clickPoint.y, getPenHoldZoom(), CLICK_ZOOM_HOLD_MS);
          }
        }
        if (isDoubleClick) {
          electronAPI.overlayDoubleClickMarker({ x: clickInfo.x, y: clickInfo.y }).catch(() => {
            triggerDoubleClickMarker(clickPoint.x, clickPoint.y);
          });
        }
      }

      if (clickInfo && !clickState.doubleClickLocked && clickInfo.mouseDown && performance.now() >= clickState.holdDelayUntil && performance.now() >= clickState.forceMaxUntil) {
        cameraState.targetZoom = getPenHoldZoom();
        cameraState.zoomHoldUntil = performance.now() + CLICK_ZOOM_HOLD_MS;
      } else if (clickInfo && !clickInfo.mouseDown) {
        clickState.holdDelayUntil = 0;
        clickState.forceMaxUntil = 0;
      }
    });
  });
}

function drawCursorGlow(cursorX, cursorY) {
  const { sx, sy, cropW, cropH, outputW, outputH } = viewState;
  const x = (cursorX - sx) * (outputW / cropW);
  const y = (cursorY - sy) * (outputH / cropH);

  if (x < 0 || y < 0 || x > outputW || y > outputH) {
    return;
  }

  const glow = ctx.createRadialGradient(x, y, 0, x, y, glowState.radius);
  glow.addColorStop(0, 'rgba(255, 241, 150, ' + glowState.opacity.toFixed(2) + ')');
  glow.addColorStop(0.35, 'rgba(255, 196, 80, ' + (glowState.opacity * 0.62).toFixed(2) + ')');
  glow.addColorStop(1, 'rgba(255, 160, 40, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, glowState.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 248, 225, ' + Math.min(1, glowState.opacity + 0.1).toFixed(2) + ')';
  ctx.beginPath();
  ctx.arc(x, y, glowState.coreRadius, 0, Math.PI * 2);
  ctx.fill();
}

function getPenFollowTarget(cursorX, cursorY) {
  const sw = rawVideo.videoWidth || previewCanvas.width || 1;
  const sh = rawVideo.videoHeight || previewCanvas.height || 1;
  const zoom = clamp(cameraState.zoom, 1, cameraState.maxZoom);
  const cropW = sw / zoom;
  const cropH = sh / zoom;
  const deadzoneHalfW = cropW * PEN_FOLLOW_DEADZONE_RATIO_X;
  const deadzoneHalfH = cropH * PEN_FOLLOW_DEADZONE_RATIO_Y;

  let targetX = cameraState.viewportX;
  let targetY = cameraState.viewportY;

  if (cursorX < targetX - deadzoneHalfW) {
    targetX = cursorX + deadzoneHalfW;
  } else if (cursorX > targetX + deadzoneHalfW) {
    targetX = cursorX - deadzoneHalfW;
  }

  if (cursorY < targetY - deadzoneHalfH) {
    targetY = cursorY + deadzoneHalfH;
  } else if (cursorY > targetY + deadzoneHalfH) {
    targetY = cursorY - deadzoneHalfH;
  }

  return {
    x: clamp(targetX, cropW / 2, sw - cropW / 2),
    y: clamp(targetY, cropH / 2, sh - cropH / 2)
  };
}

function drawLoop() {
  if (!sourceStream && !nativeHdrState.active) {
    return;
  }

  resizeCanvasToSource();

  const now = performance.now();
  if (!clickState.doubleClickLocked && now > cameraState.zoomHoldUntil) {
    cameraState.targetZoom = 1;
  }

  const smooth = cameraState.smoothing;
  const followSmooth = annotationState.enabled
    ? smooth * PEN_DRAW_FOLLOW_SLOWDOWN
    : smooth;
  const zoomSmooth = cameraState.targetZoom > cameraState.zoom
    ? smooth * CLICK_ZOOM_IN_SLOWDOWN
    : smooth;

  cameraState.zoom += (cameraState.targetZoom - cameraState.zoom) * zoomSmooth;
  cameraState.viewportX += (cameraState.targetX - cameraState.viewportX) * followSmooth;
  cameraState.viewportY += (cameraState.targetY - cameraState.viewportY) * followSmooth;

  glowState.x += (cameraState.cursorX - glowState.x) * glowState.lag;
  glowState.y += (cameraState.cursorY - glowState.y) * glowState.lag;

  const dims = getCaptureVideoDimensions();
  const sw = dims.width;
  const sh = dims.height;
  if (!sw || !sh) {
    drawTimer = setTimeout(drawLoop, DRAW_INTERVAL_MS);
    return;
  }

  const captureSource = getCaptureVideoSource();
  if (!captureSource) {
    drawTimer = setTimeout(drawLoop, DRAW_INTERVAL_MS);
    return;
  }

  const zoom = clamp(cameraState.zoom, 1, cameraState.maxZoom);
  const cropW = sw / zoom;
  const cropH = sh / zoom;
  const sx = clamp(cameraState.viewportX - cropW / 2, 0, sw - cropW);
  const sy = clamp(cameraState.viewportY - cropH / 2, 0, sh - cropH);

  viewState.sx = sx;
  viewState.sy = sy;
  viewState.cropW = cropW;
  viewState.cropH = cropH;
  viewState.outputW = sw;
  viewState.outputH = sh;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.filter = buildHdrCompensationFilter();
  ctx.drawImage(captureSource, sx, sy, cropW, cropH, 0, 0, sw, sh);
  ctx.filter = 'none';

  if (hdrCompState.enabled) {
    const sharpness = clamp(hdrCompState.sharpness, 0, 1);
    if (sharpness > 0.01) {
      ctx.globalAlpha = sharpness * 0.12;
      ctx.globalCompositeOperation = 'overlay';
      ctx.filter = 'contrast(' + (1 + sharpness * 0.45).toFixed(3) + ')';
      ctx.drawImage(captureSource, sx, sy, cropW, cropH, 0, 0, sw, sh);
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
  }

  drawDoubleClickMarker(now);
  if (!annotationState.enabled) {
    drawCursorGlow(glowState.x, glowState.y);
  }

  drawTimer = setTimeout(drawLoop, DRAW_INTERVAL_MS);
}

function stopMediaTracks(stream) {
  if (!stream) {
    return;
  }

  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function resetAudioMixer() {
  if (desktopAudioNode) {
    desktopAudioNode.disconnect();
    desktopAudioNode = undefined;
  }
  if (desktopGainNode) {
    desktopGainNode.disconnect();
    desktopGainNode = undefined;
  }
  if (micAudioNode) {
    micAudioNode.disconnect();
    micAudioNode = undefined;
  }
  if (micGainNode) {
    micGainNode.disconnect();
    micGainNode = undefined;
  }
  if (masterGainNode) {
    masterGainNode.disconnect();
    masterGainNode = undefined;
  }
  if (compressorNode) {
    compressorNode.disconnect();
    compressorNode = undefined;
  }
  if (mixedAudioDestination) {
    mixedAudioDestination = undefined;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = undefined;
  }
}

function pickRecorderConfig(requestedFormat) {
  const candidates = requestedFormat === 'mp4'
    ? [
        'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4'
      ]
    : [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ];

  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return {
        mimeType,
        ext: mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
      };
    }
  }

  if (requestedFormat === 'mp4') {
    const fallback = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (const mimeType of fallback) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return { mimeType, ext: 'webm', fallbackFromMp4: true };
      }
    }
  }

  return { mimeType: '', ext: requestedFormat === 'mp4' ? 'mp4' : 'webm' };
}

function pickBuiltinRecorderConfig() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp8',
    'video/webm'
  ];

  for (const mimeType of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) {
      return { mimeType, ext: 'webm' };
    }
  }

  return { mimeType: '', ext: 'webm' };
}

function createMediaRecorder(stream, recorderConfig, qualityPreset) {
  const videoBitrate = Number(qualityPreset.videoBitrate || 22000000);
  const audioBitrate = Number(qualityPreset.audioBitrate || 256000);
  const optionCandidates = [];

  if (recorderConfig.mimeType) {
    optionCandidates.push({
      mimeType: recorderConfig.mimeType,
      videoBitsPerSecond: videoBitrate,
      audioBitsPerSecond: audioBitrate
    });
    optionCandidates.push({ mimeType: recorderConfig.mimeType });
  }

  optionCandidates.push({
    videoBitsPerSecond: videoBitrate,
    audioBitsPerSecond: audioBitrate,
    bitsPerSecond: videoBitrate + audioBitrate
  });
  optionCandidates.push({});

  let lastError;
  for (const options of optionCandidates) {
    try {
      return new MediaRecorder(stream, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Failed to create MediaRecorder');
}

function createBuiltinMediaRecorder(stream, recorderConfig, qualityPreset, includeAudio) {
  const videoBitrate = Number((qualityPreset && qualityPreset.videoBitrate) || 22000000);
  const audioBitrate = Number((qualityPreset && qualityPreset.audioBitrate) || 256000);
  const optionCandidates = [];
  if (recorderConfig && recorderConfig.mimeType) {
    if (includeAudio) {
      optionCandidates.push({
        mimeType: recorderConfig.mimeType,
        videoBitsPerSecond: videoBitrate,
        audioBitsPerSecond: audioBitrate
      });
    } else {
      optionCandidates.push({
        mimeType: recorderConfig.mimeType,
        videoBitsPerSecond: videoBitrate
      });
    }
    optionCandidates.push({ mimeType: recorderConfig.mimeType });
  }
  if (includeAudio) {
    optionCandidates.push({
      videoBitsPerSecond: videoBitrate,
      audioBitsPerSecond: audioBitrate,
      bitsPerSecond: videoBitrate + audioBitrate
    });
  } else {
    optionCandidates.push({
      videoBitsPerSecond: videoBitrate
    });
  }
  optionCandidates.push({});

  let lastError;
  for (const options of optionCandidates) {
    try {
      return new MediaRecorder(stream, options);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('Failed to create builtin MediaRecorder');
}

function applyQualityHints(stream) {
  if (!stream) {
    return;
  }

  const [videoTrack] = stream.getVideoTracks();
  if (!videoTrack) {
    return;
  }

  try {
    videoTrack.contentHint = 'detail';
  } catch (_error) {
  }
}

async function getDesktopStream(sourceId) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxFrameRate: 60
        }
      }
    });
  } catch (_error) {
    return getDesktopVideoStream(sourceId);
  }
}

async function getDesktopVideoStream(sourceId) {
  return navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxFrameRate: 60
      }
    }
  });
}

async function getDesktopAudioStream(sourceId) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId
        }
      },
      video: false
    });
  } catch (_error) {
    return undefined;
  }
}

function ensureNativeHdrCanvas(width, height) {
  const safeW = Math.max(1, Math.floor(Number(width) || 1));
  const safeH = Math.max(1, Math.floor(Number(height) || 1));

  if (!nativeHdrState.canvas) {
    nativeHdrState.canvas = document.createElement('canvas');
    nativeHdrState.ctx = nativeHdrState.canvas.getContext('2d', { alpha: false });
  }

  if (!nativeHdrState.canvas || !nativeHdrState.ctx) {
    throw new Error('無法建立 Native HDR 畫面緩衝。');
  }

  if (nativeHdrState.canvas.width !== safeW || nativeHdrState.canvas.height !== safeH) {
    nativeHdrState.canvas.width = safeW;
    nativeHdrState.canvas.height = safeH;
    nativeHdrState.frameImageData = null;
  }
}

function getCaptureVideoSource() {
  if (nativeHdrState.active && nativeHdrState.canvas) {
    return nativeHdrState.canvas;
  }
  return rawVideo;
}

function getCaptureVideoDimensions() {
  if (nativeHdrState.active && nativeHdrState.canvas) {
    return {
      width: nativeHdrState.canvas.width,
      height: nativeHdrState.canvas.height
    };
  }
  return {
    width: Number(rawVideo.videoWidth || 0),
    height: Number(rawVideo.videoHeight || 0)
  };
}

function stopNativeHdrFramePump() {
  clearTimeout(nativeHdrFramePumpTimer);
  nativeHdrFramePumpTimer = 0;
  nativeHdrFramePumpRunning = false;
}

async function stopNativeHdrCapture() {
  stopNativeHdrFramePump();

  if (nativeHdrState.sessionId > 0) {
    await electronAPI.hdrCaptureStop({
      sessionId: nativeHdrState.sessionId
    }).catch(() => {});
  }

  nativeHdrState.active = false;
  nativeHdrState.sessionId = 0;
  nativeHdrState.width = 0;
  nativeHdrState.height = 0;
  nativeHdrState.stride = 0;
  nativeHdrState.sourceId = '';
  nativeHdrState.displayId = '';
  nativeHdrState.readFailures = 0;
  nativeHdrState.droppedFrames = 0;
  nativeHdrState.lastFrameAtMs = 0;
  nativeHdrState.frameCount = 0;
  nativeHdrState.frameImageData = null;
}

function blitNativeFrameToCanvas(frame) {
  if (!nativeHdrState.ctx || !nativeHdrState.canvas) {
    return;
  }

  const width = Math.max(1, Number(frame && frame.width ? frame.width : nativeHdrState.width || 1));
  const height = Math.max(1, Number(frame && frame.height ? frame.height : nativeHdrState.height || 1));
  const stride = Math.max(width * 4, Number(frame && frame.stride ? frame.stride : width * 4));
  const rawBytes = frame && frame.bytes ? frame.bytes : null;
  if (!rawBytes) {
    nativeHdrState.droppedFrames += 1;
    return;
  }

  const srcBytes = new Uint8ClampedArray(rawBytes);
  ensureNativeHdrCanvas(width, height);

  const expectedBytes = width * height * 4;
  if (!nativeHdrState.frameImageData || nativeHdrState.frameImageData.width !== width || nativeHdrState.frameImageData.height !== height) {
    nativeHdrState.frameImageData = nativeHdrState.ctx.createImageData(width, height);
  }

  const dst = nativeHdrState.frameImageData.data;
  if (stride === width * 4 && srcBytes.length >= expectedBytes) {
    dst.set(srcBytes.subarray(0, expectedBytes));
  } else {
    for (let row = 0; row < height; row += 1) {
      const srcOffset = row * stride;
      const dstOffset = row * width * 4;
      const end = Math.min(srcOffset + width * 4, srcBytes.length);
      if (end > srcOffset) {
        dst.set(srcBytes.subarray(srcOffset, end), dstOffset);
      }
    }
  }

  nativeHdrState.ctx.putImageData(nativeHdrState.frameImageData, 0, 0);
  nativeHdrState.lastFrameAtMs = performance.now();
  nativeHdrState.frameCount += 1;
}

async function fallbackNativeToDesktopVideo(reason) {
  if (nativeHdrFallbackAttempted) {
    return;
  }
  nativeHdrFallbackAttempted = true;

  const oldSourceStream = sourceStream;

  try {
    const fallbackStream = await getDesktopStream(nativeHdrState.sourceId || sourceSelect.value);
    sourceStream = fallbackStream;
    applyQualityHints(sourceStream);
    rawVideo.srcObject = fallbackStream;
    await rawVideo.play();
    setHdrRuntimeRoute('fallback', '目前路徑: Fallback（Native 執行中回退）');

    if (oldSourceStream && oldSourceStream !== fallbackStream) {
      extraCaptureStreams.push(oldSourceStream);
    }

    setStatus('偵測到 Native HDR 擷取中斷，已自動回退既有錄影管線。' + (reason ? ' 原因: ' + reason : ''));
  } catch (error) {
    setStatus('Native HDR 擷取中斷且回退失敗: ' + (error && error.message ? error.message : String(error)));
  } finally {
    await stopNativeHdrCapture();
  }
}

async function pollNativeHdrFrame() {
  if (!nativeHdrState.active || nativeHdrState.sessionId <= 0 || nativeHdrFramePumpRunning) {
    return;
  }

  nativeHdrFramePumpRunning = true;
  try {
    const result = await electronAPI.hdrCaptureReadFrame({
      sessionId: nativeHdrState.sessionId,
      timeoutMs: HDR_NATIVE_READ_TIMEOUT_MS
    });

    if (result && result.ok) {
      nativeHdrState.readFailures = 0;
      blitNativeFrameToCanvas(result);
      return;
    }

    nativeHdrState.readFailures += 1;
    const idleForMs = nativeHdrState.lastFrameAtMs > 0 ? (performance.now() - nativeHdrState.lastFrameAtMs) : 0;
    if (
      (result && result.fallbackRecommended) ||
      nativeHdrState.readFailures >= HDR_NATIVE_MAX_READ_FAILURES ||
      idleForMs >= HDR_NATIVE_MAX_IDLE_MS
    ) {
      await fallbackNativeToDesktopVideo((result && result.reason) || 'READ_FAILED');
    }
  } catch (error) {
    nativeHdrState.readFailures += 1;
    if (nativeHdrState.readFailures >= HDR_NATIVE_MAX_READ_FAILURES) {
      await fallbackNativeToDesktopVideo(error && error.message ? error.message : 'READ_EXCEPTION');
    }
  } finally {
    nativeHdrFramePumpRunning = false;
    if (nativeHdrState.active && nativeHdrState.sessionId > 0) {
      nativeHdrFramePumpTimer = setTimeout(() => {
        pollNativeHdrFrame().catch(() => {});
      }, 1);
    }
  }
}

async function probeHdrNativeSupport(sourceId, displayId) {
  const probe = await electronAPI.hdrProbeWindows({
    sourceId,
    displayId
  }).catch(() => ({ ok: false, supported: false, reason: 'PROBE_EXCEPTION' }));

  hdrMappingState.probeSupported = Boolean(probe && probe.supported);
  hdrMappingState.probeHdrActive = Boolean(probe && probe.hdrActive);
  hdrMappingState.probeReason = String((probe && probe.reason) || (probe && probe.supported ? 'OK' : 'UNKNOWN'));

  if (probe && probe.supported) {
    setHdrProbeStatus('Probe: Native 可用（' + (probe.hdrActive ? 'HDR 螢幕' : 'SDR/未知') + '）');
  } else {
    setHdrProbeStatus('Probe: Native 不可用（' + hdrMappingState.probeReason + '）');
  }

  return probe || { ok: false, supported: false, reason: 'UNKNOWN' };
}

async function tryStartNativeHdrCapture(sourceId, displayId) {
  const start = await electronAPI.hdrCaptureStart({
    sourceId,
    displayId,
    maxFps: 60,
    toneMap: {
      profile: 'rec709-rolloff-v1'
    }
  });

  if (!start || !start.ok) {
    return {
      ok: false,
      reason: (start && start.reason) || 'START_FAILED',
      message: (start && start.message) || '無法啟動 Native HDR 擷取。'
    };
  }

  nativeHdrState.active = true;
  nativeHdrState.sessionId = Number(start.sessionId || 0);
  nativeHdrState.width = Math.max(1, Number(start.width || 1));
  nativeHdrState.height = Math.max(1, Number(start.height || 1));
  nativeHdrState.stride = Math.max(nativeHdrState.width * 4, Number(start.stride || nativeHdrState.width * 4));
  nativeHdrState.sourceId = sourceId;
  nativeHdrState.displayId = String(displayId || '');
  nativeHdrState.readFailures = 0;
  nativeHdrState.droppedFrames = 0;
  nativeHdrState.lastFrameAtMs = 0;
  nativeHdrState.frameCount = 0;
  nativeHdrFallbackAttempted = false;

  ensureNativeHdrCanvas(nativeHdrState.width, nativeHdrState.height);
  setHdrRuntimeRoute('native', '目前路徑: Native HDR (Rec.709 Mapping)');

  await pollNativeHdrFrame();
  return { ok: true, start };
}

async function resolveCaptureRoute(sourceId, selectedDisplayId) {
  const mode = normalizeHdrMappingMode(hdrMappingState.mode);
  if (mode === 'off') {
    setHdrProbeStatus('Probe: 模式關閉');
    return { route: 'fallback', reason: 'MODE_OFF' };
  }

  const probe = await probeHdrNativeSupport(sourceId, selectedDisplayId);
  if (!probe.supported) {
    if (mode === 'force-native') {
      return {
        route: 'blocked',
        reason: probe.reason || 'NATIVE_UNAVAILABLE',
        message: probe.message || 'Force Native 但 native backend 不可用。'
      };
    }
    return { route: 'fallback', reason: probe.reason || 'NATIVE_UNAVAILABLE' };
  }

  if (mode === 'auto' && !probe.hdrActive) {
    return { route: 'fallback', reason: probe.reason || 'HDR_INACTIVE' };
  }

  const nativeStart = await tryStartNativeHdrCapture(sourceId, selectedDisplayId);
  if (nativeStart.ok) {
    return { route: 'native', reason: 'NATIVE_OK' };
  }

  if (mode === 'force-native') {
    return {
      route: 'blocked',
      reason: nativeStart.reason || 'START_FAILED',
      message: nativeStart.message || 'Force Native 啟動失敗。'
    };
  }

  return { route: 'fallback', reason: nativeStart.reason || 'START_FAILED' };
}

async function buildCaptureStreams(sourceId, selectedDisplayId) {
  const decision = await resolveCaptureRoute(sourceId, selectedDisplayId);

  if (decision.route === 'blocked') {
    throw new Error(decision.message || 'Native HDR 路徑不可用。');
  }

  if (decision.route === 'native') {
    sourceStream = await getDesktopAudioStream(sourceId);
    if (!sourceStream) {
      sourceStream = new MediaStream();
    }
    micStream = await getMicStreamIfEnabled();
    rawVideo.srcObject = null;
    rawVideo.load();
    return { route: 'native' };
  }

  await stopNativeHdrCapture();
  sourceStream = await getDesktopStream(sourceId);
  applyQualityHints(sourceStream);
  micStream = await getMicStreamIfEnabled();
  rawVideo.srcObject = sourceStream;
  await rawVideo.play();
  setHdrRuntimeRoute('fallback', '目前路徑: Fallback（既有錄影）');
  return { route: 'fallback' };
}

async function maybeProbeHdrForUi() {
  const sourceId = String(sourceSelect && sourceSelect.value ? sourceSelect.value : '');
  if (!sourceId || !selectedSource) {
    return;
  }
  if (normalizeHdrMappingMode(hdrMappingState.mode) === 'off') {
    setHdrProbeStatus('Probe: 模式關閉');
    return;
  }
  await probeHdrNativeSupport(sourceId, selectedSource.display_id);
}

async function getMicStreamIfEnabled() {
  if (!micInput.checked) {
    return undefined;
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: false
    });
  } catch (_error) {
    return undefined;
  }
}

async function buildMixedAudioTrack() {
  const desktopAudioTracks = sourceStream ? sourceStream.getAudioTracks() : [];
  const micAudioTracks = micStream ? micStream.getAudioTracks() : [];

  if (desktopAudioTracks.length === 0 && micAudioTracks.length === 0) {
    return undefined;
  }

  audioContext = new AudioContext();
  mixedAudioDestination = audioContext.createMediaStreamDestination();

  masterGainNode = audioContext.createGain();
  masterGainNode.gain.value = MASTER_GAIN;

  compressorNode = audioContext.createDynamicsCompressor();
  compressorNode.threshold.value = -24;
  compressorNode.knee.value = 18;
  compressorNode.ratio.value = 5;
  compressorNode.attack.value = 0.003;
  compressorNode.release.value = 0.25;

  masterGainNode.connect(compressorNode).connect(mixedAudioDestination);

  if (desktopAudioTracks.length > 0) {
    const desktopOnlyStream = new MediaStream(desktopAudioTracks);
    desktopAudioNode = audioContext.createMediaStreamSource(desktopOnlyStream);
    desktopGainNode = audioContext.createGain();
    desktopGainNode.gain.value = DESKTOP_GAIN;
    desktopAudioNode.connect(desktopGainNode).connect(masterGainNode);
  }

  if (micAudioTracks.length > 0) {
    const micOnlyStream = new MediaStream(micAudioTracks);
    micAudioNode = audioContext.createMediaStreamSource(micOnlyStream);
    micGainNode = audioContext.createGain();
    micGainNode.gain.value = MIC_GAIN;
    micAudioNode.connect(micGainNode).connect(masterGainNode);
  }

  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }

  return mixedAudioDestination.stream.getAudioTracks()[0];
}

function setEditorVisible(visible) {
  timelinePanel.hidden = !visible;
  previewCanvas.hidden = visible;
  rawVideo.hidden = !visible;
}

function updateEditorButtons() {
  const busy = editorState.exportBusy;
  const playing = !rawVideo.paused && !rawVideo.ended;
  playPauseBtn.textContent = playing ? '暫停' : '播放';
  playPauseBtn.disabled = busy || !editorState.active;
  previewRangeBtn.disabled = busy || !editorState.active;
  saveClipBtn.disabled = busy || !editorState.active;
  if (abortExportBtn) {
    abortExportBtn.disabled = !busy;
  }
  discardClipBtn.disabled = busy || !editorState.active;
}

function updateTrimRangeVisual() {
  if (!trimRangeBar || !trimRangeLabel) {
    return;
  }

  const duration = Math.max(0.1, toFiniteNumber(editorState.duration, 0.1));
  const start = clamp(toFiniteNumber(editorState.trimStart, 0), 0, duration);
  const end = clamp(toFiniteNumber(editorState.trimEnd, duration), 0, duration);
  const startPercent = (start / duration) * 100;
  const endPercent = (end / duration) * 100;

  trimRangeBar.style.setProperty('--trim-start', startPercent.toFixed(3));
  trimRangeBar.style.setProperty('--trim-end', endPercent.toFixed(3));
  trimRangeLabel.textContent = formatClock(start) + ' - ' + formatClock(end);
}

function updateTimelineInputs() {
  if (!editorState.active || editorState.duration <= 0) {
    timeInfo.textContent = '00:00.0 / 00:00.0';
    clipDurationInfo.textContent = '剪輯長度: 00:00.0';
    updateTrimRangeVisual();
    return;
  }

  const duration = Math.max(0.1, toFiniteNumber(editorState.duration, 0.1));
  const currentTime = clamp(toFiniteNumber(rawVideo.currentTime, 0), 0, duration);
  const clipDuration = Math.max(0, toFiniteNumber(editorState.trimEnd, 0) - toFiniteNumber(editorState.trimStart, 0));
  const normalizedPlayhead = Math.round((currentTime / duration) * 1000);
  const normalizedStart = Math.round((editorState.trimStart / duration) * 1000);
  const normalizedEnd = Math.round((editorState.trimEnd / duration) * 1000);

  playheadInput.value = String(clamp(normalizedPlayhead, 0, 1000));
  trimStartInput.value = String(clamp(normalizedStart, 0, 1000));
  trimEndInput.value = String(clamp(normalizedEnd, 0, 1000));
  timeInfo.textContent =
    formatClock(editorState.trimStart) +
    ' - ' +
    formatClock(editorState.trimEnd) +
    ' / ' +
    formatClock(duration);
  clipDurationInfo.textContent = '剪輯長度: ' + formatClock(clipDuration);
  updateTrimRangeVisual();
}

function enforceTrimBounds() {
  const duration = Math.max(0.1, toFiniteNumber(editorState.duration, 0.1));
  const currentTime = Math.max(0, toFiniteNumber(rawVideo.currentTime, 0));
  const minGap = Math.min(MIN_TRIM_GAP_SECONDS, duration);
  editorState.trimStart = clamp(editorState.trimStart, 0, Math.max(0, duration - minGap));
  editorState.trimEnd = clamp(editorState.trimEnd, minGap, duration);

  if (editorState.trimEnd - editorState.trimStart < minGap) {
    if (currentTime <= editorState.trimStart) {
      editorState.trimEnd = clamp(editorState.trimStart + minGap, minGap, duration);
    } else {
      editorState.trimStart = clamp(editorState.trimEnd - minGap, 0, Math.max(0, duration - minGap));
    }
  }
}

async function saveBlobToDisk(blob, ext) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const result = await uploadBlobToPath(blob, {
    mode: 'save',
    title: '儲存影片',
    baseName: `cursorcine-${timestamp}`,
    ext,
    route: 'save-file'
  });
  if (!result.ok) {
    if (result.reason === 'CANCELED') {
      setStatus('已取消儲存');
      return;
    }
    throw new Error(result.message || '儲存失敗');
  }
}

async function uploadBlobToOpenSession(blob, openResult) {
  if (!openResult || !openResult.ok) {
    return openResult || { ok: false, reason: 'OPEN_FAILED', message: '建立上傳工作階段失敗。' };
  }

  const sessionId = Number(openResult.sessionId);

  try {
    throwIfExportAborted();
    let offset = 0;
    while (offset < blob.size) {
      throwIfExportAborted();
      const end = Math.min(blob.size, offset + IPC_UPLOAD_CHUNK_BYTES);
      const chunkBytes = new Uint8Array(await blob.slice(offset, end).arrayBuffer());
      const chunkResult = await electronAPI.blobUploadChunk({
        sessionId,
        bytes: chunkBytes
      });
      if (!chunkResult || !chunkResult.ok) {
        throw new Error((chunkResult && chunkResult.message) || '寫入區塊失敗。');
      }
      offset = end;
    }

    throwIfExportAborted();
    const closeResult = await electronAPI.blobUploadClose({
      sessionId,
      abort: false
    });
    if (!closeResult || !closeResult.ok) {
      throw new Error((closeResult && closeResult.message) || '關閉上傳工作階段失敗。');
    }
    return openResult;
  } catch (error) {
    await electronAPI.blobUploadClose({
      sessionId,
      abort: true
    }).catch(() => {});
    throw error;
  }
}

async function exportRecording(blob, preopenedSaveSession, exportTaskId) {
  throwIfExportAborted();
  if (recordingMeta.requestedFormat === 'mp4' && recordingMeta.fallbackFromMp4) {
    setStatus('正在輸出剪輯檔，並用 ffmpeg 轉為 MP4...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uploaded = await uploadBlobToPath(blob, {
      mode: 'temp',
      baseName: `cursorcine-${timestamp}`,
      ext: 'webm'
    });
    if (!uploaded.ok) {
      if (uploaded.reason === 'CANCELED') {
        setStatus('已取消儲存 MP4');
        return;
      }
      throw new Error(uploaded.message || '暫存影片建立失敗');
    }

    const result = await electronAPI.convertWebmToMp4FromPath({
      inputPath: uploaded.filePath,
      baseName: `cursorcine-${timestamp}`,
      taskId: exportTaskId || 0,
      cleanupTempDir: uploaded.tempDir
    });

    if (result.ok) {
      setStatus('儲存完成（MP4）');
      return;
    }

    if (result.reason === 'CANCELED') {
      setStatus('已取消儲存 MP4');
      return;
    }
    if (result.reason === 'EXPORT_ABORTED') {
      throw createExportAbortedError();
    }

    await saveBlobToDisk(blob, 'webm');
    setStatus(`MP4 轉檔失敗，已改存 WebM: ${result.message}`);
    return;
  }

  if (preopenedSaveSession && preopenedSaveSession.ok) {
    await uploadBlobToOpenSession(blob, preopenedSaveSession);
  } else {
    await saveBlobToDisk(blob, recordingMeta.outputExt);
  }
  throwIfExportAborted();
  setStatus(`儲存完成（${recordingMeta.outputExt.toUpperCase()}）`);
}

async function uploadBlobToPath(blob, options) {
  const openResult = await electronAPI.blobUploadOpen(options || {});
  return uploadBlobToOpenSession(blob, openResult);
}

async function cleanupTempDir(tempDir) {
  const dir = String(tempDir || '');
  if (!dir) {
    return;
  }
  await electronAPI.cleanupTempDir({
    tempDir: dir
  }).catch(() => {});
}

function clearEditorState() {
  const cleanupDir = editorState.cleanupTempDir;
  if (editorState.sourceUrl) {
    URL.revokeObjectURL(editorState.sourceUrl);
  }
  editorState.active = false;
  editorState.exportBusy = false;
  editorState.blob = null;
  editorState.sourceUrl = '';
  editorState.sourcePath = '';
  editorState.cleanupTempDir = '';
  editorState.duration = 0;
  editorState.trimStart = 0;
  editorState.trimEnd = 0;
  exportCancelRequested = false;
  activeExportTaskId = 0;
  rawVideo.pause();
  rawVideo.removeAttribute('src');
  rawVideo.load();
  setExportDebug('待命', '-', '尚未輸出');
  resetExportTrace('Trace: 尚未輸出');
  setEditorVisible(false);
  stopExportTimer(true);
  if (cleanupDir) {
    cleanupTempDir(cleanupDir);
  }
}

async function enterEditorMode(blob, fallbackDurationSec = 0.1) {
  clearEditorState();
  editorState.blob = blob;
  editorState.sourceUrl = URL.createObjectURL(blob);
  editorState.active = true;

  rawVideo.srcObject = null;
  rawVideo.muted = false;
  rawVideo.controls = false;
  rawVideo.src = editorState.sourceUrl;
  await waitForEvent(rawVideo, 'loadedmetadata');

  editorState.duration = Math.max(0.1, getMediaDuration(rawVideo, Math.max(0.1, toFiniteNumber(fallbackDurationSec, 0.1))));
  editorState.trimStart = 0;
  editorState.trimEnd = editorState.duration;
  await seekVideo(rawVideo, 0);

  setEditorVisible(true);
  updateTimelineInputs();
  updateEditorButtons();
  setExportDebug('待命', '-', '請按「儲存定稿」開始輸出');
  resetExportTrace('Trace: 就緒，等待輸出');
  setStatus('錄製完成：請在下方時間軸剪輯並回放，定稿後按「儲存定稿」。');
}

async function enterEditorModeFromPath(filePath, tempDir, fallbackDurationSec = 0.1) {
  const fileUrlResult = await electronAPI.pathToFileUrl({
    filePath
  });
  if (!fileUrlResult || !fileUrlResult.ok || !fileUrlResult.url) {
    throw new Error((fileUrlResult && fileUrlResult.message) || '無法載入錄影檔案。');
  }

  clearEditorState();
  editorState.sourcePath = String(filePath || '');
  editorState.cleanupTempDir = String(tempDir || '');
  editorState.sourceUrl = fileUrlResult.url;
  editorState.active = true;

  rawVideo.srcObject = null;
  rawVideo.muted = false;
  rawVideo.controls = false;
  rawVideo.src = editorState.sourceUrl;
  await waitForEvent(rawVideo, 'loadedmetadata');

  editorState.duration = Math.max(0.1, getMediaDuration(rawVideo, Math.max(0.1, toFiniteNumber(fallbackDurationSec, 0.1))));
  editorState.trimStart = 0;
  editorState.trimEnd = editorState.duration;
  await seekVideo(rawVideo, 0);

  setEditorVisible(true);
  updateTimelineInputs();
  updateEditorButtons();
  setExportDebug('待命', '-', '請按「儲存定稿」開始輸出');
  resetExportTrace('Trace: 就緒，等待輸出');
  setStatus('錄製完成：請在下方時間軸剪輯並回放，定稿後按「儲存定稿」。');
}

async function appendRecordingChunkToDisk(data) {
  if (!recordingUploadSession || !recordingUploadSession.ok) {
    throw new Error('錄影上傳工作階段未建立。');
  }
  const chunkBytes = new Uint8Array(await data.arrayBuffer());
  const chunkResult = await electronAPI.blobUploadChunk({
    sessionId: Number(recordingUploadSession.sessionId),
    bytes: chunkBytes
  });
  if (!chunkResult || !chunkResult.ok) {
    throw new Error((chunkResult && chunkResult.message) || '寫入錄影區塊失敗。');
  }
}

function queueRecordingChunkToDisk(data) {
  recordingUploadQueue = recordingUploadQueue.then(async () => {
    await appendRecordingChunkToDisk(data);
  }).catch((error) => {
    recordingUploadFailure = error;
    throw error;
  });
  return recordingUploadQueue;
}

async function abortRecordingUploadSession() {
  if (!recordingUploadSession || !recordingUploadSession.ok) {
    recordingUploadSession = null;
    recordingUploadFailure = null;
    recordingUploadQueue = Promise.resolve();
    return;
  }
  const sessionId = Number(recordingUploadSession.sessionId || 0);
  recordingUploadSession = null;
  recordingUploadFailure = null;
  recordingUploadQueue = Promise.resolve();
  if (sessionId > 0) {
    await electronAPI.blobUploadClose({
      sessionId,
      abort: true
    }).catch(() => {});
  }
}

function stopEditorPlayback() {
  if (!editorState.active) {
    return;
  }
  rawVideo.pause();
  updateEditorButtons();
}

async function playEditorSegment(fromTrimStart) {
  if (!editorState.active) {
    return;
  }
  enforceTrimBounds();
  const currentTime = toFiniteNumber(rawVideo.currentTime, editorState.trimStart);
  const start = fromTrimStart ? editorState.trimStart : clamp(currentTime, editorState.trimStart, editorState.trimEnd);
  await seekVideo(rawVideo, start);
  await rawVideo.play();
  updateEditorButtons();
}

async function renderTrimmedBlob() {
  throwIfExportAborted();
  const recorderConfig = pickBuiltinRecorderConfig();
  const outputQualityKey = getOutputQualityPresetKey();
  const outputQualityPreset = QUALITY_PRESETS[outputQualityKey] || QUALITY_PRESETS[DEFAULT_QUALITY_PRESET];
  const builtinBitrateBoost = Number(BUILTIN_OUTPUT_VIDEO_BITRATE_MULTIPLIERS[outputQualityKey] || 1);
  const boostedOutputQualityPreset = {
    label: outputQualityPreset.label + ' +',
    videoBitrate: Math.min(
      BUILTIN_OUTPUT_VIDEO_BITRATE_MAX,
      Math.max(1500000, Math.round(Number(outputQualityPreset.videoBitrate || 22000000) * builtinBitrateBoost))
    ),
    audioBitrate: Math.min(
      BUILTIN_OUTPUT_AUDIO_BITRATE_MAX,
      Math.max(64000, Math.round(Number(outputQualityPreset.audioBitrate || 256000) * 1.2))
    )
  };
  const outputMimeType = recorderConfig.mimeType || 'video/webm';
  const width = rawVideo.videoWidth || previewCanvas.width || 1920;
  const height = rawVideo.videoHeight || previewCanvas.height || 1080;
  appendExportTrace(
    'builtin init: format=' + recordingMeta.requestedFormat +
    ', mime=' + (recorderConfig.mimeType || 'auto') +
    ', ext=' + recorderConfig.ext +
    ', quality=' + outputQualityPreset.label +
    ', boost=' + builtinBitrateBoost.toFixed(2) + 'x' +
    ', vBitrate=' + boostedOutputQualityPreset.videoBitrate +
    ', aBitrate=' + boostedOutputQualityPreset.audioBitrate +
    ', trim=' + editorState.trimStart.toFixed(3) + '->' + editorState.trimEnd.toFixed(3) +
    ', size=' + width + 'x' + height
  );

  async function runBuiltinCapture(mode, includeAudio) {
    throwIfExportAborted();
    appendExportTrace('builtin[' + mode + '] start (audio=' + (includeAudio ? 'on' : 'off') + ')');
    const source = document.createElement('video');
    source.src = editorState.sourceUrl;
    // Some Chromium builds mute MediaElementSource output when element.muted=true.
    source.muted = !includeAudio;
    source.volume = includeAudio ? 1 : 0;
    source.playsInline = true;
    source.preload = 'auto';
    source.style.position = 'fixed';
    source.style.left = '-99999px';
    source.style.top = '-99999px';
    source.style.width = '1px';
    source.style.height = '1px';
    document.body.appendChild(source);

    let outputStream;
    let sourceStream;
    let recorder;
    let pollTimer = 0;
    let firstChunkTimer = 0;
    let stopping = false;
    let drawFrame = null;
    let stopReason = 'unknown';
    let mixAudioContext;
    let mixAudioSourceNode;
    let mixAudioDestination;
    let mixAudioGainNode;

    try {
      await waitForEvent(source, 'loadedmetadata');
      throwIfExportAborted();
      appendExportTrace(
        'builtin[' + mode + '] metadata: duration=' + toFiniteNumber(source.duration, 0).toFixed(3) +
        ', readyState=' + source.readyState +
        ', muted=' + source.muted
      );
      await seekVideo(source, editorState.trimStart);
      throwIfExportAborted();
      appendExportTrace('builtin[' + mode + '] seeked: current=' + toFiniteNumber(source.currentTime, 0).toFixed(3));

      if (mode === 'canvas') {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const renderCtx = canvas.getContext('2d', { alpha: false });
        sourceStream = source.captureStream();
        outputStream = canvas.captureStream(60);
        appendExportTrace(
          'builtin[' + mode + '] tracks: source(v=' + sourceStream.getVideoTracks().length +
          ',a=' + sourceStream.getAudioTracks().length + '), output(v=' +
          outputStream.getVideoTracks().length + ',a=' + outputStream.getAudioTracks().length + ')'
        );

        // Draw one frame before recorder starts to avoid empty first segment.
        renderCtx.drawImage(source, 0, 0, width, height);

        drawFrame = () => {
          if (source.readyState >= 2) {
            renderCtx.drawImage(source, 0, 0, width, height);
          }
        };
      } else {
        sourceStream = source.captureStream();
        outputStream = new MediaStream();
        const sourceVideoTrack = sourceStream.getVideoTracks()[0];
        if (sourceVideoTrack) {
          outputStream.addTrack(sourceVideoTrack);
        }
        appendExportTrace(
          'builtin[' + mode + '] direct tracks: source(v=' + sourceStream.getVideoTracks().length +
          ',a=' + sourceStream.getAudioTracks().length + '), output(v=' +
          outputStream.getVideoTracks().length + ',a=' + outputStream.getAudioTracks().length + ')'
        );
      }

      if (includeAudio) {
        try {
          mixAudioContext = new AudioContext();
          mixAudioSourceNode = mixAudioContext.createMediaElementSource(source);
          mixAudioDestination = mixAudioContext.createMediaStreamDestination();
          mixAudioGainNode = mixAudioContext.createGain();
          mixAudioGainNode.gain.value = 1;
          mixAudioSourceNode.connect(mixAudioGainNode).connect(mixAudioDestination);

          if (mixAudioContext.state === 'suspended') {
            await mixAudioContext.resume();
          }

          const mixedAudioTrack = mixAudioDestination.stream.getAudioTracks()[0];
          if (mixedAudioTrack) {
            outputStream.addTrack(mixedAudioTrack);
            appendExportTrace(
              'builtin[' + mode + '] audio bridge via AudioContext ok: out(v=' +
              outputStream.getVideoTracks().length + ',a=' + outputStream.getAudioTracks().length + ')'
            );
          } else {
            appendExportTrace('builtin[' + mode + '] audio bridge via AudioContext has no track');
          }
        } catch (audioBridgeError) {
          appendExportTrace(
            'builtin[' + mode + '] audio bridge failed: ' +
            (audioBridgeError && audioBridgeError.message ? audioBridgeError.message : String(audioBridgeError))
          );
        }
      } else {
        appendExportTrace('builtin[' + mode + '] audio disabled for this attempt');
      }

      recorder = createBuiltinMediaRecorder(outputStream, recorderConfig, boostedOutputQualityPreset, includeAudio);
      appendExportTrace(
        'builtin[' + mode + '] recorder created: mime=' + (recorder.mimeType || outputMimeType) +
        ', state=' + recorder.state
      );
      const chunks = [];
      let chunkCount = 0;
      let totalBytes = 0;
      recorder.ondataavailable = (event) => {
        const size = Number(event && event.data ? event.data.size : 0);
        chunkCount += 1;
        totalBytes += size;
        appendExportTrace('builtin[' + mode + '] chunk#' + chunkCount + ': ' + size + ' bytes');
        if (size > 0) {
          if (firstChunkTimer) {
            clearTimeout(firstChunkTimer);
            firstChunkTimer = 0;
          }
          chunks.push(event.data);
        }
      };
      recorder.onerror = (event) => {
        const err = event && event.error ? event.error.message || String(event.error) : 'unknown';
        appendExportTrace('builtin[' + mode + '] recorder error: ' + err);
      };
      source.addEventListener('error', () => {
        appendExportTrace('builtin[' + mode + '] source error event');
      });

      const completed = new Promise((resolve) => {
        recorder.onstop = () => {
          appendExportTrace(
            'builtin[' + mode + '] onstop: reason=' + stopReason +
            ', chunks=' + chunkCount +
            ', total=' + totalBytes + ' bytes'
          );
          resolve();
        };
      });

      const stopRecorderSafely = () => {
        if (stopping || recorder.state === 'inactive') {
          return;
        }
        stopping = true;
        appendExportTrace(
          'builtin[' + mode + '] stop requested at t=' +
          toFiniteNumber(source.currentTime, 0).toFixed(3) +
          ', target=' + toFiniteNumber(editorState.trimEnd, 0).toFixed(3)
        );
        try {
          recorder.requestData();
          appendExportTrace('builtin[' + mode + '] requestData called');
        } catch (_error) {
          appendExportTrace('builtin[' + mode + '] requestData failed');
        }
        setTimeout(() => {
          if (recorder.state !== 'inactive') {
            appendExportTrace('builtin[' + mode + '] recorder.stop called');
            recorder.stop();
          }
        }, 80);
      };

      recorder.start(BUILTIN_RECORDER_TIMESLICE_MS);
      appendExportTrace('builtin[' + mode + '] recorder.start(' + BUILTIN_RECORDER_TIMESLICE_MS + ')');
      await source.play();
      appendExportTrace('builtin[' + mode + '] source.play ok');
      firstChunkTimer = setTimeout(() => {
        if (stopping || recorder.state === 'inactive' || chunkCount > 0) {
          return;
        }
        stopReason = 'no-first-chunk-timeout';
        appendExportTrace(
          'builtin[' + mode + '] no chunk within ' + BUILTIN_FIRST_CHUNK_TIMEOUT_MS + 'ms, fallback to next attempt'
        );
        source.pause();
        stopRecorderSafely();
      }, BUILTIN_FIRST_CHUNK_TIMEOUT_MS);

      pollTimer = setInterval(() => {
        if (exportCancelRequested) {
          stopReason = 'user-cancel';
          source.pause();
          stopRecorderSafely();
          return;
        }
        if (mode === 'canvas' && typeof drawFrame === 'function') {
          drawFrame();
        }

        if (source.currentTime >= editorState.trimEnd || source.ended) {
          stopReason = source.ended ? 'source-ended' : 'reach-trim-end';
          source.pause();
          stopRecorderSafely();
        }
      }, 16);

      await completed;
      throwIfExportAborted();
      clearInterval(pollTimer);
      pollTimer = 0;
      if (firstChunkTimer) {
        clearTimeout(firstChunkTimer);
        firstChunkTimer = 0;
      }

      const blob = new Blob(chunks, { type: outputMimeType });
      appendExportTrace('builtin[' + mode + '] blob size=' + blob.size + ' bytes');
      return {
        blob,
        ext: recorderConfig.ext,
        includeAudio
      };
    } finally {
      if (pollTimer) {
        clearInterval(pollTimer);
      }
      if (firstChunkTimer) {
        clearTimeout(firstChunkTimer);
      }
      if (sourceStream) {
        stopMediaTracks(sourceStream);
      }
      if (outputStream) {
        stopMediaTracks(outputStream);
      }
      if (mixAudioSourceNode) {
        try {
          mixAudioSourceNode.disconnect();
        } catch (_error) {
        }
      }
      if (mixAudioGainNode) {
        try {
          mixAudioGainNode.disconnect();
        } catch (_error) {
        }
      }
      if (mixAudioDestination) {
        try {
          mixAudioDestination.disconnect();
        } catch (_error) {
        }
      }
      if (mixAudioContext) {
        mixAudioContext.close().catch(() => {});
      }
      source.pause();
      source.removeAttribute('src');
      source.load();
      source.remove();
      appendExportTrace('builtin[' + mode + '] cleanup done');
    }
  }

  const attempts = builtinAudioCompatibility === 'broken'
    ? [
        { mode: 'direct', includeAudio: false },
        { mode: 'canvas', includeAudio: false }
      ]
    : [
        { mode: 'direct', includeAudio: true },
        { mode: 'canvas', includeAudio: true },
        { mode: 'direct', includeAudio: false },
        { mode: 'canvas', includeAudio: false }
      ];

  if (builtinAudioCompatibility === 'broken') {
    appendExportTrace('builtin audio compatibility=broken, skip audio-on attempts');
  }

  for (const attempt of attempts) {
    throwIfExportAborted();
    const result = await runBuiltinCapture(attempt.mode, attempt.includeAudio);
    if (result.blob && result.blob.size > 0) {
      if (attempt.includeAudio) {
        builtinAudioCompatibility = 'ok';
      } else if (builtinAudioCompatibility !== 'ok') {
        builtinAudioCompatibility = 'broken';
      }
      appendExportTrace(
        'builtin success: mode=' + attempt.mode +
        ', audio=' + (attempt.includeAudio ? 'on' : 'off') +
        ', bytes=' + result.blob.size
      );
      return result;
    }
    appendExportTrace(
      'builtin attempt empty: mode=' + attempt.mode +
      ', audio=' + (attempt.includeAudio ? 'on' : 'off')
    );
  }

  appendExportTrace('builtin all attempts empty');

  throw new Error('剪輯輸出為空檔，請調整剪輯區段後重試。');
}

async function exportTrimmedViaFfmpeg(outputPath, exportTaskId) {
  throwIfExportAborted();
  let inputPath = '';
  let cleanupTempPath = '';
  if (editorState.sourcePath) {
    inputPath = editorState.sourcePath;
  } else if (editorState.blob && editorState.blob.size > 0) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const uploaded = await uploadBlobToPath(editorState.blob, {
      mode: 'temp',
      baseName: `cursorcine-${timestamp}`,
      ext: recordingMeta.outputExt
    });
    if (!uploaded.ok) {
      return uploaded;
    }
    inputPath = uploaded.filePath;
    cleanupTempPath = uploaded.tempDir;
  } else {
    return {
      ok: false,
      reason: 'INVALID_INPUT',
      message: '找不到可剪輯的原始錄影資料。'
    };
  }
  throwIfExportAborted();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return electronAPI.exportTrimmedVideoFromPath({
    inputPath,
    startSec: editorState.trimStart,
    endSec: editorState.trimEnd,
    qualityPreset: getOutputQualityPresetKey(),
    requestedFormat: recordingMeta.requestedFormat,
    taskId: exportTaskId || 0,
    outputPath: outputPath || '',
    baseName: `cursorcine-${timestamp}`,
    cleanupTempDir: cleanupTempPath
  });
}

async function exportTrimmedViaBuiltin(preopenedSaveSession, exportTaskId) {
  throwIfExportAborted();
  const rendered = await renderTrimmedBlob();
  if (recordingMeta.requestedFormat === 'mp4' && rendered.ext !== 'mp4') {
    recordingMeta.fallbackFromMp4 = true;
    recordingMeta.outputExt = rendered.ext;
    recordingMeta.outputMimeType = rendered.blob.type || 'video/webm';
  }
  await exportRecording(rendered.blob, preopenedSaveSession, exportTaskId);
  return rendered;
}

async function saveEditedClip() {
  if (!editorState.active || editorState.exportBusy) {
    return;
  }
  editorState.exportBusy = true;
  exportCancelRequested = false;
  updateEditorButtons();
  stopExportTimer(true);

  let preopenedSaveSession = null;
  activeExportTaskId = 0;

  try {
    const taskOpenResult = await electronAPI.exportTaskOpen();
    if (!taskOpenResult || !taskOpenResult.ok) {
      throw new Error((taskOpenResult && taskOpenResult.message) || '建立輸出工作失敗');
    }
    activeExportTaskId = Number(taskOpenResult.taskId || 0);

    resetExportTrace('Trace: 開始輸出');
    appendExportTrace('saveEditedClip start');
    stopEditorPlayback();
    enforceTrimBounds();
    appendExportTrace('trim bounds: ' + editorState.trimStart.toFixed(3) + ' -> ' + editorState.trimEnd.toFixed(3));
    if (!Number.isFinite(editorState.trimStart) || !Number.isFinite(editorState.trimEnd) || editorState.trimEnd <= editorState.trimStart) {
      setExportDebug('參數檢查', 'INVALID_RANGE', '剪輯起訖點無效');
      throw new Error('剪輯範圍無效，請重新調整起訖點。');
    }

    const mode = getExportEngineMode();
    if (mode !== 'builtin') {
      const ffmpegOutputExt = recordingMeta.requestedFormat === 'mp4' ? 'mp4' : 'webm';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      setStatus('請選擇儲存位置...');
      const picked = await electronAPI.pickSavePath({
        title: '儲存剪輯影片',
        baseName: `cursorcine-${timestamp}`,
        ext: ffmpegOutputExt
      });
      if (!picked || !picked.ok) {
        if (picked && picked.reason === 'CANCELED') {
          setExportDebug('ffmpeg', 'CANCELED', picked.message || '使用者取消儲存');
          setStatus('已取消儲存');
          return;
        }
        throw new Error((picked && picked.message) || '建立儲存路徑失敗');
      }
      throwIfExportAborted();

      setStatus('正在輸出剪輯片段（ffmpeg）...');
      setExportDebug('ffmpeg', 'RUNNING', '嘗試使用 ffmpeg 輸出剪輯');
      const ffmpegResult = await exportTrimmedViaFfmpeg(picked.path, activeExportTaskId);
      if (ffmpegResult && ffmpegResult.ffmpegCommand) {
        appendExportTrace('ffmpeg cmd: ' + ffmpegResult.ffmpegCommand);
      } else if (ffmpegResult && Array.isArray(ffmpegResult.ffmpegArgs) && ffmpegResult.ffmpegArgs.length > 0) {
        appendExportTrace('ffmpeg args: ' + ffmpegResult.ffmpegArgs.join(' '));
      }
      if (ffmpegResult && ffmpegResult.ok) {
        setExportDebug('ffmpeg', 'OK', 'ffmpeg 輸出完成');
        setStatus('儲存完成（ffmpeg）');
        return;
      }

      if (ffmpegResult && ffmpegResult.reason === 'CANCELED') {
        setExportDebug('ffmpeg', 'CANCELED', ffmpegResult.message || '使用者取消儲存');
        setStatus('已取消儲存');
        return;
      }
      if (ffmpegResult && ffmpegResult.reason === 'EXPORT_ABORTED') {
        throw createExportAbortedError();
      }

      if (mode === 'ffmpeg') {
        setExportDebug('ffmpeg', (ffmpegResult && ffmpegResult.reason) || 'FFMPEG_FAILED', (ffmpegResult && ffmpegResult.message) || 'ffmpeg 剪輯失敗');
        throw new Error((ffmpegResult && ffmpegResult.message) || 'ffmpeg 剪輯失敗');
      }

      if (ffmpegResult && ffmpegResult.reason && ffmpegResult.reason !== 'NO_FFMPEG') {
        setExportDebug('ffmpeg -> 內建', ffmpegResult.reason, ffmpegResult.message || 'ffmpeg 失敗，改內建');
        setStatus('ffmpeg 失敗，改用內建剪輯器輸出...');
      } else {
        setExportDebug('ffmpeg -> 內建', (ffmpegResult && ffmpegResult.reason) || 'NO_FFMPEG', (ffmpegResult && ffmpegResult.message) || '未偵測到 ffmpeg');
        setStatus('未偵測到 ffmpeg，改用內建剪輯器輸出...');
      }
    } else {
      setStatus('正在輸出剪輯片段（內建）...');
      setExportDebug('內建', 'RUNNING', '使用內建剪輯器輸出');
    }

    try {
      if (recordingMeta.requestedFormat !== 'mp4') {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        setStatus('請選擇儲存位置...');
        preopenedSaveSession = await electronAPI.blobUploadOpen({
          mode: 'save',
          title: '儲存影片',
          baseName: `cursorcine-${timestamp}`,
          ext: recordingMeta.outputExt,
          route: 'save-file'
        });

        if (!preopenedSaveSession || !preopenedSaveSession.ok) {
          if (preopenedSaveSession && preopenedSaveSession.reason === 'CANCELED') {
            setExportDebug(mode === 'builtin' ? '內建' : 'ffmpeg -> 內建', 'CANCELED', preopenedSaveSession.message || '使用者取消儲存');
            setStatus('已取消儲存');
            return;
          }
          throw new Error((preopenedSaveSession && preopenedSaveSession.message) || '建立儲存工作階段失敗');
        }
      }
      throwIfExportAborted();

      setStatus('正在輸出剪輯片段（內建）...');
      const rendered = await exportTrimmedViaBuiltin(preopenedSaveSession, activeExportTaskId);
      preopenedSaveSession = null;
      const route = mode === 'builtin' ? '內建' : 'ffmpeg -> 內建';
      if (rendered && rendered.includeAudio === false) {
        setExportDebug(route, 'OK_NO_AUDIO', '內建輸出完成（已自動關閉音訊）');
      } else {
        setExportDebug(route, 'OK', '內建輸出完成');
      }
    } catch (builtinError) {
      setExportDebug(mode === 'builtin' ? '內建' : 'ffmpeg -> 內建', 'BUILTIN_FAILED', builtinError.message || '內建輸出失敗');
      throw builtinError;
    }
  } catch (error) {
    if (isExportAbortedError(error) || exportCancelRequested) {
      setExportDebug(exportDebugRoute?.textContent || '輸出', 'CANCELED', '輸出已中斷');
      setStatus('已中斷輸出');
      return;
    }
    console.error(error);
    if (exportDebugCode.textContent === '-' || exportDebugCode.textContent === 'RUNNING') {
      setExportDebug('未知', 'EXPORT_FAILED', error.message || '輸出失敗');
    }
    setStatus(`輸出失敗: ${error.message}`);
  } finally {
    if (preopenedSaveSession && preopenedSaveSession.ok) {
      await electronAPI.blobUploadClose({
        sessionId: Number(preopenedSaveSession.sessionId),
        abort: true
      }).catch(() => {});
    }
    if (activeExportTaskId > 0) {
      await electronAPI.exportTaskClose({
        taskId: activeExportTaskId
      }).catch(() => {});
      activeExportTaskId = 0;
    }
    stopExportTimer(false);
    editorState.exportBusy = false;
    exportCancelRequested = false;
    updateEditorButtons();
  }
}

function timelineValueToTime(value) {
  if (!editorState.active || editorState.duration <= 0) {
    return 0;
  }
  const normalized = clamp(Number(value) || 0, 0, 1000) / 1000;
  const duration = Math.max(0.1, toFiniteNumber(editorState.duration, 0.1));
  return normalized * duration;
}

function syncEditorDurationFromMedia() {
  if (!editorState.active) {
    return;
  }

  const mediaDuration = getMediaDuration(rawVideo, 0);
  if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) {
    return;
  }

  // Keep timeline range in sync when browser resolves a better duration later.
  if (Math.abs(mediaDuration - editorState.duration) < 0.01) {
    return;
  }

  const wasAtEnd = Math.abs(editorState.trimEnd - editorState.duration) < 0.05;
  editorState.duration = mediaDuration;

  if (wasAtEnd) {
    editorState.trimEnd = mediaDuration;
  }
  enforceTrimBounds();
  updateTimelineInputs();
}

function syncPenStyleToOverlay() {
  return electronAPI.overlaySetPenStyle({
    color: annotationState.color,
    size: annotationState.size
  }).catch(() => {});
}

async function startRecording() {
  if (editorState.active) {
    clearEditorState();
  }

  const sourceId = sourceSelect.value;
  selectedSource = sources.find((s) => s.id === sourceId);

  if (!selectedSource) {
    setStatus('請先選擇錄製來源');
    return;
  }

  clickState = {
    enabled: false,
    checkedCapability: false,
    lastClickTimestamp: 0,
    holdDelayUntil: 0,
    lastZoomTriggerTs: 0,
    forceMaxUntil: 0,
    doubleClickLocked: false,
    lockedX: 0,
    lockedY: 0
  };

  doubleClickMarkerState.activeUntil = 0;
  for (const stream of extraCaptureStreams.splice(0)) {
    stopMediaTracks(stream);
  }

  const captureRoute = await buildCaptureStreams(sourceId, selectedSource.display_id);

  // Prevent local monitor playback from feeding back into system-audio capture.
  rawVideo.muted = true;
  rawVideo.volume = 0;
  rawVideo.controls = false;

  const dims = getCaptureVideoDimensions();
  const sourceWidth = Math.max(1, Number(dims.width || 1));
  const sourceHeight = Math.max(1, Number(dims.height || 1));

  cameraState.cursorX = sourceWidth / 2;
  cameraState.cursorY = sourceHeight / 2;
  glowState.x = cameraState.cursorX;
  glowState.y = cameraState.cursorY;
  cameraState.targetX = cameraState.cursorX;
  cameraState.targetY = cameraState.cursorY;
  cameraState.viewportX = cameraState.cursorX;
  cameraState.viewportY = cameraState.cursorY;
  cameraState.zoom = 1;
  cameraState.targetZoom = 1;
  cameraState.zoomHoldUntil = 0;

  outputStream = previewCanvas.captureStream(60);

  const mixedAudioTrack = await buildMixedAudioTrack();
  if (mixedAudioTrack) {
    outputStream.addTrack(mixedAudioTrack);
  }

  recordingChunkCount = 0;
  recordingBytes = 0;
  recordingStopRequestedAtMs = 0;
  const requestedFormat = formatSelect.value;
  const qualityPreset = getQualityPreset();
  recordingQualityPreset = qualityPreset;
  const recorderConfig = pickRecorderConfig(requestedFormat);
  recordingMeta = {
    outputExt: recorderConfig.ext,
    outputMimeType: recorderConfig.mimeType || (recorderConfig.ext === 'mp4' ? 'video/mp4' : 'video/webm'),
    requestedFormat,
    fallbackFromMp4: Boolean(recorderConfig.fallbackFromMp4)
  };
  recordingUploadQueue = Promise.resolve();
  recordingUploadFailure = null;
  recordingUploadSession = await electronAPI.blobUploadOpen({
    mode: 'temp',
    baseName: `cursorcine-recording-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    ext: recordingMeta.outputExt
  });
  if (!recordingUploadSession || !recordingUploadSession.ok) {
    throw new Error((recordingUploadSession && recordingUploadSession.message) || '無法建立錄影暫存檔。');
  }

  mediaRecorder = createMediaRecorder(outputStream, recorderConfig, qualityPreset);

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordingChunkCount += 1;
      recordingBytes += event.data.size;
      queueRecordingChunkToDisk(event.data).catch(() => {});
      if (recordingStopRequestedAtMs > 0) {
        setStatus(
          '錄製停止中，正在載入剪輯時間軸... 已接收 ' +
          recordingChunkCount +
          ' 個片段（' +
          formatBytes(recordingBytes) +
          '）'
        );
      }
    }
  };

  mediaRecorder.onstop = async () => {
    setStatus(
      '錄製停止中，正在載入剪輯時間軸... 正在整理 ' +
      recordingChunkCount +
      ' 個片段（' +
      formatBytes(recordingBytes) +
      '）'
    );
    try {
      await recordingUploadQueue;
      if (recordingUploadFailure) {
        throw recordingUploadFailure;
      }
      if (!recordingUploadSession || !recordingUploadSession.ok) {
        throw new Error('錄影暫存檔已失效。');
      }
      const finishedSession = recordingUploadSession;
      recordingUploadSession = null;
      const closeResult = await electronAPI.blobUploadClose({
        sessionId: Number(finishedSession.sessionId),
        abort: false
      });
      if (!closeResult || !closeResult.ok) {
        throw new Error((closeResult && closeResult.message) || '無法關閉錄影暫存檔。');
      }
      await enterEditorModeFromPath(
        finishedSession.filePath,
        finishedSession.tempDir,
        getEstimatedRecordingDurationSec()
      );
    } catch (error) {
      console.error(error);
      await abortRecordingUploadSession();
      setStatus(`錄製後處理失敗: ${error.message}`);
    } finally {
      recordingUploadFailure = null;
      recordingUploadQueue = Promise.resolve();
      recordingStopRequestedAtMs = 0;
    }
  };

  mediaRecorder.start(RECORDING_TIMESLICE_MS);
  recordingStartedAtMs = performance.now();
  recordingDurationEstimateSec = 0;
  updateRecordingTimeLabel(0);
  startRecordingTimer();

  await electronAPI.overlayCreate(selectedSource.display_id);
  await syncPenStyleToOverlay();
  await electronAPI.overlaySetEnabled(annotationState.enabled);

  clearInterval(cursorTimer);
  cursorTimer = setInterval(updateCursorFromMain, 16);

  clearTimeout(drawTimer);
  drawTimer = 0;
  drawLoop();

  const minimizeDecision = await electronAPI.shouldAutoMinimizeMainWindow(selectedSource.display_id).catch(() => ({ ok: false, shouldMinimize: true }));

  if (!minimizeDecision || minimizeDecision.shouldMinimize !== false) {
    await electronAPI.minimizeMainWindow().catch(() => {});
  }

  recordBtn.disabled = true;
  stopBtn.disabled = false;
  sourceSelect.disabled = true;
  micInput.disabled = true;
  formatSelect.disabled = true;
  exportEngineSelect.disabled = true;
  qualitySelect.disabled = true;
  if (hdrMappingModeSelect) {
    hdrMappingModeSelect.disabled = true;
  }

  const hasSystemAudio = sourceStream.getAudioTracks().length > 0;
  const hasMicAudio = Boolean(micStream && micStream.getAudioTracks().length > 0);
  const audioMode = hasSystemAudio || hasMicAudio
    ? `音訊: ${hasSystemAudio ? '喇叭輸出' : ''}${hasSystemAudio && hasMicAudio ? ' + ' : ''}${hasMicAudio ? '麥克風' : ''} (已混音 + 增益)`
    : '音訊: 無';

  const routeLabel = captureRoute && captureRoute.route === 'native' ? 'Native HDR->SDR' : 'Fallback';
  setStatus('錄影中: 可在原始畫面畫筆標註（Ctrl 開啟；滾輪暫停後自動恢復；雙按 Ctrl 關閉） | 畫質: ' + qualityPreset.label + ' | HDR 路徑: ' + routeLabel + ' (' + audioMode + ')');
}

function stopRecording() {
  const stoppingRecorder = Boolean(mediaRecorder && mediaRecorder.state !== 'inactive');
  if (stoppingRecorder) {
    setStatus('錄製停止中，正在載入剪輯時間軸...');
    recordingStopRequestedAtMs = performance.now();
    if (recordingStartedAtMs > 0) {
      recordingDurationEstimateSec = Math.max(0.1, (performance.now() - recordingStartedAtMs) / 1000);
      updateRecordingTimeLabel(recordingDurationEstimateSec);
    }
    try {
      mediaRecorder.requestData();
    } catch (_error) {
    }
    mediaRecorder.stop();
  }

  stopMediaTracks(sourceStream);
  stopMediaTracks(micStream);
  stopMediaTracks(outputStream);
  for (const stream of extraCaptureStreams.splice(0)) {
    stopMediaTracks(stream);
  }
  resetAudioMixer();
  stopNativeHdrCapture().catch(() => {});

  sourceStream = undefined;
  micStream = undefined;
  outputStream = undefined;
  mediaRecorder = undefined;
  if (!stoppingRecorder) {
    abortRecordingUploadSession().catch(() => {});
  }
  selectedSource = undefined;
  recordingStartedAtMs = 0;
  stopRecordingTimer();
  if (!editorState.active) {
    updateRecordingTimeLabel(0);
  }

  clearInterval(cursorTimer);
  clearTimeout(drawTimer);
  cursorTimer = 0;
  drawTimer = 0;
  electronAPI.overlayDestroy().catch(() => {});

  recordBtn.disabled = false;
  stopBtn.disabled = true;
  sourceSelect.disabled = false;
  micInput.disabled = false;
  formatSelect.disabled = false;
  exportEngineSelect.disabled = false;
  qualitySelect.disabled = false;
  if (hdrMappingModeSelect) {
    hdrMappingModeSelect.disabled = false;
  }
}

async function setPenMode(enabled) {
  annotationState.enabled = enabled;
  if (!enabled) {
    clickState.doubleClickLocked = false;
  }
  penToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');

  try {
    const mode = await electronAPI.overlaySetEnabled(enabled);
    if (enabled && mode && mode.toggleMode) {
      penToggleBtn.textContent = '畫筆模式: 開（Ctrl 開啟；滾輪暫停後自動恢復；雙按 Ctrl 關閉）';
      return;
    }
  } catch (_error) {
  }

  penToggleBtn.textContent = enabled ? '畫筆模式: 開（Ctrl 開啟；雙按 Ctrl 關閉）' : '畫筆模式: 關';
}

playheadInput.addEventListener('input', () => {
  if (!editorState.active) {
    return;
  }
  const target = timelineValueToTime(playheadInput.value);
  rawVideo.currentTime = clamp(target, editorState.trimStart, editorState.trimEnd);
  updateTimelineInputs();
});

trimStartInput.addEventListener('input', () => {
  if (!editorState.active) {
    return;
  }
  editorState.trimStart = timelineValueToTime(trimStartInput.value);
  enforceTrimBounds();
  if (rawVideo.currentTime < editorState.trimStart) {
    rawVideo.currentTime = editorState.trimStart;
  }
  updateTimelineInputs();
});

trimEndInput.addEventListener('input', () => {
  if (!editorState.active) {
    return;
  }
  editorState.trimEnd = timelineValueToTime(trimEndInput.value);
  enforceTrimBounds();
  if (rawVideo.currentTime > editorState.trimEnd) {
    rawVideo.currentTime = editorState.trimEnd;
  }
  updateTimelineInputs();
});

rawVideo.addEventListener('timeupdate', () => {
  if (!editorState.active) {
    return;
  }
  if (rawVideo.currentTime >= editorState.trimEnd) {
    rawVideo.pause();
    rawVideo.currentTime = editorState.trimEnd;
  }
  updateTimelineInputs();
  updateEditorButtons();
});

rawVideo.addEventListener('play', updateEditorButtons);
rawVideo.addEventListener('pause', updateEditorButtons);
rawVideo.addEventListener('ended', updateEditorButtons);
rawVideo.addEventListener('durationchange', syncEditorDurationFromMedia);
rawVideo.addEventListener('loadeddata', syncEditorDurationFromMedia);

playPauseBtn.addEventListener('click', () => {
  if (!editorState.active || editorState.exportBusy) {
    return;
  }
  if (rawVideo.paused || rawVideo.ended) {
    playEditorSegment(false).catch((error) => {
      console.error(error);
      setStatus(`回放失敗: ${error.message}`);
    });
    return;
  }
  stopEditorPlayback();
});

previewRangeBtn.addEventListener('click', () => {
  if (!editorState.active || editorState.exportBusy) {
    return;
  }
  playEditorSegment(true).catch((error) => {
    console.error(error);
    setStatus(`回放失敗: ${error.message}`);
  });
});

saveClipBtn.addEventListener('click', () => {
  saveEditedClip().catch((error) => {
    console.error(error);
    setStatus(`儲存失敗: ${error.message}`);
  });
});

if (abortExportBtn) {
  abortExportBtn.addEventListener('click', () => {
    requestExportAbort();
  });
}

discardClipBtn.addEventListener('click', () => {
  stopEditorPlayback();
  clearEditorState();
  setStatus('已取消剪輯，請重新錄影。');
});

exportEngineSelect.addEventListener('change', () => {
  const mode = getExportEngineMode();
  const label = mode === 'auto' ? '自動（ffmpeg 優先）' : (mode === 'ffmpeg' ? '只用 ffmpeg' : '只用內建');
  setExportDebug('待命', 'MODE_' + mode.toUpperCase(), '目前模式: ' + label);
});

if (hdrMappingModeSelect) {
  hdrMappingModeSelect.addEventListener('change', () => {
    hdrMappingState.mode = normalizeHdrMappingMode(hdrMappingModeSelect.value);
    if (hdrMappingState.mode === 'off') {
      setHdrProbeStatus('Probe: 模式關閉');
      setHdrRuntimeRoute('fallback', '目前路徑: Fallback（HDR Mapping 關閉）');
      return;
    }
    maybeProbeHdrForUi().catch(() => {});
  });
}

sourceSelect.addEventListener('change', () => {
  selectedSource = sources.find((s) => s.id === sourceSelect.value);
  maybeProbeHdrForUi().catch(() => {});
});

zoomInput.addEventListener('input', () => {
  cameraState.maxZoom = Number(zoomInput.value);
  zoomLabel.textContent = `${cameraState.maxZoom.toFixed(1)}x`;
});

smoothInput.addEventListener('input', () => {
  cameraState.smoothing = Number(smoothInput.value);
  smoothLabel.textContent = cameraState.smoothing.toFixed(2);
});

glowSizeInput.addEventListener('input', () => {
  glowState.radius = Number(glowSizeInput.value);
  glowSizeLabel.textContent = String(glowState.radius);
});

glowCoreInput.addEventListener('input', () => {
  glowState.coreRadius = Number(glowCoreInput.value);
  glowCoreLabel.textContent = String(glowState.coreRadius);
});

glowOpacityInput.addEventListener('input', () => {
  glowState.opacity = Number(glowOpacityInput.value);
  glowOpacityLabel.textContent = glowState.opacity.toFixed(2);
});

hdrCompEnable.addEventListener('change', () => {
  hdrCompState.enabled = Boolean(hdrCompEnable.checked);
  updateHdrCompUi();
});

hdrCompStrengthInput.addEventListener('input', () => {
  hdrCompState.strength = clamp(Number(hdrCompStrengthInput.value), -1, 1);
  updateHdrCompUi();
});

hdrCompHueInput.addEventListener('input', () => {
  hdrCompState.hue = clamp(Number(hdrCompHueInput.value), -30, 30);
  updateHdrCompUi();
});

hdrCompRolloffInput.addEventListener('input', () => {
  hdrCompState.rolloff = clamp(Number(hdrCompRolloffInput.value), 0, 1);
  updateHdrCompUi();
});

hdrCompSharpnessInput.addEventListener('input', () => {
  hdrCompState.sharpness = clamp(Number(hdrCompSharpnessInput.value), 0, 1);
  updateHdrCompUi();
});

penToggleBtn.addEventListener('click', () => {
  setPenMode(!annotationState.enabled).catch(() => {});
});

penColorInput.addEventListener('input', () => {
  annotationState.color = penColorInput.value;
  syncPenStyleToOverlay();
});

penSizeInput.addEventListener('input', () => {
  annotationState.size = Number(penSizeInput.value);
  penSizeLabel.textContent = String(annotationState.size);
  syncPenStyleToOverlay();
});

penUndoBtn.addEventListener('click', () => {
  electronAPI.overlayUndo().catch(() => {});
});

penClearBtn.addEventListener('click', () => {
  electronAPI.overlayClear().catch(() => {});
});

refreshBtn.addEventListener('click', loadSources);
recordBtn.addEventListener('click', () => {
  startRecording().catch((error) => {
    console.error(error);
    setStatus(`啟動錄影失敗: ${error.message}`);
    stopRecording();
  });
});
stopBtn.addEventListener('click', stopRecording);

setEditorVisible(false);
updateEditorButtons();
setExportDebug('待命', 'MODE_AUTO', '目前模式: 自動（ffmpeg 優先）');
setPenMode(true).catch(() => {});
annotationState.color = penColorInput.value || DEFAULT_PEN_COLOR;
annotationState.size = Number(penSizeInput.value || DEFAULT_PEN_SIZE);
hdrMappingState.mode = normalizeHdrMappingMode((hdrMappingModeSelect && hdrMappingModeSelect.value) || hdrMappingState.mode);
hdrCompState.enabled = Boolean(hdrCompEnable.checked);
hdrCompState.strength = clamp(Number(hdrCompStrengthInput.value || DEFAULT_HDR_COMP_STRENGTH), -1, 1);
hdrCompState.hue = clamp(Number(hdrCompHueInput.value || DEFAULT_HDR_COMP_HUE), -30, 30);
hdrCompState.rolloff = clamp(Number(hdrCompRolloffInput.value || DEFAULT_HDR_COMP_ROLLOFF), 0, 1);
hdrCompState.sharpness = clamp(Number(hdrCompSharpnessInput.value || DEFAULT_HDR_COMP_SHARPNESS), 0, 1);

zoomLabel.textContent = `${cameraState.maxZoom.toFixed(1)}x`;
smoothLabel.textContent = cameraState.smoothing.toFixed(2);
glowSizeLabel.textContent = String(glowState.radius);
glowCoreLabel.textContent = String(glowState.coreRadius);
glowOpacityLabel.textContent = glowState.opacity.toFixed(2);
hdrCompStrengthLabel.textContent = hdrCompState.strength.toFixed(2);
penSizeLabel.textContent = String(annotationState.size);
updateHdrCompUi();
setHdrRuntimeRoute('fallback', '目前路徑: Fallback（待命）');
setHdrProbeStatus('Probe: 尚未探測');

loadSources().catch((error) => {
  console.error(error);
  setStatus(`初始化失敗: ${error.message}`);
});

electronAPI.onExportPhase((payload) => {
  if (!payload || payload.phase !== 'processing-start') {
    return;
  }
  startExportTimer();
});

updateExportTimeLabel(0);
