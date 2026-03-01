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
    expect(typeof api.hdrPreviewStart).toBe('function');
    expect(typeof api.hdrPreviewRead).toBe('function');
    expect(typeof api.hdrPreviewStop).toBe('function');
    expect(typeof api.hdrPreviewEncodedStart).toBe('function');
    expect(typeof api.hdrPreviewEncodedRead).toBe('function');
    expect(typeof api.hdrPreviewEncodedStop).toBe('function');
    expect(typeof api.hdrSharedPreflight).toBe('function');
    expect(typeof api.hdrSharedBindPrepared).toBe('function');
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
    await api.hdrPreviewStart({ sessionId: 1, codec: 'jpeg' });
    await api.hdrPreviewRead({ streamId: 1, minSeq: 0 });
    await api.hdrPreviewStop({ streamId: 1 });
    await api.hdrPreviewEncodedStart({ sessionId: 1, codec: 'h264' });
    await api.hdrPreviewEncodedRead({ streamId: 1, minSeq: 0 });
    await api.hdrPreviewEncodedStop({ streamId: 1 });
    await api.hdrSharedPreflight({ sharedFrameBuffer: {}, sharedControlBuffer: {} });

    expect(ipcRenderer.invoke).toHaveBeenCalledWith('desktop-sources:get');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('overlay:get-state');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('hdr:diagnostics-snapshot');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('hdr:preview-start', { sessionId: 1, codec: 'jpeg' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('hdr:preview-read', { streamId: 1, minSeq: 0 });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('hdr:preview-stop', { streamId: 1 });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('hdr:preview-encoded-start', { sessionId: 1, codec: 'h264' });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('hdr:preview-encoded-read', { streamId: 1, minSeq: 0 });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('hdr:preview-encoded-stop', { streamId: 1 });
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('hdr:shared-preflight', { sharedFrameBuffer: {}, sharedControlBuffer: {} });
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

  it('returns noop unbind when export-phase listener is invalid', () => {
    const ipcRenderer = createMockIpcRenderer();
    const api = createPreloadApi(ipcRenderer);
    const unbind = api.onExportPhase(null);
    expect(typeof unbind).toBe('function');
    unbind();
    expect(ipcRenderer.on).not.toHaveBeenCalled();
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

  it('resolves hdrSharedBindAsync on matching result event', async () => {
    const listeners = {};
    const ipcRenderer = {
      invoke: vi.fn(async () => ({ ok: true })),
      on: vi.fn((channel, cb) => {
        listeners[channel] = cb;
      }),
      send: vi.fn(),
      removeListener: vi.fn()
    };

    const api = createPreloadApi(ipcRenderer);
    const bindPromise = api.hdrSharedBindAsync({ displayId: '1' });
    const sendPayload = ipcRenderer.send.mock.calls[0][1];
    listeners['hdr:shared-bind-async:result']({}, {
      requestId: sendPayload.requestId,
      result: { ok: true, bound: true, reason: 'OK' }
    });

    await expect(bindPromise).resolves.toEqual({ ok: true, bound: true, reason: 'OK' });
  });

  it('resolves hdrSharedBindAsync with timeout result', async () => {
    vi.useFakeTimers();
    const ipcRenderer = createMockIpcRenderer();
    const api = createPreloadApi(ipcRenderer);

    const bindPromise = api.hdrSharedBindAsync({ displayId: '1' });
    await vi.advanceTimersByTimeAsync(3600);
    await expect(bindPromise).resolves.toMatchObject({ ok: false, reason: 'BIND_TIMEOUT' });
    vi.useRealTimers();
  });

  it('ignores async bind result when requestId does not match', async () => {
    vi.useFakeTimers();
    const listeners = {};
    const ipcRenderer = {
      invoke: vi.fn(async () => ({ ok: true })),
      on: vi.fn((channel, cb) => {
        listeners[channel] = cb;
      }),
      send: vi.fn(),
      removeListener: vi.fn()
    };

    const api = createPreloadApi(ipcRenderer);
    const bindPromise = api.hdrSharedBindAsync({ displayId: '1' });

    listeners['hdr:shared-bind-async:result']({}, {
      requestId: 'not-the-same',
      result: { ok: true, bound: true }
    });

    await vi.advanceTimersByTimeAsync(3600);
    await expect(bindPromise).resolves.toMatchObject({ ok: false, reason: 'BIND_TIMEOUT' });
    vi.useRealTimers();
  });

  it('honors custom hdrSharedBindAsync timeout value', async () => {
    vi.useFakeTimers();
    const ipcRenderer = createMockIpcRenderer();
    const api = createPreloadApi(ipcRenderer);

    const bindPromise = api.hdrSharedBindAsync({ displayId: '1', timeoutMs: 900 });
    await vi.advanceTimersByTimeAsync(950);
    await expect(bindPromise).resolves.toMatchObject({ ok: false, reason: 'BIND_TIMEOUT' });
    vi.useRealTimers();
  });

  it('resolves hdrSharedBindPrepared with shared buffers', async () => {
    const listeners = {};
    const ipcRenderer = {
      invoke: vi.fn(async (channel) => {
        if (channel === 'hdr:shared-preflight') {
          return { ok: true, reason: 'OK' };
        }
        return { ok: true };
      }),
      on: vi.fn((channel, cb) => {
        listeners[channel] = cb;
      }),
      send: vi.fn(),
      removeListener: vi.fn()
    };

    const api = createPreloadApi(ipcRenderer);
    const bindPromise = api.hdrSharedBindPrepared({ sessionId: 1, frameBytes: 1024 * 1024, controlSlots: 16, timeoutMs: 900 });
    await Promise.resolve();
    const sendPayload = ipcRenderer.send.mock.calls[0][1];
    listeners['hdr:shared-bind-async:result']({}, {
      requestId: sendPayload.requestId,
      result: { ok: true, bound: true, reason: 'OK' }
    });
    const result = await bindPromise;
    expect(result.ok).toBe(true);
    expect(result.bound).toBe(true);
    expect(result.sharedFrameBuffer instanceof SharedArrayBuffer).toBe(true);
    expect(result.sharedControlBuffer instanceof SharedArrayBuffer).toBe(true);
  });

  it('maps matching async bind event without result to BIND_EMPTY_RESULT', async () => {
    const listeners = {};
    const ipcRenderer = {
      invoke: vi.fn(async () => ({ ok: true })),
      on: vi.fn((channel, cb) => {
        listeners[channel] = cb;
      }),
      send: vi.fn(),
      removeListener: vi.fn()
    };

    const api = createPreloadApi(ipcRenderer);
    const bindPromise = api.hdrSharedBindAsync({ displayId: '1' });
    const sendPayload = ipcRenderer.send.mock.calls[0][1];
    listeners['hdr:shared-bind-async:result']({}, { requestId: sendPayload.requestId });

    await expect(bindPromise).resolves.toMatchObject({ ok: false, reason: 'BIND_EMPTY_RESULT' });
  });
});
