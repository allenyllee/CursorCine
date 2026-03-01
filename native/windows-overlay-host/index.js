'use strict';

const path = require('path');

let binding = null;
let loadError = '';

if (process.platform === 'win32') {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    binding = require(path.join(__dirname, 'build', 'Release', 'windows_overlay_host.node'));
  } catch (error) {
    loadError = error && error.message ? error.message : 'load failed';
  }
}

function notSupportedResult() {
  return {
    ok: false,
    reason: 'NATIVE_UNAVAILABLE',
    message: loadError || 'Native overlay addon not available.'
  };
}

function isSupported() {
  if (process.platform !== 'win32') {
    return false;
  }
  if (!binding || typeof binding.isSupported !== 'function') {
    return false;
  }
  return Boolean(binding.isSupported());
}

function startOverlay(payload = {}) {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      reason: 'NOT_WINDOWS',
      message: 'Windows-only backend.'
    };
  }
  if (!binding || typeof binding.startOverlay !== 'function') {
    return notSupportedResult();
  }
  return binding.startOverlay(payload);
}

function stopOverlay(payload = {}) {
  if (!binding || typeof binding.stopOverlay !== 'function') {
    return {
      ok: true,
      skipped: true
    };
  }
  return binding.stopOverlay(payload);
}

function setPointer(payload = {}) {
  if (!binding || typeof binding.setPointer !== 'function') {
    return notSupportedResult();
  }
  return binding.setPointer(payload);
}

function setPenStyle(payload = {}) {
  if (!binding || typeof binding.setPenStyle !== 'function') {
    return notSupportedResult();
  }
  return binding.setPenStyle(payload);
}

function getDebugMetrics(payload = {}) {
  if (!binding || typeof binding.getDebugMetrics !== 'function') {
    return notSupportedResult();
  }
  return binding.getDebugMetrics(payload);
}

function undoStroke() {
  if (!binding || typeof binding.undoStroke !== 'function') {
    return notSupportedResult();
  }
  return binding.undoStroke();
}

function clearStrokes() {
  if (!binding || typeof binding.clearStrokes !== 'function') {
    return notSupportedResult();
  }
  return binding.clearStrokes();
}

module.exports = {
  backendName: 'windows-overlay-host',
  isSupported,
  startOverlay,
  stopOverlay,
  setPointer,
  getDebugMetrics,
  setPenStyle,
  undoStroke,
  clearStrokes
};
