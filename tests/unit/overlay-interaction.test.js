const {
  normalizeOverlayInteractionMode,
  getOverlayInteractionProfile
} = require('../../src/core/overlay-interaction');

describe('overlay interaction core', () => {
  it('normalizes mode', () => {
    expect(normalizeOverlayInteractionMode('smooth')).toBe('smooth');
    expect(normalizeOverlayInteractionMode('STABLE')).toBe('stable');
    expect(normalizeOverlayInteractionMode('x')).toBe('stable');
  });

  it('returns smooth profile', () => {
    const profile = getOverlayInteractionProfile('smooth', { safeReleaseBase: 700 });
    expect(profile.mode).toBe('smooth');
    expect(profile.wheelPauseMs).toBe(55);
    expect(profile.safeReleaseMs).toBe(35);
  });

  it('returns stable profile with configurable safeReleaseMs', () => {
    const profile = getOverlayInteractionProfile('stable', { safeReleaseBase: 540 });
    expect(profile.mode).toBe('stable');
    expect(profile.wheelPauseMs).toBe(450);
    expect(profile.safeReleaseMs).toBe(540);
  });
});
