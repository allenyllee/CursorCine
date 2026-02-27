const {
  getDisplayBounds,
  resolveOverlayTargetDisplayId,
  buildOverlayViewport
} = require('../../src/core/overlay-display');

describe('overlay-display core', () => {
  it('keeps red frame and pen bounds aligned to display visible bounds', () => {
    const display = {
      id: 2,
      bounds: { x: 1920, y: 0, width: 2560, height: 1440 }
    };

    const viewport = buildOverlayViewport(display);

    expect(viewport.bounds).toEqual({ x: 1920, y: 0, width: 2560, height: 1440 });
    expect(viewport.redFrameBounds).toEqual(viewport.bounds);
    expect(viewport.penBounds).toEqual(viewport.bounds);
    expect(viewport.canvasLogicalSize).toEqual({ width: 2560, height: 1440 });
  });

  it('stays aligned after switching to another display with different size', () => {
    const display1 = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } };
    const display2 = { id: 2, bounds: { x: -1600, y: 0, width: 1600, height: 900 } };

    const viewport1 = buildOverlayViewport(display1);
    const viewport2 = buildOverlayViewport(display2);

    expect(viewport1.redFrameBounds).toEqual(viewport1.penBounds);
    expect(viewport1.redFrameBounds).toEqual(viewport1.bounds);
    expect(viewport2.redFrameBounds).toEqual(viewport2.penBounds);
    expect(viewport2.redFrameBounds).toEqual(viewport2.bounds);
    expect(viewport1.bounds).not.toEqual(viewport2.bounds);
  });

  it('normalizes invalid display bounds to safe minimums', () => {
    expect(getDisplayBounds({ bounds: { x: 10, y: 20, width: 0, height: -5 } }))
      .toEqual({ x: 10, y: 20, width: 1, height: 1 });
  });

  it('resolves target display by explicit display id first', () => {
    const resolved = resolveOverlayTargetDisplayId({
      inputDisplayId: '2',
      inputSourceId: 'screen:1:0',
      displays: [{ id: '1' }, { id: '2' }],
      sources: []
    });
    expect(resolved.displayId).toBe('2');
    expect(resolved.resolveMethod).toBe('input-display-id');
  });

  it('falls back to source id prefix and desktop capturer mapping', () => {
    const byPrefix = resolveOverlayTargetDisplayId({
      inputDisplayId: '',
      inputSourceId: 'screen:3:0',
      displays: [{ id: '2' }, { id: '3' }],
      sources: []
    });
    expect(byPrefix.displayId).toBe('3');
    expect(byPrefix.resolveMethod).toBe('source-id-prefix');

    const byMap = resolveOverlayTargetDisplayId({
      inputDisplayId: '',
      inputSourceId: 'screen:ignored:42',
      displays: [{ id: '2' }, { id: '4' }],
      sources: [{ id: 'screen:ignored:42', display_id: '4' }]
    });
    expect(byMap.displayId).toBe('4');
    expect(byMap.resolveMethod).toBe('desktop-capturer-map');
  });
});
