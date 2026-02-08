const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getCursorPoint: (displayId) => ipcRenderer.invoke('cursor:get', displayId),
  getLatestClick: (displayId, lastSeenTimestamp) => ipcRenderer.invoke('click:get-latest', displayId, lastSeenTimestamp),
  getDesktopSources: () => ipcRenderer.invoke('desktop-sources:get'),
  convertWebmToMp4: (bytes, baseName) => ipcRenderer.invoke('video:convert-webm-to-mp4', { bytes, baseName }),
  overlayCreate: (displayId) => ipcRenderer.invoke('overlay:create', displayId),
  overlayDestroy: () => ipcRenderer.invoke('overlay:destroy'),
  overlaySetEnabled: (enabled) => ipcRenderer.invoke('overlay:set-enabled', enabled),
  overlaySetPenStyle: (style) => ipcRenderer.invoke('overlay:set-pen-style', style),
  overlayUndo: () => ipcRenderer.invoke('overlay:undo'),
  overlayClear: () => ipcRenderer.invoke('overlay:clear'),
  overlayDoubleClickMarker: (payload) => ipcRenderer.invoke('overlay:double-click-marker', payload),
  minimizeMainWindow: () => ipcRenderer.invoke('window:minimize-main')
});
