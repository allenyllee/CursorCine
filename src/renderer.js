/* global electronAPI */

const sourceSelect = document.getElementById('sourceSelect');
const refreshBtn = document.getElementById('refreshBtn');
const recordBtn = document.getElementById('recordBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const previewCanvas = document.getElementById('previewCanvas');
const rawVideo = document.getElementById('rawVideo');
const zoomInput = document.getElementById('zoomInput');
const smoothInput = document.getElementById('smoothInput');
const micInput = document.getElementById('micInput');
const formatSelect = document.getElementById('formatSelect');
const qualitySelect = document.getElementById('qualitySelect');
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
const CLICK_ZOOM_IN_SLOWDOWN = 0.55;
const PEN_HOLD_ZOOM_RATIO = 0.45;
const PEN_HOLD_DELAY_MS = 180;
const DOUBLE_CLICK_MAX_WINDOW_MS = 320;
const DOUBLE_CLICK_MARKER_MS = 700;
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
  smooth: { label: '流暢', videoBitrate: 12000000, audioBitrate: 192000 },
  balanced: { label: '平衡', videoBitrate: 22000000, audioBitrate: 256000 },
  high: { label: '高畫質', videoBitrate: 35000000, audioBitrate: 384000 }
};
const DEFAULT_QUALITY_PRESET = 'balanced';

let sources = [];
let sourceStream;
let micStream;
let outputStream;
let mediaRecorder;
let chunks = [];
let drawTimer = 0;
const DRAW_INTERVAL_MS = 16;
let cursorTimer = 0;
let selectedSource;

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
  forceMaxUntil: 0
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

const viewState = {
  sx: 0,
  sy: 0,
  cropW: 1,
  cropH: 1,
  outputW: 1,
  outputH: 1
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getQualityPreset() {
  const key = qualitySelect?.value || DEFAULT_QUALITY_PRESET;
  return QUALITY_PRESETS[key] || QUALITY_PRESETS[DEFAULT_QUALITY_PRESET];
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

function triggerTemporaryZoom(x, y, targetZoom = cameraState.maxZoom) {
  cameraState.targetX = x;
  cameraState.targetY = y;
  cameraState.targetZoom = targetZoom;
  cameraState.zoomHoldUntil = performance.now() + CLICK_ZOOM_HOLD_MS;
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
  const w = rawVideo.videoWidth;
  const h = rawVideo.videoHeight;
  if (!w || !h) {
    return;
  }

  if (previewCanvas.width !== w || previewCanvas.height !== h) {
    previewCanvas.width = w;
    previewCanvas.height = h;
  }
}

async function loadSources() {
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
    cameraState.targetX = cursorPoint.x;
    cameraState.targetY = cursorPoint.y;

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

        clickState.lastZoomTriggerTs = clickTs;
        clickState.holdDelayUntil = performance.now() + PEN_HOLD_DELAY_MS;
        clickState.forceMaxUntil = isDoubleClick ? performance.now() + CLICK_ZOOM_HOLD_MS : 0;

        triggerTemporaryZoom(clickPoint.x, clickPoint.y, isDoubleClick ? cameraState.maxZoom : getPenHoldZoom());
        if (isDoubleClick) {
          electronAPI.overlayDoubleClickMarker({ x: clickInfo.x, y: clickInfo.y }).catch(() => {
            triggerDoubleClickMarker(clickPoint.x, clickPoint.y);
          });
        }
      }

      if (clickInfo && clickInfo.mouseDown && performance.now() >= clickState.holdDelayUntil && performance.now() >= clickState.forceMaxUntil) {
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

function drawLoop() {
  if (!sourceStream) {
    return;
  }

  resizeCanvasToSource();

  const now = performance.now();
  if (now > cameraState.zoomHoldUntil) {
    cameraState.targetZoom = 1;
  }

  const smooth = cameraState.smoothing;
  const zoomSmooth = cameraState.targetZoom > cameraState.zoom
    ? smooth * CLICK_ZOOM_IN_SLOWDOWN
    : smooth;

  cameraState.zoom += (cameraState.targetZoom - cameraState.zoom) * zoomSmooth;
  cameraState.viewportX += (cameraState.targetX - cameraState.viewportX) * smooth;
  cameraState.viewportY += (cameraState.targetY - cameraState.viewportY) * smooth;

  glowState.x += (cameraState.cursorX - glowState.x) * glowState.lag;
  glowState.y += (cameraState.cursorY - glowState.y) * glowState.lag;

  const sw = rawVideo.videoWidth;
  const sh = rawVideo.videoHeight;
  if (!sw || !sh) {
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
  ctx.drawImage(rawVideo, sx, sy, cropW, cropH, 0, 0, sw, sh);
  ctx.filter = 'none';

  if (hdrCompState.enabled) {
    const sharpness = clamp(hdrCompState.sharpness, 0, 1);
    if (sharpness > 0.01) {
      ctx.globalAlpha = sharpness * 0.12;
      ctx.globalCompositeOperation = 'overlay';
      ctx.filter = 'contrast(' + (1 + sharpness * 0.45).toFixed(3) + ')';
      ctx.drawImage(rawVideo, sx, sy, cropW, cropH, 0, 0, sw, sh);
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

function downloadBlob(blob, ext) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = url;
  a.download = `cursorcine-${timestamp}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportRecording(blob) {
  if (recordingMeta.requestedFormat === 'mp4' && recordingMeta.fallbackFromMp4) {
    setStatus('錄影已停止，正在用 ffmpeg 轉為 MP4...');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const result = await electronAPI.convertWebmToMp4(bytes, `cursorcine-${timestamp}`);

    if (result.ok) {
      setStatus('錄影已停止，MP4 轉檔完成');
      return;
    }

    if (result.reason === 'CANCELED') {
      setStatus('已取消儲存 MP4');
      return;
    }

    downloadBlob(blob, 'webm');
    setStatus(`MP4 轉檔失敗，已改下載 WebM: ${result.message}`);
    return;
  }

  downloadBlob(blob, recordingMeta.outputExt);
  setStatus('錄影已停止，檔案已下載');
}

function syncPenStyleToOverlay() {
  return electronAPI.overlaySetPenStyle({
    color: annotationState.color,
    size: annotationState.size
  }).catch(() => {});
}

async function startRecording() {
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
    forceMaxUntil: 0
  };

  doubleClickMarkerState.activeUntil = 0;

  sourceStream = await getDesktopStream(sourceId);
  applyQualityHints(sourceStream);
  micStream = await getMicStreamIfEnabled();

  rawVideo.srcObject = sourceStream;
  await rawVideo.play();

  cameraState.cursorX = rawVideo.videoWidth / 2;
  cameraState.cursorY = rawVideo.videoHeight / 2;
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

  chunks = [];
  const requestedFormat = formatSelect.value;
  const qualityPreset = getQualityPreset();
  const recorderConfig = pickRecorderConfig(requestedFormat);
  recordingMeta = {
    outputExt: recorderConfig.ext,
    outputMimeType: recorderConfig.mimeType || (recorderConfig.ext === 'mp4' ? 'video/mp4' : 'video/webm'),
    requestedFormat,
    fallbackFromMp4: Boolean(recorderConfig.fallbackFromMp4)
  };

  mediaRecorder = createMediaRecorder(outputStream, recorderConfig, qualityPreset);

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  mediaRecorder.onstop = async () => {
    const blob = new Blob(chunks, { type: recordingMeta.outputMimeType });
    await exportRecording(blob);
  };

  mediaRecorder.start();

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
  qualitySelect.disabled = true;

  const hasSystemAudio = sourceStream.getAudioTracks().length > 0;
  const hasMicAudio = Boolean(micStream && micStream.getAudioTracks().length > 0);
  const audioMode = hasSystemAudio || hasMicAudio
    ? `音訊: ${hasSystemAudio ? '喇叭輸出' : ''}${hasSystemAudio && hasMicAudio ? ' + ' : ''}${hasMicAudio ? '麥克風' : ''} (已混音 + 增益)`
    : '音訊: 無';

  setStatus('錄影中: 可在原始畫面畫筆標註（Ctrl 單擊切換繪製，滾輪會短暫暫停畫筆） | 畫質: ' + qualityPreset.label + ' (' + audioMode + ')');
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }

  stopMediaTracks(sourceStream);
  stopMediaTracks(micStream);
  stopMediaTracks(outputStream);
  resetAudioMixer();

  sourceStream = undefined;
  micStream = undefined;
  outputStream = undefined;
  mediaRecorder = undefined;
  selectedSource = undefined;

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
  qualitySelect.disabled = false;
}

async function setPenMode(enabled) {
  annotationState.enabled = enabled;
  penToggleBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');

  try {
    const mode = await electronAPI.overlaySetEnabled(enabled);
    if (enabled && mode && mode.toggleMode) {
      const pauseMs = Number(mode.wheelPauseMs || 250);
      penToggleBtn.textContent = '畫筆模式: 開（Ctrl 單擊切換；滾輪暫停 250ms）';
      return;
    }
  } catch (_error) {
  }

  penToggleBtn.textContent = enabled ? '畫筆模式: 開（Ctrl 單擊切換）' : '畫筆模式: 關';
}

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

setPenMode(true).catch(() => {});
annotationState.color = penColorInput.value || DEFAULT_PEN_COLOR;
annotationState.size = Number(penSizeInput.value || DEFAULT_PEN_SIZE);
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

loadSources().catch((error) => {
  console.error(error);
  setStatus(`初始化失敗: ${error.message}`);
});
