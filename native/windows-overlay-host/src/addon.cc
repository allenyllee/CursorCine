#include <node_api.h>

#include <algorithm>
#include <cassert>
#include <cmath>
#include <cstdint>
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
constexpr COLORREF kTransparentColorKey = RGB(255, 0, 255);
constexpr COLORREF kDefaultPenColor = RGB(255, 79, 112);

struct PenPoint {
  int x = 0;
  int y = 0;
};

struct PenStroke {
  COLORREF color = kDefaultPenColor;
  int size = kDefaultPenSize;
  std::vector<PenPoint> points;
};

struct OverlayState {
  HWND hwnd = nullptr;
  bool classRegistered = false;
  RECT bounds{0, 0, 0, 0};
  int borderPx = kDefaultBorderPx;
  bool recording = true;
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

LPCWSTR GetWindowClassName() {
  return L"CursorCineNativeOverlayHost";
}

LRESULT CALLBACK OverlayWndProc(HWND hwnd, UINT msg, WPARAM wparam, LPARAM lparam) {
  (void)wparam;
  (void)lparam;
  switch (msg) {
    case WM_NCHITTEST:
      return HTTRANSPARENT;
    case WM_ERASEBKGND:
      return 1;
    case WM_PAINT: {
      PAINTSTRUCT ps;
      HDC hdc = BeginPaint(hwnd, &ps);
      RECT rc;
      GetClientRect(hwnd, &rc);
      HBRUSH brush = CreateSolidBrush(kTransparentColorKey);
      FillRect(hdc, &rc, brush);
      DeleteObject(brush);

      if (g_state.recording) {
        const int width = std::max(1, static_cast<int>(rc.right - rc.left));
        const int height = std::max(1, static_cast<int>(rc.bottom - rc.top));
        const int borderPx = std::max(1, std::min(g_state.borderPx, std::min(width, height) / 2));
        HPEN borderPen = CreatePen(PS_SOLID, borderPx, RGB(255, 42, 42));
        HGDIOBJ oldPen = SelectObject(hdc, borderPen);
        HGDIOBJ oldBrush = SelectObject(hdc, GetStockObject(NULL_BRUSH));
        const int inset = borderPx / 2;
        Rectangle(hdc, inset, inset, std::max(inset + 1, width - inset), std::max(inset + 1, height - inset));
        SelectObject(hdc, oldBrush);
        SelectObject(hdc, oldPen);
        DeleteObject(borderPen);
      }

      for (const PenStroke& stroke : g_state.strokes) {
        if (stroke.points.empty()) {
          continue;
        }
        const int penWidth = std::max(1, stroke.size);
        HPEN pen = CreatePen(PS_SOLID, penWidth, stroke.color);
        HGDIOBJ oldPen = SelectObject(hdc, pen);
        HGDIOBJ oldBrush = SelectObject(hdc, GetStockObject(NULL_BRUSH));

        if (stroke.points.size() == 1) {
          const PenPoint& pt = stroke.points.front();
          const int radius = std::max(1, penWidth / 2);
          HBRUSH dotBrush = CreateSolidBrush(stroke.color);
          HGDIOBJ prevBrush = SelectObject(hdc, dotBrush);
          Ellipse(hdc, pt.x - radius, pt.y - radius, pt.x + radius + 1, pt.y + radius + 1);
          SelectObject(hdc, prevBrush);
          DeleteObject(dotBrush);
        } else {
          std::vector<POINT> pts(stroke.points.size());
          for (size_t i = 0; i < stroke.points.size(); i += 1) {
            pts[i].x = stroke.points[i].x;
            pts[i].y = stroke.points[i].y;
          }
          Polyline(hdc, pts.data(), static_cast<int>(pts.size()));
        }

        SelectObject(hdc, oldBrush);
        SelectObject(hdc, oldPen);
        DeleteObject(pen);
      }

      if (g_state.drawActive && g_state.pointerInside) {
        const int outerRadius = std::max(4, g_state.penSize + 3);
        const int innerRadius = std::max(2, g_state.penSize / 2);
        HBRUSH outer = CreateSolidBrush(RGB(255, 209, 102));
        HGDIOBJ oldOuter = SelectObject(hdc, outer);
        Ellipse(
          hdc,
          g_state.pointerX - outerRadius,
          g_state.pointerY - outerRadius,
          g_state.pointerX + outerRadius + 1,
          g_state.pointerY + outerRadius + 1
        );
        SelectObject(hdc, oldOuter);
        DeleteObject(outer);

        HBRUSH inner = CreateSolidBrush(RGB(255, 255, 255));
        HGDIOBJ oldInner = SelectObject(hdc, inner);
        Ellipse(
          hdc,
          g_state.pointerX - innerRadius,
          g_state.pointerY - innerRadius,
          g_state.pointerX + innerRadius + 1,
          g_state.pointerY + innerRadius + 1
        );
        SelectObject(hdc, oldInner);
        DeleteObject(inner);
      }

      EndPaint(hwnd, &ps);
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
    if (!SetLayeredWindowAttributes(g_state.hwnd, kTransparentColorKey, 255, LWA_COLORKEY)) {
      return false;
    }
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
  InvalidateRect(g_state.hwnd, nullptr, TRUE);
  UpdateWindow(g_state.hwnd);
  PumpWindowMessages();
  return true;
}

void DestroyOverlayWindow() {
  if (!g_state.hwnd) {
    return;
  }
  DestroyWindow(g_state.hwnd);
  g_state.hwnd = nullptr;
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
  InvalidateRect(g_state.hwnd, nullptr, TRUE);
  UpdateWindow(g_state.hwnd);
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
  if (static_cast<int>(stroke.points.size()) > kMaxStrokePoints) {
    stroke.points.erase(stroke.points.begin(), stroke.points.begin() + (stroke.points.size() - kMaxStrokePoints));
  }
}

void BeginStrokeIfNeeded(const PenPoint& point) {
  if (!g_state.strokeInProgress) {
    PenStroke stroke;
    stroke.color = g_state.penColor;
    stroke.size = g_state.penSize;
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
