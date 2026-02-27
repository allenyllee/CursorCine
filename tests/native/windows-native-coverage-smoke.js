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
  safeCall(label + '.readFrame', () => bridge.readFrame({
    nativeSessionId,
    timeoutMs: 10
  }));
  safeCall(label + '.stopCapture', () => bridge.stopCapture({ nativeSessionId }));
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
