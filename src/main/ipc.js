const fs = require("node:fs");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { app, ipcMain, BrowserWindow } = require("electron");
const defaults = require("../config/defaults");
const store = require("./store");
const { downloadModels } = require("./download");
const {
  updateHotkey,
  checkAccessibility,
  requestAccessibility,
} = require("./hotkey");
const { runPipeline } = require("./pipeline");

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
    return {
      model: defaults.model.name,
      hotkey: store.get("hotkey"),
      modelExists: fs.existsSync(defaults.model.path),
      accessibilityGranted: checkAccessibility(),
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

  ipcMain.handle("set-language", (event, lang) => {
    if (!validateSender(event.senderFrame)) return false;
    store.set("language", lang);
    return true;
  });

  ipcMain.handle("start-downloads", (event) => {
    if (!validateSender(event.senderFrame)) return false;
    const win = BrowserWindow.fromWebContents(event.sender);
    downloadModels(win).catch((err) => {
      console.error("[main] Download error:", err);
    });
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
    const clean = words.filter(
      (w) => typeof w === "string" && w.trim() && !/[\s,]/.test(w),
    );
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

  // Receive recorded audio from renderer
  ipcMain.handle("audio-recorded", async (event, wavBuffer) => {
    if (!validateSender(event.senderFrame)) return false;

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
