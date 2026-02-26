function createIpcHandlers(deps = {}) {
  const desktopCapturerApi = deps.desktopCapturer;
  const isTestMode = Boolean(deps.testMode);
  const testCaptureMode = String(deps.testCaptureMode || 'mock').toLowerCase();
  const testExportMode = String(deps.testExportMode || 'mock').toLowerCase();

  return {
    'app:test-config': async () => ({
      ok: true,
      testMode: isTestMode,
      captureMode: testCaptureMode,
      exportMode: testExportMode
    }),
    'desktop-sources:get': async () => {
      if (isTestMode && testCaptureMode === 'mock') {
        return [{
          id: 'screen:test:0',
          name: 'Mock Display',
          display_id: 'test-display-1'
        }];
      }
      return desktopCapturerApi.getSources({
        types: ['screen'],
        thumbnailSize: { width: 0, height: 0 },
        fetchWindowIcons: false
      });
    }
  };
}

function registerIpcHandlers(ipcMain, handlers) {
  for (const [channel, handler] of Object.entries(handlers || {})) {
    ipcMain.handle(channel, handler);
  }
}

module.exports = {
  createIpcHandlers,
  registerIpcHandlers
};
