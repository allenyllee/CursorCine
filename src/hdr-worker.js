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
  pumpTimer: 0,
  bridge: null,
  bridgeError: "",
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

function loadBridge() {
  if (process.platform !== "win32") {
    state.bridge = null;
    state.bridgeError = "NOT_WINDOWS";
    return null;
  }
  if (state.bridge) {
    return state.bridge;
  }
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const bridge = require(path.join(__dirname, "..", "native", "windows-hdr-capture"));
    state.bridge = bridge;
    state.bridgeError = "";
    return bridge;
  } catch (error) {
    state.bridge = null;
    state.bridgeError = error && error.message ? error.message : "load failed";
    return null;
  }
}

function clearPumpTimer() {
  clearTimeout(state.pumpTimer);
  state.pumpTimer = 0;
}

async function stopCaptureInternal() {
  clearPumpTimer();
  if (!state.session) {
    return;
  }
  const bridge = loadBridge();
  const nativeSessionId = Number(state.session.nativeSessionId || 0);
  state.session = null;
  state.latestFrameBytes = null;
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
  const bridge = loadBridge();
  if (!bridge || typeof bridge.readFrame !== "function") {
    emit({ type: "error", error: state.bridgeError || "NATIVE_UNAVAILABLE" });
    await stopCaptureInternal();
    return;
  }

  try {
    const result = await Promise.resolve(
      bridge.readFrame({
        nativeSessionId: Number(state.session.nativeSessionId || 0),
        timeoutMs: 80,
      })
    );
    if (result && result.ok) {
      const bytes = result.bytes;
      if (bytes && bytes.length) {
        state.latestFrameBytes = Buffer.from(bytes);
        state.frameSeq += 1;
        state.lastFrameAt = Date.now();
        state.lastFrameMeta = {
          width: Number(result.width || 0),
          height: Number(result.height || 0),
          stride: Number(result.stride || 0),
          pixelFormat: String(result.pixelFormat || "BGRA8"),
        };
      }
    }
  } catch (_error) {
  } finally {
    if (state.session) {
      state.pumpTimer = setTimeout(() => {
        pumpFrameLoop().catch(() => {});
      }, 33);
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
      bridgeError: state.bridgeError || "",
    });
    return;
  }

  if (command === "capture-start") {
    const bridge = loadBridge();
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
    };
    state.frameSeq = 0;
    state.lastFrameAt = 0;
    state.latestFrameBytes = null;
    state.lastFrameMeta = {
      width: Number(result.width || 0),
      height: Number(result.height || 0),
      stride: Number(result.stride || 0),
      pixelFormat: String(result.pixelFormat || "BGRA8"),
    };
    pumpFrameLoop().catch(() => {});
    response(requestId, true, {
      nativeSessionId: state.session.nativeSessionId,
      width: state.lastFrameMeta.width,
      height: state.lastFrameMeta.height,
      stride: state.lastFrameMeta.stride,
      pixelFormat: state.lastFrameMeta.pixelFormat,
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
