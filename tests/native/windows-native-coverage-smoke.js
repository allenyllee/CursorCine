#!/usr/bin/env node

const quietMode = String(process.env.CURSORCINE_NATIVE_COVERAGE_QUIET || '') === '1';

function compactPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return payload;
  }
  if (Array.isArray(payload)) {
    return { type: 'array', length: payload.length };
  }
  const keys = Object.keys(payload);
  const out = {};
  for (const key of keys.slice(0, 6)) {
    const value = payload[key];
    out[key] = Array.isArray(value) ? '[array:' + value.length + ']' : value;
  }
  if (keys.length > 6) {
    out._keys = keys.length;
  }
  return out;
}

function log(step, payload) {
  const printPayload = quietMode ? compactPayload(payload) : payload;
  const body = printPayload && typeof printPayload === 'object'
    ? JSON.stringify(printPayload)
    : String(printPayload || '');
  process.stdout.write('[native-smoke] ' + step + ' ' + body + '\n');
}

function safeCall(name, fn) {
  try {
    const result = fn();
    log(name + ':ok', result);
    return result;
  } catch (error) {
    log(name + ':err', { message: error && error.message ? error.message : String(error) });
    return null;
  }
}

function withEnv(name, value, fn) {
  const prev = Object.prototype.hasOwnProperty.call(process.env, name) ? process.env[name] : undefined;
  if (value === undefined || value === null) {
    delete process.env[name];
  } else {
    process.env[name] = String(value);
  }
  try {
    return fn();
  } finally {
    if (prev === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = prev;
    }
  }
}

function exerciseSessionPaths(label, bridge, nativeSessionId) {
  safeCall(label + '.readFrame.invalidZero', () => bridge.readFrame({
    nativeSessionId: 0,
    timeoutMs: 10
  }));
  safeCall(label + '.readFrame.invalidMissing', () => bridge.readFrame({
    nativeSessionId: 999999,
    timeoutMs: 10
  }));
  safeCall(label + '.readFrame.valid', () => bridge.readFrame({
    nativeSessionId,
    timeoutMs: 10
  }));

  safeCall(label + '.stopCapture.invalidZero', () => bridge.stopCapture({
    nativeSessionId: 0
  }));
  safeCall(label + '.stopCapture.invalidMissing', () => bridge.stopCapture({
    nativeSessionId: 999999
  }));
  safeCall(label + '.stopCapture.valid', () => bridge.stopCapture({ nativeSessionId }));
}

function exerciseInjectedFailures(label, bridge) {
  const startPayload = {
    sourceId: 'coverage-smoke-source',
    displayId: 'coverage-display',
    maxOutputPixels: 640 * 360
  };

  safeCall(label + '.inject.failGetDC', () => withEnv('CURSORCINE_NATIVE_TEST_FAIL_GETDC', '1', () => (
    bridge.startCapture(startPayload)
  )));

  safeCall(label + '.inject.failCreateCompatibleDC', () => withEnv('CURSORCINE_NATIVE_TEST_FAIL_CREATE_COMPATIBLE_DC', '1', () => (
    bridge.startCapture(startPayload)
  )));

  safeCall(label + '.inject.failCreateDIBSection', () => withEnv('CURSORCINE_NATIVE_TEST_FAIL_CREATE_DIB_SECTION', '1', () => (
    bridge.startCapture(startPayload)
  )));

  safeCall(label + '.inject.failSelectObject', () => withEnv('CURSORCINE_NATIVE_TEST_FAIL_SELECT_OBJECT', '1', () => (
    bridge.startCapture(startPayload)
  )));

  safeCall(label + '.inject.forceSessionRegistrationFail', () => withEnv(
    'CURSORCINE_NATIVE_TEST_FORCE_SESSION_REGISTRATION_FAIL',
    '1',
    () => bridge.startCapture(startPayload)
  ));

  safeCall(label + '.inject.forceReadFail', () => {
    const started = bridge.startCapture(startPayload);
    const sid = Number(started && started.nativeSessionId ? started.nativeSessionId : 0);
    if (sid > 0) {
      safeCall(label + '.inject.forceReadFail.read', () => withEnv('CURSORCINE_NATIVE_TEST_FORCE_READ_FAIL', '1', () => (
        bridge.readFrame({ nativeSessionId: sid, timeoutMs: 10 })
      )));
      safeCall(label + '.inject.forceReadFail.stop', () => bridge.stopCapture({ nativeSessionId: sid }));
    }
    return started;
  });
}

function exerciseStartVariants(label, bridge) {
  safeCall(label + '.startCapture.frameTooLarge', () => bridge.startCapture({
    sourceId: 'coverage-smoke-source',
    displayId: 'coverage-display',
    displayHint: {
      bounds: { x: 0, y: 0, width: 6000, height: 6000 },
      scaleFactor: 1
    }
  }));

  safeCall(label + '.startCapture.invalidBounds', () => bridge.startCapture({
    sourceId: 'coverage-smoke-source',
    displayId: 'coverage-display',
    displayHint: {
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      scaleFactor: 1
    }
  }));

  safeCall(label + '.startCapture.noToneMap', () => {
    const started = bridge.startCapture({
      sourceId: 'coverage-smoke-source',
      displayId: 'coverage-display',
      maxOutputPixels: 640 * 360
    });
    const sid = Number(started && started.nativeSessionId ? started.nativeSessionId : 0);
    if (sid > 0) {
      safeCall(label + '.startCapture.noToneMap.read', () => bridge.readFrame({
        nativeSessionId: sid,
        timeoutMs: 10
      }));
      safeCall(label + '.startCapture.noToneMap.stop', () => bridge.stopCapture({ nativeSessionId: sid }));
    }
    return started;
  });

  safeCall(label + '.startCapture.tonemapAndScale', () => {
    const started = bridge.startCapture({
      sourceId: 'coverage-smoke-source',
      displayId: 'coverage-display',
      displayHint: {
        bounds: { x: 0, y: 0, width: 800, height: 450 },
        scaleFactor: 1.5,
        isHdrLikely: true
      },
      maxOutputPixels: -123,
      toneMap: {
        profile: 'coverage-smoke-tonemap',
        rolloff: 1.5,
        saturation: -0.5
      }
    });
    const sid = Number(started && started.nativeSessionId ? started.nativeSessionId : 0);
    if (sid > 0) {
      safeCall(label + '.startCapture.tonemapAndScale.read', () => bridge.readFrame({
        nativeSessionId: sid,
        timeoutMs: 10
      }));
      safeCall(label + '.startCapture.tonemapAndScale.stop', () => bridge.stopCapture({ nativeSessionId: sid }));
    }
    return started;
  });

  safeCall(label + '.startCapture.tonemapNoScale', () => {
    const started = bridge.startCapture({
      sourceId: 'coverage-smoke-source',
      displayId: 'coverage-display',
      maxOutputPixels: 3840 * 2160,
      displayHint: {
        isHdrLikely: true
      },
      toneMap: {
        profile: 'coverage-smoke-tonemap-noscale',
        rolloff: 0.6,
        saturation: 1.4
      }
    });
    const sid = Number(started && started.nativeSessionId ? started.nativeSessionId : 0);
    if (sid > 0) {
      safeCall(label + '.startCapture.tonemapNoScale.read', () => bridge.readFrame({
        nativeSessionId: sid,
        timeoutMs: 10
      }));
      safeCall(label + '.startCapture.tonemapNoScale.stop', () => bridge.stopCapture({ nativeSessionId: sid }));
    }
    return started;
  });

  safeCall(label + '.startCapture.offscreenReadFail', () => {
    const started = bridge.startCapture({
      sourceId: 'coverage-smoke-source',
      displayId: 'coverage-display',
      displayHint: {
        bounds: { x: 2000000000, y: 2000000000, width: 64, height: 64 },
        scaleFactor: 1
      },
      maxOutputPixels: 64 * 64
    });
    const sid = Number(started && started.nativeSessionId ? started.nativeSessionId : 0);
    if (sid > 0) {
      safeCall(label + '.startCapture.offscreenReadFail.read', () => bridge.readFrame({
        nativeSessionId: sid,
        timeoutMs: 10
      }));
      safeCall(label + '.startCapture.offscreenReadFail.stop', () => bridge.stopCapture({ nativeSessionId: sid }));
    }
    return started;
  });
}

function runBridge(label, bridge) {
  if (!bridge) {
    log(label + ':missing', {});
    return;
  }

  safeCall(label + '.probe', () => bridge.probe({ sourceId: 'coverage-smoke-source' }));
  const start = safeCall(label + '.startCapture', () => bridge.startCapture({
    sourceId: 'coverage-smoke-source',
    displayId: 'coverage-display',
    maxFps: 30,
    maxOutputPixels: 640 * 360,
    toneMap: { profile: 'rec709-rolloff-v1' }
  }));

  const nativeSessionId = Number(start && start.nativeSessionId ? start.nativeSessionId : 0);
  if (nativeSessionId > 0) {
    exerciseSessionPaths(label, bridge, nativeSessionId);
  } else {
    log(label + '.startCapture:skipSessionPaths', { reason: 'NO_SESSION' });
  }

  exerciseStartVariants(label, bridge);
  exerciseInjectedFailures(label, bridge);
}

async function main() {
  if (process.platform !== 'win32') {
    log('skip', { reason: 'NOT_WINDOWS' });
    return;
  }

  const legacyBridge = safeCall('require.legacy', () => require('../../native/windows-hdr-capture'));
  const wgcBridge = safeCall('require.wgc', () => require('../../native/windows-wgc-hdr-capture'));

  runBridge('legacy', legacyBridge);
  runBridge('wgc', wgcBridge);
}

main().catch((error) => {
  log('fatal', { message: error && error.message ? error.message : String(error) });
  process.exitCode = 1;
});
