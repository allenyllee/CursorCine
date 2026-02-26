const { createRecordingController } = require('../../src/recording-controller');

describe('recording controller integration', () => {
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
});
