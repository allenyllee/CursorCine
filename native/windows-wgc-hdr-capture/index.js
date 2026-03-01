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
  if (!binding || typeof binding.probe !== 'function') {
    return unsupported('NATIVE_UNAVAILABLE', loadError || 'Native addon not available.');
  }
  return binding.probe(payload);
}

function startCapture(payload = {}) {
  if (process.platform !== 'win32') {
    return unsupported('NOT_WINDOWS', 'Windows-only backend.');
  }
  if (!binding || typeof binding.startCapture !== 'function') {
    return unsupported('NATIVE_UNAVAILABLE', loadError || 'Native addon not available.');
  }
  return binding.startCapture(payload);
}

function readFrame(payload = {}) {
  if (!binding || typeof binding.readFrame !== 'function') {
    return unsupported('NATIVE_UNAVAILABLE', loadError || 'Native addon not available.');
  }
  return binding.readFrame(payload);
}

function readCompressedFrame(payload = {}) {
  if (!binding || typeof binding.readCompressedFrame !== 'function') {
    return unsupported('NATIVE_PREVIEW_UNAVAILABLE', loadError || 'Native compressed frame not available.');
  }
  return binding.readCompressedFrame(payload);
}

function startEncodedPreview(payload = {}) {
  if (!binding || typeof binding.startEncodedPreview !== 'function') {
    return {
      ok: false,
      reason: 'PREVIEW_ENCODED_START_FAILED',
      message: loadError || 'Native encoded preview not available.'
    };
  }
  return binding.startEncodedPreview(payload);
}

function readEncodedPreview(payload = {}) {
  if (!binding || typeof binding.readEncodedPreview !== 'function') {
    return {
      ok: false,
      reason: 'PREVIEW_ENCODED_READ_TIMEOUT',
      message: loadError || 'Native encoded preview reader not available.'
    };
  }
  return binding.readEncodedPreview(payload);
}

function stopEncodedPreview(payload = {}) {
  if (!binding || typeof binding.stopEncodedPreview !== 'function') {
    return { ok: true, skipped: true };
  }
  return binding.stopEncodedPreview(payload);
}

function stopCapture(payload = {}) {
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
  readCompressedFrame,
  startEncodedPreview,
  readEncodedPreview,
  stopEncodedPreview,
  stopCapture
};
