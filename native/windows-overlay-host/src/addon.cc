#include <node_api.h>

#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstdlib>
#include <cstdint>
#include <cstring>
#include <string>
#include <vector>

#if defined(_WIN32)
#include <windows.h>
#endif

namespace {

constexpr int kDefaultBorderPx = 4;
constexpr int kDefaultPenSize = 4;
constexpr int kMaxStrokes = 128;
constexpr int kMaxStrokePoints = 4096;
constexpr uint64_t kStrokeFadeMs = 1550;
constexpr uint64_t kStrokeFadeTailMs = 760;
constexpr uint64_t kRecordBorderBlinkMs = 2200;
constexpr UINT_PTR kOverlayTimerId = 1;
constexpr UINT kOverlayTimerIntervalMs = 16;
constexpr double kNativeBorderScale = 1.08;
constexpr double kNativePenScale = 1.0;
constexpr int kGlowOuterMin = 12;
constexpr int kGlowOuterExtra = 13;
constexpr int kGlowCoreMin = 4;
constexpr double kGlowCoreScale = 0.74;

napi_value MakeObject(napi_env env) {
  napi_value out;
  assert(napi_create_object(env, &out) == napi_ok);
  return out;
}

napi_value MakeBool(napi_env env, bool value) {
  napi_value out;
  assert(napi_get_boolean(env, value, &out) == napi_ok);
  return out;
}

napi_value MakeInt32(napi_env env, int32_t value) {
  napi_value out;
  assert(napi_create_int32(env, value, &out) == napi_ok);
  return out;
}

napi_value MakeString(napi_env env, const char* value) {
  napi_value out;
  assert(napi_create_string_utf8(env, value, NAPI_AUTO_LENGTH, &out) == napi_ok);
  return out;
}

void SetNamed(napi_env env, napi_value obj, const char* key, napi_value value) {
  assert(napi_set_named_property(env, obj, key, value) == napi_ok);
}

bool GetNamedProperty(napi_env env, napi_value obj, const char* key, napi_value* out) {
  bool has = false;
  if (napi_has_named_property(env, obj, key, &has) != napi_ok || !has) {
    return false;
  }
  return napi_get_named_property(env, obj, key, out) == napi_ok;
}

int32_t GetNamedInt32(napi_env env, napi_value obj, const char* key, int32_t fallback) {
  napi_value value;
  if (!GetNamedProperty(env, obj, key, &value)) {
    return fallback;
  }
  int32_t out = fallback;
  if (napi_get_value_int32(env, value, &out) != napi_ok) {
    return fallback;
  }
  return out;
}

napi_value MakeUint32(napi_env env, uint32_t value) {
  napi_value out;
  assert(napi_create_uint32(env, value, &out) == napi_ok);
  return out;
}

bool GetNamedBool(napi_env env, napi_value obj, const char* key, bool fallback) {
  napi_value value;
  if (!GetNamedProperty(env, obj, key, &value)) {
    return fallback;
  }
  bool out = fallback;
  if (napi_get_value_bool(env, value, &out) != napi_ok) {
    return fallback;
  }
  return out;
}

std::string GetNamedString(napi_env env, napi_value obj, const char* key, const char* fallback = "") {
  napi_value value;
  if (!GetNamedProperty(env, obj, key, &value)) {
    return std::string(fallback);
  }
  size_t len = 0;
  if (napi_get_value_string_utf8(env, value, nullptr, 0, &len) != napi_ok) {
    return std::string(fallback);
  }
  std::string out(len, '\0');
  if (napi_get_value_string_utf8(env, value, out.data(), len + 1, &len) != napi_ok) {
    return std::string(fallback);
  }
  return out;
}

napi_value GetFirstArgObject(napi_env env, napi_callback_info info) {
  size_t argc = 1;
  napi_value argv[1] = {nullptr};
  assert(napi_get_cb_info(env, info, &argc, argv, nullptr, nullptr) == napi_ok);
  if (argc < 1 || argv[0] == nullptr) {
    return nullptr;
  }
  napi_valuetype type = napi_undefined;
  assert(napi_typeof(env, argv[0], &type) == napi_ok);
  if (type != napi_object) {
    return nullptr;
  }
  return argv[0];
}

#if defined(_WIN32)
constexpr COLORREF kDefaultPenColor = RGB(255, 79, 112);

struct PenPoint {
  int x = 0;
  int y = 0;
};

struct PenStroke {
  COLORREF color = kDefaultPenColor;
  int size = kDefaultPenSize;
  uint64_t lastUpdatedMs = 0;
  std::vector<PenPoint> points;
};

struct OverlayState {
  HWND hwnd = nullptr;
  bool classRegistered = false;
  HDC memoryDc = nullptr;
  HBITMAP dibBitmap = nullptr;
  HBITMAP prevBitmap = nullptr;
  void* pixelData = nullptr;
  int pixelWidth = 0;
  int pixelHeight = 0;
  int pixelStride = 0;
  RECT bounds{0, 0, 0, 0};
  int borderPx = kDefaultBorderPx;
  bool recording = true;
  double visualScale = 1.0;
  COLORREF penColor = kDefaultPenColor;
  int penSize = kDefaultPenSize;
  int pointerX = 0;
  int pointerY = 0;
  bool pointerInside = false;
  bool pointerDown = false;
  bool drawActive = false;
  bool strokeInProgress = false;
  std::vector<PenStroke> strokes;
};

OverlayState g_state;

uint64_t NowMs() {
  return static_cast<uint64_t>(GetTickCount64());
}

bool ShouldKeepStroke(uint64_t nowMs, uint64_t updatedMs) {
  return nowMs <= updatedMs || (nowMs - updatedMs) < (kStrokeFadeMs + kStrokeFadeTailMs);
}

uint8_t ClampU8(int value) {
  return static_cast<uint8_t>(std::max(0, std::min(255, value)));
}

uint32_t PackPremulBgra(uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
  const uint32_t pr = (static_cast<uint32_t>(r) * static_cast<uint32_t>(a) + 127u) / 255u;
  const uint32_t pg = (static_cast<uint32_t>(g) * static_cast<uint32_t>(a) + 127u) / 255u;
  const uint32_t pb = (static_cast<uint32_t>(b) * static_cast<uint32_t>(a) + 127u) / 255u;
  return (static_cast<uint32_t>(a) << 24) | (pr << 16) | (pg << 8) | pb;
}

void BlendPixelPremul(int x, int y, uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
  if (!g_state.pixelData || x < 0 || y < 0 || x >= g_state.pixelWidth || y >= g_state.pixelHeight || a == 0) {
    return;
  }
  uint8_t* row = static_cast<uint8_t*>(g_state.pixelData) + (y * g_state.pixelStride);
  uint32_t* pixelPtr = reinterpret_cast<uint32_t*>(row + (x * 4));
  const uint32_t dst = *pixelPtr;
  const uint32_t src = PackPremulBgra(r, g, b, a);

  const uint32_t srcA = (src >> 24) & 0xFFu;
  const uint32_t invA = 255u - srcA;
  const uint32_t dstB = (dst >> 0) & 0xFFu;
  const uint32_t dstG = (dst >> 8) & 0xFFu;
  const uint32_t dstR = (dst >> 16) & 0xFFu;
  const uint32_t dstA = (dst >> 24) & 0xFFu;
  const uint32_t srcB = (src >> 0) & 0xFFu;
  const uint32_t srcG = (src >> 8) & 0xFFu;
  const uint32_t srcR = (src >> 16) & 0xFFu;
  const uint32_t outB = srcB + ((dstB * invA + 127u) / 255u);
  const uint32_t outG = srcG + ((dstG * invA + 127u) / 255u);
  const uint32_t outR = srcR + ((dstR * invA + 127u) / 255u);
  const uint32_t outA = srcA + ((dstA * invA + 127u) / 255u);
  *pixelPtr = (outA << 24) | (outR << 16) | (outG << 8) | outB;
}

void ClearPixelBuffer() {
  if (!g_state.pixelData || g_state.pixelStride <= 0 || g_state.pixelHeight <= 0) {
    return;
  }
  std::memset(g_state.pixelData, 0, static_cast<size_t>(g_state.pixelStride) * static_cast<size_t>(g_state.pixelHeight));
}

void DrawFilledCircle(int cx, int cy, int radius, uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
  if (radius <= 0 || a == 0) {
    return;
  }
  const int minX = std::max(0, cx - radius);
  const int maxX = std::min(g_state.pixelWidth - 1, cx + radius);
  const int minY = std::max(0, cy - radius);
  const int maxY = std::min(g_state.pixelHeight - 1, cy + radius);
  const int rr = radius * radius;
  for (int y = minY; y <= maxY; y += 1) {
    const int dy = y - cy;
    for (int x = minX; x <= maxX; x += 1) {
      const int dx = x - cx;
      if ((dx * dx + dy * dy) <= rr) {
        BlendPixelPremul(x, y, r, g, b, a);
      }
    }
  }
}

void DrawStrokeSegment(const PenPoint& a, const PenPoint& b, int radius, uint8_t r, uint8_t g, uint8_t bColor, uint8_t alpha) {
  const double dx = static_cast<double>(b.x - a.x);
  const double dy = static_cast<double>(b.y - a.y);
  const double dist = std::hypot(dx, dy);
  const double step = std::max(0.6, static_cast<double>(radius) * 0.5);
  const int count = std::max(1, static_cast<int>(std::ceil(dist / step)));
  for (int i = 0; i <= count; i += 1) {
    const double t = static_cast<double>(i) / static_cast<double>(count);
    const int x = static_cast<int>(std::lround(static_cast<double>(a.x) + dx * t));
    const int y = static_cast<int>(std::lround(static_cast<double>(a.y) + dy * t));
    DrawFilledCircle(x, y, radius, r, g, bColor, alpha);
  }
}

void DrawRectStroke(int x, int y, int w, int h, int stroke, uint8_t r, uint8_t g, uint8_t b, uint8_t a) {
  if (stroke <= 0 || w <= 0 || h <= 0 || a == 0) {
    return;
  }
  const int s = std::max(1, std::min(stroke, std::min(w, h) / 2));
  for (int py = y; py < y + s; py += 1) {
    for (int px = x; px < x + w; px += 1) {
      BlendPixelPremul(px, py, r, g, b, a);
    }
  }
  for (int py = y + h - s; py < y + h; py += 1) {
    for (int px = x; px < x + w; px += 1) {
      BlendPixelPremul(px, py, r, g, b, a);
    }
  }
  for (int py = y + s; py < y + h - s; py += 1) {
    for (int px = x; px < x + s; px += 1) {
      BlendPixelPremul(px, py, r, g, b, a);
    }
    for (int px = x + w - s; px < x + w; px += 1) {
      BlendPixelPremul(px, py, r, g, b, a);
    }
  }
}

void DrawCursorGlow(int x, int y, int outerRadius, int coreRadius) {
  const int r = std::max(1, outerRadius);
  const int minX = std::max(0, x - r);
  const int maxX = std::min(g_state.pixelWidth - 1, x + r);
  const int minY = std::max(0, y - r);
  const int maxY = std::min(g_state.pixelHeight - 1, y + r);
  const double invR = 1.0 / static_cast<double>(r);
  for (int py = minY; py <= maxY; py += 1) {
    const int dy = py - y;
    for (int px = minX; px <= maxX; px += 1) {
      const int dx = px - x;
      const double dist = std::sqrt(static_cast<double>(dx * dx + dy * dy));
      if (dist > static_cast<double>(r)) {
        continue;
      }
      const double t = dist * invR;
      const double centerBoost = std::pow(std::max(0.0, 1.0 - (t * 0.92)), 0.85);
      const double edgeFade = std::pow(std::max(0.0, 1.0 - t), 1.65);
      const double mixed = (centerBoost * 0.62) + (edgeFade * 0.38);
      const uint8_t alpha = ClampU8(static_cast<int>(std::lround(228.0 * mixed)));
      const uint8_t red = 255;
      const uint8_t green = ClampU8(static_cast<int>(std::lround(236.0 - t * 74.0)));
      const uint8_t blue = ClampU8(static_cast<int>(std::lround(82.0 - t * 54.0)));
      BlendPixelPremul(px, py, red, green, blue, alpha);
    }
  }

  DrawFilledCircle(x, y, coreRadius, 255, 255, 255, 232);
  DrawFilledCircle(x, y, std::max(2, static_cast<int>(std::lround(static_cast<double>(coreRadius) * 0.5))), 255, 255, 255, 252);
}

void ReleaseRenderTarget() {
  if (g_state.dibBitmap && g_state.memoryDc) {
    if (g_state.prevBitmap) {
      SelectObject(g_state.memoryDc, g_state.prevBitmap);
      g_state.prevBitmap = nullptr;
    }
    DeleteObject(g_state.dibBitmap);
    g_state.dibBitmap = nullptr;
  }
  if (g_state.memoryDc) {
    DeleteDC(g_state.memoryDc);
    g_state.memoryDc = nullptr;
  }
  g_state.pixelData = nullptr;
  g_state.pixelWidth = 0;
  g_state.pixelHeight = 0;
  g_state.pixelStride = 0;
}

bool EnsureRenderTarget(int width, int height) {
  if (width <= 0 || height <= 0) {
    return false;
  }
  if (g_state.memoryDc && g_state.pixelData && g_state.pixelWidth == width && g_state.pixelHeight == height) {
    return true;
  }
  ReleaseRenderTarget();
  HDC screenDc = GetDC(nullptr);
  if (!screenDc) {
    return false;
  }
  g_state.memoryDc = CreateCompatibleDC(screenDc);
  ReleaseDC(nullptr, screenDc);
  if (!g_state.memoryDc) {
    return false;
  }
  BITMAPINFO bmi{};
  bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
  bmi.bmiHeader.biWidth = width;
  bmi.bmiHeader.biHeight = -height;
  bmi.bmiHeader.biPlanes = 1;
  bmi.bmiHeader.biBitCount = 32;
  bmi.bmiHeader.biCompression = BI_RGB;
  g_state.dibBitmap = CreateDIBSection(g_state.memoryDc, &bmi, DIB_RGB_COLORS, &g_state.pixelData, nullptr, 0);
  if (!g_state.dibBitmap || !g_state.pixelData) {
    ReleaseRenderTarget();
    return false;
  }
  g_state.prevBitmap = static_cast<HBITMAP>(SelectObject(g_state.memoryDc, g_state.dibBitmap));
  g_state.pixelWidth = width;
  g_state.pixelHeight = height;
  g_state.pixelStride = width * 4;
  return true;
}

double ClampVisualScale(double value) {
  if (!std::isfinite(value)) {
    return 1.0;
  }
  return std::max(0.55, std::min(2.0, value));
}

void RenderOverlayFrame() {
  if (!g_state.hwnd) {
    return;
  }
  const int width = std::max(1, static_cast<int>(g_state.bounds.right - g_state.bounds.left));
  const int height = std::max(1, static_cast<int>(g_state.bounds.bottom - g_state.bounds.top));
  if (!EnsureRenderTarget(width, height)) {
    return;
  }
  ClearPixelBuffer();
  const uint64_t nowMs = NowMs();

  if (g_state.recording) {
    const double phase = (static_cast<double>(nowMs % kRecordBorderBlinkMs) / static_cast<double>(kRecordBorderBlinkMs)) * (std::acos(-1.0) * 2.0);
    const double alpha = 0.35 + ((std::sin(phase) + 1.0) / 2.0) * 0.45;
    const uint8_t borderAlpha = ClampU8(static_cast<int>(std::lround(alpha * 255.0)));
    const double borderScale = kNativeBorderScale * g_state.visualScale;
    const int borderPx = std::max(1, static_cast<int>(std::lround(static_cast<double>(g_state.borderPx) * borderScale)));
    DrawRectStroke(0, 0, width, height, borderPx, 255, 42, 42, borderAlpha);
  }
  std::vector<PenStroke> remaining;
  remaining.reserve(g_state.strokes.size());
  const size_t activeIndex = (g_state.strokeInProgress && !g_state.strokes.empty())
    ? (g_state.strokes.size() - 1)
    : static_cast<size_t>(-1);

  for (size_t index = 0; index < g_state.strokes.size(); index += 1) {
    PenStroke stroke = g_state.strokes[index];
    if (stroke.points.empty()) {
      continue;
    }
    const bool activeStroke = (index == activeIndex);
    const uint64_t updatedMs = stroke.lastUpdatedMs > 0 ? stroke.lastUpdatedMs : nowMs;
    if (!activeStroke && !ShouldKeepStroke(nowMs, updatedMs)) {
      continue;
    }
    double fadeT = 0.0;
    if (!activeStroke && nowMs > updatedMs) {
      fadeT = std::min(1.0, static_cast<double>(nowMs - updatedMs) / static_cast<double>(kStrokeFadeMs));
    }
    const uint64_t ageMs = nowMs > updatedMs ? (nowMs - updatedMs) : 0;
    double fadeAlpha = 1.0;
    if (ageMs <= kStrokeFadeMs) {
      const double t = std::max(0.0, std::min(1.0, static_cast<double>(ageMs) / static_cast<double>(kStrokeFadeMs)));
      const double smoother = t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
      fadeAlpha = std::max(0.0, 1.0 - smoother);
    } else {
      const uint64_t tailAge = ageMs - kStrokeFadeMs;
      const double tailT = std::max(0.0, std::min(1.0, static_cast<double>(tailAge) / static_cast<double>(kStrokeFadeTailMs)));
      // Keep a visible tail longer, then fade out gently near the end.
      fadeAlpha = 0.22 * std::pow(1.0 - tailT, 1.75);
    }
    const uint8_t alpha = ClampU8(static_cast<int>(std::lround(255.0 * fadeAlpha)));
    if (alpha == 0) {
      continue;
    }
    const double penScale = kNativePenScale * g_state.visualScale;
    const int penWidth = std::max(1, static_cast<int>(std::lround(static_cast<double>(stroke.size) * penScale)));
    const int radius = std::max(1, (penWidth + 1) / 2);
    const uint8_t r = GetRValue(stroke.color);
    const uint8_t g = GetGValue(stroke.color);
    const uint8_t b = GetBValue(stroke.color);

    if (stroke.points.size() == 1) {
      const PenPoint& pt = stroke.points.front();
      DrawFilledCircle(pt.x, pt.y, radius, r, g, b, alpha);
    } else {
      for (size_t i = 1; i < stroke.points.size(); i += 1) {
        DrawStrokeSegment(stroke.points[i - 1], stroke.points[i], radius, r, g, b, alpha);
      }
    }
    remaining.push_back(std::move(stroke));
  }
  g_state.strokes.swap(remaining);

  if (g_state.drawActive && g_state.pointerInside) {
    const double penScale = kNativePenScale * g_state.visualScale;
    const int scaledPen = std::max(1, static_cast<int>(std::lround(static_cast<double>(g_state.penSize) * penScale)));
    const int outerRadius = std::max(kGlowOuterMin, scaledPen + kGlowOuterExtra);
    const int coreRadius = std::max(kGlowCoreMin, static_cast<int>(std::lround(static_cast<double>(scaledPen) * kGlowCoreScale)));
    DrawCursorGlow(g_state.pointerX, g_state.pointerY, outerRadius, coreRadius);
  }

  POINT dst{g_state.bounds.left, g_state.bounds.top};
  POINT src{0, 0};
  SIZE size{width, height};
  BLENDFUNCTION blend{AC_SRC_OVER, 0, 255, AC_SRC_ALPHA};
  UpdateLayeredWindow(g_state.hwnd, nullptr, &dst, &size, g_state.memoryDc, &src, 0, &blend, ULW_ALPHA);
}

LPCWSTR GetWindowClassName() {
  return L"CursorCineNativeOverlayHost";
}

LRESULT CALLBACK OverlayWndProc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam) {
  (void)lparam;
  switch (msg) {
    case WM_NCHITTEST:
      return HTTRANSPARENT;
    case WM_ERASEBKGND:
      return 1;
    case WM_TIMER:
      if (wparam == kOverlayTimerId) {
        RenderOverlayFrame();
        return 0;
      }
      break;
    case WM_PAINT: {
      PAINTSTRUCT ps;
      BeginPaint(hwnd, &ps);
      EndPaint(hwnd, &ps);
      RenderOverlayFrame();
      return 0;
    }
    default:
      return DefWindowProcW(hwnd, msg, wparam, lparam);
  }
}

bool EnsureWindowClassRegistered() {
  if (g_state.classRegistered) {
    return true;
  }
  WNDCLASSEXW wc{};
  wc.cbSize = sizeof(WNDCLASSEXW);
  wc.lpfnWndProc = OverlayWndProc;
  wc.hInstance = GetModuleHandleW(nullptr);
  wc.lpszClassName = GetWindowClassName();
  wc.hbrBackground = static_cast<HBRUSH>(GetStockObject(NULL_BRUSH));
  if (!RegisterClassExW(&wc)) {
    const DWORD err = GetLastError();
    if (err != ERROR_CLASS_ALREADY_EXISTS) {
      return false;
    }
  }
  g_state.classRegistered = true;
  return true;
}

void PumpWindowMessages() {
  MSG msg;
  while (PeekMessageW(&msg, nullptr, 0, 0, PM_REMOVE)) {
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
  }
}

RECT ResolveOverlayBounds(napi_env env, napi_value payloadObj) {
  RECT rc{};
  rc.left = GetSystemMetrics(SM_XVIRTUALSCREEN);
  rc.top = GetSystemMetrics(SM_YVIRTUALSCREEN);
  rc.right = rc.left + std::max(1, GetSystemMetrics(SM_CXVIRTUALSCREEN));
  rc.bottom = rc.top + std::max(1, GetSystemMetrics(SM_CYVIRTUALSCREEN));

  if (!payloadObj) {
    return rc;
  }

  napi_value boundsObj;
  if (!GetNamedProperty(env, payloadObj, "bounds", &boundsObj)) {
    return rc;
  }

  const int x = GetNamedInt32(env, boundsObj, "x", rc.left);
  const int y = GetNamedInt32(env, boundsObj, "y", rc.top);
  const int width = std::max(1, static_cast<int>(GetNamedInt32(env, boundsObj, "width", static_cast<int32_t>(rc.right - rc.left))));
  const int height = std::max(1, static_cast<int>(GetNamedInt32(env, boundsObj, "height", static_cast<int32_t>(rc.bottom - rc.top))));

  rc.left = x;
  rc.top = y;
  rc.right = x + width;
  rc.bottom = y + height;
  return rc;
}

RECT SnapRectToMonitor(const RECT& rc) {
  const LONG cx = rc.left + ((rc.right - rc.left) / 2);
  const LONG cy = rc.top + ((rc.bottom - rc.top) / 2);
  POINT center{cx, cy};
  HMONITOR monitor = MonitorFromPoint(center, MONITOR_DEFAULTTONEAREST);
  if (!monitor) {
    return rc;
  }
  MONITORINFO mi{};
  mi.cbSize = sizeof(MONITORINFO);
  if (!GetMonitorInfoW(monitor, &mi)) {
    return rc;
  }
  return mi.rcMonitor;
}

bool EnsureOverlayWindow(const RECT& rc, int borderPx) {
  if (!EnsureWindowClassRegistered()) {
    return false;
  }
  const RECT snapped = SnapRectToMonitor(rc);
  const int width = static_cast<int>(std::max<int32_t>(1, static_cast<int32_t>(snapped.right - snapped.left)));
  const int height = static_cast<int>(std::max<int32_t>(1, static_cast<int32_t>(snapped.bottom - snapped.top)));

  if (!g_state.hwnd) {
    const DWORD exStyle = WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE | WS_EX_LAYERED;
    const DWORD style = WS_POPUP;
    g_state.hwnd = CreateWindowExW(
      exStyle,
      GetWindowClassName(),
      L"",
      style,
      snapped.left,
      snapped.top,
      width,
      height,
      nullptr,
      nullptr,
      GetModuleHandleW(nullptr),
      nullptr
    );
    if (!g_state.hwnd) {
      return false;
    }
    SetTimer(g_state.hwnd, kOverlayTimerId, kOverlayTimerIntervalMs, nullptr);
  }

  SetWindowPos(
    g_state.hwnd,
    HWND_TOPMOST,
    snapped.left,
    snapped.top,
    width,
    height,
    SWP_SHOWWINDOW | SWP_NOACTIVATE
  );
  ShowWindow(g_state.hwnd, SW_SHOWNOACTIVATE);
  UpdateWindow(g_state.hwnd);

  g_state.bounds = snapped;
  g_state.borderPx = borderPx;
  if (!EnsureRenderTarget(width, height)) {
    return false;
  }
  RenderOverlayFrame();
  PumpWindowMessages();
  return true;
}

void DestroyOverlayWindow() {
  if (!g_state.hwnd) {
    return;
  }
  KillTimer(g_state.hwnd, kOverlayTimerId);
  DestroyWindow(g_state.hwnd);
  g_state.hwnd = nullptr;
  ReleaseRenderTarget();
  g_state.strokes.clear();
  g_state.strokeInProgress = false;
  PumpWindowMessages();
}

int ClampInt(int value, int low, int high) {
  return std::max(low, std::min(high, value));
}

COLORREF ParseHexColor(const std::string& value, COLORREF fallback) {
  if (value.size() != 7 || value[0] != '#') {
    return fallback;
  }
  const auto parseByte = [&](size_t offset) -> int {
    int out = 0;
    for (size_t i = offset; i < offset + 2; i += 1) {
      const char c = value[i];
      out <<= 4;
      if (c >= '0' && c <= '9') out |= (c - '0');
      else if (c >= 'a' && c <= 'f') out |= (10 + c - 'a');
      else if (c >= 'A' && c <= 'F') out |= (10 + c - 'A');
      else return -1;
    }
    return out;
  };
  const int r = parseByte(1);
  const int g = parseByte(3);
  const int b = parseByte(5);
  if (r < 0 || g < 0 || b < 0) {
    return fallback;
  }
  return RGB(r, g, b);
}

void RequestOverlayRepaint() {
  if (!g_state.hwnd) {
    return;
  }
  RenderOverlayFrame();
  PumpWindowMessages();
}

void PushPointToStroke(PenStroke& stroke, const PenPoint& point) {
  if (!stroke.points.empty()) {
    const PenPoint& last = stroke.points.back();
    const double dist = std::hypot(static_cast<double>(point.x - last.x), static_cast<double>(point.y - last.y));
    if (dist < 1.0) {
      return;
    }
  }
  stroke.points.push_back(point);
  stroke.lastUpdatedMs = NowMs();
  if (static_cast<int>(stroke.points.size()) > kMaxStrokePoints) {
    stroke.points.erase(stroke.points.begin(), stroke.points.begin() + (stroke.points.size() - kMaxStrokePoints));
  }
}

void BeginStrokeIfNeeded(const PenPoint& point) {
  if (!g_state.strokeInProgress) {
    PenStroke stroke;
    stroke.color = g_state.penColor;
    stroke.size = g_state.penSize;
    stroke.lastUpdatedMs = NowMs();
    g_state.strokes.push_back(stroke);
    if (static_cast<int>(g_state.strokes.size()) > kMaxStrokes) {
      g_state.strokes.erase(g_state.strokes.begin(), g_state.strokes.begin() + (g_state.strokes.size() - kMaxStrokes));
    }
    g_state.strokeInProgress = true;
  }
  if (g_state.strokes.empty()) {
    return;
  }
  PushPointToStroke(g_state.strokes.back(), point);
}

void EndStroke() {
  g_state.strokeInProgress = false;
}

#endif

napi_value IsSupported(napi_env env, napi_callback_info /*info*/) {
#if defined(_WIN32)
  return MakeBool(env, true);
#else
  return MakeBool(env, false);
#endif
}

napi_value StartOverlay(napi_env env, napi_callback_info info) {
  napi_value out = MakeObject(env);
#if defined(_WIN32)
  napi_value payload = GetFirstArgObject(env, info);
  const RECT rc = ResolveOverlayBounds(env, payload);
  int borderPx = kDefaultBorderPx;
  if (payload) {
    borderPx = std::max<int32_t>(1, GetNamedInt32(env, payload, "borderPx", kDefaultBorderPx));
    g_state.recording = GetNamedBool(env, payload, "recording", true);
    const std::string visualScaleText = GetNamedString(env, payload, "visualScale", "");
    if (!visualScaleText.empty()) {
      g_state.visualScale = ClampVisualScale(std::strtod(visualScaleText.c_str(), nullptr));
    } else {
      napi_value visualScaleValue = nullptr;
      if (GetNamedProperty(env, payload, "visualScale", &visualScaleValue)) {
        double parsed = 1.0;
        if (napi_get_value_double(env, visualScaleValue, &parsed) == napi_ok) {
          g_state.visualScale = ClampVisualScale(parsed);
        }
      }
    }
  }
  const bool ok = EnsureOverlayWindow(rc, borderPx);
  SetNamed(env, out, "ok", MakeBool(env, ok));
  SetNamed(env, out, "reason", MakeString(env, ok ? "OK" : "CREATE_FAILED"));
  SetNamed(env, out, "x", MakeInt32(env, rc.left));
  SetNamed(env, out, "y", MakeInt32(env, rc.top));
  SetNamed(
    env,
    out,
    "width",
    MakeInt32(env, std::max<int32_t>(1, static_cast<int32_t>(rc.right - rc.left)))
  );
  SetNamed(
    env,
    out,
    "height",
    MakeInt32(env, std::max<int32_t>(1, static_cast<int32_t>(rc.bottom - rc.top)))
  );
  SetNamed(env, out, "borderPx", MakeInt32(env, borderPx));
  SetNamed(env, out, "recording", MakeBool(env, g_state.recording));
  SetNamed(env, out, "visualScaleX1000", MakeInt32(env, static_cast<int32_t>(std::lround(g_state.visualScale * 1000.0))));
  return out;
#else
  (void)info;
  SetNamed(env, out, "ok", MakeBool(env, false));
  SetNamed(env, out, "reason", MakeString(env, "NOT_WINDOWS"));
  SetNamed(env, out, "message", MakeString(env, "Windows-only backend."));
  return out;
#endif
}

napi_value SetPointer(napi_env env, napi_callback_info info) {
  napi_value out = MakeObject(env);
#if defined(_WIN32)
  napi_value payload = GetFirstArgObject(env, info);
  if (!payload) {
    SetNamed(env, out, "ok", MakeBool(env, false));
    SetNamed(env, out, "reason", MakeString(env, "INVALID_PAYLOAD"));
    return out;
  }

  const int width = std::max(1, static_cast<int>(g_state.bounds.right - g_state.bounds.left));
  const int height = std::max(1, static_cast<int>(g_state.bounds.bottom - g_state.bounds.top));
  g_state.pointerX = ClampInt(GetNamedInt32(env, payload, "x", g_state.pointerX), 0, width - 1);
  g_state.pointerY = ClampInt(GetNamedInt32(env, payload, "y", g_state.pointerY), 0, height - 1);
  g_state.pointerInside = GetNamedBool(env, payload, "inside", g_state.pointerInside);
  g_state.pointerDown = GetNamedBool(env, payload, "down", g_state.pointerDown);
  g_state.drawActive = GetNamedBool(env, payload, "drawActive", g_state.drawActive);

  const bool shouldDraw = g_state.drawActive && g_state.pointerInside && g_state.pointerDown;
  if (shouldDraw) {
    BeginStrokeIfNeeded(PenPoint{g_state.pointerX, g_state.pointerY});
  } else {
    EndStroke();
  }
  RequestOverlayRepaint();

  SetNamed(env, out, "ok", MakeBool(env, true));
  SetNamed(env, out, "x", MakeInt32(env, g_state.pointerX));
  SetNamed(env, out, "y", MakeInt32(env, g_state.pointerY));
  SetNamed(env, out, "inside", MakeBool(env, g_state.pointerInside));
  SetNamed(env, out, "down", MakeBool(env, g_state.pointerDown));
  SetNamed(env, out, "drawActive", MakeBool(env, g_state.drawActive));
  SetNamed(env, out, "strokeCount", MakeUint32(env, static_cast<uint32_t>(g_state.strokes.size())));
  return out;
#else
  (void)info;
  SetNamed(env, out, "ok", MakeBool(env, false));
  SetNamed(env, out, "reason", MakeString(env, "NOT_WINDOWS"));
  return out;
#endif
}

napi_value SetPenStyle(napi_env env, napi_callback_info info) {
  napi_value out = MakeObject(env);
#if defined(_WIN32)
  napi_value payload = GetFirstArgObject(env, info);
  if (payload) {
    const std::string color = GetNamedString(env, payload, "color", "");
    const int size = GetNamedInt32(env, payload, "size", g_state.penSize);
    if (!color.empty()) {
      g_state.penColor = ParseHexColor(color, g_state.penColor);
    }
    g_state.penSize = std::max(1, std::min(64, size));
  }
  RequestOverlayRepaint();
  SetNamed(env, out, "ok", MakeBool(env, true));
  SetNamed(env, out, "size", MakeInt32(env, g_state.penSize));
  SetNamed(env, out, "colorBgr", MakeUint32(env, static_cast<uint32_t>(g_state.penColor)));
  return out;
#else
  (void)info;
  SetNamed(env, out, "ok", MakeBool(env, false));
  SetNamed(env, out, "reason", MakeString(env, "NOT_WINDOWS"));
  return out;
#endif
}

napi_value UndoStroke(napi_env env, napi_callback_info /*info*/) {
  napi_value out = MakeObject(env);
#if defined(_WIN32)
  EndStroke();
  if (!g_state.strokes.empty()) {
    g_state.strokes.pop_back();
  }
  RequestOverlayRepaint();
  SetNamed(env, out, "ok", MakeBool(env, true));
  SetNamed(env, out, "strokeCount", MakeUint32(env, static_cast<uint32_t>(g_state.strokes.size())));
  return out;
#else
  SetNamed(env, out, "ok", MakeBool(env, false));
  SetNamed(env, out, "reason", MakeString(env, "NOT_WINDOWS"));
  return out;
#endif
}

napi_value ClearStrokes(napi_env env, napi_callback_info /*info*/) {
  napi_value out = MakeObject(env);
#if defined(_WIN32)
  EndStroke();
  g_state.strokes.clear();
  RequestOverlayRepaint();
  SetNamed(env, out, "ok", MakeBool(env, true));
  SetNamed(env, out, "strokeCount", MakeUint32(env, 0));
  return out;
#else
  SetNamed(env, out, "ok", MakeBool(env, false));
  SetNamed(env, out, "reason", MakeString(env, "NOT_WINDOWS"));
  return out;
#endif
}

napi_value StopOverlay(napi_env env, napi_callback_info /*info*/) {
  napi_value out = MakeObject(env);
#if defined(_WIN32)
  DestroyOverlayWindow();
#endif
  SetNamed(env, out, "ok", MakeBool(env, true));
  SetNamed(env, out, "stopped", MakeBool(env, true));
  return out;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor descriptors[] = {
    {"isSupported", nullptr, IsSupported, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"startOverlay", nullptr, StartOverlay, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setPointer", nullptr, SetPointer, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"setPenStyle", nullptr, SetPenStyle, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"undoStroke", nullptr, UndoStroke, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"clearStrokes", nullptr, ClearStrokes, nullptr, nullptr, nullptr, napi_default, nullptr},
    {"stopOverlay", nullptr, StopOverlay, nullptr, nullptr, nullptr, napi_default, nullptr}
  };

  assert(
    napi_define_properties(
      env,
      exports,
      sizeof(descriptors) / sizeof(descriptors[0]),
      descriptors
    ) == napi_ok
  );
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
