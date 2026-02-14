# windows-hdr-capture (scaffold)

This folder contains the Windows native capture addon scaffold for HDR-to-SDR mapping.

## Current status

- `index.js` exposes a stable bridge API used by Electron IPC.
- `src/addon.cc` is a Node-API stub and does not yet contain the final WGC/D3D11 tone-mapping pipeline.
- Runtime behavior in app:
  - if addon is unavailable or not implemented, renderer auto-falls back to the existing desktop capture path.

## Build (Windows)

```bash
npm run build:native-hdr-win
```

## Bridge API

- `probe(payload)`
- `startCapture(payload)`
- `readFrame(payload)`
- `stopCapture(payload)`

The Electron main process wraps these methods under IPC:

- `hdr:probe`
- `hdr:start`
- `hdr:read-frame`
- `hdr:stop`
