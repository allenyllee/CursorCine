const { normalizeExportMode, decideNextExportAction } = require('../../src/core/export-strategy');

describe('export-strategy core', () => {
  it('normalizes mode', () => {
    expect(normalizeExportMode('ffmpeg')).toBe('ffmpeg');
    expect(normalizeExportMode('builtin')).toBe('builtin');
    expect(normalizeExportMode('auto')).toBe('auto');
    expect(normalizeExportMode('x')).toBe('auto');
  });

  it('auto mode tries ffmpeg first', () => {
    const action = decideNextExportAction({ mode: 'auto' });
    expect(action.useFfmpeg).toBe(true);
  });

  it('auto mode falls back to builtin and reuses output path', () => {
    const action = decideNextExportAction({
      mode: 'auto',
      preselectedOutputPath: '/tmp/output.webm',
      ffmpegResult: { ok: false, reason: 'TRIM_FAILED' }
    });
    expect(action.useBuiltin).toBe(true);
    expect(action.reuseOutputPath).toBe('/tmp/output.webm');
  });

  it('ffmpeg-only mode stops on ffmpeg failure', () => {
    const action = decideNextExportAction({
      mode: 'ffmpeg',
      ffmpegResult: { ok: false, reason: 'TRIM_FAILED' }
    });
    expect(action.done).toBe(true);
    expect(action.error).toBe(true);
  });
});
