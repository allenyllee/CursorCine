const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getCursorPoint: (displayId) => ipcRenderer.invoke('cursor:get', displayId),
  getLatestClick: (displayId, lastSeenTimestamp) => ipcRenderer.invoke('click:get-latest', displayId, lastSeenTimestamp),
  getDesktopSources: () => ipcRenderer.invoke('desktop-sources:get'),
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
  pathToFileUrl: (payload) => ipcRenderer.invoke('path:to-file-url', payload),
  cleanupTempDir: (payload) => ipcRenderer.invoke('path:cleanup-temp-dir', payload),
  overlayCreate: (displayId) => ipcRenderer.invoke('overlay:create', displayId),
  overlayDestroy: () => ipcRenderer.invoke('overlay:destroy'),
  overlaySetEnabled: (enabled) => ipcRenderer.invoke('overlay:set-enabled', enabled),
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
