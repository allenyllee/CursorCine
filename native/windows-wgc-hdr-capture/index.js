const path = require('path');

let binding = null;
let loadError = '';

if (process.platform === 'win32') {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    binding = require(path.join(__dirname, 'build', 'Release', 'windows_wgc_hdr_capture.node'));
  } catch (error) {
    loadError = error && error.message ? error.message : 'load failed';
  }
}

let legacyBridge = null;
let legacyLoadError = '';

function loadLegacyBridge() {
  if (legacyBridge) {
    return legacyBridge;
  }
  if (legacyLoadError) {
    return null;
  }
  try {
    // eslint-disable-next-line global-require
    legacyBridge = require(path.join(__dirname, '..', 'windows-hdr-capture'));
    return legacyBridge;
  } catch (error) {
    legacyLoadError = error && error.message ? error.message : 'load failed';
    return null;
  }
}

function unsupported(reason, message, extra = {}) {
  return {
    ok: false,
    supported: false,
    hdrActive: false,
    nativeBackend: 'windows-wgc-hdr-capture',
    reason,
    message,
    ...extra
  };
}

function probe(payload = {}) {
  if (process.platform !== 'win32') {
    return unsupported('NOT_WINDOWS', 'Windows-only backend.');
  }
  if (binding && typeof binding.probe === 'function') {
    return binding.probe(payload);
  }
  const legacy = loadLegacyBridge();
  if (legacy && typeof legacy.probe === 'function') {
    const result = legacy.probe(payload);
    return {
      ...result,
      nativeBackend: 'windows-wgc-hdr-capture->legacy'
    };
  }
  return unsupported('NATIVE_UNAVAILABLE', loadError || legacyLoadError || 'Native addon not available.');
}

function startCapture(payload = {}) {
  if (process.platform !== 'win32') {
    return unsupported('NOT_WINDOWS', 'Windows-only backend.');
  }

  const legacy = loadLegacyBridge();
  if (legacy && typeof legacy.startCapture === 'function') {
    const result = legacy.startCapture(payload);
    return {
      ...result,
      nativeBackend: String((result && result.nativeBackend) || 'windows-wgc-hdr-capture->legacy')
    };
  }

  if (!binding || typeof binding.startCapture !== 'function') {
    return unsupported('NATIVE_UNAVAILABLE', loadError || legacyLoadError || 'Native addon not available.');
  }
  return binding.startCapture(payload);
}

function readFrame(payload = {}) {
  const legacy = loadLegacyBridge();
  if (legacy && typeof legacy.readFrame === 'function') {
    return legacy.readFrame(payload);
  }
  if (!binding || typeof binding.readFrame !== 'function') {
    return unsupported('NATIVE_UNAVAILABLE', loadError || legacyLoadError || 'Native addon not available.');
  }
  return binding.readFrame(payload);
}

function stopCapture(payload = {}) {
  const legacy = loadLegacyBridge();
  if (legacy && typeof legacy.stopCapture === 'function') {
    return legacy.stopCapture(payload);
  }
  if (!binding || typeof binding.stopCapture !== 'function') {
    return { ok: true, skipped: true };
  }
  return binding.stopCapture(payload);
}

module.exports = {
  backendName: 'windows-wgc-hdr-capture',
  probe,
  startCapture,
  readFrame,
  stopCapture
};
