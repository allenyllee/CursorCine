const {
  getOverlayPlatformDefaults,
  enforceOverlayPlatformPolicy
} = require('../../src/core/overlay-policy');

describe('overlay policy core', () => {
  it('uses native + safe defaults on Windows', () => {
    const defaults = getOverlayPlatformDefaults('win32');
    expect(defaults).toEqual({
      backendRequested: 'native',
      windowBehavior: 'safe'
    });
  });

  it('uses electron + always defaults on non-Windows', () => {
    expect(getOverlayPlatformDefaults('linux')).toEqual({
      backendRequested: 'electron',
      windowBehavior: 'always'
    });
    expect(getOverlayPlatformDefaults('darwin')).toEqual({
      backendRequested: 'electron',
      windowBehavior: 'always'
    });
  });

  it('falls back to electron + safe on Windows when native is unavailable', () => {
    const enforced = enforceOverlayPlatformPolicy({
      platform: 'win32',
      requestedBackend: 'native',
      effectiveBackend: 'electron',
      currentWindowBehavior: 'always'
    });
    expect(enforced).toEqual({
      backendRequested: 'electron',
      windowBehavior: 'safe'
    });
  });

  it('forces non-Windows to electron + always regardless of input', () => {
    const enforced = enforceOverlayPlatformPolicy({
      platform: 'linux',
      requestedBackend: 'native',
      effectiveBackend: 'native',
      currentWindowBehavior: 'safe'
    });
    expect(enforced).toEqual({
      backendRequested: 'electron',
      windowBehavior: 'always'
    });
  });
});
