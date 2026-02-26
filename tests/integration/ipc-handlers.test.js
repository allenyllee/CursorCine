const { createIpcHandlers, registerIpcHandlers } = require('../../src/ipc-handlers');

describe('ipc handlers', () => {
  it('returns mock desktop source in test capture mode', async () => {
    const handlers = createIpcHandlers({
      desktopCapturer: { getSources: vi.fn() },
      testMode: true,
      testCaptureMode: 'mock',
      testExportMode: 'mock'
    });

    const cfg = await handlers['app:test-config']();
    const sources = await handlers['desktop-sources:get']();

    expect(cfg.testMode).toBe(true);
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe('screen:test:0');
  });

  it('registers handlers via ipcMain.handle', () => {
    const ipc = { handle: vi.fn() };
    registerIpcHandlers(ipc, {
      alpha: async () => 1,
      beta: async () => 2
    });
    expect(ipc.handle).toHaveBeenCalledTimes(2);
    expect(ipc.handle).toHaveBeenNthCalledWith(1, 'alpha', expect.any(Function));
    expect(ipc.handle).toHaveBeenNthCalledWith(2, 'beta', expect.any(Function));
  });
});
