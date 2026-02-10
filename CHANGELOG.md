# Changelog

All notable changes to this project are documented in this file.

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

