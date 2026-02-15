/* global electronAPI */
const runtimeElectronAPI = typeof window !== 'undefined' ? window.electronAPI : undefined;

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
const hdrMappingDiagEl = document.getElementById('hdrMappingDiag');
const copyHdrDiagBtn = document.getElementById('copyHdrDiagBtn');
const runHdrSmokeBtn = document.getElementById('runHdrSmokeBtn');
const forceNativeOptionTemplate = hdrMappingModeSelect
  ? Array.from(hdrMappingModeSelect.options || []).find((opt) => opt.value === 'force-native')?.cloneNode(true)
  : null;
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
const penInteractionModeSelect = document.getElementById('penInteractionModeSelect');
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
const HDR_NATIVE_READ_TIMEOUT_MS = 80;
const HDR_NATIVE_MAX_READ_FAILURES = 8;
const HDR_NATIVE_MAX_IDLE_MS = 2000;
const HDR_NATIVE_POLL_INTERVAL_MS = 16;
const HDR_NATIVE_STARTUP_NO_FRAME_TIMEOUT_MS = 4000;
const HDR_SHARED_CONTROL_SLOTS = 16;

let sources = [];
let sourceStream;
let micStream;
let outputStream;
let mediaRecorder;
let drawTimer = 0;
const DRAW_INTERVAL_MS = 16;
const DRAW_EPSILON = 0.25;
let cursorTimer = 0;
let cursorUpdateInFlight = false;
let lastDrawNow = 0;
let lastDrawnNativeFrameCount = 0;
let lastDrawnViewportX = 0;
let lastDrawnViewportY = 0;
let lastDrawnZoom = 1;
let lastDrawnGlowX = 0;
let lastDrawnGlowY = 0;
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
let hdrDiagStatusMessage = '尚未開始';
let exportStartedAtMs = 0;
let exportTimer = 0;
let builtinAudioCompatibility = 'unknown';
let exportCancelRequested = false;
let activeExportTaskId = 0;
let nativeHdrFramePumpTimer = 0;
let nativeHdrFramePumpRunning = false;
let nativeHdrFallbackAttempted = false;
let hdrExperimentalPollTimer = 0;
let hdrSmokeAutoRunning = false;
let hdrSmokeManualRunning = false;
let hdrSmokeAutoSuspendUntilMs = 0;
const extraCaptureStreams = [];
const hdrDecisionTrace = [];
const HDR_DECISION_TRACE_LIMIT = 120;

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
  interactionMode: 'stable',
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
  runtimeBackend: '',
  runtimeStage: '',
  runtimeTransportMode: '',
  routePreference: 'auto',
  fallbackLevel: 3,
  probeSupported: false,
  probeHdrActive: false,
  probeReason: 'NOT_PROBED',
  nativeRouteEnabled: false,
  nativeRouteReason: 'UNINITIALIZED',
  nativeRouteStage: '',
  fallbackCount: 0,
  nativeStartAttempts: 0,
  nativeStartFailures: 0,
  lastFallbackReason: '',
  lastFallbackAt: 0,
  mainSharedSessionCount: 0,
  mainTopFrameSeq: 0,
  mainTopReadFailures: 0,
  mainTopBindAttempts: 0,
  mainTopBindFailures: 0,
  mainTopLastBindReason: '',
  mainTopLastBindError: '',
  uiBindAttempts: 0,
  uiBindFailures: 0,
  uiBindLastReason: '',
  uiBindLastError: '',
  mainTopLastReason: '',
  mainTopLastError: '',
  mainTopReadMsAvg: 0,
  mainTopCopyMsAvg: 0,
  mainTopSabWriteMsAvg: 0,
  mainTopBytesPerFrameAvg: 0,
  mainTopBytesPerSec: 0,
  mainTopPumpJitterMsAvg: 0,
  mainTopFrameIntervalMsAvg: 0,
  nativeEnvFlag: '',
  nativeEnvFlagEnabled: false,
  nativeLiveEnvFlag: '',
  nativeLiveEnvFlagEnabled: false,
  wgcEnvFlag: '',
  wgcEnvFlagEnabled: false,
  nativeSmokeRan: false,
  nativeSmokeOk: false,
  nativeSmokeForSource: false,
  nativeSmokeReason: '',
  nativeSmokeAt: 0,
  sharedBindCloneBlocked: false,
  recordingAttemptSeq: 0,
  recordingAttemptStartedAt: 0
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
  frameImageData: null,
  sharedFrameBuffer: null,
  sharedControlBuffer: null,
  sharedFrameView: null,
  sharedControlView: null,
  lastSharedFrameSeq: 0,
  pendingFrame: null,
  firstFrameReceived: false,
  startupDeadlineMs: 0,
  frameEndpoint: '',
  lastHttpFrameSeq: 0,
  captureFps: 0,
  renderFps: 0,
  queueDepth: 0,
  runtimeLegacyRetryAttempted: false,
  rendererBlitMsAvg: 0
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

function getRecordingAudioModeLabel() {
  const hasSystemAudio = Boolean(sourceStream && sourceStream.getAudioTracks().length > 0);
  const hasMicAudio = Boolean(micStream && micStream.getAudioTracks().length > 0);
  if (!hasSystemAudio && !hasMicAudio) {
    return '音訊: 無';
  }
  return `音訊: ${hasSystemAudio ? '喇叭輸出' : ''}${hasSystemAudio && hasMicAudio ? ' + ' : ''}${hasMicAudio ? '麥克風' : ''} (已混音 + 增益)`;
}

function getPenInteractionModeLabel(mode) {
  return String(mode || '').trim().toLowerCase() === 'smooth' ? '流暢優先' : '穩定優先';
}

function refreshRecordingStatusLine() {
  if (!(mediaRecorder && mediaRecorder.state === 'recording')) {
    return;
  }
  const runtimeRoute = String((hdrMappingState && hdrMappingState.runtimeRoute) || 'fallback');
  const routeLabel = getHdrRouteLabel(runtimeRoute, getEffectiveHdrTransportMode());
  const qualityLabel = String((recordingQualityPreset && recordingQualityPreset.label) || '平衡');
  const audioMode = getRecordingAudioModeLabel();
  const penModeLabel = getPenInteractionModeLabel(annotationState.interactionMode);
  setStatus('錄影中: 可在原始畫面畫筆標註（Ctrl 開啟；滾輪暫停後自動恢復；雙按 Ctrl 關閉） | 畫筆互動: ' + penModeLabel + ' | 畫質: ' + qualityLabel + ' | HDR 路徑: ' + routeLabel + ' (' + audioMode + ')');
}

async function withTimeout(promise, ms, message) {
  let timer = 0;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function normalizeHdrMappingMode(value) {
  return value === 'off' || value === 'force-native' ? value : 'auto';
}

function normalizeHdrRoutePreference(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'wgc' || v === 'legacy' || v === 'auto') {
    return v;
  }
  return 'auto';
}

function normalizeHdrTransportMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'shared-buffer' || mode === 'http-fallback') {
    return mode;
  }
  return '';
}

function decodeSharedPixelFormat(code) {
  const n = Number(code || 0);
  if (n === 2) {
    return 'BGRA8';
  }
  return 'RGBA8';
}

function getHdrRouteLabel(route, transportMode = '') {
  const runtimeRoute = String(route || 'fallback');
  if (runtimeRoute === 'fallback') {
    return 'Fallback';
  }
  const mode = normalizeHdrTransportMode(transportMode);
  return mode ? (runtimeRoute + '/' + mode) : runtimeRoute;
}

function getEffectiveHdrTransportMode() {
  const mapped = normalizeHdrTransportMode(hdrMappingState.runtimeTransportMode);
  if (mapped) {
    return mapped;
  }
  if (nativeHdrState.sharedFrameView && nativeHdrState.sharedControlView) {
    return 'shared-buffer';
  }
  if (nativeHdrState.frameEndpoint) {
    return 'http-fallback';
  }
  return '';
}

function updateHdrMappingStatusUi() {
  if (hdrMappingRuntimeEl) {
    hdrMappingRuntimeEl.textContent = hdrRuntimeStatusMessage;
  }
  if (hdrMappingProbeEl) {
    hdrMappingProbeEl.textContent = hdrProbeStatusMessage;
  }
  if (hdrMappingDiagEl) {
    hdrMappingDiagEl.textContent = hdrDiagStatusMessage;
  }
}

function setHdrRuntimeRoute(route, message, transportMode) {
  hdrMappingState.runtimeRoute = String(route || 'fallback');
  if (transportMode !== undefined) {
    hdrMappingState.runtimeTransportMode = normalizeHdrTransportMode(transportMode);
  }
  hdrRuntimeStatusMessage = message || ('目前路徑: ' + getHdrRouteLabel(hdrMappingState.runtimeRoute, getEffectiveHdrTransportMode()));
  updateHdrMappingStatusUi();
  refreshRecordingStatusLine();
}

function setHdrProbeStatus(message) {
  hdrProbeStatusMessage = message || '尚未探測';
  updateHdrMappingStatusUi();
}

function updateHdrDiagStatus(message) {
  if (message) {
    hdrDiagStatusMessage = message;
    updateHdrMappingStatusUi();
    return;
  }
  const fallbackReason = hdrMappingState.lastFallbackReason || '-';
  const fallbackTime = hdrMappingState.lastFallbackAt > 0
    ? new Date(hdrMappingState.lastFallbackAt).toLocaleTimeString()
    : '-';
  const attemptLabel = hdrMappingState.recordingAttemptSeq > 0
    ? String(hdrMappingState.recordingAttemptSeq)
    : '-';
  hdrDiagStatusMessage =
    'Diag: attempt=' + attemptLabel +
    ', route=' + String(getHdrRouteLabel(hdrMappingState.runtimeRoute || '-', getEffectiveHdrTransportMode())) +
    ', stage=' + String(hdrMappingState.runtimeStage || '-') +
    ', pref=' + String(hdrMappingState.routePreference || 'auto') +
    ', level=' + String(hdrMappingState.fallbackLevel || 3) +
    ', fallback=' + String(hdrMappingState.fallbackCount) +
    ', nativeStart=' + String(hdrMappingState.nativeStartAttempts) +
    ', nativeFail=' + String(hdrMappingState.nativeStartFailures) +
    ', readFail=' + String(nativeHdrState.readFailures) +
    ', capFps=' + String(Number(nativeHdrState.captureFps || 0).toFixed(1)) +
    ', renderFps=' + String(Number(nativeHdrState.renderFps || 0).toFixed(1)) +
    ', blitMs=' + String(Number(nativeHdrState.rendererBlitMsAvg || 0).toFixed(2)) +
    ', queue=' + String(nativeHdrState.queueDepth || 0) +
    ', mainSess=' + String(hdrMappingState.mainSharedSessionCount) +
    ', mainFrame=' + String(hdrMappingState.mainTopFrameSeq) +
    ', mainReadFail=' + String(hdrMappingState.mainTopReadFailures) +
    ', mainBind=' + String(hdrMappingState.mainTopBindFailures) + '/' + String(hdrMappingState.mainTopBindAttempts) +
    ', uiBind=' + String(hdrMappingState.uiBindFailures) + '/' + String(hdrMappingState.uiBindAttempts) +
    ', mainReadMs=' + String(Number(hdrMappingState.mainTopReadMsAvg || 0).toFixed(2)) +
    ', mainCopyMs=' + String(Number(hdrMappingState.mainTopCopyMsAvg || 0).toFixed(2)) +
    ', mainJitMs=' + String(Number(hdrMappingState.mainTopPumpJitterMsAvg || 0).toFixed(2)) +
    ', mainBpf=' + String(Math.round(Number(hdrMappingState.mainTopBytesPerFrameAvg || 0))) +
    ', mainBps=' + String(Math.round(Number(hdrMappingState.mainTopBytesPerSec || 0))) +
    ', mainReason=' + String(hdrMappingState.mainTopLastReason || '-') +
    ', mainBindReason=' + String(hdrMappingState.mainTopLastBindReason || '-') +
    ', mainBindErr=' + String(hdrMappingState.mainTopLastBindError || '-') +
    ', uiBindReason=' + String(hdrMappingState.uiBindLastReason || '-') +
    ', uiBindErr=' + String(hdrMappingState.uiBindLastError || '-') +
    ', mainErr=' + String(hdrMappingState.mainTopLastError || '-') +
    ', guard=' + (hdrMappingState.nativeRouteEnabled ? 'off' : 'on') +
    ', env=' + (hdrMappingState.nativeEnvFlag || '-') + ':' + (hdrMappingState.nativeEnvFlagEnabled ? '1' : '0') +
    ', live=' + (hdrMappingState.nativeLiveEnvFlag || '-') + ':' + (hdrMappingState.nativeLiveEnvFlagEnabled ? '1' : '0') +
    ', wgc=' + (hdrMappingState.wgcEnvFlag || '-') + ':' + (hdrMappingState.wgcEnvFlagEnabled ? '1' : '0') +
    ', smoke=' + (
      !hdrMappingState.nativeSmokeRan
        ? 'required'
        : (hdrMappingState.nativeSmokeOk
          ? (hdrMappingState.nativeSmokeForSource ? 'ok' : 'stale')
          : 'fail')
    ) +
    ', lastFallback=' + fallbackReason + '@' + fallbackTime;
  updateHdrMappingStatusUi();
}

function pushHdrDecisionTrace(type, detail = {}) {
  hdrDecisionTrace.push({
    ts: Date.now(),
    type: String(type || 'unknown'),
    detail: detail && typeof detail === 'object' ? detail : { value: String(detail || '') }
  });
  if (hdrDecisionTrace.length > HDR_DECISION_TRACE_LIMIT) {
    hdrDecisionTrace.splice(0, hdrDecisionTrace.length - HDR_DECISION_TRACE_LIMIT);
  }
}

function resetHdrDiagForRecordingAttempt() {
  hdrMappingState.recordingAttemptSeq += 1;
  hdrMappingState.recordingAttemptStartedAt = Date.now();
  hdrMappingState.fallbackCount = 0;
  hdrMappingState.nativeStartAttempts = 0;
  hdrMappingState.nativeStartFailures = 0;
  hdrMappingState.lastFallbackReason = '';
  hdrMappingState.lastFallbackAt = 0;
  nativeHdrState.readFailures = 0;
  pushHdrDecisionTrace('recording-attempt-reset', {
    attempt: hdrMappingState.recordingAttemptSeq
  });
  updateHdrDiagStatus();
}

function noteHdrFallback(reason) {
  hdrMappingState.fallbackCount += 1;
  hdrMappingState.lastFallbackReason = String(reason || 'UNKNOWN');
  hdrMappingState.lastFallbackAt = Date.now();
  pushHdrDecisionTrace('fallback', {
    reason: hdrMappingState.lastFallbackReason,
    attempt: hdrMappingState.recordingAttemptSeq
  });
  updateHdrDiagStatus();
}

function markSmokeStaleForSourceChange() {
  if (!hdrMappingState.nativeSmokeRan) {
    return;
  }
  hdrMappingState.nativeSmokeForSource = false;
  hdrSmokeAutoSuspendUntilMs = Date.now() + 3000;
  pushHdrDecisionTrace('smoke-mark-stale', {
    sourceId: String(sourceSelect && sourceSelect.value ? sourceSelect.value : ''),
    until: hdrSmokeAutoSuspendUntilMs
  });
  updateHdrDiagStatus();
}

function updateHdrModeAvailabilityUi() {
  if (!hdrMappingModeSelect) {
    return;
  }
  const visible = Boolean(hdrMappingState.nativeEnvFlagEnabled || hdrMappingState.wgcEnvFlagEnabled);
  let forceOption = Array.from(hdrMappingModeSelect.options || []).find((opt) => opt.value === 'force-native');
  if (!visible && forceOption) {
    forceOption.remove();
    forceOption = null;
  }
  if (visible && !forceOption && forceNativeOptionTemplate) {
    hdrMappingModeSelect.appendChild(forceNativeOptionTemplate.cloneNode(true));
    forceOption = Array.from(hdrMappingModeSelect.options || []).find((opt) => opt.value === 'force-native') || null;
  }

  const disabled = !hdrMappingState.nativeRouteEnabled;
  if (forceOption) {
    forceOption.disabled = disabled;
    forceOption.textContent = disabled
      ? 'Force Native（暫停：IPC guard）'
      : 'Force Native（不可用則阻止開始）';
  }

  if ((!visible || disabled) && normalizeHdrMappingMode(hdrMappingState.mode) === 'force-native') {
    hdrMappingState.mode = 'auto';
    hdrMappingModeSelect.value = 'auto';
  }

  if (runHdrSmokeBtn) {
    const recordingActive = Boolean(mediaRecorder && mediaRecorder.state === 'recording');
    runHdrSmokeBtn.disabled = !hdrMappingState.nativeEnvFlagEnabled || recordingActive || hdrSmokeAutoRunning || hdrSmokeManualRunning;
  }
}

async function copyHdrDiagnosticsSnapshot() {
  const sourceId = String(sourceSelect && sourceSelect.value ? sourceSelect.value : '');
  const displayId = selectedSource && selectedSource.display_id ? String(selectedSource.display_id) : '';
  const probe = sourceId
    ? await electronAPI.hdrProbeWindows({ sourceId, displayId }).catch(() => null)
    : null;
  const mainSnapshot = await electronAPI.hdrDiagnosticsSnapshot().catch(() => null);
  const payload = {
    generatedAt: new Date().toISOString(),
    ui: {
      sourceId,
      displayId,
      hdrMappingMode: hdrMappingState.mode,
      hdrRuntimeRoute: hdrMappingState.runtimeRoute,
      hdrRuntimeBackend: hdrMappingState.runtimeBackend,
      hdrRuntimeStage: hdrMappingState.runtimeStage,
      hdrRuntimeTransportMode: hdrMappingState.runtimeTransportMode,
      hdrRoutePreference: hdrMappingState.routePreference,
      hdrFallbackLevel: hdrMappingState.fallbackLevel,
      hdrRuntimeStatusMessage,
      hdrProbeStatusMessage,
      hdrDiagStatusMessage,
      nativeRouteEnabled: hdrMappingState.nativeRouteEnabled,
      nativeRouteReason: hdrMappingState.nativeRouteReason,
      nativeRouteStage: hdrMappingState.nativeRouteStage,
      nativeSmokeRan: hdrMappingState.nativeSmokeRan,
      nativeSmokeOk: hdrMappingState.nativeSmokeOk,
      nativeSmokeForSource: hdrMappingState.nativeSmokeForSource,
      nativeSmokeReason: hdrMappingState.nativeSmokeReason,
      nativeSmokeAt: hdrMappingState.nativeSmokeAt,
      fallbackCount: hdrMappingState.fallbackCount,
      nativeStartAttempts: hdrMappingState.nativeStartAttempts,
      nativeStartFailures: hdrMappingState.nativeStartFailures,
      mainTopReadMsAvg: hdrMappingState.mainTopReadMsAvg,
      mainTopBindAttempts: hdrMappingState.mainTopBindAttempts,
      mainTopBindFailures: hdrMappingState.mainTopBindFailures,
      mainTopLastBindReason: hdrMappingState.mainTopLastBindReason,
      mainTopLastBindError: hdrMappingState.mainTopLastBindError,
      uiBindAttempts: hdrMappingState.uiBindAttempts,
      uiBindFailures: hdrMappingState.uiBindFailures,
      uiBindLastReason: hdrMappingState.uiBindLastReason,
      uiBindLastError: hdrMappingState.uiBindLastError,
      mainTopCopyMsAvg: hdrMappingState.mainTopCopyMsAvg,
      mainTopSabWriteMsAvg: hdrMappingState.mainTopSabWriteMsAvg,
      mainTopBytesPerFrameAvg: hdrMappingState.mainTopBytesPerFrameAvg,
      mainTopBytesPerSec: hdrMappingState.mainTopBytesPerSec,
      mainTopPumpJitterMsAvg: hdrMappingState.mainTopPumpJitterMsAvg,
      mainTopFrameIntervalMsAvg: hdrMappingState.mainTopFrameIntervalMsAvg,
      lastFallbackReason: hdrMappingState.lastFallbackReason,
      lastFallbackAt: hdrMappingState.lastFallbackAt,
      nativeState: {
        active: nativeHdrState.active,
        sessionId: nativeHdrState.sessionId,
        width: nativeHdrState.width,
        height: nativeHdrState.height,
        stride: nativeHdrState.stride,
        frameEndpoint: nativeHdrState.frameEndpoint,
        lastHttpFrameSeq: nativeHdrState.lastHttpFrameSeq,
        readFailures: nativeHdrState.readFailures,
        droppedFrames: nativeHdrState.droppedFrames,
        frameCount: nativeHdrState.frameCount,
        captureFps: nativeHdrState.captureFps,
        renderFps: nativeHdrState.renderFps,
        queueDepth: nativeHdrState.queueDepth,
        rendererBlitMsAvg: nativeHdrState.rendererBlitMsAvg,
        supportsSharedFrameRead: Boolean(nativeHdrState.sharedFrameView && nativeHdrState.sharedControlView),
        transportMode: nativeHdrState.sharedFrameView && nativeHdrState.sharedControlView ? 'shared-buffer' : 'http-fallback'
      },
      decisionTrace: hdrDecisionTrace.slice(-80)
    },
    probe,
    main: mainSnapshot
  };
  const text = JSON.stringify(payload, null, 2);
  const copyResult = await electronAPI.copyText({ text }).catch(() => ({ ok: false }));
  if (!copyResult || !copyResult.ok) {
    throw new Error('無法複製 HDR 診斷到剪貼簿。');
  }
  return payload;
}

function getCurrentSelectedSource() {
  const sourceId = String(sourceSelect && sourceSelect.value ? sourceSelect.value : '');
  if (!sourceId) {
    return null;
  }
  return sources.find((s) => s.id === sourceId) || selectedSource || null;
}

async function runHdrNativeSmokeFromUi() {
  let sourceId = String(sourceSelect && sourceSelect.value ? sourceSelect.value : '');
  let currentSource = getCurrentSelectedSource();
  if (!sourceId || !currentSource) {
    await loadSources();
    sourceId = String(sourceSelect && sourceSelect.value ? sourceSelect.value : '');
    currentSource = getCurrentSelectedSource();
  }
  if (!sourceId || !currentSource) {
    throw new Error('缺少來源，請先選擇螢幕來源。');
  }
  selectedSource = currentSource;
  const displayId = currentSource && currentSource.display_id ? String(currentSource.display_id) : '';
  const result = await electronAPI.hdrNativeRouteSmoke({
    sourceId,
    displayId
  });
  pushHdrDecisionTrace('native-smoke', {
    sourceId,
    displayId,
    ok: Boolean(result && result.ok),
    startOk: Boolean(result && result.startOk),
    readOk: Boolean(result && result.readOk),
    stopOk: Boolean(result && result.stopOk),
    readReason: String((result && result.readReason) || '')
  });
  return result;
}

async function ensureNativeSmokeReadyForAttempt(sourceId, displayId) {
  if (!hdrMappingState.nativeEnvFlagEnabled || hdrMappingState.nativeSmokeOk) {
    return;
  }
  pushHdrDecisionTrace('native-smoke-auto-begin', {
    sourceId,
    displayId: String(displayId || '')
  });
  const smokeResult = await electronAPI.hdrNativeRouteSmoke({
    sourceId,
    displayId: String(displayId || '')
  }).catch((error) => ({
    ok: false,
    startOk: false,
    readOk: false,
    stopOk: false,
    readReason: error && error.message ? error.message : 'SMOKE_EXCEPTION'
  }));
  pushHdrDecisionTrace('native-smoke-auto-finish', {
    ok: Boolean(smokeResult && smokeResult.ok),
    startOk: Boolean(smokeResult && smokeResult.startOk),
    readOk: Boolean(smokeResult && smokeResult.readOk),
    stopOk: Boolean(smokeResult && smokeResult.stopOk),
    readReason: String((smokeResult && smokeResult.readReason) || '')
  });
  await loadHdrExperimentalState().catch(() => {});
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

async function updateCursorFromMain() {
  if (!selectedSource || cursorUpdateInFlight) {
    return;
  }
  cursorUpdateInFlight = true;

  try {
    const p = await electronAPI.getCursorPoint(selectedSource.display_id);
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

    const clickInfo = await electronAPI.getLatestClick(selectedSource.display_id, clickState.lastClickTimestamp);
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
  } catch (_error) {
  } finally {
    cursorUpdateInFlight = false;
  }
}

function smoothingByDelta(base, deltaMs) {
  const k = clamp(Number(base) || 0, 0, 1);
  if (k <= 0) {
    return 0;
  }
  if (k >= 1) {
    return 1;
  }
  const frameScale = clamp((Number(deltaMs) || DRAW_INTERVAL_MS) / DRAW_INTERVAL_MS, 0.25, 4);
  return 1 - Math.pow(1 - k, frameScale);
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
  const deltaMs = lastDrawNow > 0 ? Math.max(1, now - lastDrawNow) : DRAW_INTERVAL_MS;
  lastDrawNow = now;
  if (!clickState.doubleClickLocked && now > cameraState.zoomHoldUntil) {
    cameraState.targetZoom = 1;
  }

  const smooth = clamp(cameraState.smoothing, 0.01, 1);
  const followSmoothBase = annotationState.enabled
    ? smooth * PEN_DRAW_FOLLOW_SLOWDOWN
    : smooth;
  const zoomSmoothBase = cameraState.targetZoom > cameraState.zoom
    ? smooth * CLICK_ZOOM_IN_SLOWDOWN
    : smooth;
  const followSmooth = smoothingByDelta(followSmoothBase, deltaMs);
  const zoomSmooth = smoothingByDelta(zoomSmoothBase, deltaMs);
  const glowSmooth = smoothingByDelta(glowState.lag, deltaMs);

  cameraState.zoom += (cameraState.targetZoom - cameraState.zoom) * zoomSmooth;
  cameraState.viewportX += (cameraState.targetX - cameraState.viewportX) * followSmooth;
  cameraState.viewportY += (cameraState.targetY - cameraState.viewportY) * followSmooth;

  glowState.x += (cameraState.cursorX - glowState.x) * glowSmooth;
  glowState.y += (cameraState.cursorY - glowState.y) * glowSmooth;

  const dims = getCaptureVideoDimensions();
  const sw = dims.width;
  const sh = dims.height;
  if (!sw || !sh) {
    drawTimer = requestAnimationFrame(drawLoop);
    return;
  }

  const captureSource = getCaptureVideoSource();
  if (!captureSource) {
    drawTimer = requestAnimationFrame(drawLoop);
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

  const nativeActive = nativeHdrState.active;
  const hasNewNativeFrame = nativeActive && nativeHdrState.frameCount !== lastDrawnNativeFrameCount;
  const cameraMoved =
    Math.abs(cameraState.viewportX - lastDrawnViewportX) > DRAW_EPSILON ||
    Math.abs(cameraState.viewportY - lastDrawnViewportY) > DRAW_EPSILON ||
    Math.abs(cameraState.zoom - lastDrawnZoom) > 0.002;
  const glowMoved =
    Math.abs(glowState.x - lastDrawnGlowX) > DRAW_EPSILON ||
    Math.abs(glowState.y - lastDrawnGlowY) > DRAW_EPSILON;
  const markerActive = now < doubleClickMarkerState.activeUntil;
  const shouldDraw = !nativeActive || hasNewNativeFrame || cameraMoved || glowMoved || markerActive;

  if (!shouldDraw) {
    drawTimer = requestAnimationFrame(drawLoop);
    return;
  }

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

  lastDrawnNativeFrameCount = nativeHdrState.frameCount;
  lastDrawnViewportX = cameraState.viewportX;
  lastDrawnViewportY = cameraState.viewportY;
  lastDrawnZoom = cameraState.zoom;
  lastDrawnGlowX = glowState.x;
  lastDrawnGlowY = glowState.y;
  drawTimer = requestAnimationFrame(drawLoop);
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
  return withTimeout(
    navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxFrameRate: 60
        }
      }
    }),
    10000,
    '桌面視訊擷取逾時，請確認來源仍可用。'
  );
}

async function getDesktopAudioStream(sourceId) {
  try {
    return await withTimeout(
      navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId
          }
        },
        video: false
      }),
      5000,
      '桌面音訊擷取逾時。'
    );
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
    await electronAPI.hdrSharedStop({
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
  nativeHdrState.sharedFrameBuffer = null;
  nativeHdrState.sharedControlBuffer = null;
  nativeHdrState.sharedFrameView = null;
  nativeHdrState.sharedControlView = null;
  nativeHdrState.lastSharedFrameSeq = 0;
  nativeHdrState.pendingFrame = null;
  nativeHdrState.firstFrameReceived = false;
  nativeHdrState.startupDeadlineMs = 0;
  nativeHdrState.frameEndpoint = '';
  nativeHdrState.lastHttpFrameSeq = 0;
  nativeHdrState.captureFps = 0;
  nativeHdrState.renderFps = 0;
  nativeHdrState.queueDepth = 0;
  nativeHdrState.runtimeLegacyRetryAttempted = false;
  nativeHdrState.rendererBlitMsAvg = 0;
}

function blitNativeFrameToCanvas(frame) {
  if (!nativeHdrState.ctx || !nativeHdrState.canvas) {
    return;
  }
  const blitStart = performance.now();

  const width = Math.max(1, Number(frame && frame.width ? frame.width : nativeHdrState.width || 1));
  const height = Math.max(1, Number(frame && frame.height ? frame.height : nativeHdrState.height || 1));
  const stride = Math.max(width * 4, Number(frame && frame.stride ? frame.stride : width * 4));
  const rawBytes = frame && frame.bytes ? frame.bytes : null;
  if (!rawBytes) {
    nativeHdrState.droppedFrames += 1;
    return;
  }

  const srcBytes = new Uint8ClampedArray(rawBytes);
  const pixelFormat = String(frame && frame.pixelFormat ? frame.pixelFormat : 'RGBA8').toUpperCase();
  ensureNativeHdrCanvas(width, height);

  const expectedBytes = width * height * 4;
  if (!nativeHdrState.frameImageData || nativeHdrState.frameImageData.width !== width || nativeHdrState.frameImageData.height !== height) {
    nativeHdrState.frameImageData = nativeHdrState.ctx.createImageData(width, height);
  }

  const dst = nativeHdrState.frameImageData.data;
  if (pixelFormat === 'RGBA8') {
    if (stride === width * 4 && srcBytes.length >= expectedBytes) {
      dst.set(srcBytes.subarray(0, expectedBytes));
    } else {
      for (let row = 0; row < height; row += 1) {
        const srcOffset = row * stride;
        const dstOffset = row * width * 4;
        const rowBytes = Math.max(0, Math.min(width * 4, srcBytes.length - srcOffset));
        if (rowBytes > 0) {
          dst.set(srcBytes.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
        }
      }
    }
  } else {
    for (let row = 0; row < height; row += 1) {
      const srcOffset = row * stride;
      const dstOffset = row * width * 4;
      const rowBytes = Math.max(0, Math.min(width * 4, srcBytes.length - srcOffset));
      for (let i = 0; i + 3 < rowBytes; i += 4) {
        const s = srcOffset + i;
        const d = dstOffset + i;
        // Backward-compatible conversion for legacy BGRA payloads.
        dst[d] = srcBytes[s + 2];
        dst[d + 1] = srcBytes[s + 1];
        dst[d + 2] = srcBytes[s];
        dst[d + 3] = srcBytes[s + 3];
      }
    }
  }

  nativeHdrState.ctx.putImageData(nativeHdrState.frameImageData, 0, 0);
  const now = performance.now();
  const delta = nativeHdrState.lastFrameAtMs > 0 ? Math.max(1, now - nativeHdrState.lastFrameAtMs) : 0;
  if (delta > 0) {
    const fps = 1000 / delta;
    nativeHdrState.renderFps = nativeHdrState.renderFps > 0
      ? ((nativeHdrState.renderFps * 0.8) + (fps * 0.2))
      : fps;
    nativeHdrState.captureFps = nativeHdrState.captureFps > 0
      ? ((nativeHdrState.captureFps * 0.8) + (fps * 0.2))
      : fps;
  }
  nativeHdrState.lastFrameAtMs = now;
  nativeHdrState.frameCount += 1;
  nativeHdrState.firstFrameReceived = true;
  const blitMs = Math.max(0, performance.now() - blitStart);
  nativeHdrState.rendererBlitMsAvg = nativeHdrState.rendererBlitMsAvg > 0
    ? ((nativeHdrState.rendererBlitMsAvg * 0.8) + (blitMs * 0.2))
    : blitMs;
}

function tryReadNativeFrameFromSharedBuffer() {
  const control = nativeHdrState.sharedControlView;
  const frameView = nativeHdrState.sharedFrameView;
  if (!control || !frameView) {
    return null;
  }

  const status = Atomics.load(control, 0);
  if (status !== 1) {
    return null;
  }

  const frameSeq = Atomics.load(control, 1);
  if (frameSeq <= nativeHdrState.lastSharedFrameSeq) {
    return null;
  }
  const queueDepth = Math.max(0, frameSeq - nativeHdrState.lastSharedFrameSeq - 1);
  nativeHdrState.queueDepth = queueDepth;
  if (queueDepth > 0) {
    nativeHdrState.droppedFrames += queueDepth;
  }

  const width = Math.max(1, Atomics.load(control, 2));
  const height = Math.max(1, Atomics.load(control, 3));
  const stride = Math.max(width * 4, Atomics.load(control, 4));
  const byteLength = Math.max(0, Atomics.load(control, 5));
  const pixelFormatCode = Atomics.load(control, 8);
  if (byteLength <= 0 || byteLength > frameView.length) {
    return null;
  }

  nativeHdrState.lastSharedFrameSeq = frameSeq;
  return {
    ok: true,
    frameSeq,
    width,
    height,
    stride,
    pixelFormat: decodeSharedPixelFormat(pixelFormatCode),
    bytes: frameView.slice(0, byteLength)
  };
}

function tryReadNativeFrameFromPushBuffer() {
  const frame = nativeHdrState.pendingFrame;
  if (!frame) {
    return null;
  }
  nativeHdrState.pendingFrame = null;
  return frame;
}

async function tryReadNativeFrameFromHttpEndpoint() {
  const endpoint = String(nativeHdrState.frameEndpoint || '');
  if (!endpoint) {
    return null;
  }
  const url = endpoint + '?minSeq=' + String(Number(nativeHdrState.lastHttpFrameSeq || 0));
  const response = await fetch(url, {
    method: 'GET',
    cache: 'no-store'
  }).catch(() => null);
  if (!response || response.status === 204) {
    return null;
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: 'HTTP_FRAME_' + String(response.status || 0)
    };
  }
  const frameSeq = Number(response.headers.get('x-hdr-frame-seq') || 0);
  if (frameSeq <= Number(nativeHdrState.lastHttpFrameSeq || 0)) {
    return null;
  }
  const queueDepth = Math.max(0, frameSeq - Number(nativeHdrState.lastHttpFrameSeq || 0) - 1);
  nativeHdrState.queueDepth = queueDepth;
  if (queueDepth > 0) {
    nativeHdrState.droppedFrames += queueDepth;
  }
  const width = Math.max(1, Number(response.headers.get('x-hdr-width') || nativeHdrState.width || 1));
  const height = Math.max(1, Number(response.headers.get('x-hdr-height') || nativeHdrState.height || 1));
  const stride = Math.max(width * 4, Number(response.headers.get('x-hdr-stride') || nativeHdrState.stride || width * 4));
  const pixelFormat = String(response.headers.get('x-hdr-pixel-format') || 'RGBA8');
  const bytes = await response.arrayBuffer();
  nativeHdrState.lastHttpFrameSeq = frameSeq;
  return {
    ok: true,
    frameSeq,
    width,
    height,
    stride,
    pixelFormat,
    bytes
  };
}

async function fallbackNativeToDesktopVideo(reason) {
  if (nativeHdrFallbackAttempted) {
    return;
  }
  nativeHdrFallbackAttempted = true;
  let keepNativeSession = false;
  const fallbackReason = String(reason || 'NATIVE_RUNTIME_FALLBACK');

  const oldSourceStream = sourceStream;

  try {
    noteHdrFallback(fallbackReason);
    const runtimeRoute = String(hdrMappingState.runtimeRoute || '');
    if (runtimeRoute === 'wgc-v1' && !nativeHdrState.runtimeLegacyRetryAttempted) {
      nativeHdrState.runtimeLegacyRetryAttempted = true;
      const retrySourceId = String(nativeHdrState.sourceId || (sourceSelect && sourceSelect.value ? sourceSelect.value : ''));
      const retryDisplayId = String(nativeHdrState.displayId || (selectedSource && selectedSource.display_id ? selectedSource.display_id : ''));
      await stopNativeHdrCapture();
      const legacyRetry = await tryStartNativeHdrCapture(retrySourceId, retryDisplayId, {
        routePreference: 'legacy'
      });
      if (legacyRetry && legacyRetry.ok) {
        keepNativeSession = true;
        setStatus('WGC 路徑中斷，已自動降級到 Legacy Native HDR。原因: ' + fallbackReason);
        return;
      }
    }
    hdrMappingState.fallbackLevel = 3;
    const fallbackStream = await getDesktopStream(nativeHdrState.sourceId || sourceSelect.value);
    sourceStream = fallbackStream;
    applyQualityHints(sourceStream);
    rawVideo.srcObject = fallbackStream;
    await rawVideo.play();
    setHdrRuntimeRoute('fallback', '目前路徑: Fallback（Native 執行中回退）');

    if (oldSourceStream && oldSourceStream !== fallbackStream) {
      extraCaptureStreams.push(oldSourceStream);
    }

    setStatus('偵測到 Native HDR 擷取中斷，已自動回退既有錄影管線。' + (fallbackReason ? ' 原因: ' + fallbackReason : ''));
  } catch (error) {
    setStatus('Native HDR 擷取中斷且回退失敗: ' + (error && error.message ? error.message : String(error)));
  } finally {
    if (!keepNativeSession) {
      await stopNativeHdrCapture();
    }
  }
}

async function pollNativeHdrFrame() {
  if (!nativeHdrState.active || nativeHdrState.sessionId <= 0 || nativeHdrFramePumpRunning) {
    return;
  }

  nativeHdrFramePumpRunning = true;
  try {
    const now = performance.now();
    const pushedResult = tryReadNativeFrameFromPushBuffer();
    if (pushedResult && pushedResult.ok) {
      nativeHdrState.readFailures = 0;
      blitNativeFrameToCanvas(pushedResult);
      return;
    }

    const result = tryReadNativeFrameFromSharedBuffer();
    if (!result) {
      const httpResult = await tryReadNativeFrameFromHttpEndpoint();
      if (httpResult && httpResult.ok) {
        nativeHdrState.readFailures = 0;
        blitNativeFrameToCanvas(httpResult);
        return;
      }
    }

    if (result && result.ok && result.hasFrame !== false) {
      nativeHdrState.readFailures = 0;
      blitNativeFrameToCanvas(result);
      return;
    }
    const idleForMs = nativeHdrState.lastFrameAtMs > 0 ? (now - nativeHdrState.lastFrameAtMs) : 0;
    if (!nativeHdrState.firstFrameReceived && nativeHdrState.startupDeadlineMs > 0 && now >= nativeHdrState.startupDeadlineMs) {
      await fallbackNativeToDesktopVideo('STARTUP_NO_FRAME_TIMEOUT');
      return;
    }
    if (result === null) {
      if (idleForMs >= HDR_NATIVE_MAX_IDLE_MS) {
        nativeHdrState.readFailures += 1;
      }
      return;
    }

    nativeHdrState.readFailures += 1;
    const hardFallback =
      result &&
      (result.reason === 'FRAME_TOO_LARGE' ||
        result.reason === 'INVALID_SESSION' ||
        result.reason === 'NATIVE_UNAVAILABLE' ||
        result.reason === 'WORKER_FRAME_READ_FAILED');
    if (
      hardFallback ||
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
      }, HDR_NATIVE_POLL_INTERVAL_MS);
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
  const isolated = typeof window !== 'undefined' && window.crossOriginIsolated === true;
  const isoTag = hdrMappingState.sharedBindCloneBlocked
    ? 'SAB:BLOCKED'
    : (isolated ? 'SAB:OK' : 'SAB:OFF');

  if (probe && probe.supported) {
    setHdrProbeStatus('Probe: Native 可用（' + (probe.hdrActive ? 'HDR 螢幕' : 'SDR/未知') + '，' + isoTag + '）');
  } else if (probe && probe.reason === 'LOCAL_BRIDGE_UNAVAILABLE') {
    setHdrProbeStatus('Probe: Native 不可用（LOCAL_BRIDGE_UNAVAILABLE，' + isoTag + '）');
  } else {
    setHdrProbeStatus('Probe: Native 不可用（' + hdrMappingState.probeReason + '，' + isoTag + '）');
  }

  pushHdrDecisionTrace('probe', {
    sourceId,
    displayId: String(displayId || ''),
    supported: Boolean(probe && probe.supported),
    hdrActive: Boolean(probe && probe.hdrActive),
    reason: String((probe && probe.reason) || '')
  });

  return probe || { ok: false, supported: false, reason: 'UNKNOWN' };
}

async function tryStartNativeHdrCapture(sourceId, displayId, options = {}) {
  hdrMappingState.nativeStartAttempts += 1;
  updateHdrDiagStatus();
  const routePreference = options && options.routePreference
    ? normalizeHdrRoutePreference(options.routePreference)
    : (normalizeHdrMappingMode(hdrMappingState.mode) === 'force-native'
      ? 'wgc'
      : normalizeHdrRoutePreference(hdrMappingState.routePreference));

  let start = null;
  const sharedPreferred = typeof window !== 'undefined' && window.crossOriginIsolated === true;
  const startPayloadBase = {
    sourceId,
    displayId,
    routePreference,
    maxFps: 60,
    toneMap: {
      profile: 'rec709-rolloff-v1',
      rolloff: 0.0,
      saturation: 1.0
    }
  };
  try {
    start = await electronAPI.hdrSharedStart({
      ...startPayloadBase,
      allowSharedBuffer: sharedPreferred
    });
  } catch (error) {
    const message = error && error.message ? String(error.message) : 'Shared start IPC clone error';
    const cloneLike = /could not be cloned|clone/i.test(message);
    if (sharedPreferred && cloneLike) {
      pushHdrDecisionTrace('shared-start-clone-retry-http', {
        reason: message
      });
      try {
        start = await electronAPI.hdrSharedStart({
          ...startPayloadBase,
          allowSharedBuffer: false
        });
      } catch (retryError) {
        return {
          ok: false,
          reason: 'SHARED_START_CLONE_ERROR',
          message: retryError && retryError.message ? retryError.message : message
        };
      }
    } else {
      return {
        ok: false,
        reason: 'SHARED_START_CLONE_ERROR',
        message
      };
    }
  }

  if (!start || !start.ok) {
    hdrMappingState.nativeStartFailures += 1;
    updateHdrDiagStatus();
    return {
      ok: false,
      reason: (start && start.reason) || 'START_FAILED',
      message: (start && start.message) || '無法啟動 Native HDR 擷取。'
    };
  }
  pushHdrDecisionTrace('native-start-ok', {
    sessionId: Number(start.sessionId || 0),
    width: Math.max(1, Number(start.width || 1)),
    height: Math.max(1, Number(start.height || 1)),
    supportsSharedFrameRead: start && start.supportsSharedFrameRead !== false,
    transportMode: String((start && start.transportMode) || '')
  });
  const width = Math.max(1, Number(start.width || 1));
  const height = Math.max(1, Number(start.height || 1));
  const stride = Math.max(width * 4, Number(start.stride || width * 4));
  let sharedFrameBuffer = start.sharedFrameBuffer;
  let sharedControlBuffer = start.sharedControlBuffer;
  let sharedBindOk = false;
  if (sharedPreferred && !hdrMappingState.sharedBindCloneBlocked && start && Number(start.sessionId || 0) > 0) {
    hdrMappingState.uiBindAttempts += 1;
    hdrMappingState.uiBindLastReason = '';
    hdrMappingState.uiBindLastError = '';
    try {
      const frameBytes = Math.max(1024 * 1024, stride * height);
      sharedFrameBuffer = new SharedArrayBuffer(frameBytes);
      sharedControlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * HDR_SHARED_CONTROL_SLOTS);
      let bindResult = null;
      try {
        bindResult = await electronAPI.hdrSharedBind({
          sessionId: Number(start.sessionId || 0),
          sharedFrameBuffer,
          sharedControlBuffer
        });
      } catch (bindInvokeError) {
        bindResult = {
          ok: false,
          bound: false,
          reason: 'BIND_INVOKE_CLONE_ERROR',
          message: bindInvokeError && bindInvokeError.message ? bindInvokeError.message : 'bind invoke clone error'
        };
      }
      if (!bindResult || !bindResult.ok) {
        bindResult = await electronAPI.hdrSharedBindAsync({
          sessionId: Number(start.sessionId || 0),
          sharedFrameBuffer,
          sharedControlBuffer
        });
      }
      sharedBindOk = Boolean(bindResult && bindResult.ok && bindResult.bound);
      hdrMappingState.uiBindLastReason = String((bindResult && bindResult.reason) || (sharedBindOk ? 'OK' : 'BIND_FAILED'));
      hdrMappingState.uiBindLastError = String((bindResult && bindResult.message) || '');
      pushHdrDecisionTrace('shared-bind', {
        ok: sharedBindOk,
        reason: String((bindResult && bindResult.reason) || (sharedBindOk ? 'OK' : 'BIND_FAILED')),
        message: String((bindResult && bindResult.message) || '')
      });
      if (!sharedBindOk) {
        hdrMappingState.uiBindFailures += 1;
        sharedFrameBuffer = null;
        sharedControlBuffer = null;
      }
    } catch (bindError) {
      hdrMappingState.uiBindFailures += 1;
      hdrMappingState.uiBindLastReason = 'BIND_EXCEPTION';
      hdrMappingState.uiBindLastError = bindError && bindError.message ? bindError.message : 'BIND_EXCEPTION';
      if (/could not be cloned|clone/i.test(String(hdrMappingState.uiBindLastError))) {
        hdrMappingState.sharedBindCloneBlocked = true;
        hdrMappingState.uiBindLastReason = 'BIND_CLONE_BLOCKED';
      }
      pushHdrDecisionTrace('shared-bind-exception', {
        message: bindError && bindError.message ? bindError.message : 'BIND_EXCEPTION'
      });
      sharedFrameBuffer = null;
      sharedControlBuffer = null;
      sharedBindOk = false;
    }
  }

  nativeHdrState.active = true;
  nativeHdrState.sessionId = Number(start.sessionId || 0);
  nativeHdrState.width = width;
  nativeHdrState.height = height;
  nativeHdrState.stride = stride;
  nativeHdrState.sourceId = sourceId;
  nativeHdrState.displayId = String(displayId || '');
  nativeHdrState.readFailures = 0;
  nativeHdrState.droppedFrames = 0;
  nativeHdrState.lastFrameAtMs = 0;
  nativeHdrState.frameCount = 0;
  nativeHdrFallbackAttempted = false;
  nativeHdrState.sharedFrameBuffer = sharedFrameBuffer;
  nativeHdrState.sharedControlBuffer = sharedControlBuffer;
  nativeHdrState.sharedFrameView = sharedFrameBuffer instanceof SharedArrayBuffer ? new Uint8Array(sharedFrameBuffer) : null;
  nativeHdrState.sharedControlView = sharedControlBuffer instanceof SharedArrayBuffer ? new Int32Array(sharedControlBuffer) : null;
  nativeHdrState.lastSharedFrameSeq = 0;
  nativeHdrState.pendingFrame = null;
  nativeHdrState.firstFrameReceived = false;
  nativeHdrState.startupDeadlineMs = performance.now() + HDR_NATIVE_STARTUP_NO_FRAME_TIMEOUT_MS;
  nativeHdrState.frameEndpoint = String(start.frameEndpoint || '');
  nativeHdrState.lastHttpFrameSeq = 0;
  nativeHdrState.runtimeLegacyRetryAttempted = routePreference === 'legacy';
  hdrMappingState.runtimeBackend = String(start.nativeBackend || '');
  hdrMappingState.runtimeTransportMode = normalizeHdrTransportMode(
    sharedBindOk ? 'shared-buffer' : (start.transportMode || 'http-fallback')
  );
  hdrMappingState.runtimeStage = String(start.pipelineStage || '') +
    (hdrMappingState.runtimeTransportMode ? ('/' + hdrMappingState.runtimeTransportMode) : '');
  hdrMappingState.fallbackLevel = Math.max(1, Number(start.fallbackLevel || 2));
  hdrMappingState.routePreference = normalizeHdrRoutePreference(start.requestedRoute || routePreference);

  ensureNativeHdrCanvas(nativeHdrState.width, nativeHdrState.height);
  setHdrRuntimeRoute(String(start.runtimeRoute || 'native-legacy'), null, hdrMappingState.runtimeTransportMode);

  await pollNativeHdrFrame();
  return { ok: true, start };
}

async function resolveCaptureRoute(sourceId, selectedDisplayId) {
  const mode = normalizeHdrMappingMode(hdrMappingState.mode);
  if (mode === 'off') {
    pushHdrDecisionTrace('resolve-route', { mode, route: 'fallback', reason: 'MODE_OFF' });
    setHdrProbeStatus('Probe: 模式關閉');
    return { route: 'fallback', reason: 'MODE_OFF' };
  }

  if (hdrMappingState.nativeEnvFlagEnabled && (!hdrMappingState.nativeSmokeOk || !hdrMappingState.nativeSmokeForSource)) {
    await ensureNativeSmokeReadyForAttempt(sourceId, selectedDisplayId);
  }

  if (!hdrMappingState.nativeRouteEnabled) {
    const disabledReason = hdrMappingState.nativeRouteReason || 'NATIVE_ROUTE_DISABLED';
    if (mode === 'force-native') {
      pushHdrDecisionTrace('resolve-route', { mode, route: 'blocked', reason: disabledReason });
      return {
        route: 'blocked',
        reason: disabledReason,
        message: 'Force Native 暫時停用：' + disabledReason
      };
    }
    pushHdrDecisionTrace('resolve-route', { mode, route: 'fallback', reason: disabledReason });
    noteHdrFallback(disabledReason);
    return { route: 'fallback', reason: disabledReason };
  }

  const probe = await probeHdrNativeSupport(sourceId, selectedDisplayId);
  if (!probe.supported) {
    if (mode === 'force-native') {
      pushHdrDecisionTrace('resolve-route', { mode, route: 'blocked', reason: probe.reason || 'NATIVE_UNAVAILABLE' });
      return {
        route: 'blocked',
        reason: probe.reason || 'NATIVE_UNAVAILABLE',
        message: probe.message || 'Force Native 但 native backend 不可用。'
      };
    }
    pushHdrDecisionTrace('resolve-route', { mode, route: 'fallback', reason: probe.reason || 'NATIVE_UNAVAILABLE' });
    noteHdrFallback(probe.reason || 'NATIVE_UNAVAILABLE');
    return { route: 'fallback', reason: probe.reason || 'NATIVE_UNAVAILABLE' };
  }

  if (mode === 'auto' && !probe.hdrActive) {
    pushHdrDecisionTrace('resolve-route', { mode, route: 'fallback', reason: probe.reason || 'HDR_INACTIVE' });
    noteHdrFallback(probe.reason || 'HDR_INACTIVE');
    return { route: 'fallback', reason: probe.reason || 'HDR_INACTIVE' };
  }

  const nativeStart = await tryStartNativeHdrCapture(sourceId, selectedDisplayId);
  if (nativeStart.ok) {
    pushHdrDecisionTrace('resolve-route', { mode, route: 'native', reason: 'NATIVE_OK' });
    return { route: 'native', reason: 'NATIVE_OK' };
  }

  const nonBlockingNativeFailure =
    nativeStart.reason === 'SHARED_START_CLONE_ERROR' ||
    nativeStart.reason === 'WORKER_CAPTURE_START_FAILED' ||
    /could not be cloned/i.test(String(nativeStart.message || ''));
  if (nonBlockingNativeFailure) {
    pushHdrDecisionTrace('resolve-route', { mode, route: 'fallback', reason: nativeStart.reason || 'START_FAILED' });
    setHdrProbeStatus('Probe: Native 暫停（共享記憶體 IPC 尚未完成）');
    noteHdrFallback(nativeStart.reason || 'START_FAILED');
    return { route: 'fallback', reason: nativeStart.reason || 'START_FAILED' };
  }

  if (mode === 'force-native') {
    pushHdrDecisionTrace('resolve-route', { mode, route: 'blocked', reason: nativeStart.reason || 'START_FAILED' });
    return {
      route: 'blocked',
      reason: nativeStart.reason || 'START_FAILED',
      message: nativeStart.message || 'Force Native 啟動失敗。'
    };
  }

  pushHdrDecisionTrace('resolve-route', { mode, route: 'fallback', reason: nativeStart.reason || 'START_FAILED' });
  noteHdrFallback(nativeStart.reason || 'START_FAILED');
  return { route: 'fallback', reason: nativeStart.reason || 'START_FAILED' };
}

async function buildCaptureStreams(sourceId, selectedDisplayId) {
  const decision = await resolveCaptureRoute(sourceId, selectedDisplayId);

  if (decision.route === 'blocked') {
    const reason = decision && decision.message ? String(decision.message) : 'Native HDR 路徑不可用。';
    await stopNativeHdrCapture();
    hdrMappingState.fallbackLevel = 3;
    sourceStream = await getDesktopStream(sourceId);
    applyQualityHints(sourceStream);
    micStream = await getMicStreamIfEnabled();
    rawVideo.srcObject = sourceStream;
    await rawVideo.play();
    setHdrRuntimeRoute('fallback', '目前路徑: Fallback（Native 不可用，自動回退）');
    setStatus('Native HDR 不可用，已自動回退既有錄影管線。原因: ' + reason);
    noteHdrFallback('BLOCKED_FALLBACK');
    return { route: 'fallback', reason: 'BLOCKED_FALLBACK' };
  }

  if (decision.route === 'native') {
    // Avoid desktop audio-only constraints here; on some Windows/Electron
    // builds this can trigger renderer termination (bad IPC message 263).
    sourceStream = await getDesktopStream(sourceId).catch(() => undefined);
    if (!sourceStream) {
      sourceStream = new MediaStream();
    }
    micStream = await getMicStreamIfEnabled();
    rawVideo.srcObject = null;
    rawVideo.load();
    return { route: 'native' };
  }

  await stopNativeHdrCapture();
  hdrMappingState.fallbackLevel = 3;
  sourceStream = await getDesktopStream(sourceId);
  applyQualityHints(sourceStream);
  micStream = await getMicStreamIfEnabled();
  rawVideo.srcObject = sourceStream;
  await rawVideo.play();
  setHdrRuntimeRoute('fallback', '目前路徑: Fallback（既有錄影）');
  updateHdrDiagStatus();
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
  if (!hdrMappingState.nativeRouteEnabled) {
    const reason = hdrMappingState.nativeRouteReason || 'NATIVE_ROUTE_DISABLED';
    const stage = hdrMappingState.nativeRouteStage ? ('，stage=' + hdrMappingState.nativeRouteStage) : '';
    setHdrProbeStatus('Probe: Native 停用（' + reason + stage + '）');
    return;
  }
  if (!(mediaRecorder && mediaRecorder.state === 'recording')) {
    setHdrRuntimeRoute('fallback', '目前路徑: 待命（實驗 Native 可用，尚未啟動擷取）');
  }
  await probeHdrNativeSupport(sourceId, selectedSource.display_id);
}

async function loadHdrExperimentalState() {
  const currentSource = getCurrentSelectedSource();
  const sourceId = String(currentSource && currentSource.id ? currentSource.id : '');
  const displayId = String(currentSource && currentSource.display_id ? currentSource.display_id : '');
  const result = await electronAPI.hdrExperimentalState({
    sourceId,
    displayId
  }).catch(() => null);
  if (!result || !result.ok) {
    hdrMappingState.nativeRouteEnabled = false;
    hdrMappingState.nativeRouteReason = 'HDR_EXPERIMENTAL_STATE_UNAVAILABLE';
    hdrMappingState.nativeRouteStage = '';
    hdrMappingState.runtimeBackend = '';
    hdrMappingState.runtimeStage = '';
    hdrMappingState.runtimeTransportMode = '';
    hdrMappingState.routePreference = 'auto';
    hdrMappingState.fallbackLevel = 3;
    hdrMappingState.mainSharedSessionCount = 0;
    hdrMappingState.mainTopFrameSeq = 0;
    hdrMappingState.mainTopReadFailures = 0;
    hdrMappingState.mainTopBindAttempts = 0;
    hdrMappingState.mainTopBindFailures = 0;
    hdrMappingState.mainTopLastBindReason = '';
    hdrMappingState.mainTopLastBindError = '';
    hdrMappingState.uiBindAttempts = 0;
    hdrMappingState.uiBindFailures = 0;
    hdrMappingState.uiBindLastReason = '';
    hdrMappingState.uiBindLastError = '';
    hdrMappingState.mainTopReadMsAvg = 0;
    hdrMappingState.mainTopCopyMsAvg = 0;
    hdrMappingState.mainTopSabWriteMsAvg = 0;
    hdrMappingState.mainTopBytesPerFrameAvg = 0;
    hdrMappingState.mainTopBytesPerSec = 0;
    hdrMappingState.mainTopPumpJitterMsAvg = 0;
    hdrMappingState.mainTopFrameIntervalMsAvg = 0;
    hdrMappingState.mainTopLastReason = '';
    hdrMappingState.mainTopLastError = '';
    hdrMappingState.nativeEnvFlag = '';
    hdrMappingState.nativeEnvFlagEnabled = false;
    hdrMappingState.nativeLiveEnvFlag = '';
    hdrMappingState.nativeLiveEnvFlagEnabled = false;
    hdrMappingState.wgcEnvFlag = '';
    hdrMappingState.wgcEnvFlagEnabled = false;
    hdrMappingState.nativeSmokeRan = false;
    hdrMappingState.nativeSmokeOk = false;
    hdrMappingState.nativeSmokeForSource = false;
    hdrMappingState.nativeSmokeReason = '';
    hdrMappingState.nativeSmokeAt = 0;
    updateHdrModeAvailabilityUi();
    updateHdrDiagStatus();
    return;
  }
  hdrMappingState.nativeRouteEnabled = Boolean(result.nativeRouteEnabled);
  hdrMappingState.nativeRouteReason = String(result.reason || (result.nativeRouteEnabled ? 'OK' : 'NATIVE_ROUTE_DISABLED'));
  hdrMappingState.nativeRouteStage = String(result.stage || '');
  hdrMappingState.runtimeStage = String(result.wgcStage || result.stage || '');
  hdrMappingState.runtimeTransportMode = '';
  hdrMappingState.routePreference = normalizeHdrRoutePreference(result.routePreference || hdrMappingState.routePreference);
  const diagnostics = result.diagnostics || {};
  const sessions = Array.isArray(diagnostics.sharedSessions) ? diagnostics.sharedSessions : [];
  const top = sessions.length > 0
    ? sessions.reduce((best, item) => {
      const bestSeq = Number(best && best.frameSeq ? best.frameSeq : 0);
      const itemSeq = Number(item && item.frameSeq ? item.frameSeq : 0);
      return itemSeq >= bestSeq ? item : best;
    }, sessions[0])
    : null;
  hdrMappingState.mainSharedSessionCount = Number(diagnostics.sharedSessionCount || sessions.length || 0);
  hdrMappingState.mainTopFrameSeq = Number(top && top.frameSeq ? top.frameSeq : 0);
  hdrMappingState.mainTopReadFailures = Number(top && top.totalReadFailures ? top.totalReadFailures : 0);
  hdrMappingState.mainTopBindAttempts = Number(top && top.bindAttempts ? top.bindAttempts : 0);
  hdrMappingState.mainTopBindFailures = Number(top && top.bindFailures ? top.bindFailures : 0);
  hdrMappingState.mainTopLastBindReason = String((top && top.lastBindReason) || '');
  hdrMappingState.mainTopLastBindError = String((top && top.lastBindError) || '');
  hdrMappingState.mainTopReadMsAvg = Number(top && top.perf && top.perf.readMsAvg ? top.perf.readMsAvg : 0);
  hdrMappingState.mainTopCopyMsAvg = Number(top && top.perf && top.perf.copyMsAvg ? top.perf.copyMsAvg : 0);
  hdrMappingState.mainTopSabWriteMsAvg = Number(top && top.perf && top.perf.sabWriteMsAvg ? top.perf.sabWriteMsAvg : 0);
  hdrMappingState.mainTopBytesPerFrameAvg = Number(top && top.perf && top.perf.bytesPerFrameAvg ? top.perf.bytesPerFrameAvg : 0);
  hdrMappingState.mainTopBytesPerSec = Number(top && top.perf && top.perf.bytesPerSec ? top.perf.bytesPerSec : 0);
  hdrMappingState.mainTopPumpJitterMsAvg = Number(top && top.perf && top.perf.pumpJitterMsAvg ? top.perf.pumpJitterMsAvg : 0);
  hdrMappingState.mainTopFrameIntervalMsAvg = Number(top && top.perf && top.perf.frameIntervalMsAvg ? top.perf.frameIntervalMsAvg : 0);
  hdrMappingState.mainTopLastReason = String((top && top.lastReason) || '');
  hdrMappingState.mainTopLastError = String((top && top.lastError) || '');
  if (top && top.runtimeRoute) {
    const topTransportMode = normalizeHdrTransportMode(top.transportMode || '') ||
      (top.supportsSharedFrameRead ? 'shared-buffer' : '');
    hdrMappingState.runtimeTransportMode = topTransportMode;
    hdrMappingState.runtimeStage = String((top.pipelineStage || '') + (topTransportMode ? ('/' + topTransportMode) : '')) || hdrMappingState.runtimeStage;
    setHdrRuntimeRoute(String(top.runtimeRoute || hdrMappingState.runtimeRoute || 'fallback'), null, topTransportMode);
  }
  hdrMappingState.runtimeBackend = String((top && top.nativeBackend) || '');
  hdrMappingState.fallbackLevel = Number((top && top.fallbackLevel) || hdrMappingState.fallbackLevel || 3);
  hdrMappingState.nativeEnvFlag = String(result.envFlag || '');
  hdrMappingState.nativeEnvFlagEnabled = Boolean(result.envFlagEnabled);
  hdrMappingState.nativeLiveEnvFlag = String(result.liveEnvFlag || '');
  hdrMappingState.nativeLiveEnvFlagEnabled = Boolean(result.liveEnvFlagEnabled);
  hdrMappingState.wgcEnvFlag = String(result.wgcEnvFlag || '');
  hdrMappingState.wgcEnvFlagEnabled = Boolean(result.wgcEnvFlagEnabled);
  hdrMappingState.nativeSmokeRan = Boolean(result.smoke && result.smoke.ran);
  hdrMappingState.nativeSmokeOk = Boolean(result.smoke && result.smoke.ok);
  hdrMappingState.nativeSmokeForSource = Boolean(result.smokeMatchesRequestedSource);
  hdrMappingState.nativeSmokeReason = String((result.smoke && (result.smoke.readReason || result.smoke.startReason || result.smoke.stopReason)) || '');
  hdrMappingState.nativeSmokeAt = Number(result.smoke && result.smoke.timestamp ? result.smoke.timestamp : 0);
  updateHdrModeAvailabilityUi();
  updateHdrDiagStatus();

  const shouldAutoSmoke =
    hdrMappingState.nativeEnvFlagEnabled &&
    (!hdrMappingState.nativeSmokeRan || !hdrMappingState.nativeSmokeForSource) &&
    !(mediaRecorder && mediaRecorder.state === 'recording') &&
    Date.now() >= hdrSmokeAutoSuspendUntilMs &&
    !hdrSmokeAutoRunning &&
    getCurrentSelectedSource() &&
    String(getCurrentSelectedSource().id || '') !== '';
  if (shouldAutoSmoke) {
    hdrSmokeAutoRunning = true;
    runHdrNativeSmokeFromUi()
      .catch(() => null)
      .then(() => loadHdrExperimentalState().catch(() => null))
      .finally(() => {
        hdrSmokeAutoRunning = false;
      });
  }
}

function startHdrExperimentalStatePoll() {
  clearInterval(hdrExperimentalPollTimer);
  hdrExperimentalPollTimer = setInterval(() => {
    loadHdrExperimentalState().catch(() => {});
  }, 2000);
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
  let preselectedOutputPath = '';
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
      preselectedOutputPath = String(picked.path || '');

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
        setStatus(preselectedOutputPath ? '沿用先前儲存位置...' : '請選擇儲存位置...');
        const openPayload = preselectedOutputPath
          ? {
              mode: 'path',
              filePath: preselectedOutputPath,
              ext: recordingMeta.outputExt,
              route: 'save-file'
            }
          : {
              mode: 'save',
              title: '儲存影片',
              baseName: `cursorcine-${timestamp}`,
              ext: recordingMeta.outputExt,
              route: 'save-file'
            };
        preopenedSaveSession = await electronAPI.blobUploadOpen(openPayload);

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
  setStatus('正在啟動錄影...');
  resetHdrDiagForRecordingAttempt();
  if (editorState.active) {
    clearEditorState();
  }

  let sourceId = String(sourceSelect && sourceSelect.value ? sourceSelect.value : '');
  selectedSource = sources.find((s) => s.id === sourceId);
  if (!sourceId || !selectedSource) {
    await loadSources().catch(() => {});
    sourceId = String(sourceSelect && sourceSelect.value ? sourceSelect.value : '');
    selectedSource = sources.find((s) => s.id === sourceId) || selectedSource;
  }

  if (!selectedSource) {
    setStatus('請先選擇錄製來源');
    return;
  }

  await loadHdrExperimentalState().catch(() => {});
  if (hdrMappingState.nativeEnvFlagEnabled && !hdrMappingState.nativeSmokeOk) {
    await ensureNativeSmokeReadyForAttempt(sourceId, selectedSource.display_id).catch(() => {});
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

  const captureRoute = await withTimeout(
    buildCaptureStreams(sourceId, selectedSource.display_id),
    12000,
    '擷取來源初始化逾時，請重新整理來源後再試。'
  );

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
  cursorUpdateInFlight = false;
  cursorTimer = setInterval(updateCursorFromMain, 16);

  cancelAnimationFrame(drawTimer);
  drawTimer = 0;
  lastDrawNow = 0;
  lastDrawnNativeFrameCount = 0;
  lastDrawnViewportX = 0;
  lastDrawnViewportY = 0;
  lastDrawnZoom = 1;
  lastDrawnGlowX = 0;
  lastDrawnGlowY = 0;
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

  const runtimeRoute = String((hdrMappingState && hdrMappingState.runtimeRoute) || (captureRoute && captureRoute.route) || 'fallback');
  hdrMappingState.runtimeRoute = runtimeRoute;
  refreshRecordingStatusLine();
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
  cancelAnimationFrame(drawTimer);
  cursorTimer = 0;
  drawTimer = 0;
  cursorUpdateInFlight = false;
  lastDrawNow = 0;
  lastDrawnNativeFrameCount = 0;
  lastDrawnViewportX = 0;
  lastDrawnViewportY = 0;
  lastDrawnZoom = 1;
  lastDrawnGlowX = 0;
  lastDrawnGlowY = 0;
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
      const interactionMode = String(mode.interactionMode || annotationState.interactionMode || 'stable');
      annotationState.interactionMode = interactionMode === 'smooth' ? 'smooth' : 'stable';
      if (penInteractionModeSelect) {
        penInteractionModeSelect.value = annotationState.interactionMode;
      }
      const wheelPauseMs = Number(mode.wheelPauseMs || 0);
      penToggleBtn.textContent = '畫筆模式: 開（Ctrl 開啟；雙按 Ctrl 關閉；滾輪暫停 ' + wheelPauseMs + 'ms）';
      refreshRecordingStatusLine();
      return;
    }
  } catch (_error) {
  }

  penToggleBtn.textContent = enabled ? '畫筆模式: 開（Ctrl 開啟；雙按 Ctrl 關閉）' : '畫筆模式: 關';
  refreshRecordingStatusLine();
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

if (copyHdrDiagBtn) {
  copyHdrDiagBtn.addEventListener('click', () => {
    copyHdrDiagnosticsSnapshot()
      .then(() => {
        setStatus('HDR 診斷已複製到剪貼簿。');
      })
      .catch((error) => {
        setStatus('複製 HDR 診斷失敗: ' + (error && error.message ? error.message : String(error)));
      });
  });
}

if (runHdrSmokeBtn) {
  runHdrSmokeBtn.addEventListener('click', () => {
    if (hdrSmokeManualRunning) {
      return;
    }
    hdrSmokeManualRunning = true;
    updateHdrModeAvailabilityUi();
    setStatus('正在執行 Native smoke...');
    runHdrNativeSmokeFromUi()
      .then(async (result) => {
        await loadHdrExperimentalState().catch(() => {});
        const ok = Boolean(result && result.ok);
        const summary = 'start=' + (result && result.startOk ? 'ok' : 'fail') +
          ', read=' + (result && result.readOk ? 'ok' : 'fail') +
          ', stop=' + (result && result.stopOk ? 'ok' : 'fail');
        setStatus((ok ? 'Native smoke 成功。' : 'Native smoke 失敗。') + ' ' + summary);
        updateHdrDiagStatus();
      })
      .catch((error) => {
        setStatus('Native smoke 失敗: ' + (error && error.message ? error.message : String(error)));
      })
      .finally(() => {
        hdrSmokeManualRunning = false;
        updateHdrModeAvailabilityUi();
      });
  });
}

sourceSelect.addEventListener('change', () => {
  selectedSource = sources.find((s) => s.id === sourceSelect.value);
  markSmokeStaleForSourceChange();
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

if (penInteractionModeSelect) {
  penInteractionModeSelect.addEventListener('change', async () => {
    const selectedMode = String(penInteractionModeSelect.value || 'stable').toLowerCase() === 'smooth' ? 'smooth' : 'stable';
    annotationState.interactionMode = selectedMode;
    const result = await electronAPI.overlaySetInteractionMode(selectedMode).catch(() => null);
    if (result && result.ok) {
      annotationState.interactionMode = String(result.interactionMode || selectedMode) === 'smooth' ? 'smooth' : 'stable';
      penInteractionModeSelect.value = annotationState.interactionMode;
      if (annotationState.enabled) {
        const wheelPauseMs = Number(result.wheelPauseMs || 0);
        penToggleBtn.textContent = '畫筆模式: 開（Ctrl 開啟；雙按 Ctrl 關閉；滾輪暫停 ' + wheelPauseMs + 'ms）';
      }
    }
    refreshRecordingStatusLine();
  });
}

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
  setStatus('正在啟動錄影...');
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
if (penInteractionModeSelect) {
  penInteractionModeSelect.value = annotationState.interactionMode;
}
setPenMode(true).catch(() => {});
annotationState.color = penColorInput.value || DEFAULT_PEN_COLOR;
annotationState.size = Number(penSizeInput.value || DEFAULT_PEN_SIZE);
hdrMappingState.mode = normalizeHdrMappingMode((hdrMappingModeSelect && hdrMappingModeSelect.value) || hdrMappingState.mode);
hdrCompState.enabled = Boolean(hdrCompEnable.checked);
hdrCompState.strength = clamp(Number(hdrCompStrengthInput.value || DEFAULT_HDR_COMP_STRENGTH), -1, 1);
hdrCompState.hue = clamp(Number(hdrCompHueInput.value || DEFAULT_HDR_COMP_HUE), -30, 30);
hdrCompState.rolloff = clamp(Number(hdrCompRolloffInput.value || DEFAULT_HDR_COMP_ROLLOFF), 0, 1);
hdrCompState.sharpness = clamp(Number(hdrCompSharpnessInput.value || DEFAULT_HDR_COMP_SHARPNESS), 0, 1);
updateHdrModeAvailabilityUi();

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
updateHdrDiagStatus('Diag: 初始化中');

Promise.resolve()
  .then(() => loadHdrExperimentalState())
  .then(() => loadSources())
  .catch((error) => {
  console.error(error);
  setStatus(`初始化失敗: ${error.message}`);
});

if (!runtimeElectronAPI) {
  recordBtn.disabled = true;
  refreshBtn.disabled = true;
  stopBtn.disabled = true;
  setStatus('初始化失敗: preload 未載入（electronAPI 缺失）');
}

electronAPI.onExportPhase((payload) => {
  if (!payload || payload.phase !== 'processing-start') {
    return;
  }
  startExportTimer();
});

updateExportTimeLabel(0);
startHdrExperimentalStatePoll();
