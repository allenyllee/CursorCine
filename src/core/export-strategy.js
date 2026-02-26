function normalizeExportMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'ffmpeg' || mode === 'builtin') {
    return mode;
  }
  return 'auto';
}

function decideNextExportAction(input = {}) {
  const mode = normalizeExportMode(input.mode);
  const ffmpegResult = input.ffmpegResult || null;

  if (mode === 'builtin') {
    return { useBuiltin: true, done: false, reason: 'MODE_BUILTIN' };
  }

  if (!ffmpegResult) {
    return { useFfmpeg: true, done: false, reason: 'TRY_FFMPEG' };
  }

  if (ffmpegResult.ok) {
    return { done: true, route: 'ffmpeg', reason: 'FFMPEG_OK' };
  }

  const failureReason = String(ffmpegResult.reason || 'FFMPEG_FAILED');
  if (failureReason === 'CANCELED' || failureReason === 'EXPORT_ABORTED') {
    return { done: true, route: 'ffmpeg', reason: failureReason };
  }

  if (mode === 'ffmpeg') {
    return { done: true, route: 'ffmpeg', reason: failureReason, error: true };
  }

  return {
    useBuiltin: true,
    done: false,
    reason: failureReason,
    reuseOutputPath: String(input.preselectedOutputPath || '')
  };
}

module.exports = {
  normalizeExportMode,
  decideNextExportAction
};
