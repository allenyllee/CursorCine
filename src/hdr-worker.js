const path = require("path");

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
    lastPumpAt: 0,
    lastFrameAt: 0,
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
};

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
