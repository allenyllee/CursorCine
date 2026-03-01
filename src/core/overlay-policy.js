function normalizePlatform(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeOverlayBackend(value) {
  return String(value || '').trim().toLowerCase() === 'native' ? 'native' : 'electron';
}

function normalizeOverlayWindowBehavior(value) {
  return String(value || '').trim().toLowerCase() === 'always' ? 'always' : 'safe';
}

function isWindowsPlatform(platform) {
  return normalizePlatform(platform) === 'win32';
}

function getOverlayPlatformDefaults(platform) {
  if (isWindowsPlatform(platform)) {
    return {
      backendRequested: 'native',
      windowBehavior: 'safe'
    };
  }
  return {
    backendRequested: 'electron',
    windowBehavior: 'always'
  };
}

function enforceOverlayPlatformPolicy(input = {}) {
  const platform = normalizePlatform(input.platform);
  const requestedBackend = normalizeOverlayBackend(input.requestedBackend);
  const effectiveBackend = normalizeOverlayBackend(input.effectiveBackend);
  const currentWindowBehavior = normalizeOverlayWindowBehavior(input.currentWindowBehavior);

  if (!isWindowsPlatform(platform)) {
    return {
      backendRequested: 'electron',
      windowBehavior: 'always'
    };
  }

  if (requestedBackend === 'native' && effectiveBackend !== 'native') {
    return {
      backendRequested: 'electron',
      windowBehavior: 'safe'
    };
  }

  return {
    backendRequested: requestedBackend,
    windowBehavior: currentWindowBehavior
  };
}

module.exports = {
  getOverlayPlatformDefaults,
  enforceOverlayPlatformPolicy
};
