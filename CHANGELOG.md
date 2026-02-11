# Changelog

All notable changes to this project are documented in this file.

## [0.5.1] - 2026-02-11

### Added
* New export IPC handlers for path/chunk workflows: `video:blob-upload-open`, `video:blob-upload-chunk`, `video:blob-upload-close`, `video:trim-export-from-path`, and `video:convert-webm-to-mp4-path`.
* Renderer-side chunked blob uploader using `Blob.slice` to stream large recordings to the main process in bounded chunks.

### Changed
* Release metadata bump from `0.5.0` to `0.5.1`.
* Trim export and MP4 conversion can now run from temporary file paths instead of transferring full video buffers through IPC.
* `AGENTS.md` now requires updating `CHANGELOG.md` in the same change set when shipping a new version.

### Fixed
* Reduced renderer memory pressure during long exports by replacing whole-blob IPC transfers with chunked upload sessions.
* Fixed temp file cleanup order so ffmpeg input files are kept until processing completes, avoiding `No such file or directory` failures.

## [0.5.0] - 2026-02-10

### Added
* Live recording elapsed time display in the main control panel.
* Export elapsed time display during save/finalize operations.
* Export phase bridge (`video:export-phase`) from main process to renderer for accurate timer start timing.
* Independent output quality selector, separated from recording quality settings.
* Export debug trace output for effective ffmpeg command visibility.
* `AGENTS.md` commit message conventions guide.

### Changed
* Export timing starts after save path selection is completed, not on initial save button click.
* WebM export presets revised with VP9-focused tuning for `smooth`, `balanced`, and `high`.
* Recording quality preset bitrates rebalanced to improve practical quality tier separation.

### Fixed
* Recording preview audio is explicitly muted at recording start to prevent second-run echo feedback loops.
* Export quality preset is now applied during ffmpeg trim export so output quality reflects selected output tier.
