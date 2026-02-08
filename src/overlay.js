const { ipcRenderer } = require('electron');

const canvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d');

const STROKE_FADE_MS = 1200;
const DOUBLE_CLICK_MARKER_MS = 700;

const state = {
  enabled: false,
  drawActive: false,
  globalMouseDown: false,
  color: '#ff4f70',
  size: 4,
  strokes: [],
  activeStroke: null,
  isPointerDown: false,
  activePointerId: null,
  pointer: {
    visible: false,
    x: 0,
    y: 0
  },
  doubleClickMarker: {
    x: 0,
    y: 0,
    activeUntil: 0
  }
};

function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(window.innerWidth * dpr));
  const height = Math.max(1, Math.floor(window.innerHeight * dpr));

  if (canvas.width === width && canvas.height === height) {
    return;
  }

  canvas.width = width;
  canvas.height = height;
}

function drawPointerGlow() {
  if (!state.enabled || !state.drawActive || !state.pointer.visible) {
    return;
  }

  const x = state.pointer.x;
  const y = state.pointer.y;
  const dpr = window.devicePixelRatio || 1;
  const core = 3 * dpr;
  const radius = 14 * dpr;

  const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
  glow.addColorStop(0, 'rgba(255, 248, 194, 0.95)');
  glow.addColorStop(0.45, 'rgba(255, 205, 96, 0.55)');
  glow.addColorStop(1, 'rgba(255, 165, 65, 0)');

  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 255, 240, 0.95)';
  ctx.beginPath();
  ctx.arc(x, y, core, 0, Math.PI * 2);
  ctx.fill();
}

function triggerDoubleClickMarker(x, y) {
  state.doubleClickMarker.x = x * (window.devicePixelRatio || 1);
  state.doubleClickMarker.y = y * (window.devicePixelRatio || 1);
  state.doubleClickMarker.activeUntil = performance.now() + DOUBLE_CLICK_MARKER_MS;
}

function drawDoubleClickMarker(now) {
  if (now >= state.doubleClickMarker.activeUntil) {
    return;
  }

  const remaining = state.doubleClickMarker.activeUntil - now;
  const progress = 1 - (remaining / DOUBLE_CLICK_MARKER_MS);
  const alpha = Math.max(0, 0.9 * (1 - progress));
  const ringRadius = (18 + progress * 44) * (window.devicePixelRatio || 1);

  const x = state.doubleClickMarker.x;
  const y = state.doubleClickMarker.y;

  ctx.save();
  ctx.strokeStyle = "rgba(255, 236, 150, " + alpha.toFixed(3) + ")";
  ctx.lineWidth = 3.5 * (window.devicePixelRatio || 1);
  ctx.beginPath();
  ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "rgba(255, 140, 80, " + Math.max(0, alpha * 0.65).toFixed(3) + ")";
  ctx.beginPath();
  ctx.arc(x, y, (6 + (1 - progress) * 3) * (window.devicePixelRatio || 1), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAll(now) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!state.drawActive) {
    state.strokes = [];
    drawDoubleClickMarker(now);
    return;
  }

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const remaining = [];

  for (const stroke of state.strokes) {
    if (!stroke.points.length) {
      continue;
    }

    const age = now - stroke.lastUpdatedAt;
    const alpha = Math.max(0, 1 - age / STROKE_FADE_MS);
    if (alpha <= 0) {
      continue;
    }

    remaining.push(stroke);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.beginPath();

    for (let i = 0; i < stroke.points.length; i += 1) {
      const pt = stroke.points[i];
      if (i === 0) {
        ctx.moveTo(pt.x, pt.y);
      } else {
        ctx.lineTo(pt.x, pt.y);
      }
    }

    ctx.stroke();
    ctx.restore();
  }

  state.strokes = remaining;
  drawDoubleClickMarker(now);
  drawPointerGlow();
}

function eventPoint(event) {
  const dpr = window.devicePixelRatio || 1;
  return {
    x: event.clientX * dpr,
    y: event.clientY * dpr
  };
}

function updatePointer(event) {
  const p = eventPoint(event);
  state.pointer.x = p.x;
  state.pointer.y = p.y;
  state.pointer.visible = state.enabled && state.drawActive;
  return p;
}

function beginStroke(point) {
  const now = performance.now();
  const stroke = {
    color: state.color,
    size: state.size * (window.devicePixelRatio || 1),
    points: [point],
    lastUpdatedAt: now
  };
  state.strokes.push(stroke);
  state.activeStroke = stroke;
}

function extendStroke(point) {
  if (!state.activeStroke) {
    return;
  }

  const last = state.activeStroke.points[state.activeStroke.points.length - 1];
  if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 0.8) {
    state.activeStroke.points.push(point);
    state.activeStroke.lastUpdatedAt = performance.now();
  }
}

function releaseCapturedPointer() {
  if (state.activePointerId === null || state.activePointerId === undefined) {
    return;
  }

  if (canvas.hasPointerCapture(state.activePointerId)) {
    canvas.releasePointerCapture(state.activePointerId);
  }

  state.activePointerId = null;
}

function endStroke() {
  releaseCapturedPointer();
  state.isPointerDown = false;
  state.activeStroke = null;
}

function finishStroke(event) {
  if (!state.enabled || !state.isPointerDown) {
    return;
  }

  const p = updatePointer(event);
  extendStroke(p);
  endStroke();
}

canvas.addEventListener('pointerdown', (event) => {
  if (!state.enabled || !state.drawActive) {
    return;
  }

  event.preventDefault();
  const p = updatePointer(event);
  state.isPointerDown = true;
  state.activePointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  beginStroke(p);
});

canvas.addEventListener('pointermove', (event) => {
  if (!state.enabled) {
    return;
  }

  event.preventDefault();
  const p = updatePointer(event);

  if (!state.drawActive) {
    endStroke();
    return;
  }

  const leftPressed = ((event.buttons & 1) === 1) || state.globalMouseDown;

  if (!state.isPointerDown) {
    if (leftPressed) {
      state.isPointerDown = true;
      state.activePointerId = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      beginStroke(p);
    }
    return;
  }

  if (!leftPressed) {
    endStroke();
    return;
  }

  extendStroke(p);
});

canvas.addEventListener('pointerenter', (event) => {
  if (!state.enabled) {
    return;
  }
  updatePointer(event);
});

canvas.addEventListener('pointerleave', () => {
  state.pointer.visible = false;
  endStroke();
});

canvas.addEventListener('pointerup', finishStroke);
canvas.addEventListener('pointercancel', finishStroke);

ipcRenderer.on('overlay:init', () => {
  resizeCanvas();
});

ipcRenderer.on('overlay:set-enabled', (_event, enabled) => {
  state.enabled = Boolean(enabled);
  if (!state.enabled) {
    state.drawActive = false;
    state.globalMouseDown = false;
    state.pointer.visible = false;
    endStroke();
  }

  canvas.style.cursor = state.enabled && state.drawActive ? 'none' : 'default';
});

ipcRenderer.on('overlay:set-draw-active', (_event, payload) => {
  if (payload && typeof payload === 'object') {
    state.drawActive = Boolean(payload.active) && state.enabled;
    state.globalMouseDown = Boolean(payload.mouseDown);
  } else {
    state.drawActive = Boolean(payload) && state.enabled;
  }

  if (!state.drawActive) {
    state.pointer.visible = false;
    endStroke();
  }

  canvas.style.cursor = state.enabled && state.drawActive ? 'none' : 'default';
});

ipcRenderer.on('overlay:set-pen-style', (_event, style) => {
  if (style && typeof style.color === 'string') {
    state.color = style.color;
  }
  if (style && Number.isFinite(Number(style.size))) {
    state.size = Number(style.size);
  }
});

ipcRenderer.on('overlay:undo', () => {
  state.strokes.pop();
});

ipcRenderer.on('overlay:clear', () => {
  state.strokes = [];
  endStroke();
});

ipcRenderer.on('overlay:double-click-marker', (_event, payload) => {
  if (!payload || typeof payload !== 'object') {
    return;
  }

  const x = Number(payload.x);
  const y = Number(payload.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  triggerDoubleClickMarker(x, y);
});

function renderLoop() {
  drawAll(performance.now());
  requestAnimationFrame(renderLoop);
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
renderLoop();
