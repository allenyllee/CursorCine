const path = require("path");
const NATIVE_COMPRESSED_FRAME_ENABLED = String(process.env.CURSORCINE_ENABLE_HDR_NATIVE_COMPRESSED_FRAME || "0") === "1";
let workerNativeImage = null;
try {
  // Electron utility process may expose nativeImage for fast JPEG encoding.
  // eslint-disable-next-line global-require
  const electronMod = require("electron");
  if (electronMod && electronMod.nativeImage) {
    workerNativeImage = electronMod.nativeImage;
  }
} catch (_error) {
  workerNativeImage = null;
}

const state = {
  initialized: false,
  startedAt: Date.now(),
  session: null,
  frameSeq: 0,
  lastFrameAt: 0,
  lastFrameMeta: {
    width: 0,
    height: 0,
    stride: 0,
    pixelFormat: "BGRA8",
  },
  latestFrameBytes: null,
  sharedFrameBuffer: null,
  sharedControlBuffer: null,
  sharedFrameView: null,
  sharedControlView: null,
  pumpTimer: 0,
  bridge: null,
  bridgeKind: "",
  bridgeError: "",
  pumpIntervalMs: 16,
  readTimeoutMs: 40,
  noFrameStreak: 0,
  reusableFrameBuffer: null,
  reusableFrameLength: 0,
  perf: {
    readMsAvg: 0,
    copyMsAvg: 0,
    sabWriteMsAvg: 0,
    bytesPerFrameAvg: 0,
    bytesPerSec: 0,
    pumpJitterMsAvg: 0,
    frameIntervalMsAvg: 0,
    previewEncodeMsAvg: 0,
    previewBytesPerFrameAvg: 0,
    previewDroppedByBackpressure: 0,
    previewJitterMsAvg: 0,
    lastPumpAt: 0,
    lastFrameAt: 0,
  },
  preview: {
    enabled: false,
    nativeCompressedEnabled: false,
    nativeCompressedAvailable: false,
    nativeCompressedActive: false,
    nativeCompressedFallbackReason: "",
    codec: "jpeg",
    quality: 78,
    configuredQuality: 78,
    maxFps: 20,
    maxWidth: 1920,
    maxHeight: 1200,
    configuredMaxWidth: 1920,
    configuredMaxHeight: 1200,
    frameStep: 1,
    maxFrameStep: 4,
    latestSeq: 0,
    latestTimestampMs: 0,
    latestWidth: 0,
    latestHeight: 0,
    latestMime: "image/jpeg",
    latestBytes: null,
    lastEncodedSeq: 0,
    lastEncodedAt: 0,
    lastFrameTimestampMs: 0,
  },
};

const CONTROL_INDEX = {
  STATUS: 0,
  FRAME_SEQ: 1,
  WIDTH: 2,
  HEIGHT: 3,
  STRIDE: 4,
  BYTE_LENGTH: 5,
  TS_LOW: 6,
  TS_HIGH: 7,
  PIXEL_FORMAT: 8,
};

function encodePixelFormat(value) {
  const fmt = String(value || "").trim().toUpperCase();
  if (fmt === "BGRA8") {
    return 2;
  }
  return 1; // RGBA8 default
}

function emit(message) {
  const payload = message || {};
  if (process.parentPort && typeof process.parentPort.postMessage === "function") {
    process.parentPort.postMessage(payload);
    return;
  }
  if (typeof process.send === "function") {
    process.send(payload);
  }
}

function response(requestId, ok, payload = {}) {
  emit({
    type: "response",
    requestId: Number(requestId || 0),
    ok: Boolean(ok),
    ...payload,
  });
}

function normalizeRoutePreference(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "wgc" || v === "legacy" || v === "auto") {
    return v;
  }
  return "auto";
}

function loadBridge(routePreference = "auto") {
  if (process.platform !== "win32") {
    state.bridge = null;
    state.bridgeKind = "";
    state.bridgeError = "NOT_WINDOWS";
    return null;
  }
  const requested = normalizeRoutePreference(routePreference);
  const candidates = requested === "legacy" ? ["legacy", "wgc"] : ["wgc", "legacy"];
  if (state.bridge && candidates.includes(state.bridgeKind)) {
    return state.bridge;
  }
  state.bridge = null;
  state.bridgeKind = "";
  state.bridgeError = "";
  for (const candidate of candidates) {
    const modulePath =
      candidate === "wgc"
        ? path.join(__dirname, "..", "native", "windows-wgc-hdr-capture")
        : path.join(__dirname, "..", "native", "windows-hdr-capture");
    try {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      const bridge = require(modulePath);
      state.bridge = bridge;
      state.bridgeKind = candidate;
      state.bridgeError = "";
      return bridge;
    } catch (error) {
      state.bridge = null;
      state.bridgeKind = "";
      state.bridgeError = error && error.message ? error.message : "load failed";
    }
  }
  return null;
}

function clearPumpTimer() {
  clearTimeout(state.pumpTimer);
  state.pumpTimer = 0;
}

function ewma(prev, sample, alpha = 0.2) {
  const p = Number(prev || 0);
  const s = Number(sample || 0);
  if (!Number.isFinite(s) || s <= 0) {
    return p;
  }
  return p > 0 ? (p * (1 - alpha) + s * alpha) : s;
}

function toStableBuffer(bytes) {
  if (!bytes || !bytes.length) {
    return null;
  }
  if (Buffer.isBuffer(bytes)) {
    return bytes;
  }
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const required = Number(input.length || 0);
  if (!state.reusableFrameBuffer || state.reusableFrameBuffer.length < required) {
    state.reusableFrameBuffer = Buffer.allocUnsafe(required);
  }
  state.reusableFrameBuffer.set(input.subarray(0, required), 0);
  state.reusableFrameLength = required;
  return state.reusableFrameBuffer.subarray(0, state.reusableFrameLength);
}

function rgbaToBgraBuffer(input) {
  const src = Buffer.isBuffer(input) ? input : Buffer.from(input || []);
  const out = Buffer.allocUnsafe(src.length);
  for (let i = 0; i + 3 < src.length; i += 4) {
    out[i] = src[i + 2];
    out[i + 1] = src[i + 1];
    out[i + 2] = src[i];
    out[i + 3] = src[i + 3];
  }
  return out;
}

function tunePreviewQualityAndScale() {
  const encodeMs = Number(state.perf.previewEncodeMsAvg || 0);
  if (!Number.isFinite(encodeMs) || encodeMs <= 0) {
    return;
  }
  const minQuality = 40;
  const minWidth = 640;
  const minHeight = 360;
  const slowThresholdMs = 24;
  const fastThresholdMs = 12;

  if (encodeMs > slowThresholdMs) {
    state.preview.frameStep = Math.min(state.preview.maxFrameStep, Number(state.preview.frameStep || 1) + 1);
    state.preview.quality = Math.max(minQuality, Number(state.preview.quality || minQuality) - 4);
    state.preview.maxWidth = Math.max(minWidth, Math.floor(Number(state.preview.maxWidth || minWidth) * 0.9));
    state.preview.maxHeight = Math.max(minHeight, Math.floor(Number(state.preview.maxHeight || minHeight) * 0.9));
    return;
  }
  if (encodeMs < fastThresholdMs) {
    state.preview.frameStep = Math.max(1, Number(state.preview.frameStep || 1) - 1);
    state.preview.quality = Math.min(
      Number(state.preview.configuredQuality || 58),
      Number(state.preview.quality || minQuality) + 2
    );
    state.preview.maxWidth = Math.min(
      Number(state.preview.configuredMaxWidth || 1280),
      Math.ceil(Number(state.preview.maxWidth || minWidth) * 1.05)
    );
    state.preview.maxHeight = Math.min(
      Number(state.preview.configuredMaxHeight || 800),
      Math.ceil(Number(state.preview.maxHeight || minHeight) * 1.05)
    );
  }
}

function encodePreviewFrame(result, rawBytes) {
  if (state.preview.nativeCompressedEnabled && state.preview.nativeCompressedAvailable) {
    return;
  }
  if (!state.preview.enabled || !workerNativeImage || typeof workerNativeImage.createFromBitmap !== "function") {
    return;
  }
  if (!rawBytes || !rawBytes.length) {
    return;
  }
  const minIntervalMs = Math.max(1, Math.round(1000 / Math.max(1, Number(state.preview.maxFps || 20))));
  const now = Date.now();
  if (state.preview.lastEncodedAt > 0 && (now - state.preview.lastEncodedAt) < minIntervalMs) {
    return;
  }
  const nextSeq = Number(state.frameSeq || 0);
  if (nextSeq <= Number(state.preview.lastEncodedSeq || 0)) {
    return;
  }
  const frameStep = Math.max(1, Number(state.preview.frameStep || 1));
  if ((nextSeq - Number(state.preview.lastEncodedSeq || 0)) < frameStep) {
    return;
  }

  const width = Math.max(1, Number(result && result.width ? result.width : state.lastFrameMeta.width || 1));
  const height = Math.max(1, Number(result && result.height ? result.height : state.lastFrameMeta.height || 1));
  const stride = Math.max(width * 4, Number(result && result.stride ? result.stride : state.lastFrameMeta.stride || width * 4));
  const rowBytes = width * 4;
  const expectedBytes = Math.max(1, stride * height);
  const sourceBytes = rawBytes.length >= expectedBytes
    ? rawBytes.subarray(0, expectedBytes)
    : rawBytes;
  let packedRgba = null;
  if (stride === rowBytes) {
    packedRgba = sourceBytes.length >= (rowBytes * height)
      ? sourceBytes.subarray(0, rowBytes * height)
      : sourceBytes;
  } else {
    packedRgba = Buffer.allocUnsafe(rowBytes * height);
    for (let row = 0; row < height; row += 1) {
      const srcOffset = row * stride;
      const dstOffset = row * rowBytes;
      const copyBytes = Math.max(0, Math.min(rowBytes, sourceBytes.length - srcOffset));
      if (copyBytes > 0) {
        sourceBytes.copy(packedRgba, dstOffset, srcOffset, srcOffset + copyBytes);
      }
      if (copyBytes < rowBytes) {
        packedRgba.fill(0, dstOffset + copyBytes, dstOffset + rowBytes);
      }
    }
  }
  const pixelFormat = String(result && result.pixelFormat ? result.pixelFormat : state.lastFrameMeta.pixelFormat || "BGRA8").toUpperCase();
  const encodeStartMs = Number(process.hrtime.bigint()) / 1e6;
  const bgra = pixelFormat === "BGRA8" ? packedRgba : rgbaToBgraBuffer(packedRgba);
  let image = workerNativeImage.createFromBitmap(bgra, {
    width,
    height,
    scaleFactor: 1,
  });

  const maxWidth = Math.max(320, Math.min(2560, Number(state.preview.maxWidth || 1280) || 1280));
  const maxHeight = Math.max(180, Math.min(1440, Number(state.preview.maxHeight || 800) || 800));
  let targetWidth = width;
  let targetHeight = height;
  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    targetWidth = Math.max(2, Math.floor(width * ratio));
    targetHeight = Math.max(2, Math.floor(height * ratio));
    image = image.resize({
      width: targetWidth,
      height: targetHeight,
      quality: "good",
    });
  }
  const quality = Math.max(40, Math.min(95, Number(state.preview.quality || 58) || 58));
  const jpegBytes = image.toJPEG(quality);
  if (!Buffer.isBuffer(jpegBytes) || jpegBytes.length <= 0) {
    return;
  }
  const encodeEndMs = Number(process.hrtime.bigint()) / 1e6;
  if (nextSeq > Number(state.preview.lastEncodedSeq || 0) + 1) {
    state.perf.previewDroppedByBackpressure += nextSeq - Number(state.preview.lastEncodedSeq || 0) - 1;
  }
  const frameTs = Number(result && result.timestampMs ? result.timestampMs : now);
  if (state.preview.lastFrameTimestampMs > 0) {
    const delta = Math.max(1, frameTs - state.preview.lastFrameTimestampMs);
    state.perf.previewJitterMsAvg = ewma(state.perf.previewJitterMsAvg, Math.abs(delta - minIntervalMs));
  }
  state.preview.lastFrameTimestampMs = frameTs;
  state.preview.lastEncodedSeq = nextSeq;
  state.preview.lastEncodedAt = now;
  state.preview.latestSeq = nextSeq;
  state.preview.latestTimestampMs = frameTs;
  state.preview.latestWidth = targetWidth;
  state.preview.latestHeight = targetHeight;
  state.preview.latestMime = "image/jpeg";
  state.preview.latestBytes = jpegBytes;
  state.perf.previewEncodeMsAvg = ewma(state.perf.previewEncodeMsAvg, encodeEndMs - encodeStartMs);
  state.perf.previewBytesPerFrameAvg = ewma(state.perf.previewBytesPerFrameAvg, Number(jpegBytes.length || 0));
  tunePreviewQualityAndScale();
}

function ensureSharedBuffers(frameByteLength) {
  const safeLength = Math.max(1024 * 1024, Number(frameByteLength || 0));
  if (!state.sharedFrameBuffer || !state.sharedFrameView || state.sharedFrameView.length < safeLength) {
    state.sharedFrameBuffer = new SharedArrayBuffer(safeLength);
    state.sharedFrameView = new Uint8Array(state.sharedFrameBuffer);
  }
  if (!state.sharedControlBuffer || !state.sharedControlView) {
    state.sharedControlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 16);
    state.sharedControlView = new Int32Array(state.sharedControlBuffer);
    state.sharedControlView.fill(0);
  }
}

function writeFrameToSharedBuffer(result, bytes) {
  if (!bytes || !bytes.length) {
    return;
  }
  const t0 = Number(process.hrtime.bigint()) / 1e6;
  ensureSharedBuffers(bytes.length);
  const len = Math.min(bytes.length, state.sharedFrameView.length);
  state.sharedFrameView.set(bytes.subarray(0, len), 0);

  const seq = state.frameSeq;
  const ts = Number(result && result.timestampMs ? result.timestampMs : Date.now());
  const tsLow = ts >>> 0;
  const tsHigh = Math.floor(ts / 4294967296) >>> 0;

  Atomics.store(state.sharedControlView, CONTROL_INDEX.WIDTH, Number(result && result.width ? result.width : 0));
  Atomics.store(state.sharedControlView, CONTROL_INDEX.HEIGHT, Number(result && result.height ? result.height : 0));
  Atomics.store(state.sharedControlView, CONTROL_INDEX.STRIDE, Number(result && result.stride ? result.stride : 0));
  Atomics.store(state.sharedControlView, CONTROL_INDEX.BYTE_LENGTH, len);
  Atomics.store(state.sharedControlView, CONTROL_INDEX.TS_LOW, tsLow);
  Atomics.store(state.sharedControlView, CONTROL_INDEX.TS_HIGH, tsHigh);
  Atomics.store(
    state.sharedControlView,
    CONTROL_INDEX.PIXEL_FORMAT,
    encodePixelFormat(result && result.pixelFormat ? result.pixelFormat : state.lastFrameMeta.pixelFormat)
  );
  Atomics.store(state.sharedControlView, CONTROL_INDEX.FRAME_SEQ, seq);
  Atomics.store(state.sharedControlView, CONTROL_INDEX.STATUS, 1);
  const t1 = Number(process.hrtime.bigint()) / 1e6;
  state.perf.sabWriteMsAvg = ewma(state.perf.sabWriteMsAvg, t1 - t0);
}

async function stopCaptureInternal() {
  clearPumpTimer();
  if (!state.session) {
    return;
  }
  const bridge = loadBridge(state.session && state.session.routePreference ? state.session.routePreference : "auto");
  const nativeSessionId = Number(state.session.nativeSessionId || 0);
  state.session = null;
  state.latestFrameBytes = null;
  state.preview.latestBytes = null;
  state.preview.nativeCompressedActive = false;
  state.preview.nativeCompressedFallbackReason = "";
  state.preview.latestSeq = 0;
  state.preview.lastEncodedSeq = 0;
  state.preview.lastEncodedAt = 0;
  state.preview.lastFrameTimestampMs = 0;
  state.noFrameStreak = 0;
  state.perf.lastPumpAt = 0;
  state.perf.lastFrameAt = 0;
  if (bridge && typeof bridge.stopCapture === "function" && nativeSessionId > 0) {
    try {
      await Promise.resolve(bridge.stopCapture({ nativeSessionId }));
    } catch (_error) {
    }
  }
}

async function pumpFrameLoop() {
  if (!state.session) {
    return;
  }
  const bridge = loadBridge(state.session && state.session.routePreference ? state.session.routePreference : "auto");
  if (!bridge || typeof bridge.readFrame !== "function") {
    emit({ type: "error", error: state.bridgeError || "NATIVE_UNAVAILABLE" });
    await stopCaptureInternal();
    return;
  }

  const loopStartMs = Number(process.hrtime.bigint()) / 1e6;
  if (state.perf.lastPumpAt > 0) {
    const expected = Math.max(1, Number(state.pumpIntervalMs || 16));
    const actual = Math.max(0, loopStartMs - state.perf.lastPumpAt);
    state.perf.pumpJitterMsAvg = ewma(state.perf.pumpJitterMsAvg, Math.abs(actual - expected));
  }
  state.perf.lastPumpAt = loopStartMs;

  let gotFrame = false;
  try {
    const readStartMs = Number(process.hrtime.bigint()) / 1e6;
    const result = await Promise.resolve(
      bridge.readFrame({
        nativeSessionId: Number(state.session.nativeSessionId || 0),
        timeoutMs: Number(state.readTimeoutMs || 40),
      })
    );
    const readEndMs = Number(process.hrtime.bigint()) / 1e6;
    state.perf.readMsAvg = ewma(state.perf.readMsAvg, readEndMs - readStartMs);
    if (result && result.ok) {
      const bytes = result.bytes;
      if (bytes && bytes.length) {
        gotFrame = true;
        state.noFrameStreak = 0;
        const copyStartMs = Number(process.hrtime.bigint()) / 1e6;
        state.latestFrameBytes = toStableBuffer(bytes);
        const copyEndMs = Number(process.hrtime.bigint()) / 1e6;
        state.perf.copyMsAvg = ewma(state.perf.copyMsAvg, copyEndMs - copyStartMs);
        state.frameSeq += 1;
        const nowTs = Date.now();
        state.lastFrameAt = nowTs;
        state.lastFrameMeta = {
          width: Number(result.width || 0),
          height: Number(result.height || 0),
          stride: Number(result.stride || 0),
          pixelFormat: String(result.pixelFormat || "BGRA8"),
        };
        writeFrameToSharedBuffer(result, state.latestFrameBytes);
        encodePreviewFrame(result, state.latestFrameBytes);
        const bytesLen = Number(state.latestFrameBytes.length || 0);
        state.perf.bytesPerFrameAvg = ewma(state.perf.bytesPerFrameAvg, bytesLen);
        if (state.perf.lastFrameAt > 0) {
          const deltaMs = Math.max(1, nowTs - state.perf.lastFrameAt);
          const perSec = (bytesLen * 1000) / deltaMs;
          state.perf.bytesPerSec = ewma(state.perf.bytesPerSec, perSec);
          state.perf.frameIntervalMsAvg = ewma(state.perf.frameIntervalMsAvg, deltaMs);
        }
        state.perf.lastFrameAt = nowTs;
      }
    } else {
      state.noFrameStreak += 1;
    }
  } catch (_error) {
    state.noFrameStreak += 1;
  } finally {
    if (state.session) {
      const baseInterval = Math.max(1, Number(state.pumpIntervalMs || 16));
      const backoffMs = gotFrame ? 0 : Math.min(48, Math.max(0, state.noFrameStreak) * 2);
      const nextDelay = baseInterval + backoffMs;
      state.pumpTimer = setTimeout(() => {
        pumpFrameLoop().catch(() => {});
      }, nextDelay);
    }
  }
}

async function handleRequest(requestId, command, payload) {
  if (command === "status") {
    response(requestId, true, {
      state: state.session ? "capturing" : "idle",
      frameSeq: state.frameSeq,
      lastFrameAt: state.lastFrameAt,
      meta: state.lastFrameMeta,
      hasFrame: Boolean(state.latestFrameBytes && state.latestFrameBytes.length > 0),
      bridgeKind: state.bridgeKind || "",
      pumpIntervalMs: Number(state.pumpIntervalMs || 0),
      readTimeoutMs: Number(state.readTimeoutMs || 0),
      perf: {
        readMsAvg: Number(state.perf.readMsAvg || 0),
        copyMsAvg: Number(state.perf.copyMsAvg || 0),
        sabWriteMsAvg: Number(state.perf.sabWriteMsAvg || 0),
        bytesPerFrameAvg: Number(state.perf.bytesPerFrameAvg || 0),
        bytesPerSec: Number(state.perf.bytesPerSec || 0),
        pumpJitterMsAvg: Number(state.perf.pumpJitterMsAvg || 0),
        frameIntervalMsAvg: Number(state.perf.frameIntervalMsAvg || 0),
        previewEncodeMsAvg: Number(state.perf.previewEncodeMsAvg || 0),
        previewBytesPerFrameAvg: Number(state.perf.previewBytesPerFrameAvg || 0),
        previewDroppedByBackpressure: Number(state.perf.previewDroppedByBackpressure || 0),
        previewJitterMsAvg: Number(state.perf.previewJitterMsAvg || 0),
      },
      bridgeError: state.bridgeError || "",
    });
    return;
  }

  if (command === "capture-start") {
    const routePreference = normalizeRoutePreference(payload && payload.routePreference ? payload.routePreference : "auto");
    const bridge = loadBridge(routePreference);
    if (!bridge || typeof bridge.startCapture !== "function") {
      response(requestId, false, {
        reason: "NATIVE_UNAVAILABLE",
        message: state.bridgeError || "native bridge unavailable",
      });
      return;
    }

    await stopCaptureInternal();
    const result = await Promise.resolve(bridge.startCapture(payload || {}));
    if (!result || !result.ok) {
      response(requestId, false, {
        reason: String((result && result.reason) || "START_FAILED"),
        message: String((result && result.message) || "Failed to start worker capture."),
      });
      return;
    }

    state.session = {
      nativeSessionId: Number(result.nativeSessionId || 0),
      routePreference,
    };
    const maxFps = Math.max(1, Math.min(120, Number(payload && payload.maxFps ? payload.maxFps : 60)));
    state.pumpIntervalMs = Math.max(1, Math.floor(1000 / maxFps));
    state.readTimeoutMs = Math.max(1, Math.min(120, state.pumpIntervalMs + 6));
    state.frameSeq = 0;
    state.lastFrameAt = 0;
    state.noFrameStreak = 0;
    state.latestFrameBytes = null;
    state.preview.enabled = false;
    state.preview.nativeCompressedEnabled = false;
    state.preview.nativeCompressedAvailable = false;
    state.preview.nativeCompressedActive = false;
    state.preview.nativeCompressedFallbackReason = "";
    state.preview.codec = "jpeg";
    state.preview.quality = 78;
    state.preview.configuredQuality = 78;
    state.preview.maxFps = 20;
    state.preview.maxWidth = 1920;
    state.preview.maxHeight = 1200;
    state.preview.configuredMaxWidth = 1920;
    state.preview.configuredMaxHeight = 1200;
    state.preview.frameStep = 1;
    state.preview.maxFrameStep = 4;
    state.preview.latestBytes = null;
    state.preview.latestSeq = 0;
    state.preview.lastEncodedSeq = 0;
    state.preview.lastEncodedAt = 0;
    state.preview.lastFrameTimestampMs = 0;
    state.perf.previewEncodeMsAvg = 0;
    state.perf.previewBytesPerFrameAvg = 0;
    state.perf.previewDroppedByBackpressure = 0;
    state.perf.previewJitterMsAvg = 0;
    state.lastFrameMeta = {
      width: Number(result.width || 0),
      height: Number(result.height || 0),
      stride: Number(result.stride || 0),
      pixelFormat: String(result.pixelFormat || "BGRA8"),
    };
    const frameBytes = Math.max(1, state.lastFrameMeta.height) * Math.max(4, state.lastFrameMeta.stride);
    ensureSharedBuffers(frameBytes);
    pumpFrameLoop().catch(() => {});
    response(requestId, true, {
      nativeSessionId: state.session.nativeSessionId,
      width: state.lastFrameMeta.width,
      height: state.lastFrameMeta.height,
      stride: state.lastFrameMeta.stride,
      pixelFormat: state.lastFrameMeta.pixelFormat,
      runtimeRoute: state.bridgeKind === "wgc" ? "wgc-v1" : "native-legacy",
      nativeBackend: String((result && result.nativeBackend) || (state.bridgeKind === "wgc" ? "windows-wgc-hdr-capture" : "windows-hdr-capture")),
    });
    return;
  }

  if (command === "capture-stop") {
    await stopCaptureInternal();
    response(requestId, true, { stopped: true });
    return;
  }

  if (command === "bind-shared") {
    const sharedFrameBuffer = payload && payload.sharedFrameBuffer;
    const sharedControlBuffer = payload && payload.sharedControlBuffer;
    if (!(sharedFrameBuffer instanceof SharedArrayBuffer) || !(sharedControlBuffer instanceof SharedArrayBuffer)) {
      response(requestId, false, {
        reason: "INVALID_SHARED_BUFFER",
        message: "shared buffers are required",
      });
      return;
    }
    state.sharedFrameBuffer = sharedFrameBuffer;
    state.sharedControlBuffer = sharedControlBuffer;
    state.sharedFrameView = new Uint8Array(sharedFrameBuffer);
    state.sharedControlView = new Int32Array(sharedControlBuffer);
    state.sharedControlView.fill(0);
    response(requestId, true, { bound: true });
    return;
  }

  if (command === "frame-meta") {
    response(requestId, true, {
      frameSeq: state.frameSeq,
      lastFrameAt: state.lastFrameAt,
      meta: state.lastFrameMeta,
      hasFrame: Boolean(state.latestFrameBytes && state.latestFrameBytes.length > 0),
    });
    return;
  }

  if (command === "frame-read") {
    if (!state.latestFrameBytes || state.latestFrameBytes.length === 0) {
      response(requestId, true, {
        hasFrame: false,
        frameSeq: state.frameSeq,
        lastFrameAt: state.lastFrameAt,
        width: state.lastFrameMeta.width,
        height: state.lastFrameMeta.height,
        stride: state.lastFrameMeta.stride,
        pixelFormat: state.lastFrameMeta.pixelFormat,
      });
      return;
    }
    response(requestId, true, {
      hasFrame: true,
      frameSeq: state.frameSeq,
      lastFrameAt: state.lastFrameAt,
      width: state.lastFrameMeta.width,
      height: state.lastFrameMeta.height,
      stride: state.lastFrameMeta.stride,
      pixelFormat: state.lastFrameMeta.pixelFormat,
      bytes: state.latestFrameBytes,
    });
    return;
  }

  if (command === "preview-config") {
    const bridge = loadBridge(state.session && state.session.routePreference ? state.session.routePreference : "auto");
    const nativeCompressedAvailable = Boolean(
      NATIVE_COMPRESSED_FRAME_ENABLED &&
      bridge &&
      typeof bridge.readCompressedFrame === "function"
    );
    state.preview.enabled = true;
    state.preview.nativeCompressedEnabled = NATIVE_COMPRESSED_FRAME_ENABLED;
    state.preview.nativeCompressedAvailable = nativeCompressedAvailable;
    state.preview.nativeCompressedActive = false;
    state.preview.nativeCompressedFallbackReason = nativeCompressedAvailable ? "" : "NATIVE_PREVIEW_UNAVAILABLE";
    state.preview.codec = "jpeg";
    state.preview.quality = Math.max(40, Math.min(95, Number(payload && payload.quality ? payload.quality : 78) || 78));
    state.preview.configuredQuality = state.preview.quality;
    state.preview.maxFps = Math.max(8, Math.min(60, Number(payload && payload.maxFps ? payload.maxFps : 20) || 20));
    state.preview.maxWidth = Math.max(320, Math.min(2560, Number(payload && payload.maxWidth ? payload.maxWidth : 1920) || 1920));
    state.preview.maxHeight = Math.max(180, Math.min(1440, Number(payload && payload.maxHeight ? payload.maxHeight : 1200) || 1200));
    state.preview.configuredMaxWidth = state.preview.maxWidth;
    state.preview.configuredMaxHeight = state.preview.maxHeight;
    state.preview.frameStep = 1;
    state.preview.maxFrameStep = Math.max(2, Math.min(6, Number(payload && payload.maxFrameStep ? payload.maxFrameStep : 4) || 4));
    response(requestId, true, {
      enabled: true,
      codec: state.preview.codec,
      quality: state.preview.quality,
      maxFps: state.preview.maxFps,
      maxWidth: state.preview.maxWidth,
      maxHeight: state.preview.maxHeight,
      frameStep: state.preview.frameStep,
      maxFrameStep: state.preview.maxFrameStep,
      nativeImageAvailable: Boolean(workerNativeImage),
      nativeCompressedEnabled: state.preview.nativeCompressedEnabled,
      nativeCompressedAvailable: state.preview.nativeCompressedAvailable,
    });
    return;
  }

  if (command === "frame-read-preview-native") {
    if (!state.preview.enabled) {
      response(requestId, true, {
        hasFrame: false,
        frameSeq: Number(state.preview.latestSeq || 0),
        lastFrameAt: Number(state.preview.latestTimestampMs || 0),
      });
      return;
    }
    const bridge = loadBridge(state.session && state.session.routePreference ? state.session.routePreference : "auto");
    if (!state.preview.nativeCompressedEnabled || !bridge || typeof bridge.readCompressedFrame !== "function") {
      state.preview.nativeCompressedActive = false;
      state.preview.nativeCompressedFallbackReason = "NATIVE_PREVIEW_UNAVAILABLE";
      response(requestId, false, {
        reason: "NATIVE_PREVIEW_UNAVAILABLE",
        message: "Native compressed preview read is unavailable.",
      });
      return;
    }
    const minIntervalMs = Math.max(1, Math.floor(1000 / Math.max(1, Number(state.preview.maxFps || 20))));
    const result = await Promise.resolve(bridge.readCompressedFrame({
      nativeSessionId: Number(state.session && state.session.nativeSessionId ? state.session.nativeSessionId : 0),
      quality: Number(state.preview.quality || 78),
      maxWidth: Number(state.preview.maxWidth || 1920),
      maxHeight: Number(state.preview.maxHeight || 1200),
      minIntervalMs,
    })).catch((error) => ({
      ok: false,
      reason: "NATIVE_PREVIEW_READ_FAILED",
      message: error && error.message ? error.message : "readCompressedFrame failed",
    }));

    if (!result || result.ok === false) {
      state.preview.nativeCompressedActive = false;
      state.preview.nativeCompressedFallbackReason = String((result && result.reason) || "NATIVE_PREVIEW_READ_FAILED");
      response(requestId, false, {
        reason: state.preview.nativeCompressedFallbackReason,
        message: String((result && result.message) || "Native compressed preview read failed."),
      });
      return;
    }

    if (!result.hasFrame || !result.bytes) {
      response(requestId, true, {
        hasFrame: false,
        frameSeq: Number(result.frameSeq || state.preview.latestSeq || 0),
        lastFrameAt: Number(result.timestampMs || state.preview.latestTimestampMs || 0),
        perf: {
          previewEncodeMsAvg: Number(state.perf.previewEncodeMsAvg || 0),
          previewBytesPerFrameAvg: Number(state.perf.previewBytesPerFrameAvg || 0),
          previewDroppedByBackpressure: Number(state.perf.previewDroppedByBackpressure || 0),
          previewJitterMsAvg: Number(state.perf.previewJitterMsAvg || 0),
          previewFrameStep: Number(state.preview.frameStep || 1),
          previewNativePathActive: Boolean(state.preview.nativeCompressedActive),
          previewNativeFallbackReason: String(state.preview.nativeCompressedFallbackReason || ""),
        },
      });
      return;
    }

    const ts = Number(result.timestampMs || Date.now());
    const seq = Number(result.frameSeq || state.preview.latestSeq + 1 || state.frameSeq + 1 || 1);
    const bytes = Buffer.isBuffer(result.bytes) ? result.bytes : Buffer.from(result.bytes);
    state.preview.nativeCompressedActive = true;
    state.preview.nativeCompressedFallbackReason = "";
    state.preview.latestSeq = seq;
    state.preview.latestTimestampMs = ts;
    state.preview.latestWidth = Number(result.width || state.preview.latestWidth || 0);
    state.preview.latestHeight = Number(result.height || state.preview.latestHeight || 0);
    state.preview.latestMime = String(result.mime || "image/jpeg");
    state.preview.latestBytes = bytes;
    if (Number(result.encodeMs || 0) > 0) {
      state.perf.previewEncodeMsAvg = ewma(state.perf.previewEncodeMsAvg, Number(result.encodeMs || 0));
    }
    state.perf.previewBytesPerFrameAvg = ewma(state.perf.previewBytesPerFrameAvg, Number(bytes.length || 0));

    response(requestId, true, {
      hasFrame: true,
      frameSeq: seq,
      lastFrameAt: ts,
      width: Number(result.width || 0),
      height: Number(result.height || 0),
      mime: String(result.mime || "image/jpeg"),
      bytes,
      perf: {
        previewEncodeMsAvg: Number(state.perf.previewEncodeMsAvg || 0),
        previewBytesPerFrameAvg: Number(state.perf.previewBytesPerFrameAvg || 0),
        previewDroppedByBackpressure: Number(state.perf.previewDroppedByBackpressure || 0),
        previewJitterMsAvg: Number(state.perf.previewJitterMsAvg || 0),
        previewFrameStep: Number(state.preview.frameStep || 1),
        previewNativePathActive: true,
        previewNativeFallbackReason: "",
      },
    });
    return;
  }

  if (command === "frame-read-preview") {
    if (!state.preview.enabled || !state.preview.latestBytes || state.preview.latestBytes.length <= 0) {
      response(requestId, true, {
        hasFrame: false,
        frameSeq: Number(state.preview.latestSeq || 0),
        lastFrameAt: Number(state.preview.latestTimestampMs || 0),
      });
      return;
    }
    response(requestId, true, {
      hasFrame: true,
      frameSeq: Number(state.preview.latestSeq || 0),
      lastFrameAt: Number(state.preview.latestTimestampMs || 0),
      width: Number(state.preview.latestWidth || 0),
      height: Number(state.preview.latestHeight || 0),
      mime: String(state.preview.latestMime || "image/jpeg"),
      bytes: state.preview.latestBytes,
      perf: {
        previewEncodeMsAvg: Number(state.perf.previewEncodeMsAvg || 0),
        previewBytesPerFrameAvg: Number(state.perf.previewBytesPerFrameAvg || 0),
        previewDroppedByBackpressure: Number(state.perf.previewDroppedByBackpressure || 0),
        previewJitterMsAvg: Number(state.perf.previewJitterMsAvg || 0),
        previewFrameStep: Number(state.preview.frameStep || 1),
        previewNativePathActive: false,
        previewNativeFallbackReason: String(state.preview.nativeCompressedFallbackReason || ""),
      },
    });
    return;
  }

  response(requestId, false, {
    reason: "UNKNOWN_COMMAND",
    message: "Unknown worker command: " + String(command),
  });
}

function normalizeIncomingMessage(raw) {
  if (!raw) {
    return null;
  }
  if (typeof raw === "object" && raw !== null && "data" in raw && raw.data && typeof raw.data === "object") {
    return raw.data;
  }
  if (typeof raw === "object") {
    return raw;
  }
  return null;
}

async function onMessage(rawMessage) {
  const message = normalizeIncomingMessage(rawMessage);
  if (!message) {
    return;
  }
  const type = String(message.type || "");
  if (type === "init") {
    state.initialized = true;
    emit({
      type: "ready",
      payload: {
        initialized: true,
        startedAt: state.startedAt,
      },
    });
    return;
  }

  if (type === "request") {
    const requestId = Number(message.requestId || 0);
    const command = String(message.command || "");
    const payload = message.payload || {};
    try {
      await handleRequest(requestId, command, payload);
    } catch (error) {
      response(requestId, false, {
        reason: "REQUEST_FAILED",
        message: error && error.message ? error.message : "Worker request failed.",
      });
    }
    return;
  }

  if (type === "stop") {
    await stopCaptureInternal();
    emit({ type: "log", message: "stopping" });
    process.exit(0);
  }
}

if (process.parentPort && typeof process.parentPort.on === "function") {
  process.parentPort.on("message", (message) => {
    onMessage(message).catch(() => {});
  });
}
process.on("message", (message) => {
  onMessage(message).catch(() => {});
});

process.on("uncaughtException", (error) => {
  emit({
    type: "error",
    error: error && error.message ? error.message : "uncaughtException",
  });
});

emit({
  type: "ready",
  payload: {
    initialized: false,
    startedAt: state.startedAt,
  },
});

emit({
  type: "log",
  message: "listener-ready",
});
