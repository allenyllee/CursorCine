# Windows Native Overlay Host (Experimental)

This folder contains a Node-API addon for a Windows-native overlay host.

## Expected bridge shape

The module loaded by `src/main.js` exports:

- `startOverlay(payload)`
- `setPointer(payload)`
- `setPenStyle(payload)`
- `undoStroke()`
- `clearStrokes()`
- `stopOverlay(payload)`

## Current status

- `index.js` loads `build/Release/windows_overlay_host.node`.
- The addon currently exports `isSupported`, `startOverlay`, `setPointer`, `setPenStyle`, `undoStroke`, `clearStrokes`, `stopOverlay`.
- Native overlay rendering includes:
  - Recording border
  - Cursor glow point
  - Basic pen stroke drawing (mouse down + move)
- App behavior: when `Overlay backend = Native` is available, `src/main.js` can route pen interactions to native APIs.
