function normalizeHdrRoutePreference(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'wgc' || v === 'legacy' || v === 'auto') {
    return v;
  }
  return 'auto';
}

function normalizeHdrMappingMode(value) {
  const v = String(value || '').trim().toLowerCase();
  return v === 'off' || v === 'force-native' ? v : 'auto';
}

function selectHdrBridge(options = {}) {
  const preference = normalizeHdrRoutePreference(options.requestedRoute || options.defaultRoute || 'auto');
  const tries = preference === 'legacy' ? ['legacy', 'wgc'] : ['wgc', 'legacy'];
  const errors = [];

  for (const candidate of tries) {
    if (candidate === 'wgc') {
      if (!options.wgcEnabled) {
        errors.push('WGC_ROUTE_DISABLED');
        continue;
      }
      const wgcBridge = typeof options.getWgcBridge === 'function' ? options.getWgcBridge() : null;
      if (wgcBridge && typeof wgcBridge.startCapture === 'function' && typeof wgcBridge.readFrame === 'function') {
        return {
          route: 'wgc-v1',
          fallbackLevel: 1,
          bridge: wgcBridge,
          backendLabel: String(wgcBridge.backendName || 'windows-wgc-hdr-capture')
        };
      }
      errors.push(String(options.wgcLoadError || 'WGC_UNAVAILABLE'));
      continue;
    }

    const legacyBridge = typeof options.getLegacyBridge === 'function' ? options.getLegacyBridge() : null;
    if (legacyBridge && typeof legacyBridge.startCapture === 'function' && typeof legacyBridge.readFrame === 'function') {
      return {
        route: 'native-legacy',
        fallbackLevel: 2,
        bridge: legacyBridge,
        backendLabel: String(legacyBridge.backendName || 'windows-hdr-capture')
      };
    }
    errors.push(String(options.legacyLoadError || 'LEGACY_UNAVAILABLE'));
  }

  return {
    route: 'builtin-desktop',
    fallbackLevel: 3,
    bridge: null,
    backendLabel: '',
    reason: errors.length > 0 ? errors.join('|') : 'NATIVE_UNAVAILABLE'
  };
}

function resolveHdrMappingDecision(input = {}) {
  const mode = normalizeHdrMappingMode(input.mode);
  if (mode === 'off') {
    return { route: 'fallback', reason: 'MODE_OFF' };
  }

  if (!input.nativeRouteEnabled) {
    const reason = String(input.nativeRouteReason || 'NATIVE_ROUTE_DISABLED');
    if (mode === 'force-native') {
      return { route: 'blocked', reason };
    }
    return { route: 'fallback', reason };
  }

  if (!input.probeSupported) {
    const reason = String(input.probeReason || 'NATIVE_UNAVAILABLE');
    if (mode === 'force-native') {
      return { route: 'blocked', reason };
    }
    return { route: 'fallback', reason };
  }

  if (mode === 'auto' && !input.hdrActive) {
    return { route: 'fallback', reason: String(input.probeReason || 'HDR_INACTIVE') };
  }

  if (input.nativeStartOk) {
    return { route: 'native', reason: 'NATIVE_OK' };
  }

  const startReason = String(input.nativeStartReason || 'START_FAILED');
  if (mode === 'force-native') {
    return { route: 'blocked', reason: startReason };
  }
  return { route: 'fallback', reason: startReason };
}

module.exports = {
  normalizeHdrRoutePreference,
  normalizeHdrMappingMode,
  selectHdrBridge,
  resolveHdrMappingDecision
};
