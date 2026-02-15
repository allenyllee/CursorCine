# windows-wgc-hdr-capture

## Status

This module is the new route entrypoint for `wgc-v1` in CursorCine's HDR pipeline.

Current implementation is a migration skeleton:

- Node-API addon target exists (`windows_wgc_hdr_capture`)
- JS bridge exists and is wired into Electron route selection
- Runtime currently falls through to legacy `windows-hdr-capture` behavior

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
