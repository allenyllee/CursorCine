const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getCursorPoint: (displayId) => ipcRenderer.invoke('cursor:get', displayId),
  getLatestClick: (displayId, lastSeenTimestamp) => ipcRenderer.invoke('click:get-latest', displayId, lastSeenTimestamp),
  getDesktopSources: () => ipcRenderer.invoke('desktop-sources:get'),
  convertWebmToMp4: (bytes, baseName) => ipcRenderer.invoke('video:convert-webm-to-mp4', { bytes, baseName })
});
