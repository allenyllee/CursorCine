function createChunkUploadQueue(options = {}) {
  const appendChunk = typeof options.appendChunk === 'function' ? options.appendChunk : async () => {};

  let chain = Promise.resolve();
  let failure = null;

  function enqueue(data) {
    chain = chain.then(async () => {
      await appendChunk(data);
    }).catch((error) => {
      failure = error;
      throw error;
    });
    return chain;
  }

  function getFailure() {
    return failure;
  }

  async function waitForDrain() {
    await chain;
    if (failure) {
      throw failure;
    }
  }

  function reset() {
    chain = Promise.resolve();
    failure = null;
  }

  return {
    enqueue,
    waitForDrain,
    getFailure,
    reset
  };
}

module.exports = {
  createChunkUploadQueue
};
