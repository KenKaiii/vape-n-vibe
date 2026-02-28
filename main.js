const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);
const {
  app,
  ipcMain,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
} = require("electron");
const { createWindow, createOverlay } = require("./src/main/window");
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
const { muteSystem, unmuteSystem } = require("./src/main/audio-control");
const {
  initUpdater,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
} = require("./src/main/updater");

// --- Global error handlers ---
process.on("unhandledRejection", (reason) => {
  console.error("[main] Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[main] Uncaught exception:", err);
});

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let recording = false;

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
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  // Find a non-overlay window
  const wins = BrowserWindow.getAllWindows().filter(
    (w) => !w.isDestroyed() && w !== overlayWindow,
  );
  return wins[0] || null;
}

function sendToOverlay(channel, data) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send(channel, data);
  }
}

// Set dock icon on macOS
if (process.platform === "darwin") {
  app.dock.setIcon(path.join(__dirname, "assets", "icon.png"));
}

app.whenReady().then(() => {
  defaults.resolveModelPaths();

  ipcMain.handle("get-config", (event) => {
    if (!validateSender(event.senderFrame)) return null;
    return {
      model: defaults.model.name,
      hotkey: store.get("hotkey"),
      modelExists: fs.existsSync(defaults.model.path),
      cleanupEnabled: store.get("cleanupEnabled"),
      llmModel: defaults.llm.name,
      llmModelExists: fs.existsSync(defaults.llm.path),
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

  ipcMain.handle("toggle-cleanup", async (event, enabled) => {
    if (!validateSender(event.senderFrame)) return false;
    store.set("cleanupEnabled", enabled);
    try {
      if (enabled && fs.existsSync(defaults.llm.path)) {
        await initModel(defaults.llm.path);
      } else if (!enabled) {
        await disposeModel();
      }
    } catch (err) {
      console.error("[main] LLM toggle error:", err);
      store.set("cleanupEnabled", false);
      return false;
    }
    return true;
  });

  ipcMain.handle("cleanup-text", async (event, text) => {
    if (!validateSender(event.senderFrame)) return text;
    if (!store.get("cleanupEnabled")) return text;
    return await cleanupText(text);
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
    checkForUpdates();
    return true;
  });

  ipcMain.handle("download-update", (event) => {
    if (!validateSender(event.senderFrame)) return false;
    downloadUpdate();
    return true;
  });

  ipcMain.handle("install-update", (event) => {
    if (!validateSender(event.senderFrame)) return false;
    installUpdate();
    return true;
  });

  ipcMain.handle("restart-app", (event) => {
    if (!validateSender(event.senderFrame)) return false;
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
    const wavPath = path.join(defaults.paths.tmp, "vapenvibe-recording.wav");
    fs.writeFileSync(wavPath, Buffer.from(wavBuffer));

    const win = getWin();
    try {
      sendToOverlay("viz-mode", "processing");
      if (win) win.webContents.send("transcription-status", "transcribing");
      console.log("[main] Transcribing audio...");
      let text = await transcribe(wavPath, store.get("language"));
      console.log("[main] Transcription result:", text);

      if (text && store.get("cleanupEnabled")) {
        if (win) win.webContents.send("transcription-status", "cleaning");
        text = await cleanupText(text);
        console.log("[main] Cleaned text:", JSON.stringify(text));
      }

      if (win) win.webContents.send("transcription-status", "idle");
      sendToOverlay("viz-mode", "idle");

      if (text && text.trim()) {
        await pasteText(text.trim());
      }
    } catch (err) {
      console.error("[main] Transcription error:", err);
      if (win) win.webContents.send("transcription-status", "idle");
      sendToOverlay("viz-mode", "idle");
    } finally {
      try {
        fs.unlinkSync(wavPath);
      } catch {
        // best-effort cleanup
      }
    }

    return true;
  });

  mainWindow = createWindow();
  overlayWindow = createOverlay();
  initUpdater(mainWindow);

  // Auto-init LLM if cleanup is enabled and model exists
  if (store.get("cleanupEnabled") && fs.existsSync(defaults.llm.path)) {
    initModel(defaults.llm.path).catch((err) => {
      console.error("[main] LLM init error:", err);
    });
  }

  // --- Tray ---
  const trayIcon = nativeImage.createFromPath(
    path.join(__dirname, "assets", "trayTemplate.png"),
  );
  trayIcon.setTemplateImage(true);
  tray = new Tray(trayIcon);
  tray.setToolTip("Vape 'n' Vibe");
  const pkg = require("./package.json");
  const trayMenu = Menu.buildFromTemplate([
    { label: `Vape 'n' Vibe v${pkg.version}`, enabled: false },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(trayMenu);
  tray.on("click", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      mainWindow = createWindow();
    }
  });

  // Register push-to-talk hotkey
  const hotkey = store.get("hotkey");
  console.log("[main] Setting up hotkey:", hotkey);

  registerHotkey(hotkey, {
    onDown: () => {
      if (recording) return;
      recording = true;
      console.log("[main] Recording started");
      if (defaults.recording.muteWhileRecording) muteSystem();
      sendToOverlay("viz-mode", "recording");
      const win = getWin();
      if (win) win.webContents.send("recording-toggle", true);
    },
    onUp: () => {
      if (!recording) return;
      recording = false;
      console.log("[main] Recording stopped");
      if (defaults.recording.muteWhileRecording) unmuteSystem();
      const win = getWin();
      if (win) {
        win.webContents.send("recording-toggle", false);
      } else {
        // No renderer — clear overlay
        sendToOverlay("viz-mode", "idle");
      }
    },
  });

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      mainWindow = createWindow();
    }
  });
});

app.on("before-quit", () => {
  // Allow windows to actually close
  BrowserWindow.getAllWindows().forEach((w) => {
    w.forceClose = true;
  });
  stopHotkey();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
