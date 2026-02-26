const { createPreloadApi } = require('../../src/preload-api');

describe('preload api contract', () => {
  function createMockIpcRenderer() {
    return {
      invoke: vi.fn(async () => ({ ok: true })),
      on: vi.fn(),
      send: vi.fn(),
      removeListener: vi.fn()
    };
  }

  it('exposes expected surface and forwards invokes', async () => {
    const ipcRenderer = createMockIpcRenderer();
    const api = createPreloadApi(ipcRenderer);

    expect(typeof api.getDesktopSources).toBe('function');
    expect(typeof api.hdrSharedStart).toBe('function');
    expect(typeof api.exportTrimmedVideoFromPath).toBe('function');
    expect(typeof api.overlayGetState).toBe('function');
    expect(typeof api.getTestConfig).toBe('function');
    expect(typeof api.recordingUploadOpen).toBe('function');
    expect(typeof api.recordingUploadChunk).toBe('function');
    expect(typeof api.recordingUploadFinish).toBe('function');
    expect(typeof api.recordingUploadAbort).toBe('function');
    expect(typeof api.decideExportAction).toBe('function');

    await api.getDesktopSources();
    await api.overlayGetState();
    await api.hdrDiagnosticsSnapshot();

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('desktop-sources:get');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('overlay:get-state');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('hdr:diagnostics-snapshot');
  });

  it('supports export-phase event subscription', () => {
    const ipcRenderer = createMockIpcRenderer();
    const api = createPreloadApi(ipcRenderer);
    const listener = vi.fn();

    const unbind = api.onExportPhase(listener);
    expect(ipcRenderer.on).toHaveBeenCalledWith('video:export-phase', expect.any(Function));

    unbind();
    expect(ipcRenderer.removeListener).toHaveBeenCalledWith('video:export-phase', expect.any(Function));
  });

  it('exposes export fallback decision helper', () => {
    const ipcRenderer = createMockIpcRenderer();
    const api = createPreloadApi(ipcRenderer);
    const decision = api.decideExportAction({
      mode: 'auto',
      ffmpegResult: { ok: false, reason: 'TRIM_FAILED' },
      preselectedOutputPath: '/tmp/demo.webm'
    });
    expect(decision.useBuiltin).toBe(true);
    expect(decision.reuseOutputPath).toBe('/tmp/demo.webm');
  });
});
