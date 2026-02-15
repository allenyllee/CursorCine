# windows-wgc-hdr-capture

## Status

This module is the new route entrypoint for `wgc-v1` in CursorCine's HDR pipeline.

Current implementation is an independent native backend (MVP):

- Node-API addon target exists (`windows_wgc_hdr_capture`)
- JS bridge is bound directly to the module's own native binary
- Runtime no longer forwards to legacy `windows-hdr-capture` at JS layer
- Capture core is currently GDI-backed while keeping `wgc-v1` route separation

## Why this exists

The old native path can introduce noticeable system interaction lag under HDR due to main-process capture pressure.
This module is the dedicated place for the next stage:

- Windows Graphics Capture (WGC) frame acquisition
- D3D11/GPU tone mapping
- non-blocking frame transport

## Build

From repository root:

```bash
npm run build:native-hdr-win
```

This command now builds both:

- `native/windows-hdr-capture`
- `native/windows-wgc-hdr-capture`

## Bridge API

- `probe(payload)`
- `startCapture(payload)`
- `readFrame(payload)`
- `stopCapture(payload)`

The API shape is intentionally aligned with the existing legacy bridge so the route can switch without IPC contract breakage.
