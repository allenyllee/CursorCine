const { createRecordingController } = require('../../src/recording-controller');

describe('recording controller integration', () => {
  it('requires electronAPI dependency', () => {
    expect(() => createRecordingController()).toThrow('electronAPI is required');
  });

  it('opens, appends chunks, and closes upload session', async () => {
    const electronAPI = {
      blobUploadOpen: vi.fn(async () => ({ ok: true, sessionId: 9, filePath: '/tmp/f.webm', tempDir: '/tmp/a' })),
      blobUploadChunk: vi.fn(async () => ({ ok: true })),
      blobUploadClose: vi.fn(async () => ({ ok: true }))
    };
    const controller = createRecordingController({
      electronAPI,
      arrayBufferFromBlob: async (blob) => blob._bytes.buffer
    });

    await controller.openSession({ mode: 'temp' });
    await controller.enqueueChunk({ size: 3, _bytes: new Uint8Array([1, 2, 3]) });
    const finished = await controller.finishSession();

    expect(finished.sessionId).toBe(9);
    expect(electronAPI.blobUploadChunk).toHaveBeenCalledTimes(1);
    expect(electronAPI.blobUploadClose).toHaveBeenCalledWith({ sessionId: 9, abort: false });
  });

  it('aborts upload session cleanly', async () => {
    const electronAPI = {
      blobUploadOpen: vi.fn(async () => ({ ok: true, sessionId: 11 })),
      blobUploadChunk: vi.fn(async () => ({ ok: true })),
      blobUploadClose: vi.fn(async () => ({ ok: true }))
    };
    const controller = createRecordingController({
      electronAPI,
      arrayBufferFromBlob: async () => new Uint8Array([1]).buffer
    });

    await controller.openSession({ mode: 'temp' });
    await controller.abortSession();
    expect(electronAPI.blobUploadClose).toHaveBeenCalledWith({ sessionId: 11, abort: true });
  });

  it('throws when open session fails', async () => {
    const electronAPI = {
      blobUploadOpen: vi.fn(async () => ({ ok: false, message: 'open failed' })),
      blobUploadChunk: vi.fn(async () => ({ ok: true })),
      blobUploadClose: vi.fn(async () => ({ ok: true }))
    };
    const controller = createRecordingController({
      electronAPI,
      arrayBufferFromBlob: async () => new Uint8Array([1]).buffer
    });

    await expect(controller.openSession({ mode: 'temp' })).rejects.toThrow('open failed');
  });

  it('surfaces upload chunk failure in stats', async () => {
    const electronAPI = {
      blobUploadOpen: vi.fn(async () => ({ ok: true, sessionId: 13 })),
      blobUploadChunk: vi.fn(async () => ({ ok: false, message: 'chunk write failed' })),
      blobUploadClose: vi.fn(async () => ({ ok: true }))
    };
    const controller = createRecordingController({
      electronAPI,
      arrayBufferFromBlob: async (blob) => blob._bytes.buffer
    });

    await controller.openSession({ mode: 'temp' });
    await expect(controller.enqueueChunk({ size: 2, _bytes: new Uint8Array([7, 8]) })).rejects.toThrow('chunk write failed');
    const stats = controller.getStats();
    expect(stats.failed).toBe(true);
    expect(String(stats.error)).toContain('chunk write failed');
  });

  it('throws if finish is called without a valid session', async () => {
    const electronAPI = {
      blobUploadOpen: vi.fn(async () => ({ ok: true, sessionId: 17 })),
      blobUploadChunk: vi.fn(async () => ({ ok: true })),
      blobUploadClose: vi.fn(async () => ({ ok: true }))
    };
    const controller = createRecordingController({
      electronAPI,
      arrayBufferFromBlob: async () => new Uint8Array([1]).buffer
    });

    await expect(controller.finishSession()).rejects.toThrow('錄影暫存檔已失效');
  });

  it('throws when close result is not ok', async () => {
    const electronAPI = {
      blobUploadOpen: vi.fn(async () => ({ ok: true, sessionId: 21 })),
      blobUploadChunk: vi.fn(async () => ({ ok: true })),
      blobUploadClose: vi.fn(async () => ({ ok: false, message: 'close failed' }))
    };
    const controller = createRecordingController({
      electronAPI,
      arrayBufferFromBlob: async (blob) => blob._bytes.buffer
    });

    await controller.openSession({ mode: 'temp' });
    await controller.enqueueChunk({ size: 1, _bytes: new Uint8Array([1]) });
    await expect(controller.finishSession()).rejects.toThrow('close failed');
  });

  it('abortSession is a no-op when no active session exists', async () => {
    const electronAPI = {
      blobUploadOpen: vi.fn(async () => ({ ok: true, sessionId: 22 })),
      blobUploadChunk: vi.fn(async () => ({ ok: true })),
      blobUploadClose: vi.fn(async () => ({ ok: true }))
    };
    const controller = createRecordingController({
      electronAPI,
      arrayBufferFromBlob: async () => new Uint8Array([1]).buffer
    });

    await controller.abortSession();
    expect(electronAPI.blobUploadClose).not.toHaveBeenCalled();
  });

  it('fails enqueue when upload session has not been opened', async () => {
    const electronAPI = {
      blobUploadOpen: vi.fn(async () => ({ ok: true, sessionId: 33 })),
      blobUploadChunk: vi.fn(async () => ({ ok: true })),
      blobUploadClose: vi.fn(async () => ({ ok: true }))
    };
    const controller = createRecordingController({
      electronAPI,
      arrayBufferFromBlob: async (blob) => blob._bytes.buffer
    });

    await expect(controller.enqueueChunk({ size: 1, _bytes: new Uint8Array([1]) })).rejects.toThrow('錄影上傳工作階段未建立');
  });

  it('reset clears stats after chunks were counted', async () => {
    const electronAPI = {
      blobUploadOpen: vi.fn(async () => ({ ok: true, sessionId: 44 })),
      blobUploadChunk: vi.fn(async () => ({ ok: true })),
      blobUploadClose: vi.fn(async () => ({ ok: true }))
    };
    const controller = createRecordingController({
      electronAPI,
      arrayBufferFromBlob: async (blob) => blob._bytes.buffer
    });

    await controller.openSession({ mode: 'temp' });
    await controller.enqueueChunk({ size: 3, _bytes: new Uint8Array([1, 2, 3]) });
    expect(controller.getStats().totalBytes).toBe(3);

    controller.reset();
    expect(controller.getStats()).toMatchObject({ chunkCount: 0, totalBytes: 0, failed: false });
  });
});
