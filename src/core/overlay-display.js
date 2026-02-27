function getDisplayBounds(display) {
  const bounds = display && display.bounds
    ? display.bounds
    : { x: 0, y: 0, width: 0, height: 0 };

  return {
    x: Number(bounds.x || 0),
    y: Number(bounds.y || 0),
    width: Math.max(1, Number(bounds.width || 1)),
    height: Math.max(1, Number(bounds.height || 1))
  };
}

function extractDisplayIdFromSourceId(sourceId) {
  const raw = String(sourceId || '');
  const match = /^screen:([^:]+):/i.exec(raw);
  if (!match || !match[1]) {
    return '';
  }
  return String(match[1]);
}

function resolveOverlayTargetDisplayId(options = {}) {
  const displays = Array.isArray(options.displays) ? options.displays : [];
  const sources = Array.isArray(options.sources) ? options.sources : [];
  const inputDisplayId = String(options.inputDisplayId || '');
  const inputSourceId = String(options.inputSourceId || '');

  const hasDisplayIdMatch = inputDisplayId &&
    displays.some((d) => String(d && d.id ? d.id : '') === inputDisplayId);
  if (hasDisplayIdMatch) {
    return {
      displayId: inputDisplayId,
      sourceId: inputSourceId,
      resolveMethod: 'input-display-id'
    };
  }

  const parsedFromSourceId = extractDisplayIdFromSourceId(inputSourceId);
  const hasParsedMatch = parsedFromSourceId &&
    displays.some((d) => String(d && d.id ? d.id : '') === parsedFromSourceId);
  if (hasParsedMatch) {
    return {
      displayId: parsedFromSourceId,
      sourceId: inputSourceId,
      resolveMethod: 'source-id-prefix'
    };
  }

  const matchedSource = sources.find((item) => String(item && item.id ? item.id : '') === inputSourceId);
  const mappedDisplayId = String(matchedSource && matchedSource.display_id ? matchedSource.display_id : '');
  const hasMappedMatch = mappedDisplayId &&
    displays.some((d) => String(d && d.id ? d.id : '') === mappedDisplayId);
  if (hasMappedMatch) {
    return {
      displayId: mappedDisplayId,
      sourceId: inputSourceId,
      resolveMethod: 'desktop-capturer-map'
    };
  }

  return {
    displayId: '',
    sourceId: inputSourceId,
    resolveMethod: 'fallback-primary'
  };
}

function buildOverlayViewport(display) {
  const bounds = getDisplayBounds(display);
  return {
    bounds,
    redFrameBounds: { ...bounds },
    penBounds: { ...bounds },
    canvasLogicalSize: {
      width: bounds.width,
      height: bounds.height
    }
  };
}

module.exports = {
  getDisplayBounds,
  extractDisplayIdFromSourceId,
  resolveOverlayTargetDisplayId,
  buildOverlayViewport
};
