const fs = require("node:fs");
const path = require("node:path");
const { app, ipcMain, BrowserWindow } = require("electron");
const { createWindow } = require("./src/main/window");
const defaults = require("./src/config/defaults");
const store = require("./src/main/store");
const { downloadModels } = require("./src/main/download");
const { initModel, cleanupText, disposeModel } = require("./src/main/llm");
const { transcribe } = require("./src/main/transcribe");
const { pasteText } = require("./src/main/paste");
const {
  registerHotkey,
  updateHotkey,
  stopHotkey,
  checkAccessibility,
  requestAccessibility,
} = require("./src/main/hotkey");

let mainWindow = null;
let recording = false;

function getWin() {
  return mainWindow || BrowserWindow.getAllWindows()[0];
}

app.whenReady().then(() => {
  ipcMain.handle("get-config", () => ({
    model: defaults.model.name,
    hotkey: store.get("hotkey"),
    modelExists: fs.existsSync(defaults.model.path),
    cleanupEnabled: store.get("cleanupEnabled"),
    llmModel: defaults.llm.name,
    llmModelExists: fs.existsSync(defaults.llm.path),
    accessibilityGranted: checkAccessibility(),
  }));

  ipcMain.handle("set-hotkey", (_event, hotkey) => {
    store.set("hotkey", hotkey);
    updateHotkey(hotkey);
    return true;
  });

  ipcMain.handle("check-model", () => ({
    exists: fs.existsSync(defaults.model.path),
  }));

  ipcMain.handle("start-downloads", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    downloadModels(win).catch(() => {});
    return true;
  });

  ipcMain.handle("toggle-cleanup", async (_event, enabled) => {
    store.set("cleanupEnabled", enabled);
    if (enabled && fs.existsSync(defaults.llm.path)) {
      await initModel(defaults.llm.path);
    } else if (!enabled) {
      await disposeModel();
    }
    return true;
  });

  ipcMain.handle("cleanup-text", async (_event, text) => {
    if (!store.get("cleanupEnabled")) return text;
    return await cleanupText(text);
  });

  ipcMain.handle("request-accessibility", () => {
    requestAccessibility();
    return true;
  });

  ipcMain.handle("check-accessibility", () => {
    return checkAccessibility();
  });

  // Receive recorded audio from renderer
  ipcMain.handle("audio-recorded", async (_event, wavBuffer) => {
    const wavPath = path.join(defaults.paths.tmp, "vapenvibe-recording.wav");
    fs.writeFileSync(wavPath, Buffer.from(wavBuffer));

    const win = getWin();
    try {
      win.webContents.send("transcription-status", "transcribing");
      console.log("[main] Transcribing audio...");
      let text = await transcribe(wavPath);
      console.log("[main] Transcription result:", text);

      if (text && store.get("cleanupEnabled")) {
        win.webContents.send("transcription-status", "cleaning");
        text = await cleanupText(text);
      }

      win.webContents.send("transcription-status", "idle");

      if (text && text.trim()) {
        pasteText(text.trim());
      }
    } catch (err) {
      console.error("[main] Transcription error:", err);
      win.webContents.send("transcription-status", "idle");
    } finally {
      try {
        fs.unlinkSync(wavPath);
      } catch {}
    }

    return true;
  });

  mainWindow = createWindow();

  // Register push-to-talk hotkey
  const hotkey = store.get("hotkey");
  console.log("[main] Setting up hotkey:", hotkey);

  registerHotkey(hotkey, {
    onDown: () => {
      if (recording) return;
      recording = true;
      console.log("[main] Recording started");
      const win = getWin();
      if (win) win.webContents.send("recording-toggle", true);
    },
    onUp: () => {
      if (!recording) return;
      recording = false;
      console.log("[main] Recording stopped");
      const win = getWin();
      if (win) win.webContents.send("recording-toggle", false);
    },
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on("will-quit", () => {
  stopHotkey();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
