const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { app, ipcMain, BrowserWindow, systemPreferences } = require("electron");
const defaults = require("../config/defaults");
const store = require("./store");
const { downloadModels, modelExists } = require("./download");
const {
  updateHotkey,
  checkAccessibility,
  requestAccessibility,
} = require("./hotkey");
const { runPipeline } = require("./pipeline");
const { restartServer, isReady, stopServer } = require("./whisper-server");
const { stopParakeet } = require("./parakeet");
const { transcribePartial, cancelActivePartial } = require("./transcribe");

const execFileAsync = promisify(execFile);

let _windows = null;

function validateSender(frame) {
  if (!frame || !frame.url) return false;
  try {
    const parsed = new URL(frame.url);
    if (parsed.protocol !== "file:") return false;
    return parsed.pathname.includes("/src/renderer/");
  } catch {
    return false;
  }
}

function getWin() {
  if (_windows.main && !_windows.main.isDestroyed()) return _windows.main;
  const wins = BrowserWindow.getAllWindows().filter(
    (w) => !w.isDestroyed() && w !== _windows.overlay,
  );
  return wins[0] || null;
}

function sendToOverlay(channel, data) {
  if (_windows.overlay && !_windows.overlay.isDestroyed()) {
    _windows.overlay.webContents.send(channel, data);
  }
}

function registerIpcHandlers(windows) {
  _windows = windows;

  ipcMain.handle("get-config", (event) => {
    if (!validateSender(event.senderFrame)) return null;
    const selectedModel = store.get("selectedModel") || defaults.defaultModel;
    return {
      model: selectedModel,
      models: Object.entries(defaults.models).map(([key, m]) => ({
        key,
        label: m.label,
        engine: m.engine,
        downloaded: modelExists(key),
      })),
      selectedModel,
      hotkey: store.get("hotkey"),
      modelExists: modelExists(selectedModel),
      accessibilityGranted: checkAccessibility(),
      microphoneGranted:
        process.platform !== "darwin" ||
        systemPreferences.getMediaAccessStatus("microphone") === "granted",
      platform: process.platform,
      language: store.get("language"),
      version: app.getVersion(),
    };
  });

  ipcMain.handle("set-hotkey", (event, hotkey) => {
    if (!validateSender(event.senderFrame)) return false;
    store.set("hotkey", hotkey);
    updateHotkey(hotkey);
    return true;
  });

  ipcMain.handle("set-language", async (event, lang) => {
    if (!validateSender(event.senderFrame)) return false;
    store.set("language", lang);

    // Restart whisper server with new language if it's running
    if (isReady()) {
      restartServer(lang).catch((err) => {
        console.error("[ipc] Whisper server restart failed:", err.message);
      });
    }

    // Tell the renderer when the selected parakeet model can't serve
    // this language — transcription silently falls back to whisper.
    const selected = defaults.getModel(
      store.get("selectedModel") || defaults.defaultModel,
    );
    const parakeetUnsupported =
      selected.engine === "parakeet" &&
      lang !== "auto" &&
      !selected.languages.includes(lang);

    return { ok: true, parakeetUnsupported };
  });

  ipcMain.handle("set-model", (event, key) => {
    if (!validateSender(event.senderFrame)) return false;
    if (typeof key !== "string" || !defaults.models[key]) return false;

    const previous = store.get("selectedModel") || defaults.defaultModel;
    if (key === previous) return { ok: true, downloaded: modelExists(key) };

    store.set("selectedModel", key);

    // Stop the now-inactive engine to reclaim its memory; the new one
    // is started lazily on next use (ensureServer/ensureParakeet) or
    // eagerly here when its files are already on disk.
    const newEngine = defaults.models[key].engine;
    if (newEngine !== "whisper") stopServer();
    if (newEngine !== "parakeet") stopParakeet();

    const downloaded = modelExists(key);
    if (downloaded) {
      const { startEngineForModel } = require("./download");
      startEngineForModel(key);
    }

    return { ok: true, downloaded };
  });

  ipcMain.handle("start-downloads", async (event, modelKey) => {
    if (!validateSender(event.senderFrame)) return false;
    if (modelKey !== undefined && typeof modelKey !== "string") return false;
    const win = BrowserWindow.fromWebContents(event.sender);
    await downloadModels(win, modelKey);
    return true;
  });

  ipcMain.handle("request-accessibility", (event) => {
    if (!validateSender(event.senderFrame)) return false;
    requestAccessibility();
    return true;
  });

  ipcMain.handle("check-accessibility", (event) => {
    if (!validateSender(event.senderFrame)) return false;
    return checkAccessibility();
  });

  ipcMain.handle("check-system-events", async (event) => {
    if (!validateSender(event.senderFrame)) return false;
    if (process.platform !== "darwin") return true;
    try {
      await execFileAsync("osascript", [
        "-e",
        'tell application "System Events" to return ""',
      ]);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("request-system-events", async (event) => {
    if (!validateSender(event.senderFrame)) return false;
    if (process.platform !== "darwin") return true;
    try {
      await execFileAsync("osascript", [
        "-e",
        'tell application "System Events" to return ""',
      ]);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("check-microphone", (event) => {
    if (!validateSender(event.senderFrame)) return false;
    if (process.platform !== "darwin") return true;
    return systemPreferences.getMediaAccessStatus("microphone") === "granted";
  });

  ipcMain.handle("request-microphone", async (event) => {
    if (!validateSender(event.senderFrame)) return false;
    if (process.platform !== "darwin") return true;
    return systemPreferences.askForMediaAccess("microphone");
  });

  ipcMain.handle("check-for-updates", (event) => {
    if (!validateSender(event.senderFrame)) return false;
    const { checkForUpdates } = require("./updater");
    checkForUpdates();
    return true;
  });

  ipcMain.handle("download-update", (event) => {
    if (!validateSender(event.senderFrame)) return false;
    const { downloadUpdate } = require("./updater");
    downloadUpdate();
    return true;
  });

  ipcMain.handle("install-update", (event) => {
    if (!validateSender(event.senderFrame)) return false;
    const { installUpdate } = require("./updater");
    installUpdate();
    return true;
  });

  ipcMain.handle("get-dictionary", (event) => {
    if (!validateSender(event.senderFrame)) return [];
    return store.get("dictionaryWords");
  });

  ipcMain.handle("set-dictionary", (event, words) => {
    if (!validateSender(event.senderFrame)) return false;
    if (!Array.isArray(words)) return false;
    const clean = words
      .filter((w) => typeof w === "string" && w.trim() && !/[\s,]/.test(w))
      .filter((w) => w.length <= 50)
      .slice(0, 200);
    store.set("dictionaryWords", clean);
    return true;
  });

  ipcMain.handle("restart-app", (event) => {
    if (!validateSender(event.senderFrame)) return false;
    BrowserWindow.getAllWindows().forEach((w) => {
      w.forceClose = true;
    });
    app.relaunch();
    app.exit(0);
    return true;
  });

  // Forward frequency data from renderer to overlay
  ipcMain.on("viz-freq", (event, data) => {
    if (!validateSender(event.senderFrame)) return;
    sendToOverlay("viz-freq", data);
  });

  // Partial transcription — display-only preview in the overlay.
  // The full accumulated audio buffer is re-transcribed each time so
  // whisper has enough context.  We track the latest result and paste
  // it once on recording stop (avoiding a second full-pipeline pass).
  //
  // Session ID pattern: each recording session gets a unique integer ID.
  // Partials capture the ID at dispatch time and discard their result if
  // the ID has changed by the time transcribePartial() resolves — this
  // prevents a partial that was in-flight when audio-recorded fired from
  // updating the overlay after the session has already ended.
  let partialInFlight = false;
  let recordingSessionId = 0;

  ipcMain.handle("audio-partial", async (event, wavBuffer) => {
    if (!validateSender(event.senderFrame)) return "";
    if (partialInFlight) return "";

    const sessionId = recordingSessionId;
    partialInFlight = true;
    try {
      const lang = store.get("language");
      const text = await transcribePartial(wavBuffer, lang);

      // Only update overlay if the recording session is still active.
      // If audio-recorded fired while we were awaiting, sessionId will
      // differ from recordingSessionId and we silently discard the result.
      if (text && sessionId === recordingSessionId) {
        sendToOverlay("partial-text", text);
        const win = getWin();
        if (win) win.webContents.send("partial-text", text);
      }

      return text;
    } catch (err) {
      console.error("[ipc] partial transcription error:", err.message);
      return "";
    } finally {
      partialInFlight = false;
    }
  });

  // Receive recorded audio from renderer
  ipcMain.handle("audio-recorded", async (event, wavBuffer) => {
    if (!validateSender(event.senderFrame)) return false;

    // Advance the session ID so any in-flight partial discards its result,
    // and abort it — the whisper server is single-threaded, so an active
    // partial would otherwise delay the final transcription by its full
    // inference time.
    recordingSessionId++;
    cancelActivePartial();

    // Clear overlay text (visualizer mode handled by pipeline)
    sendToOverlay("partial-text", "");

    // Always run the full pipeline with the complete audio buffer.
    // Partials were display-only previews — the final transcription
    // needs the entire recording to capture every word.
    await runPipeline(wavBuffer, {
      sendStatus: (status) => {
        const win = getWin();
        if (win) win.webContents.send("transcription-status", status);
      },
      sendOverlay: (mode) => sendToOverlay("viz-mode", mode),
    });

    return true;
  });
}

module.exports = { registerIpcHandlers, getWin, sendToOverlay, validateSender };
