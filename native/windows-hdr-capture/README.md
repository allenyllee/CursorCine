# windows-hdr-capture

## Current status

- `index.js` exposes the bridge API used by Electron IPC.
- `src/addon.cc` now provides a Windows MVP implementation:
  - display-region frame acquisition via Win32 GDI (`BitBlt` + `DIBSection`)
  - deterministic Rec.709-style highlight rolloff and saturation preservation
  - BGRA frame output buffer for renderer canvas path
- Runtime behavior in app remains safe:
  - if native start/read fails, renderer falls back to the existing desktop capture route.
  - oversized capture surfaces are rejected with `FRAME_TOO_LARGE` to prevent renderer white-screen/OOM.

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

## Notes

- This is an MVP path for stability and integration testing.
- A future phase can replace GDI with WGC/D3D11 for lower latency and truer HDR source handling.
