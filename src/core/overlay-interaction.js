function normalizeOverlayInteractionMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  return mode === 'smooth' ? 'smooth' : 'stable';
}

function getOverlayInteractionProfile(mode, options = {}) {
  const normalizedMode = normalizeOverlayInteractionMode(mode);
  const safeReleaseBase = Math.max(120, Math.min(1200, Number(options.safeReleaseBase || 360) || 360));

  if (normalizedMode === 'smooth') {
    return {
      mode: 'smooth',
      wheelPauseMs: 55,
      reentryPauseMs: 30,
      reentryGraceMs: 180,
      reentryClickThrough: true,
      keepWheelLockIntercept: false,
      wheelHideOverlay: false,
      safeArmMs: 30,
      safeReleaseMs: 35
    };
  }

  return {
    mode: 'stable',
    wheelPauseMs: 450,
    reentryPauseMs: 140,
    reentryGraceMs: 1200,
    reentryClickThrough: false,
    keepWheelLockIntercept: true,
    wheelHideOverlay: true,
    safeArmMs: 320,
    safeReleaseMs: safeReleaseBase
  };
}

module.exports = {
  normalizeOverlayInteractionMode,
  getOverlayInteractionProfile
};
