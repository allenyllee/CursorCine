# windows-hdr-capture

## Current status

- `index.js` exposes the bridge API used by Electron IPC.
- `src/addon.cc` now provides a Windows MVP implementation:
  - display-region frame acquisition via Win32 GDI (`BitBlt` + `DIBSection`)
  - deterministic Rec.709-style highlight rolloff and saturation preservation
  - BGRA frame output buffer for renderer canvas path
  - display-bounds DPI normalization (DIP -> physical pixel mapping)
  - configurable output sizing (`maxOutputPixels`) for shared/live route quality tuning
- Runtime behavior in app remains safe:
  - if native start/read fails, renderer falls back to the existing desktop capture route.
  - oversized capture surfaces are rejected with `FRAME_TOO_LARGE` to prevent renderer white-screen/OOM.

## Prerequisites (Windows)

- Node.js
- Python 3.11.x (recommended for `node-gyp@9`)
- Visual Studio 2022 Build Tools with:
  - Desktop development with C++
  - MSVC v143 toolset
  - Windows 10/11 SDK

If PowerShell blocks `npm`, use `npm.cmd`.

## Build (Windows)

From repository root:

```bash
npm run build:native-hdr-win
```

From `native/windows-hdr-capture` directory:

```bash
npm run build
```

PowerShell variants:

```powershell
npm.cmd run build:native-hdr-win
npm.cmd run build
```

`npm run build:native-hdr-win` uses `scripts/build-native-hdr-win.js` to:
- run `node-gyp configure`
- patch generated `windows_hdr_capture.vcxproj` to force `<PlatformToolset>v143</PlatformToolset>`
- run `node-gyp build`

If build still fails with `MSB8020` and `PlatformToolset='ClangCL'`, delete `native/windows-hdr-capture/build` and run the build command again.

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

Shared/live route IPC wrappers:

- `hdr:shared-start`
- `hdr:shared-stop`
- `hdr:experimental-state`
- `hdr:native-route-smoke`

## Notes

- This is an MVP path for stability and integration testing.
- It now serves as the `native-legacy` fallback route under the new `wgc-v1 -> native-legacy -> builtin-desktop` chain.
- A future phase can replace GDI with WGC/D3D11 for lower latency and truer HDR source handling.
- Native frame output is `RGBA8` to avoid per-frame channel conversion overhead in renderer.
- On non-Windows platforms, native route is not used and app falls back automatically.
