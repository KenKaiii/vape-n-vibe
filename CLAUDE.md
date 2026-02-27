# Vape 'n' Vibe

Push-to-talk desktop app that records audio via hotkey, transcribes with Whisper, optionally cleans up text with a local LLM, and pastes the result.

## Tech Stack

Electron 40 (JS, no TypeScript), whisper-node, node-llama-cpp, uiohook-napi, electron-store. Native Obj-C module for macOS fn key monitoring.

## Project Structure

```
main.js                    # Electron entry — IPC handlers, tray, hotkey setup
src/
  config/defaults.js       # Model paths, window size, default settings
  main/
    window.js              # Main window + overlay creation
    hotkey.js              # Global hotkey via uiohook + native fn monitor
    transcribe.js          # Whisper speech-to-text
    llm.js                 # LLM text cleanup (node-llama-cpp)
    paste.js               # Clipboard write + simulate Cmd/Ctrl+V
    download.js            # Model downloader with progress
    store.js               # Persistent settings (electron-store)
    preload.js             # Main window IPC bridge
    preload-overlay.js     # Overlay window IPC bridge
  renderer/
    index.html + renderer.js + styles.css    # Settings UI
    visualizer.html + visualizer.js + visualizer.css  # Recording overlay
  native/fn_key_monitor.mm # macOS fn key via IOKit
models/                    # Local model files (gitignored)
assets/                    # Tray icons
```

## Organization Rules

- Main process code → `src/main/`, one module per concern
- Renderer code → `src/renderer/`, HTML+JS+CSS per window
- Config → `src/config/`
- IPC flows through preload scripts, never expose node directly to renderer
- Keep files single-responsibility

## Code Quality

After editing ANY file, run:

```bash
npm run lint
npm run format:check
```

Fix ALL errors before continuing. Use `npm run lint:fix` and `npm run format` for auto-fixes.

## Architecture Notes

- Main window hides on close (not destroyed) to keep renderer alive for recording
- Overlay window is always-on-top, transparent, mouse-through — used for recording/processing visualizer
- Hotkey system supports both native fn key (macOS) and uiohook for all other keys
- Audio flows: renderer records → WAV buffer → main process → whisper transcribe → optional LLM cleanup → clipboard paste
