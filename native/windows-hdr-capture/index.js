const path = require('path');

let binding = null;
let loadError = '';

if (process.platform === 'win32') {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    binding = require(path.join(__dirname, 'build', 'Release', 'windows_hdr_capture.node'));
  } catch (error) {
    loadError = error && error.message ? error.message : 'load failed';
  }
}

function unsupported(reason, message, extra = {}) {
  return {
    supported: false,
    hdrActive: false,
    nativeBackend: 'windows-hdr-capture',
    reason,
    message,
    ...extra
  };
}

function probe(payload = {}) {
  if (process.platform !== 'win32') {
    return unsupported('NOT_WINDOWS', 'Windows-only backend.');
  }
  if (!binding || typeof binding.probe !== 'function') {
    return unsupported('NATIVE_UNAVAILABLE', 'Native addon not available.', {
      loadError
    });
  }
  return binding.probe(payload);
}

function startCapture(payload = {}) {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      reason: 'NOT_WINDOWS',
      message: 'Windows-only backend.'
    };
  }
  if (!binding || typeof binding.startCapture !== 'function') {
    return {
      ok: false,
      reason: 'NATIVE_UNAVAILABLE',
      message: loadError || 'Native addon not available.'
    };
  }
  return binding.startCapture(payload);
}

function readFrame(payload = {}) {
  if (!binding || typeof binding.readFrame !== 'function') {
    return {
      ok: false,
      reason: 'NATIVE_UNAVAILABLE',
      message: loadError || 'Native addon not available.'
    };
  }
  return binding.readFrame(payload);
}

function readCompressedFrame(payload = {}) {
  if (!binding || typeof binding.readCompressedFrame !== 'function') {
    return {
      ok: false,
      reason: 'NATIVE_PREVIEW_UNAVAILABLE',
      message: loadError || 'Native compressed frame not available.'
    };
  }
  return binding.readCompressedFrame(payload);
}

function stopCapture(payload = {}) {
  if (!binding || typeof binding.stopCapture !== 'function') {
    return {
      ok: true,
      skipped: true
    };
  }
  return binding.stopCapture(payload);
}

module.exports = {
  probe,
  startCapture,
  readFrame,
  readCompressedFrame,
  stopCapture
};
