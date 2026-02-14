#include <node_api.h>

#include <cassert>
#include <cstring>
#include <string>

namespace {

napi_value MakeString(napi_env env, const char* value) {
  napi_value out;
  napi_status status = napi_create_string_utf8(env, value, NAPI_AUTO_LENGTH, &out);
  assert(status == napi_ok);
  return out;
}

napi_value MakeBool(napi_env env, bool value) {
  napi_value out;
  napi_status status = napi_get_boolean(env, value, &out);
  assert(status == napi_ok);
  return out;
}

napi_value MakeInt32(napi_env env, int32_t value) {
  napi_value out;
  napi_status status = napi_create_int32(env, value, &out);
  assert(status == napi_ok);
  return out;
}

napi_value Probe(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_status status = napi_create_object(env, &result);
  assert(status == napi_ok);

#if defined(_WIN32)
  napi_set_named_property(env, result, "supported", MakeBool(env, false));
  napi_set_named_property(env, result, "hdrActive", MakeBool(env, false));
  napi_set_named_property(env, result, "nativeBackend", MakeString(env, "node-addon-stub"));
  napi_set_named_property(env, result, "reason", MakeString(env, "NOT_IMPLEMENTED"));
  napi_set_named_property(env, result, "message", MakeString(env, "Native Windows HDR capture backend is scaffolded but not implemented yet."));
#else
  napi_set_named_property(env, result, "supported", MakeBool(env, false));
  napi_set_named_property(env, result, "hdrActive", MakeBool(env, false));
  napi_set_named_property(env, result, "nativeBackend", MakeString(env, "node-addon-stub"));
  napi_set_named_property(env, result, "reason", MakeString(env, "NOT_WINDOWS"));
#endif

  return result;
}

napi_value StartCapture(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_status status = napi_create_object(env, &result);
  assert(status == napi_ok);

#if defined(_WIN32)
  napi_set_named_property(env, result, "ok", MakeBool(env, false));
  napi_set_named_property(env, result, "reason", MakeString(env, "NOT_IMPLEMENTED"));
  napi_set_named_property(env, result, "message", MakeString(env, "Native Windows HDR capture backend is scaffolded but not compiled with WGC pipeline yet."));
#else
  napi_set_named_property(env, result, "ok", MakeBool(env, false));
  napi_set_named_property(env, result, "reason", MakeString(env, "NOT_WINDOWS"));
  napi_set_named_property(env, result, "message", MakeString(env, "Windows-only backend."));
#endif

  return result;
}

napi_value ReadFrame(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_status status = napi_create_object(env, &result);
  assert(status == napi_ok);

  napi_set_named_property(env, result, "ok", MakeBool(env, false));
  napi_set_named_property(env, result, "reason", MakeString(env, "NOT_IMPLEMENTED"));
  napi_set_named_property(env, result, "message", MakeString(env, "Frame path not implemented in stub addon."));

  return result;
}

napi_value StopCapture(napi_env env, napi_callback_info info) {
  napi_value result;
  napi_status status = napi_create_object(env, &result);
  assert(status == napi_ok);

  napi_set_named_property(env, result, "ok", MakeBool(env, true));

  return result;
}

napi_value Init(napi_env env, napi_value exports) {
  napi_property_descriptor desc[] = {
      {"probe", 0, Probe, 0, 0, 0, napi_default, 0},
      {"startCapture", 0, StartCapture, 0, 0, 0, napi_default, 0},
      {"readFrame", 0, ReadFrame, 0, 0, 0, napi_default, 0},
      {"stopCapture", 0, StopCapture, 0, 0, 0, napi_default, 0},
  };

  napi_status status = napi_define_properties(env, exports, sizeof(desc) / sizeof(desc[0]), desc);
  assert(status == napi_ok);
  return exports;
}

}  // namespace

NAPI_MODULE(NODE_GYP_MODULE_NAME, Init)
