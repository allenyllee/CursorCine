const { contextBridge, ipcRenderer } = require('electron');
const { createPreloadApi } = require('./preload-api');

contextBridge.exposeInMainWorld('electronAPI', createPreloadApi(ipcRenderer));
