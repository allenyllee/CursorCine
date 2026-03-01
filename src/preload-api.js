const { createRecordingController } = require('./recording-controller');
const { decideNextExportAction } = require('./core/export-strategy');

function createPreloadApi(ipcRenderer) {
  function runHdrSharedBindAsync(payload = {}) {
    return new Promise((resolve) => {
      const requestId = 'bind-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      let settled = false;
      const done = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        ipcRenderer.removeListener('hdr:shared-bind-async:result', onResult);
        resolve(result || { ok: false, bound: false, reason: 'BIND_UNKNOWN', message: 'Unknown bind result' });
      };
      const onResult = (_event, message) => {
        if (!message || String(message.requestId || '') !== requestId) {
          return;
        }
        done(message.result || { ok: false, bound: false, reason: 'BIND_EMPTY_RESULT', message: 'Empty bind result' });
      };
      const timeoutMs = Math.max(800, Math.min(10000, Number(payload && payload.timeoutMs ? payload.timeoutMs : 3500) || 3500));
      const timer = setTimeout(() => {
        done({ ok: false, bound: false, reason: 'BIND_TIMEOUT', message: 'Shared bind timeout' });
      }, timeoutMs);
      ipcRenderer.on('hdr:shared-bind-async:result', onResult);
      ipcRenderer.send('hdr:shared-bind-async', {
        ...(payload || {}),
        requestId
      });
    });
  }

  const uploadIpcApi = {
    blobUploadOpen: (payload) => ipcRenderer.invoke('video:blob-upload-open', payload),
    blobUploadChunk: (payload) => ipcRenderer.invoke('video:blob-upload-chunk', payload),
    blobUploadClose: (payload) => ipcRenderer.invoke('video:blob-upload-close', payload)
  };
  const recordingUploadController = createRecordingController({
    electronAPI: uploadIpcApi
  });

  return {
    getCursorPoint: (displayId) => ipcRenderer.invoke('cursor:get', displayId),
    getLatestClick: (displayId, lastSeenTimestamp) => ipcRenderer.invoke('click:get-latest', displayId, lastSeenTimestamp),
    getDesktopSources: () => ipcRenderer.invoke('desktop-sources:get'),
    getTestConfig: () => ipcRenderer.invoke('app:test-config'),
    convertWebmToMp4: (bytes, baseName) => ipcRenderer.invoke('video:convert-webm-to-mp4', { bytes, baseName }),
    convertWebmToMp4FromPath: (payload) => ipcRenderer.invoke('video:convert-webm-to-mp4-path', payload),
    saveVideoFile: (bytes, baseName, ext) => ipcRenderer.invoke('video:save-file', { bytes, baseName, ext }),
    exportTrimmedVideo: (payload) => ipcRenderer.invoke('video:trim-export', payload),
    exportTrimmedVideoFromPath: (payload) => ipcRenderer.invoke('video:trim-export-from-path', payload),
    pickSavePath: (payload) => ipcRenderer.invoke('video:pick-save-path', payload),
    exportTaskOpen: () => ipcRenderer.invoke('video:export-task-open'),
    exportTaskCancel: (payload) => ipcRenderer.invoke('video:export-task-cancel', payload),
    exportTaskClose: (payload) => ipcRenderer.invoke('video:export-task-close', payload),
    blobUploadOpen: (payload) => ipcRenderer.invoke('video:blob-upload-open', payload),
    blobUploadChunk: (payload) => ipcRenderer.invoke('video:blob-upload-chunk', payload),
    blobUploadClose: (payload) => ipcRenderer.invoke('video:blob-upload-close', payload),
    recordingUploadOpen: (payload) => recordingUploadController.openSession(payload),
    recordingUploadChunk: (blob) => recordingUploadController.enqueueChunk(blob),
    recordingUploadFinish: () => recordingUploadController.finishSession(),
    recordingUploadAbort: () => recordingUploadController.abortSession(),
    recordingUploadStats: () => recordingUploadController.getStats(),
    recordingUploadReset: () => recordingUploadController.reset(),
    decideExportAction: (payload) => decideNextExportAction(payload || {}),
    pathToFileUrl: (payload) => ipcRenderer.invoke('path:to-file-url', payload),
    cleanupTempDir: (payload) => ipcRenderer.invoke('path:cleanup-temp-dir', payload),
    copyText: (payload) => ipcRenderer.invoke('app:copy-text', payload),
    overlayCreate: (displayId) => ipcRenderer.invoke('overlay:create', displayId),
    overlayDestroy: () => ipcRenderer.invoke('overlay:destroy'),
    overlaySetEnabled: (enabled) => ipcRenderer.invoke('overlay:set-enabled', enabled),
    overlayGetState: () => ipcRenderer.invoke('overlay:get-state'),
    overlaySetInteractionMode: (mode) => ipcRenderer.invoke('overlay:set-interaction-mode', mode),
    overlaySetWindowBehavior: (mode) => ipcRenderer.invoke('overlay:set-window-behavior', mode),
    overlaySetBackend: (backend) => ipcRenderer.invoke('overlay:set-backend', backend),
    overlaySetPenStyle: (style) => ipcRenderer.invoke('overlay:set-pen-style', style),
    overlayUndo: () => ipcRenderer.invoke('overlay:undo'),
    overlayClear: () => ipcRenderer.invoke('overlay:clear'),
    overlayDoubleClickMarker: (payload) => ipcRenderer.invoke('overlay:double-click-marker', payload),
    hdrWorkerStatus: () => ipcRenderer.invoke('hdr:worker-status'),
    hdrWorkerStart: (payload) => ipcRenderer.invoke('hdr:worker-start', payload),
    hdrWorkerStop: () => ipcRenderer.invoke('hdr:worker-stop'),
    hdrWorkerCaptureStart: (payload) => ipcRenderer.invoke('hdr:worker-capture-start', payload),
    hdrWorkerCaptureStop: () => ipcRenderer.invoke('hdr:worker-capture-stop'),
    hdrWorkerFrameMeta: () => ipcRenderer.invoke('hdr:worker-frame-meta'),
    hdrWorkerFrameRead: () => ipcRenderer.invoke('hdr:worker-frame-read'),
    hdrSharedStart: (payload) => ipcRenderer.invoke('hdr:shared-start', payload),
    hdrPreviewStart: (payload) => ipcRenderer.invoke('hdr:preview-start', payload),
    hdrPreviewRead: (payload) => ipcRenderer.invoke('hdr:preview-read', payload),
    hdrPreviewStop: (payload) => ipcRenderer.invoke('hdr:preview-stop', payload),
    hdrSharedPreflight: (payload) => ipcRenderer.invoke('hdr:shared-preflight', payload),
    hdrSharedBind: (payload) => ipcRenderer.invoke('hdr:shared-bind', payload),
    hdrSharedBindAsync: (payload) => runHdrSharedBindAsync(payload),
    hdrSharedBindPrepared: async (payload) => {
      const frameBytes = Math.max(1024 * 1024, Number(payload && payload.frameBytes ? payload.frameBytes : 0) || 0);
      const controlSlots = Math.max(8, Number(payload && payload.controlSlots ? payload.controlSlots : 16) || 16);
      const sessionId = Number(payload && payload.sessionId ? payload.sessionId : 0);
      const timeoutMs = Number(payload && payload.timeoutMs ? payload.timeoutMs : 3500);
      if (!Number.isFinite(sessionId) || sessionId <= 0) {
        return { ok: false, bound: false, reason: 'INVALID_SESSION', message: 'Invalid session id' };
      }
      try {
        const sharedFrameBuffer = new SharedArrayBuffer(frameBytes);
        const sharedControlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * controlSlots);
        const preflight = await ipcRenderer.invoke('hdr:shared-preflight', {
          sharedFrameBuffer,
          sharedControlBuffer
        });
        if (!preflight || !preflight.ok) {
          return {
            ok: false,
            bound: false,
            reason: preflight && preflight.reason ? preflight.reason : 'BIND_REJECTED',
            message: preflight && preflight.message ? preflight.message : 'Shared preflight failed'
          };
        }
        const bindResult = await runHdrSharedBindAsync({
          sessionId,
          sharedFrameBuffer,
          sharedControlBuffer,
          timeoutMs
        });
        if (!bindResult || !bindResult.ok || !bindResult.bound) {
          return bindResult || { ok: false, bound: false, reason: 'BIND_REJECTED', message: 'Shared bind failed' };
        }
        return {
          ...bindResult,
          sharedFrameBuffer,
          sharedControlBuffer
        };
      } catch (error) {
        return {
          ok: false,
          bound: false,
          reason: 'BIND_EXCEPTION',
          message: error && error.message ? error.message : 'Shared bind prepared exception'
        };
      }
    },
    hdrSharedStop: (payload) => ipcRenderer.invoke('hdr:shared-stop', payload),
    hdrExperimentalState: (payload) => ipcRenderer.invoke('hdr:experimental-state', payload),
    hdrDiagnosticsSnapshot: () => ipcRenderer.invoke('hdr:diagnostics-snapshot'),
    hdrNativeRouteSmoke: (payload) => ipcRenderer.invoke('hdr:native-route-smoke', payload),
    hdrProbeWindows: (payload) => ipcRenderer.invoke('hdr:probe', payload),
    hdrCaptureStart: (payload) => ipcRenderer.invoke('hdr:start', payload),
    hdrCaptureReadFrame: (payload) => ipcRenderer.invoke('hdr:read-frame', payload),
    hdrCaptureStop: (payload) => ipcRenderer.invoke('hdr:stop', payload),
    shouldAutoMinimizeMainWindow: (displayId) => ipcRenderer.invoke('window:should-auto-minimize', displayId),
    minimizeMainWindow: () => ipcRenderer.invoke('window:minimize-main'),
    onExportPhase: (listener) => {
      if (typeof listener !== 'function') {
        return () => {};
      }
      const wrapped = (_event, payload) => listener(payload || {});
      ipcRenderer.on('video:export-phase', wrapped);
      return () => ipcRenderer.removeListener('video:export-phase', wrapped);
    }
  };
}

module.exports = {
  createPreloadApi
};
