const { contextBridge, ipcRenderer } = require('electron');

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

function createRecordingUploadController() {
  let session = null;
  let chain = Promise.resolve();
  let failure = null;
  let totalBytes = 0;
  let chunkCount = 0;

  return {
    async openSession(payload) {
      session = await ipcRenderer.invoke('video:blob-upload-open', payload || {});
      chain = Promise.resolve();
      failure = null;
      totalBytes = 0;
      chunkCount = 0;
      if (!session || !session.ok) {
        throw new Error((session && session.message) || '無法建立錄影暫存檔。');
      }
      return session;
    },
    enqueueChunk(blob) {
      const size = Number(blob && blob.size ? blob.size : 0);
      if (size > 0) {
        chunkCount += 1;
        totalBytes += size;
      }
      chain = chain.then(async () => {
        if (!session || !session.ok) {
          throw new Error('錄影上傳工作階段未建立。');
        }
        const chunkBytes = new Uint8Array(await blob.arrayBuffer());
        const chunkResult = await ipcRenderer.invoke('video:blob-upload-chunk', {
          sessionId: Number(session.sessionId),
          bytes: chunkBytes
        });
        if (!chunkResult || !chunkResult.ok) {
          throw new Error((chunkResult && chunkResult.message) || '寫入錄影區塊失敗。');
        }
      }).catch((error) => {
        failure = error;
        throw error;
      });
      return chain;
    },
    async finishSession() {
      await chain;
      if (failure) {
        throw failure;
      }
      if (!session || !session.ok) {
        throw new Error('錄影暫存檔已失效。');
      }
      const finished = session;
      session = null;
      const closeResult = await ipcRenderer.invoke('video:blob-upload-close', {
        sessionId: Number(finished.sessionId),
        abort: false
      });
      if (!closeResult || !closeResult.ok) {
        throw new Error((closeResult && closeResult.message) || '無法關閉錄影暫存檔。');
      }
      return finished;
    },
    async abortSession() {
      const current = session;
      session = null;
      chain = Promise.resolve();
      failure = null;
      if (!current || !current.ok) {
        return;
      }
      await ipcRenderer.invoke('video:blob-upload-close', {
        sessionId: Number(current.sessionId || 0),
        abort: true
      }).catch(() => {});
    },
    getStats() {
      return {
        chunkCount,
        totalBytes,
        failed: Boolean(failure),
        error: failure || null
      };
    },
    reset() {
      session = null;
      chain = Promise.resolve();
      failure = null;
      totalBytes = 0;
      chunkCount = 0;
    }
  };
}

const recordingUploadController = createRecordingUploadController();

contextBridge.exposeInMainWorld('electronAPI', {
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
  overlayCreate: (payload) => ipcRenderer.invoke('overlay:create', payload),
  overlayDestroy: () => ipcRenderer.invoke('overlay:destroy'),
  overlaySetEnabled: (enabled) => ipcRenderer.invoke('overlay:set-enabled', enabled),
  overlayGetState: () => ipcRenderer.invoke('overlay:get-state'),
  overlaySetInteractionMode: (mode) => ipcRenderer.invoke('overlay:set-interaction-mode', mode),
  overlaySetPenStyle: (style) => ipcRenderer.invoke('overlay:set-pen-style', style),
  overlayUndo: () => ipcRenderer.invoke('overlay:undo'),
  overlayClear: () => ipcRenderer.invoke('overlay:clear'),
  overlayTestDrawHorizontal: (payload) => ipcRenderer.invoke('overlay:test-draw-horizontal', payload),
  overlayDoubleClickMarker: (payload) => ipcRenderer.invoke('overlay:double-click-marker', payload),
  hdrWorkerStatus: () => ipcRenderer.invoke('hdr:worker-status'),
  hdrWorkerStart: (payload) => ipcRenderer.invoke('hdr:worker-start', payload),
  hdrWorkerStop: () => ipcRenderer.invoke('hdr:worker-stop'),
  hdrWorkerCaptureStart: (payload) => ipcRenderer.invoke('hdr:worker-capture-start', payload),
  hdrWorkerCaptureStop: () => ipcRenderer.invoke('hdr:worker-capture-stop'),
  hdrWorkerFrameMeta: () => ipcRenderer.invoke('hdr:worker-frame-meta'),
  hdrWorkerFrameRead: () => ipcRenderer.invoke('hdr:worker-frame-read'),
  hdrSharedStart: (payload) => ipcRenderer.invoke('hdr:shared-start', payload),
  hdrSharedBind: (payload) => ipcRenderer.invoke('hdr:shared-bind', payload),
  hdrSharedBindAsync: (payload) => new Promise((resolve) => {
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
    const timer = setTimeout(() => {
      done({ ok: false, bound: false, reason: 'BIND_TIMEOUT', message: 'Shared bind timeout' });
    }, 2500);
    ipcRenderer.on('hdr:shared-bind-async:result', onResult);
    ipcRenderer.send('hdr:shared-bind-async', {
      ...(payload || {}),
      requestId
    });
  }),
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
});
