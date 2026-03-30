# Live Transcription (Approach 3: Periodic HTTP Re-transcription)

## Overview

While recording, periodically send the accumulated audio buffer to the whisper.cpp HTTP server every ~2 seconds, display partial transcription text in the overlay, and on release do a final transcription + paste as before.

## Architecture

```
Renderer (recording)
  └─ Every 2s: encode current audioChunks → WAV → IPC "audio-partial"
       └─ Main process: write temp WAV → POST to whisper server → get text
            └─ Send "partial-text" to overlay
            └─ Send "partial-text" to renderer (for status display)

Renderer (stop recording)
  └─ Encode full audio → WAV → IPC "audio-recorded" (existing flow)
       └─ Main process: full transcription → paste (unchanged)
```

## Key Design Decisions

- **Partial transcriptions are display-only** — they never paste. Only the final full transcription pastes.
- **Overlay shows live text** below the waveform visualizer during recording.
- **Debounce/skip** — if a partial transcription is still in-flight when the next interval fires, skip it (don't queue up).
- **No hallucination filtering on partials** — partials are ephemeral display text; only the final goes through the full filter pipeline.
- **Overlay needs to grow** — currently 100x120px canvas only. We need to widen it and add a text element below/above the canvas for the live text.

## Files to Modify

- `src/renderer/renderer.js` — add periodic partial audio sending during recording (~lines 259-343)
- `src/main/preload.js` — add `sendPartialAudio` IPC method and `onPartialText` listener
- `src/main/preload-overlay.js` — add `onPartialText` listener
- `src/main/ipc.js` — add `audio-partial` IPC handler that transcribes without pasting
- `src/main/transcribe.js` — extract a lighter `transcribePartial()` that skips hallucination filtering or uses minimal filtering
- `src/renderer/visualizer.html` — add a text element for partial transcription display
- `src/renderer/visualizer.js` — listen for partial text and render it
- `src/renderer/visualizer.css` — style the partial text element
- `src/main/window.js` — widen overlay to accommodate text (e.g. 340x150)

## Steps

1. In `src/main/transcribe.js`, add a `transcribePartial(wavBuffer, lang)` function that accepts a raw WAV buffer, writes it to a temp file, POSTs to the whisper server, and returns the text with minimal filtering (structural only — no hallucination exact-match filtering since partials are ephemeral). Reuse `ensureServer`, `getServerUrl`, and the multipart POST logic from the existing `transcribe()` function. Clean up the temp file after.
2. In `src/main/ipc.js`, add a new `ipcMain.handle("audio-partial", ...)` handler that calls `transcribePartial()`, then sends the partial text to both the overlay (`sendToOverlay("partial-text", text)`) and the main renderer window (`win.webContents.send("partial-text", text)`). Use a boolean `partialInFlight` guard so concurrent partial requests don't pile up — if one is already running, return immediately.
3. In `src/main/preload.js`, add `sendPartialAudio: (wavBuffer) => ipcRenderer.invoke("audio-partial", wavBuffer)` and `onPartialText: (cb) => { const handler = (_e, text) => cb(text); ipcRenderer.on("partial-text", handler); return () => ipcRenderer.removeListener("partial-text", handler); }` to the exposed API.
4. In `src/main/preload-overlay.js`, add `onPartialText: (cb) => { const handler = (_e, text) => cb(text); ipcRenderer.on("partial-text", handler); return () => ipcRenderer.removeListener("partial-text", handler); }` to the `vizBridge` exposed API.
5. In `src/renderer/renderer.js`, inside `startRecording()` (after setting up the AudioWorklet around line 300), start a `setInterval` every 2000ms that: (a) if `audioChunks.length === 0` skip, (b) encode current `audioChunks` to WAV using the existing `encodeWav()` function (without clearing the array), (c) call `window.vapenvibe.sendPartialAudio(wavBuffer)`. Store the interval ID in a variable `partialInterval`. In `stopRecording()`, clear this interval before processing the final audio. Also send a `sendPartialAudio(null)` or similar to signal "done" — or just let the final pipeline handle cleanup.
6. In `src/main/window.js`, widen the overlay from 100x120 to 340x150 to accommodate the transcription text below the visualizer canvas. Keep it centered horizontally.
7. In `src/renderer/visualizer.html`, add a `<div id="partial-text"></div>` element below the canvas.
8. In `src/renderer/visualizer.css`, style `#partial-text` with white text, small font (12px), centered, max-width constrained, text-overflow ellipsis, and a subtle text-shadow for readability on any background. Also update the canvas and body layout to accommodate the wider overlay.
9. In `src/renderer/visualizer.js`, add a listener for `window.vizBridge.onPartialText((text) => { ... })` that updates the `#partial-text` element's textContent. When mode changes to "idle", clear the partial text. When mode changes to "processing", show the last partial text (or clear it).
10. Run `npm run lint:fix && npm run format` to fix any style issues, then run `npm run lint && npm run format:check` to verify everything passes.
