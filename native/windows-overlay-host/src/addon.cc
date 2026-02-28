#include <node_api.h>

#include <algorithm>
#include <cassert>
#include <cstdint>

#if defined(_WIN32)
#include <windows.h>
#endif

namespace {

constexpr int kDefaultBorderPx = 4;

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

struct OverlayState {
  HWND hwnd = nullptr;
  bool classRegistered = false;
  RECT bounds{0, 0, 0, 0};
  int borderPx = kDefaultBorderPx;
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
      HBRUSH brush = CreateSolidBrush(RGB(255, 42, 42));
      FillRect(hdc, &rc, brush);
      DeleteObject(brush);
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
  const int width = std::max(1, GetNamedInt32(env, boundsObj, "width", rc.right - rc.left));
  const int height = std::max(1, GetNamedInt32(env, boundsObj, "height", rc.bottom - rc.top));

  rc.left = x;
  rc.top = y;
  rc.right = x + width;
  rc.bottom = y + height;
  return rc;
}

bool ApplyBorderRegion(HWND hwnd, int width, int height, int borderPx) {
  const int bw = std::max(1, std::min(borderPx, std::min(width, height) / 2));
  HRGN outer = CreateRectRgn(0, 0, width, height);
  HRGN inner = CreateRectRgn(bw, bw, std::max(bw + 1, width - bw), std::max(bw + 1, height - bw));
  if (!outer || !inner) {
    if (outer) {
      DeleteObject(outer);
    }
    if (inner) {
      DeleteObject(inner);
    }
    return false;
  }
  CombineRgn(outer, outer, inner, RGN_DIFF);
  DeleteObject(inner);
  if (!SetWindowRgn(hwnd, outer, TRUE)) {
    DeleteObject(outer);
    return false;
  }
  return true;
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
    const DWORD exStyle = WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE;
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

  if (!ApplyBorderRegion(g_state.hwnd, width, height, borderPx)) {
    return false;
  }

  g_state.bounds = snapped;
  g_state.borderPx = borderPx;
  PumpWindowMessages();
  return true;
}

void DestroyOverlayWindow() {
  if (!g_state.hwnd) {
    return;
  }
  DestroyWindow(g_state.hwnd);
  g_state.hwnd = nullptr;
  PumpWindowMessages();
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
  return out;
#else
  (void)info;
  SetNamed(env, out, "ok", MakeBool(env, false));
  SetNamed(env, out, "reason", MakeString(env, "NOT_WINDOWS"));
  SetNamed(env, out, "message", MakeString(env, "Windows-only backend."));
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
