const { ipcRenderer } = require('electron');

const canvas = document.getElementById('overlayCanvas');
const ctx = canvas.getContext('2d');

const state = {
  enabled: false,
  color: '#ff4f70',
  size: 4,
  strokes: [],
  activeStroke: null,
  isPointerDown: false,
  pointer: {
    visible: false,
    x: 0,
    y: 0
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
  drawAll();
}

function drawPointerGlow() {
  if (!state.enabled || !state.pointer.visible) {
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

function drawAll() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  for (const stroke of state.strokes) {
    if (!stroke.points.length) {
      continue;
    }

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
  }

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
  state.pointer.visible = state.enabled;
  return p;
}

function beginStroke(point) {
  const stroke = {
    color: state.color,
    size: state.size * (window.devicePixelRatio || 1),
    points: [point]
  };
  state.strokes.push(stroke);
  state.activeStroke = stroke;
  drawAll();
}

function extendStroke(point) {
  if (!state.activeStroke) {
    return;
  }

  const last = state.activeStroke.points[state.activeStroke.points.length - 1];
  if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 0.8) {
    state.activeStroke.points.push(point);
    drawAll();
  }
}

function finishStroke(event) {
  if (!state.enabled || !state.isPointerDown) {
    return;
  }

  const p = updatePointer(event);
  extendStroke(p);
  state.isPointerDown = false;
  state.activeStroke = null;

  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }

  drawAll();
}

canvas.addEventListener('pointerdown', (event) => {
  if (!state.enabled) {
    return;
  }

  event.preventDefault();
  const p = updatePointer(event);
  state.isPointerDown = true;
  canvas.setPointerCapture(event.pointerId);
  beginStroke(p);
});

canvas.addEventListener('pointermove', (event) => {
  if (!state.enabled) {
    return;
  }

  event.preventDefault();
  const p = updatePointer(event);

  if (state.isPointerDown) {
    extendStroke(p);
    return;
  }

  drawAll();
});

canvas.addEventListener('pointerenter', (event) => {
  if (!state.enabled) {
    return;
  }
  updatePointer(event);
  drawAll();
});

canvas.addEventListener('pointerleave', () => {
  state.pointer.visible = false;
  drawAll();
});

canvas.addEventListener('pointerup', finishStroke);
canvas.addEventListener('pointercancel', finishStroke);

ipcRenderer.on('overlay:init', () => {
  resizeCanvas();
});

ipcRenderer.on('overlay:set-enabled', (_event, enabled) => {
  state.enabled = Boolean(enabled);
  canvas.style.cursor = state.enabled ? 'none' : 'default';

  if (!state.enabled) {
    state.isPointerDown = false;
    state.activeStroke = null;
    state.pointer.visible = false;
  }

  drawAll();
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
  drawAll();
});

ipcRenderer.on('overlay:clear', () => {
  state.strokes = [];
  state.activeStroke = null;
  state.isPointerDown = false;
  drawAll();
});

window.addEventListener('resize', resizeCanvas);
resizeCanvas();
