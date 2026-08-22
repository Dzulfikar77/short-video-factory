# Changelog

All significant changes to this project will be recorded in this file.

## [v1.2.2] - 2026-04-07

### Fixed & Optimized

- Optimize segment duration acquisition in large media libraries by switching to offscreen metadata probing with cache, reducing undefined duration failures during composition
- Decouple preview rendering from duration dependency and improve random segment selection stability
- Add robust default folder fallback for Windows folder picker (downloads -> desktop -> documents -> home -> cwd) to avoid dialog open failures when downloads path is unavailable
- Add safer TTS audio metadata parsing guards and clearer error messages for invalid duration scenarios

## [v1.2.1] - 2026-03-12

### Added

- Add anonymous event reporting in the Electron main process for key workflow events

### Fixed & Optimized

- Fix BGM filename matching edge cases during media selection
- Resolve voice truncation caused by loudness normalization when adding BGM
- Fix TTS audio metadata parsing by specifying mimeType to avoid format detection failures
- Fix synthesis flow when BGM folder is missing and optimize related error handling
- Upgrade AI SDK dependency

## [v1.2.0] - 2026-01-22

### Added

- Add error details copy button
- Automatically stop the previous sound when trying to play the next sound in the text
- Better background music and vocal volume balance control

### Fixed & Optimized

- Implementing Unicode Non Space Sentence System Matching
- Solving the problem of non Chinese subtitle sticking
- Cancel subtitle segmentation length limit
- Fix EdgeTTS synthesis failure issue
- Adjust UI Text

## [v1.1.10] - 2025-10-22

### Added

- Add macOS embedding FFmpeg support

### Fixed

- Resolve the error of not setting BGM folder
- Resolve the issue of reporting errors when there are non mp3 files in the BGM folder
- Remove the restriction that the total duration of video materials should not be shorter than that of voice
- Optimize some details

## [v1.1.1] - 2025-08-26

### Fixed

- Fix macOS copy and paste shortcut key failure issue

## [v1.1.0] - 2025-08-22

### Added

- Multi-Language Support

## [v1.0.1] - 2025-08-12

### Fixed

- Fix inconsistency between mixed cut segment duration and voice duration
- Fix rendering frame freeze issue

## [v1.0.0] - 2025-08-08

### Added

- Release first official version
- Support using large language models to generate scripts (recommend free GLM-4.5-Flash)
- Support using EdgeTTS free speech synthesis
- Support storyboard assets auto mixed cutting
- Support rendering composition video
- Support automated batch processing tasks
- Beautiful UI interface

## [v0.7.12] - 2025-08-08

### Added

- Build testing
- Cross-platform: macOS dmg, Windows exe, Linux AppImage.
