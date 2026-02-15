#include <node_api.h>

#include <algorithm>
#include <cassert>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#if defined(_WIN32)
#include <windows.h>
#endif

namespace {

constexpr const char* kBackendName = "windows-wgc-hdr-mvp";
constexpr int64_t kMaxCapturePixels = 3840LL * 2160LL;
constexpr size_t kMaxFrameBytes = static_cast<size_t>(kMaxCapturePixels * 4LL);
constexpr int64_t kDefaultMaxOutputPixels = 640LL * 360LL;

napi_value MakeObject(napi_env env) {
  napi_value out;
  assert(napi_create_object(env, &out) == napi_ok);
  return out;
}

napi_value MakeString(napi_env env, const char* value) {
  napi_value out;
  assert(napi_create_string_utf8(env, value, NAPI_AUTO_LENGTH, &out) == napi_ok);
  return out;
}

napi_value MakeString(napi_env env, const std::string& value) {
  napi_value out;
  assert(napi_create_string_utf8(env, value.c_str(), NAPI_AUTO_LENGTH, &out) == napi_ok);
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

napi_value MakeDouble(napi_env env, double value) {
  napi_value out;
  assert(napi_create_double(env, value, &out) == napi_ok);
  return out;
}

void SetNamed(napi_env env, napi_value obj, const char* key, napi_value value) {
  assert(napi_set_named_property(env, obj, key, value) == napi_ok);
}

napi_value GetFirstArg(napi_env env, napi_callback_info info) {
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

bool GetNamedProperty(napi_env env, napi_value obj, const char* key, napi_value* out) {
  if (obj == nullptr) {
    return false;
  }
  bool has = false;
  if (napi_has_named_property(env, obj, key, &has) != napi_ok || !has) {
    return false;
  }
  return napi_get_named_property(env, obj, key, out) == napi_ok;
}

bool GetNamedBool(napi_env env, napi_value obj, const char* key, bool fallback = false) {
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

double GetNamedNumber(napi_env env, napi_value obj, const char* key, double fallback = 0.0) {
  napi_value value;
  if (!GetNamedProperty(env, obj, key, &value)) {
    return fallback;
  }
  double out = fallback;
  if (napi_get_value_double(env, value, &out) != napi_ok) {
    return fallback;
  }
  return out;
}

int32_t GetNamedInt32(napi_env env, napi_value obj, const char* key, int32_t fallback = 0) {
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

#if defined(_WIN32)

struct CaptureRect {
  int32_t x = 0;
  int32_t y = 0;
  int32_t width = 0;
  int32_t height = 0;
};

struct ToneMapConfig {
  float rolloff = 0.0f;
  float saturation = 1.00f;
};

struct CaptureSession {
  int32_t sessionId = 0;
  bool hdrLikely = false;
  CaptureRect rect;
  ToneMapConfig toneMap;
  HDC desktopDc = nullptr;
  HDC captureDc = nullptr;
  HBITMAP bitmap = nullptr;
  HGDIOBJ oldBitmap = nullptr;
  void* bitmapBits = nullptr;
  int32_t outputWidth = 0;
  int32_t outputHeight = 0;
  int32_t outputStride = 0;
  std::vector<uint8_t> frameBytes;

  ~CaptureSession() {
    if (captureDc && oldBitmap) {
      SelectObject(captureDc, oldBitmap);
      oldBitmap = nullptr;
    }
    if (bitmap) {
      DeleteObject(bitmap);
      bitmap = nullptr;
    }
    if (captureDc) {
      DeleteDC(captureDc);
      captureDc = nullptr;
    }
    if (desktopDc) {
      ReleaseDC(nullptr, desktopDc);
      desktopDc = nullptr;
    }
  }
};

std::mutex g_sessionsMutex;
std::unordered_map<int32_t, std::unique_ptr<CaptureSession>> g_sessions;
int32_t g_nextSessionId = 1;

CaptureRect GetDefaultVirtualScreenRect() {
  CaptureRect rect;
  rect.x = GetSystemMetrics(SM_XVIRTUALSCREEN);
  rect.y = GetSystemMetrics(SM_YVIRTUALSCREEN);
  rect.width = GetSystemMetrics(SM_CXVIRTUALSCREEN);
  rect.height = GetSystemMetrics(SM_CYVIRTUALSCREEN);
  if (rect.width <= 0 || rect.height <= 0) {
    rect.x = 0;
    rect.y = 0;
    rect.width = std::max(1, GetSystemMetrics(SM_CXSCREEN));
    rect.height = std::max(1, GetSystemMetrics(SM_CYSCREEN));
  }
  return rect;
}

CaptureRect ResolveCaptureRect(napi_env env, napi_value payload) {
  CaptureRect rect = GetDefaultVirtualScreenRect();
  napi_value displayHint;
  if (!GetNamedProperty(env, payload, "displayHint", &displayHint)) {
    return rect;
  }
  napi_value bounds;
  if (!GetNamedProperty(env, displayHint, "bounds", &bounds)) {
    return rect;
  }

  int32_t x = GetNamedInt32(env, bounds, "x", rect.x);
  int32_t y = GetNamedInt32(env, bounds, "y", rect.y);
  int32_t width = GetNamedInt32(env, bounds, "width", rect.width);
  int32_t height = GetNamedInt32(env, bounds, "height", rect.height);

  const double scaleFactor = GetNamedNumber(env, displayHint, "scaleFactor", 1.0);
  if (scaleFactor > 1.01 && width > 0 && height > 0) {
    const int32_t sx = static_cast<int32_t>(std::llround(static_cast<double>(x) * scaleFactor));
    const int32_t sy = static_cast<int32_t>(std::llround(static_cast<double>(y) * scaleFactor));
    const int32_t sw = static_cast<int32_t>(std::llround(static_cast<double>(width) * scaleFactor));
    const int32_t sh = static_cast<int32_t>(std::llround(static_cast<double>(height) * scaleFactor));
    const CaptureRect vr = GetDefaultVirtualScreenRect();
    if (sw > 0 && sh > 0 && sw <= (vr.width + 8) && sh <= (vr.height + 8)) {
      x = sx;
      y = sy;
      width = sw;
      height = sh;
    }
  }
  if (width > 0 && height > 0) {
    rect.x = x;
    rect.y = y;
    rect.width = width;
    rect.height = height;
  }

  return rect;
}

bool ResolveHdrLikely(napi_env env, napi_value payload) {
  napi_value displayHint;
  if (!GetNamedProperty(env, payload, "displayHint", &displayHint)) {
    return false;
  }
  return GetNamedBool(env, displayHint, "isHdrLikely", false);
}

ToneMapConfig ResolveToneMap(napi_env env, napi_value payload) {
  ToneMapConfig cfg;
  napi_value toneMap;
  if (!GetNamedProperty(env, payload, "toneMap", &toneMap)) {
    return cfg;
  }

  const double rolloff = GetNamedNumber(env, toneMap, "rolloff", cfg.rolloff);
  const double saturation = GetNamedNumber(env, toneMap, "saturation", cfg.saturation);
  cfg.rolloff = static_cast<float>(std::min(1.0, std::max(0.0, rolloff)));
  cfg.saturation = static_cast<float>(std::min(2.0, std::max(0.0, saturation)));
  return cfg;
}

int64_t ResolveMaxOutputPixels(napi_env env, napi_value payload) {
  const double requested = GetNamedNumber(env, payload, "maxOutputPixels", static_cast<double>(kDefaultMaxOutputPixels));
  if (!std::isfinite(requested) || requested <= 0) {
    return kDefaultMaxOutputPixels;
  }
  const int64_t clamped = static_cast<int64_t>(requested);
  return std::min(kMaxCapturePixels, std::max<int64_t>(kDefaultMaxOutputPixels, clamped));
}

void ComputeOutputSize(int32_t srcW, int32_t srcH, int64_t maxOutputPixels, int32_t* outW, int32_t* outH) {
  if (srcW <= 0 || srcH <= 0) {
    *outW = 0;
    *outH = 0;
    return;
  }
  const int64_t srcPixels = static_cast<int64_t>(srcW) * static_cast<int64_t>(srcH);
  if (srcPixels <= maxOutputPixels) {
    *outW = srcW;
    *outH = srcH;
    return;
  }

  const double scale = std::sqrt(static_cast<double>(maxOutputPixels) / static_cast<double>(srcPixels));
  int32_t w = static_cast<int32_t>(std::floor(srcW * scale));
  int32_t h = static_cast<int32_t>(std::floor(srcH * scale));
  *outW = std::max(1, w);
  *outH = std::max(1, h);
}

uint8_t ToByte(float value) {
  const float v = std::min(1.0f, std::max(0.0f, value));
  return static_cast<uint8_t>(v * 255.0f + 0.5f);
}

void ApplyToneMap(std::vector<uint8_t>* frameBytes, bool hdrLikely, const ToneMapConfig& cfg) {
  if (!frameBytes || frameBytes->empty()) {
    return;
  }

  const float rolloff = std::min(1.0f, std::max(0.0f, cfg.rolloff));
  const float sat = std::min(2.0f, std::max(0.0f, cfg.saturation));
  uint8_t* pixels = frameBytes->data();
  const size_t count = frameBytes->size();
  for (size_t i = 0; i + 3 < count; i += 4) {
    float b = pixels[i] / 255.0f;
    float g = pixels[i + 1] / 255.0f;
    float r = pixels[i + 2] / 255.0f;

    if (hdrLikely && rolloff > 0.0f) {
      // Deterministic shoulder compression for highlight rolloff.
      r = r / (1.0f + rolloff * r);
      g = g / (1.0f + rolloff * g);
      b = b / (1.0f + rolloff * b);
    }

    if (std::fabs(sat - 1.0f) > 0.001f) {
      const float luma = 0.2126f * r + 0.7152f * g + 0.0722f * b;
      r = luma + (r - luma) * sat;
      g = luma + (g - luma) * sat;
      b = luma + (b - luma) * sat;
    }

    // Convert in-place from BGRA source bytes to RGBA output bytes.
    pixels[i] = ToByte(r);
    pixels[i + 1] = ToByte(g);
    pixels[i + 2] = ToByte(b);
    pixels[i + 3] = 255;
  }
}

void ScaleBgraNearest(const uint8_t* src,
                      int32_t srcW,
                      int32_t srcH,
                      int32_t srcStride,
                      std::vector<uint8_t>* dst,
                      int32_t dstW,
                      int32_t dstH) {
  if (!src || !dst || srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return;
  }
  dst->resize(static_cast<size_t>(dstW) * static_cast<size_t>(dstH) * 4);
  uint8_t* out = dst->data();
  const float xRatio = static_cast<float>(srcW) / static_cast<float>(dstW);
  const float yRatio = static_cast<float>(srcH) / static_cast<float>(dstH);

  for (int32_t y = 0; y < dstH; ++y) {
    const int32_t sy = std::min(srcH - 1, static_cast<int32_t>(y * yRatio));
    const uint8_t* srcRow = src + static_cast<size_t>(sy) * static_cast<size_t>(srcStride);
    uint8_t* dstRow = out + static_cast<size_t>(y) * static_cast<size_t>(dstW) * 4;
    for (int32_t x = 0; x < dstW; ++x) {
      const int32_t sx = std::min(srcW - 1, static_cast<int32_t>(x * xRatio));
      const uint8_t* sp = srcRow + static_cast<size_t>(sx) * 4;
      uint8_t* dp = dstRow + static_cast<size_t>(x) * 4;
      dp[0] = sp[0];
      dp[1] = sp[1];
      dp[2] = sp[2];
      dp[3] = 255;
    }
  }
}

bool CaptureFrame(CaptureSession* session) {
  if (!session || !session->desktopDc || !session->captureDc || !session->bitmapBits) {
    return false;
  }
  if (session->rect.width <= 0 || session->rect.height <= 0) {
    return false;
  }

  if (!BitBlt(session->captureDc,
              0,
              0,
              session->rect.width,
              session->rect.height,
              session->desktopDc,
              session->rect.x,
              session->rect.y,
              SRCCOPY | CAPTUREBLT)) {
    return false;
  }

  // Composite current system cursor so native path matches desktop capture
  // behavior (cursor included in recorded frame).
  CURSORINFO cursorInfo;
  std::memset(&cursorInfo, 0, sizeof(cursorInfo));
  cursorInfo.cbSize = sizeof(cursorInfo);
  if (GetCursorInfo(&cursorInfo) && (cursorInfo.flags & CURSOR_SHOWING) && cursorInfo.hCursor) {
    ICONINFO iconInfo;
    std::memset(&iconInfo, 0, sizeof(iconInfo));
    if (GetIconInfo(cursorInfo.hCursor, &iconInfo)) {
      const int32_t cursorX = static_cast<int32_t>(cursorInfo.ptScreenPos.x) - session->rect.x -
          static_cast<int32_t>(iconInfo.xHotspot);
      const int32_t cursorY = static_cast<int32_t>(cursorInfo.ptScreenPos.y) - session->rect.y -
          static_cast<int32_t>(iconInfo.yHotspot);
      DrawIconEx(session->captureDc,
                 cursorX,
                 cursorY,
                 cursorInfo.hCursor,
                 0,
                 0,
                 0,
                 nullptr,
                 DI_NORMAL | DI_DEFAULTSIZE);
      if (iconInfo.hbmMask) {
        DeleteObject(iconInfo.hbmMask);
      }
      if (iconInfo.hbmColor) {
        DeleteObject(iconInfo.hbmColor);
      }
    }
  }

  const size_t captureBytes =
      static_cast<size_t>(session->rect.width) * static_cast<size_t>(session->rect.height) * 4;
  if (captureBytes == 0 || captureBytes > kMaxFrameBytes) {
    return false;
  }

  if (session->outputWidth == session->rect.width && session->outputHeight == session->rect.height) {
    session->frameBytes.resize(captureBytes);
    std::memcpy(session->frameBytes.data(), session->bitmapBits, captureBytes);
  } else {
    ScaleBgraNearest(reinterpret_cast<const uint8_t*>(session->bitmapBits),
                     session->rect.width,
                     session->rect.height,
                     session->rect.width * 4,
                     &session->frameBytes,
                     session->outputWidth,
                     session->outputHeight);
  }

  ApplyToneMap(&session->frameBytes, session->hdrLikely, session->toneMap);
  return true;
}

std::unique_ptr<CaptureSession> CreateSession(napi_env env, napi_value payload, std::string* errorMessage) {
  auto session = std::make_unique<CaptureSession>();
  session->rect = ResolveCaptureRect(env, payload);
  const int64_t pixelCount =
      static_cast<int64_t>(session->rect.width) * static_cast<int64_t>(session->rect.height);
  if (session->rect.width <= 0 || session->rect.height <= 0 || pixelCount <= 0) {
    if (errorMessage) {
      *errorMessage = "Invalid capture bounds.";
    }
    return nullptr;
  }
  if (pixelCount > kMaxCapturePixels) {
    if (errorMessage) {
      *errorMessage = "FRAME_TOO_LARGE: capture bounds exceed safe native IPC size.";
    }
    return nullptr;
  }
  session->hdrLikely = ResolveHdrLikely(env, payload);
  session->toneMap = ResolveToneMap(env, payload);
  const int64_t maxOutputPixels = ResolveMaxOutputPixels(env, payload);
  ComputeOutputSize(session->rect.width, session->rect.height, maxOutputPixels, &session->outputWidth, &session->outputHeight);
  session->outputStride = session->outputWidth * 4;

  session->desktopDc = GetDC(nullptr);
  if (!session->desktopDc) {
    if (errorMessage) {
      *errorMessage = "GetDC failed.";
    }
    return nullptr;
  }

  session->captureDc = CreateCompatibleDC(session->desktopDc);
  if (!session->captureDc) {
    if (errorMessage) {
      *errorMessage = "CreateCompatibleDC failed.";
    }
    return nullptr;
  }

  BITMAPINFO bmi;
  std::memset(&bmi, 0, sizeof(BITMAPINFO));
  bmi.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
  bmi.bmiHeader.biWidth = session->rect.width;
  bmi.bmiHeader.biHeight = -session->rect.height;
  bmi.bmiHeader.biPlanes = 1;
  bmi.bmiHeader.biBitCount = 32;
  bmi.bmiHeader.biCompression = BI_RGB;

  session->bitmap =
      CreateDIBSection(session->desktopDc, &bmi, DIB_RGB_COLORS, &session->bitmapBits, nullptr, 0);
  if (!session->bitmap || !session->bitmapBits) {
    if (errorMessage) {
      *errorMessage = "CreateDIBSection failed.";
    }
    return nullptr;
  }

  session->oldBitmap = SelectObject(session->captureDc, session->bitmap);
  if (!session->oldBitmap) {
    if (errorMessage) {
      *errorMessage = "SelectObject failed.";
    }
    return nullptr;
  }

  const size_t bytes = static_cast<size_t>(session->outputWidth) * static_cast<size_t>(session->outputHeight) * 4;
  if (bytes == 0 || bytes > kMaxFrameBytes) {
    if (errorMessage) {
      *errorMessage = "FRAME_TOO_LARGE: output frame exceeds safe native IPC size.";
    }
    return nullptr;
  }
  session->frameBytes.resize(bytes);
  return session;
}

void SetProbeResponse(napi_env env, napi_value result, bool hdrActive) {
  SetNamed(env, result, "supported", MakeBool(env, true));
  SetNamed(env, result, "hdrActive", MakeBool(env, hdrActive));
  SetNamed(env, result, "nativeBackend", MakeString(env, kBackendName));
  SetNamed(env, result, "reason", MakeString(env, hdrActive ? "HDR_ACTIVE" : "SDR_OR_UNKNOWN"));
}

#endif

napi_value Probe(napi_env env, napi_callback_info info) {
  napi_value result = MakeObject(env);

#if defined(_WIN32)
  napi_value payload = GetFirstArg(env, info);
  const bool hdrLikely = ResolveHdrLikely(env, payload);
  SetProbeResponse(env, result, hdrLikely);
#else
  SetNamed(env, result, "supported", MakeBool(env, false));
  SetNamed(env, result, "hdrActive", MakeBool(env, false));
  SetNamed(env, result, "nativeBackend", MakeString(env, "node-addon-stub"));
  SetNamed(env, result, "reason", MakeString(env, "NOT_WINDOWS"));
#endif
  return result;
}

napi_value StartCapture(napi_env env, napi_callback_info info) {
  napi_value result = MakeObject(env);

#if defined(_WIN32)
  napi_value payload = GetFirstArg(env, info);
  std::string error;
  auto session = CreateSession(env, payload, &error);
  if (!session) {
    const bool frameTooLarge = error.rfind("FRAME_TOO_LARGE", 0) == 0;
    SetNamed(env, result, "ok", MakeBool(env, false));
    SetNamed(env, result, "reason", MakeString(env, frameTooLarge ? "FRAME_TOO_LARGE" : "START_FAILED"));
    SetNamed(env, result, "message", MakeString(env, error.empty() ? "Failed to create capture session." : error));
    return result;
  }

  int32_t startedId = 0;
  {
    std::lock_guard<std::mutex> lock(g_sessionsMutex);
    startedId = g_nextSessionId++;
    session->sessionId = startedId;
    g_sessions[startedId] = std::move(session);
  }

  std::lock_guard<std::mutex> lock(g_sessionsMutex);
  const auto it = g_sessions.find(startedId);
  if (it == g_sessions.end()) {
    SetNamed(env, result, "ok", MakeBool(env, false));
    SetNamed(env, result, "reason", MakeString(env, "START_FAILED"));
    SetNamed(env, result, "message", MakeString(env, "Session registration failed."));
    return result;
  }

  CaptureSession* started = it->second.get();
  SetNamed(env, result, "ok", MakeBool(env, true));
  SetNamed(env, result, "nativeSessionId", MakeInt32(env, started->sessionId));
  SetNamed(env, result, "width", MakeInt32(env, started->outputWidth));
  SetNamed(env, result, "height", MakeInt32(env, started->outputHeight));
  SetNamed(env, result, "stride", MakeInt32(env, started->outputStride));
  SetNamed(env, result, "pixelFormat", MakeString(env, "RGBA8"));
  SetNamed(env, result, "colorSpace", MakeString(env, "Rec.709"));
  SetNamed(env, result, "hdrActive", MakeBool(env, started->hdrLikely));
  SetNamed(env, result, "nativeBackend", MakeString(env, kBackendName));

  napi_value toneMap = MakeObject(env);
  SetNamed(env, toneMap, "profile", MakeString(env, "rec709-rolloff-v1"));
  SetNamed(env, toneMap, "rolloff", MakeDouble(env, started->toneMap.rolloff));
  SetNamed(env, toneMap, "saturation", MakeDouble(env, started->toneMap.saturation));
  SetNamed(env, result, "toneMap", toneMap);
#else
  SetNamed(env, result, "ok", MakeBool(env, false));
  SetNamed(env, result, "reason", MakeString(env, "NOT_WINDOWS"));
  SetNamed(env, result, "message", MakeString(env, "Windows-only backend."));
#endif

  return result;
}

napi_value ReadFrame(napi_env env, napi_callback_info info) {
  napi_value result = MakeObject(env);

#if defined(_WIN32)
  napi_value payload = GetFirstArg(env, info);
  const int32_t nativeSessionId = GetNamedInt32(env, payload, "nativeSessionId", 0);
  if (nativeSessionId <= 0) {
    SetNamed(env, result, "ok", MakeBool(env, false));
    SetNamed(env, result, "reason", MakeString(env, "INVALID_SESSION"));
    SetNamed(env, result, "message", MakeString(env, "Invalid native session id."));
    return result;
  }

  std::lock_guard<std::mutex> lock(g_sessionsMutex);
  auto it = g_sessions.find(nativeSessionId);
  if (it == g_sessions.end()) {
    SetNamed(env, result, "ok", MakeBool(env, false));
    SetNamed(env, result, "reason", MakeString(env, "INVALID_SESSION"));
    SetNamed(env, result, "message", MakeString(env, "Native session not found."));
    return result;
  }

  CaptureSession* session = it->second.get();
  if (!CaptureFrame(session)) {
    SetNamed(env, result, "ok", MakeBool(env, false));
    SetNamed(env, result, "reason", MakeString(env, "READ_FAILED"));
    SetNamed(env, result, "message", MakeString(env, "BitBlt failed."));
    return result;
  }

  void* dst = nullptr;
  napi_value bytes;
  assert(napi_create_buffer_copy(env,
                                 session->frameBytes.size(),
                                 session->frameBytes.data(),
                                 &dst,
                                 &bytes) == napi_ok);

  const auto now = std::chrono::duration_cast<std::chrono::milliseconds>(
                       std::chrono::system_clock::now().time_since_epoch())
                       .count();
  SetNamed(env, result, "ok", MakeBool(env, true));
  SetNamed(env, result, "width", MakeInt32(env, session->outputWidth));
  SetNamed(env, result, "height", MakeInt32(env, session->outputHeight));
  SetNamed(env, result, "stride", MakeInt32(env, session->outputStride));
  SetNamed(env, result, "pixelFormat", MakeString(env, "RGBA8"));
  SetNamed(env, result, "timestampMs", MakeDouble(env, static_cast<double>(now)));
  SetNamed(env, result, "bytes", bytes);
#else
  SetNamed(env, result, "ok", MakeBool(env, false));
  SetNamed(env, result, "reason", MakeString(env, "NOT_WINDOWS"));
  SetNamed(env, result, "message", MakeString(env, "Frame path is Windows-only."));
#endif

  return result;
}

napi_value StopCapture(napi_env env, napi_callback_info info) {
  napi_value result = MakeObject(env);

#if defined(_WIN32)
  napi_value payload = GetFirstArg(env, info);
  const int32_t nativeSessionId = GetNamedInt32(env, payload, "nativeSessionId", 0);
  if (nativeSessionId <= 0) {
    SetNamed(env, result, "ok", MakeBool(env, false));
    SetNamed(env, result, "reason", MakeString(env, "INVALID_SESSION"));
    SetNamed(env, result, "message", MakeString(env, "Invalid native session id."));
    return result;
  }

  std::lock_guard<std::mutex> lock(g_sessionsMutex);
  const size_t erased = g_sessions.erase(nativeSessionId);
  SetNamed(env, result, "ok", MakeBool(env, erased > 0));
  if (erased == 0) {
    SetNamed(env, result, "reason", MakeString(env, "INVALID_SESSION"));
    SetNamed(env, result, "message", MakeString(env, "Native session not found."));
  }
#else
  SetNamed(env, result, "ok", MakeBool(env, true));
  SetNamed(env, result, "skipped", MakeBool(env, true));
#endif

  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor desc[] = {
      {"probe", 0, Probe, 0, 0, 0, napi_default, 0},
      {"startCapture", 0, StartCapture, 0, 0, 0, napi_default, 0},
      {"readFrame", 0, ReadFrame, 0, 0, 0, napi_default, 0},
      {"stopCapture", 0, StopCapture, 0, 0, 0, napi_default, 0},
  };

  assert(napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]), desc) == napi_ok);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
