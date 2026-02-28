# Windows Native Overlay Host (Experimental Scaffold)

This folder now contains a minimal Node-API addon scaffold for a future Windows-native overlay host.

## Expected bridge shape

The module loaded by `src/main.js` should export:

- `startOverlay(payload)`
- `stopOverlay(payload)`

When these two functions become available, `Overlay 後端 = Native` can switch to the native path automatically.

## Current status

- `index.js` loads `build/Release/windows_overlay_host.node`.
- The addon currently exports `isSupported`, `startOverlay`, `stopOverlay`.
- `isSupported` returns `false` for now.
- App behavior: selecting `Overlay backend = Native` automatically falls back to Electron with a diagnostic reason.
