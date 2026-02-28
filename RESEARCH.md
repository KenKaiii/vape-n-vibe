# RESEARCH: Push-to-talk desktop transcription app with local Whisper + LLM

Generated: 2026-03-01
Stack: Electron 40 + JavaScript (CommonJS) + Node.js 22

## VERDICT: ON THE RIGHT PATH

Electron is the **only viable framework** for this app. Tauri has no Node.js runtime — `whisper-node`, `node-llama-cpp`, and `uiohook-napi` cannot load without one. The AI model runtimes dwarf Chromium's memory footprint, negating Tauri's size advantage. Project structure is above average — module-per-concern layout, sandboxed preloads, IPC sender validation, and atomic downloads are all correct patterns confirmed by production Electron codebases.

## CRITICAL ISSUES

1. **`whisper-node` is abandoned** — last published 2 years ago, zero real-world GitHub usage found. Replace with `nodejs-whisper`.
2. **`main.js` is 348 lines doing too much** — entry point + IPC registry + tray + audio pipeline. Extract `ipc.js`, `tray.js`, `pipeline.js`.
3. **No test framework** — add Vitest 4.

## DEPENDENCY CHANGES

### Replace

| current               | replacement      | version | reason                                                                   |
| --------------------- | ---------------- | ------- | ------------------------------------------------------------------------ |
| `whisper-node` ^1.1.1 | `nodejs-whisper` | 0.2.9   | Abandoned; nodejs-whisper has auto WAV conversion, Apple Silicon support |

### Upgrade

| package            | current | latest | notes                                                         |
| ------------------ | ------- | ------ | ------------------------------------------------------------- |
| `node-llama-cpp`   | ^3.16.2 | 3.16.2 | Already current, verify asarUnpack includes platform binaries |
| `electron-updater` | ^6.6.2  | 6.8.3  | Published 16 days ago                                         |

### Keep As-Is

| package          | version | notes                                                       |
| ---------------- | ------- | ----------------------------------------------------------- |
| `electron`       | ^40.6.1 | Current, correct choice                                     |
| `uiohook-napi`   | ^1.5.4  | Stable, heavily used in production Electron apps            |
| `electron-store` | ^8.2.0  | Do NOT upgrade to v11 — it's ESM-only, breaks CJS require() |
| `node-addon-api` | ^8.5.0  | Current                                                     |

### Add

| package             | version | purpose                        | type |
| ------------------- | ------- | ------------------------------ | ---- |
| `vitest`            | 4.0.18  | Unit/integration testing       | dev  |
| `@electron/rebuild` | 4.0.3   | Explicit native module rebuild | dev  |

## DEV DEPENDENCIES (current + changes)

| package                  | version | purpose                       |
| ------------------------ | ------- | ----------------------------- |
| `electron`               | ^40.6.1 | Desktop app framework         |
| `electron-builder`       | ^26.8.1 | App packaging + publishing    |
| `@electron/notarize`     | ^3.1.1  | macOS notarization            |
| `@electron/rebuild`      | ^4.0.3  | **NEW** Native module rebuild |
| `eslint`                 | ^10.0.2 | Linter (flat config)          |
| `@eslint/js`             | ^10.0.1 | ESLint recommended rules      |
| `eslint-config-prettier` | ^10.1.8 | Disable conflicting rules     |
| `prettier`               | ^3.8.1  | Code formatter                |
| `globals`                | ^17.3.0 | ESLint global definitions     |
| `vitest`                 | ^4.0.18 | **NEW** Test framework        |

## PRODUCTION DEPENDENCIES

| package            | version | purpose                               |
| ------------------ | ------- | ------------------------------------- |
| `nodejs-whisper`   | ^0.2.9  | **REPLACE** whisper-node; Whisper STT |
| `node-llama-cpp`   | ^3.16.2 | Local LLM text cleanup                |
| `uiohook-napi`     | ^1.5.4  | Global hotkey listener                |
| `electron-store`   | ^8.2.0  | Persistent settings                   |
| `electron-updater` | ^6.8.3  | Auto-update via GitHub                |
| `node-addon-api`   | ^8.5.0  | Native addon support                  |

## CONFIG FILE CHANGES

### `.prettierrc` — add missing settings

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "endOfLine": "lf"
}
```

### `package.json` scripts — add cache + test

```json
"lint": "eslint . --cache",
"test": "vitest run"
```

### `.gitignore` — add

```
.eslintcache
```

### `package.json` build.publish — make explicit

```json
"publish": {
  "provider": "github",
  "owner": "UnstableMind",
  "repo": "vape-n-vibe",
  "releaseType": "release"
}
```

### `.github/workflows/release.yml` — dynamic API key filename

```yaml
- name: Prepare notarization credentials
  env:
    APPLE_API_KEY: ${{ secrets.APPLE_API_KEY }}
    APPLE_API_KEY_ID: ${{ secrets.APPLE_API_KEY_ID }}
  run: |
    mkdir -p ~/.private_keys
    echo "$APPLE_API_KEY" | base64 --decode > ~/.private_keys/AuthKey_${APPLE_API_KEY_ID}.p8
```

### `.github/workflows/release.yml` — add concurrency guard

```yaml
concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false
```

## ARCHITECTURE REFACTORS (priority order)

### 1. Extract `src/main/ipc.js` from `main.js`

Move all 14 `ipcMain.handle` calls into one file. Export `registerIpcHandlers(windows)`. Cuts main.js to ~50 lines.

### 2. Extract `src/main/tray.js` from `main.js`

Self-contained tray creation + menu. Export `createTray(mainWindow)`.

### 3. Namespace IPC channels

Rename: `"get-config"` → `"config:get"`, `"set-hotkey"` → `"hotkey:set"`, `"audio-recorded"` → `"audio:recorded"`, etc. Update `ipc.js` + both preloads.

### 4. Extract `src/main/pipeline.js`

Move the `audio-recorded` handler body into `runPipeline(wavBuffer, { onStatus, onOverlay })`. IPC handler becomes 3 lines.

### 5. Fix `download.js` coupling

Accept `{ onProgress, onComplete, onError }` callbacks instead of raw `BrowserWindow` reference.

### 6. Split `renderer.js` (lower priority)

At 572 lines, eventually split into `audio.js`, `settings-ui.js`, `permissions-ui.js`, `update-ui.js`. Requires `<script type="module">` or bundler.

## RECOMMENDED PROJECT STRUCTURE

```
main.js                        # Thin coordinator (~50 lines)
src/
  config/
    defaults.js                # Static config only
    paths.js                   # Path resolution (unchanged)
  main/
    ipc.js                     # NEW: all ipcMain.handle registrations
    tray.js                    # NEW: extracted from main.js
    pipeline.js                # NEW: transcribe+cleanup+paste flow
    window.js                  # (unchanged)
    hotkey.js                  # (unchanged)
    transcribe.js              # (unchanged)
    llm.js                     # (unchanged)
    paste.js                   # (unchanged)
    download.js                # CHANGE: accept callbacks, not BrowserWindow
    store.js                   # (unchanged)
    updater.js                 # (unchanged)
    audio-control.js           # (unchanged)
    preload.js                 # (unchanged)
    preload-overlay.js         # (unchanged)
  renderer/
    index.html                 # (unchanged)
    renderer.js                # (unchanged for now, split later)
    styles.css                 # (unchanged)
    visualizer.html            # (unchanged)
    visualizer.js              # (unchanged)
    visualizer.css             # (unchanged)
    audio-worklet-processor.js # (unchanged)
  native/
    fn_key_monitor.mm          # (unchanged)
```

## KEY PATTERNS

- **IPC**: namespace channels by domain (`config:`, `hotkey:`, `audio:`, `update:`), register all in one module
- **Native addons**: try/catch with graceful fallback; resolve `app.asar.unpacked` paths via `paths.js`
- **Audio pipeline**: renderer MediaRecorder → WAV buffer → IPC → main process → whisper → optional LLM → clipboard paste
- **Window lifecycle**: main window hides on close (not destroyed), overlay is always-on-top mouse-through
- **Security**: `contextIsolation: true`, `sandbox: true`, `validateSender` on every IPC handler, CSP headers via session
- **Store**: keep `electron-store` v8.x (CJS compatible), add typed accessor layer before adding more settings

## WHAT NOT TO CHANGE

- **Do not migrate to Tauri** — no Node.js runtime, all native addons would need rewriting in Rust
- **Do not migrate to TypeScript** — working plain JS project, the cost exceeds current benefit; consider gradual `@ts-check` later
- **Do not add a bundler** — Electron loads HTML/JS directly, no benefit for plain JS without a UI framework
- **Do not migrate to pnpm** — marginal speed gain doesn't justify the native module compatibility risk for this project
- **Do not upgrade `electron-store` past v9** — v10+ is ESM-only, breaks CJS `require()`

## SOURCES

### Stack Validation

- [Fora Soft: Electron Guide 2026](https://forasoft.medium.com/electron-desktop-app-development-guide-for-business-in-2026-e75e439fe9d4)
- [node-llama-cpp Electron guide](https://node-llama-cpp.withcat.ai/guide/electron)
- [Electron Native Obj-C docs](https://www.electronjs.org/docs/latest/tutorial/native-code-and-electron-objc-macos)
- [DoltHub: Electron vs Tauri 2025](https://www.dolthub.com/blog/2025-11-13-electron-vs-tauri/)

### Dependencies

- [nodejs-whisper npm](https://www.npmjs.com/package/nodejs-whisper)
- [node-llama-cpp npm](https://www.npmjs.com/package/node-llama-cpp)
- [uiohook-napi npm](https://www.npmjs.com/package/uiohook-napi)
- [electron-store npm](https://www.npmjs.com/package/electron-store)
- [electron-updater npm](https://www.npmjs.com/package/electron-updater)
- [@jitsi/robotjs npm](https://www.npmjs.com/package/@jitsi/robotjs)

### Dev Tooling

- [ESLint v10.0.0 release](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/)
- [Vitest 4.0 release](https://vitest.dev/blog/vitest-4)
- [@electron/rebuild npm](https://www.npmjs.com/package/@electron/rebuild)
- [electron-builder vs electron-forge](https://npmtrends.com/electron-builder-vs-electron-forge)

### Config & Security

- [Electron Security docs](https://www.electronjs.org/docs/latest/tutorial/security)
- [electron-builder configuration](https://www.electron.build/configuration.html)
- [Electron Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [Prettier configuration](https://prettier.io/docs/configuration)
