const {
  normalizeHdrRoutePreference,
  normalizeHdrMappingMode,
  selectHdrBridge,
  resolveHdrMappingDecision
} = require('../../src/core/hdr-route');

describe('hdr-route core', () => {
  it('normalizes route preference', () => {
    expect(normalizeHdrRoutePreference('WGC')).toBe('wgc');
    expect(normalizeHdrRoutePreference('legacy')).toBe('legacy');
    expect(normalizeHdrRoutePreference('unknown')).toBe('auto');
  });

  it('normalizes mapping mode', () => {
    expect(normalizeHdrMappingMode('off')).toBe('off');
    expect(normalizeHdrMappingMode('force-native')).toBe('force-native');
    expect(normalizeHdrMappingMode('other')).toBe('auto');
  });

  it('selects wgc before legacy in auto mode', () => {
    const wgc = { backendName: 'wgc', startCapture: () => {}, readFrame: () => {} };
    const legacy = { backendName: 'legacy', startCapture: () => {}, readFrame: () => {} };
    const selected = selectHdrBridge({
      requestedRoute: 'auto',
      wgcEnabled: true,
      getWgcBridge: () => wgc,
      getLegacyBridge: () => legacy
    });
    expect(selected.route).toBe('wgc-v1');
  });

  it('falls back to legacy when wgc unavailable', () => {
    const legacy = { backendName: 'legacy', startCapture: () => {}, readFrame: () => {} };
    const selected = selectHdrBridge({
      requestedRoute: 'auto',
      wgcEnabled: true,
      getWgcBridge: () => null,
      getLegacyBridge: () => legacy,
      wgcLoadError: 'WGC_LOAD_FAIL'
    });
    expect(selected.route).toBe('native-legacy');
    expect(selected.fallbackLevel).toBe(2);
  });

  it('falls back to builtin when wgc route is disabled and legacy unavailable', () => {
    const selected = selectHdrBridge({
      requestedRoute: 'wgc',
      wgcEnabled: false,
      getWgcBridge: () => null,
      getLegacyBridge: () => null,
      legacyLoadError: 'LEGACY_FAIL'
    });
    expect(selected.route).toBe('builtin-desktop');
    expect(selected.reason).toContain('WGC_ROUTE_DISABLED');
    expect(selected.reason).toContain('LEGACY_FAIL');
  });

  it('returns builtin route when both native bridges unavailable', () => {
    const selected = selectHdrBridge({
      requestedRoute: 'legacy',
      wgcEnabled: true,
      getWgcBridge: () => null,
      getLegacyBridge: () => null,
      wgcLoadError: 'WGC_FAIL',
      legacyLoadError: 'LEGACY_FAIL'
    });
    expect(selected.route).toBe('builtin-desktop');
    expect(selected.reason).toContain('LEGACY_FAIL');
  });

  it('resolves off/force-native decision', () => {
    expect(resolveHdrMappingDecision({ mode: 'off' }).route).toBe('fallback');
    expect(resolveHdrMappingDecision({ mode: 'force-native', nativeRouteEnabled: false }).route).toBe('blocked');
    expect(resolveHdrMappingDecision({ mode: 'force-native', nativeRouteEnabled: true, probeSupported: true, hdrActive: true, nativeStartOk: true }).route).toBe('native');
  });

  it('falls back in auto mode when HDR is inactive', () => {
    const decision = resolveHdrMappingDecision({
      mode: 'auto',
      nativeRouteEnabled: true,
      probeSupported: true,
      hdrActive: false,
      probeReason: 'HDR_INACTIVE'
    });
    expect(decision.route).toBe('fallback');
    expect(decision.reason).toBe('HDR_INACTIVE');
  });

  it('blocks in force-native mode when start fails', () => {
    const decision = resolveHdrMappingDecision({
      mode: 'force-native',
      nativeRouteEnabled: true,
      probeSupported: true,
      hdrActive: true,
      nativeStartOk: false,
      nativeStartReason: 'START_FAILED'
    });
    expect(decision.route).toBe('blocked');
    expect(decision.reason).toBe('START_FAILED');
  });

  it('falls back with default reason when native route is disabled in auto mode', () => {
    const decision = resolveHdrMappingDecision({
      mode: 'auto',
      nativeRouteEnabled: false
    });
    expect(decision.route).toBe('fallback');
    expect(decision.reason).toBe('NATIVE_ROUTE_DISABLED');
  });

  it('blocks with probe reason when force-native and probe unsupported', () => {
    const decision = resolveHdrMappingDecision({
      mode: 'force-native',
      nativeRouteEnabled: true,
      probeSupported: false,
      probeReason: 'NATIVE_UNAVAILABLE'
    });
    expect(decision.route).toBe('blocked');
    expect(decision.reason).toBe('NATIVE_UNAVAILABLE');
  });

  it('falls back on auto mode when native start fails', () => {
    const decision = resolveHdrMappingDecision({
      mode: 'auto',
      nativeRouteEnabled: true,
      probeSupported: true,
      hdrActive: true,
      nativeStartOk: false,
      nativeStartReason: 'START_FAILED'
    });
    expect(decision.route).toBe('fallback');
    expect(decision.reason).toBe('START_FAILED');
  });
});
