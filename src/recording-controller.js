const { createChunkUploadQueue } = require('./core/chunk-upload');

function createRecordingController(deps = {}) {
  const electronAPI = deps.electronAPI;
  const arrayBufferFromBlob = deps.arrayBufferFromBlob || ((data) => data.arrayBuffer());

  if (!electronAPI) {
    throw new Error('electronAPI is required');
  }

  let session = null;
  let bytes = 0;
  let chunks = 0;

  const queue = createChunkUploadQueue({
    appendChunk: async (data) => {
      if (!session || !session.ok) {
        throw new Error('錄影上傳工作階段未建立。');
      }
      const chunkBytes = new Uint8Array(await arrayBufferFromBlob(data));
      const chunkResult = await electronAPI.blobUploadChunk({
        sessionId: Number(session.sessionId),
        bytes: chunkBytes
      });
      if (!chunkResult || !chunkResult.ok) {
        throw new Error((chunkResult && chunkResult.message) || '寫入錄影區塊失敗。');
      }
    }
  });

  async function openSession(payload) {
    session = await electronAPI.blobUploadOpen(payload || {});
    queue.reset();
    bytes = 0;
    chunks = 0;
    if (!session || !session.ok) {
      throw new Error((session && session.message) || '無法建立錄影暫存檔。');
    }
    return session;
  }

  async function enqueueChunk(blob) {
    const blobSize = Number(blob && blob.size ? blob.size : 0);
    if (blobSize > 0) {
      chunks += 1;
      bytes += blobSize;
    }
    return queue.enqueue(blob);
  }

  async function finishSession() {
    await queue.waitForDrain();
    if (!session || !session.ok) {
      throw new Error('錄影暫存檔已失效。');
    }
    const finishedSession = session;
    session = null;
    const closeResult = await electronAPI.blobUploadClose({
      sessionId: Number(finishedSession.sessionId),
      abort: false
    });
    if (!closeResult || !closeResult.ok) {
      throw new Error((closeResult && closeResult.message) || '無法關閉錄影暫存檔。');
    }
    return finishedSession;
  }

  async function abortSession() {
    const current = session;
    session = null;
    queue.reset();
    if (!current || !current.ok) {
      return;
    }
    await electronAPI.blobUploadClose({
      sessionId: Number(current.sessionId || 0),
      abort: true
    }).catch(() => {});
  }

  function getStats() {
    return {
      chunkCount: chunks,
      totalBytes: bytes,
      failed: Boolean(queue.getFailure()),
      error: queue.getFailure() || null
    };
  }

  return {
    openSession,
    enqueueChunk,
    finishSession,
    abortSession,
    getStats,
    reset: () => {
      session = null;
      queue.reset();
      bytes = 0;
      chunks = 0;
    }
  };
}

module.exports = {
  createRecordingController
};
