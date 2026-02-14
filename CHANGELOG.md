# Changelog

All notable changes to this project are documented in this file.

## [0.5.3] - 2026-02-12

### Changed
* Recording now streams chunks to temporary files during capture, reducing RAM spikes in long sessions.
* Release metadata bump from `0.5.2` to `0.5.3`.

### Fixed
* Hardened temporary recording cleanup on app/window shutdown to avoid leftover `cursorcine-upload-*` directories in system temp paths.

## [0.5.2] - 2026-02-12

### Added
* Force-abort control for ongoing exports, allowing users to cancel long-running output operations.
* GitHub Actions supply-chain checks in `.github/workflows/build.yml` via a dedicated `supply-chain` job.
* PR dependency risk gate using `actions/dependency-review-action` with high-severity and denied-license policies.

### Changed
* Recording stop flow now reduces stop latency and improves stop-progress feedback.
* `ffmpeg` export flow now opens the save dialog earlier to fail fast before heavy processing starts.
* Builtin exporter quality ceiling was raised to improve final output quality in high-quality presets.
* CI now runs `npm audit --omit=dev --audit-level=high` before version-change detection/build.
* Build/release flow is blocked when supply-chain checks fail.
* Build workflow now also runs on `pull_request` to enforce dependency checks earlier.
* `README.md` now documents CI supply-chain checks and failure behavior for push/PR workflows.
* Release documentation policy now requires reviewing `README.md` during version bumps.
* Release metadata bump from `0.5.1` to `0.5.2`.

### Fixed
* Export now fails fast when the recorder yields no initial chunks, improving error visibility and avoiding invalid follow-up processing.

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
