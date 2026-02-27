#!/usr/bin/env node

function log(step, payload) {
  const body = payload && typeof payload === 'object' ? JSON.stringify(payload) : String(payload || '');
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
