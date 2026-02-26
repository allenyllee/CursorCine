const { createChunkUploadQueue } = require('../../src/core/chunk-upload');

describe('chunk upload queue', () => {
  it('processes chunks sequentially', async () => {
    const order = [];
    const q = createChunkUploadQueue({
      appendChunk: async (data) => {
        order.push(data);
      }
    });

    await Promise.all([q.enqueue('a'), q.enqueue('b'), q.enqueue('c')]);
    await q.waitForDrain();
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('captures failure and exposes it', async () => {
    const q = createChunkUploadQueue({
      appendChunk: async (data) => {
        if (data === 'bad') {
          throw new Error('bad chunk');
        }
      }
    });

    await expect(q.enqueue('bad')).rejects.toThrow('bad chunk');
    expect(q.getFailure()).toBeTruthy();
    q.reset();
    expect(q.getFailure()).toBeNull();
  });
});
