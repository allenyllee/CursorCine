#include <node_api.h>

#include <cassert>
#include <cstdint>

namespace {

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

void SetNamed(napi_env env, napi_value obj, const char* key, napi_value value) {
  assert(napi_set_named_property(env, obj, key, value) == napi_ok);
}

napi_value UnsupportedResult(napi_env env, const char* reason, const char* message) {
  napi_value out = MakeObject(env);
  SetNamed(env, out, "ok", MakeBool(env, false));
  SetNamed(env, out, "supported", MakeBool(env, false));
  SetNamed(env, out, "reason", MakeString(env, reason));
  SetNamed(env, out, "message", MakeString(env, message));
  SetNamed(env, out, "nativeBackend", MakeString(env, "windows-wgc-hdr-capture-stub"));
  return out;
}

napi_value Probe(napi_env env, napi_callback_info) {
#if defined(_WIN32)
  napi_value out = MakeObject(env);
  SetNamed(env, out, "supported", MakeBool(env, true));
  SetNamed(env, out, "hdrActive", MakeBool(env, false));
  SetNamed(env, out, "reason", MakeString(env, "WGC_STUB"));
  SetNamed(env, out, "nativeBackend", MakeString(env, "windows-wgc-hdr-capture-stub"));
  return out;
#else
  return UnsupportedResult(env, "NOT_WINDOWS", "Windows-only backend.");
#endif
}

napi_value StartCapture(napi_env env, napi_callback_info) {
  return UnsupportedResult(env, "WGC_STUB_UNAVAILABLE", "WGC capture is not implemented in this addon yet.");
}

napi_value ReadFrame(napi_env env, napi_callback_info) {
  return UnsupportedResult(env, "WGC_STUB_UNAVAILABLE", "WGC capture is not implemented in this addon yet.");
}

napi_value StopCapture(napi_env env, napi_callback_info) {
  napi_value out = MakeObject(env);
  SetNamed(env, out, "ok", MakeBool(env, true));
  SetNamed(env, out, "stopped", MakeBool(env, true));
  SetNamed(env, out, "nativeBackend", MakeString(env, "windows-wgc-hdr-capture-stub"));
  return out;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_value fn;

  assert(napi_create_function(env, "probe", NAPI_AUTO_LENGTH, Probe, nullptr, &fn) == napi_ok);
  assert(napi_set_named_property(env, exports, "probe", fn) == napi_ok);

  assert(napi_create_function(env, "startCapture", NAPI_AUTO_LENGTH, StartCapture, nullptr, &fn) == napi_ok);
  assert(napi_set_named_property(env, exports, "startCapture", fn) == napi_ok);

  assert(napi_create_function(env, "readFrame", NAPI_AUTO_LENGTH, ReadFrame, nullptr, &fn) == napi_ok);
  assert(napi_set_named_property(env, exports, "readFrame", fn) == napi_ok);

  assert(napi_create_function(env, "stopCapture", NAPI_AUTO_LENGTH, StopCapture, nullptr, &fn) == napi_ok);
  assert(napi_set_named_property(env, exports, "stopCapture", fn) == napi_ok);

  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
