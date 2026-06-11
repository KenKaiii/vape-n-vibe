const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow, ipcMain } = require("electron");
const { createWindow, createOverlay } = require("./src/main/window");
const defaults = require("./src/config/defaults");
const { registerHotkey, stopHotkey } = require("./src/main/hotkey");
const { muteSystem, unmuteSystem } = require("./src/main/audio-control");
const { initUpdater } = require("./src/main/updater");
const {
  registerIpcHandlers,
  getWin,
  sendToOverlay,
  validateSender,
} = require("./src/main/ipc");
const { createTray } = require("./src/main/tray");
const store = require("./src/main/store");
const { startServer, stopServer } = require("./src/main/whisper-server");

// --- Global error handlers ---
process.on("unhandledRejection", (reason) => {
  console.error("[main] Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[main] Uncaught exception:", err);
});

const windows = { main: null, overlay: null };
let recording = false;

// Set dock icon on macOS
if (process.platform === "darwin") {
  app.dock.setIcon(path.join(__dirname, "assets", "icon.png"));
}

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    const { systemPreferences } = require("electron");
    systemPreferences.askForMediaAccess("microphone").catch(() => {});
  }

  defaults.resolveModelPaths();

  // Start whisper server if model exists (non-blocking)
  if (fs.existsSync(defaults.model.path)) {
    startServer(store.get("language")).catch((err) => {
      console.error("[main] Whisper server failed to start:", err.message);
    });
  }

  windows.main = createWindow();
  windows.overlay = createOverlay();

  registerIpcHandlers(windows);
  initUpdater(windows);

  windows.tray = createTray(windows);

  // Register push-to-talk hotkey
  const hotkey = store.get("hotkey");
  console.log("[main] Setting up hotkey:", hotkey);

  registerHotkey(hotkey, {
    onDown: async () => {
      if (recording) return;
      recording = true;
      console.log("[main] Recording started");
      // Send IPC immediately — before any async work — so message
      // ordering is guaranteed even on rapid taps.
      sendToOverlay("viz-mode", "recording");
      const win = getWin();
      if (win) win.webContents.send("recording-toggle", true);
      try {
        if (defaults.recording.muteWhileRecording) await muteSystem();
      } catch (err) {
        console.error("[main] Mute failed:", err.message);
      }
    },
    onUp: async () => {
      if (!recording) return;
      recording = false;
      console.log("[main] Recording stopped");
      // Send IPC immediately — before any async work — so the renderer
      // always receives stop after start, never reversed.
      sendToOverlay("viz-mode", "idle");
      const win = getWin();
      if (win) {
        win.webContents.send("recording-toggle", false);
      }
      try {
        if (defaults.recording.muteWhileRecording) await unmuteSystem();
      } catch (err) {
        console.error("[main] Unmute failed:", err.message);
      }
    },
  });

  // Reset recording state if renderer fails to start recording
  ipcMain.on("recording-error", (event) => {
    if (!validateSender(event.senderFrame)) return;
    console.warn("[main] Renderer reported recording error, resetting state");
    recording = false;
    sendToOverlay("viz-mode", "idle");
  });

  app.on("activate", () => {
    if (windows.main && !windows.main.isDestroyed()) {
      windows.main.show();
      windows.main.focus();
    } else {
      windows.main = createWindow();
    }
  });
});

app.on("before-quit", () => {
  BrowserWindow.getAllWindows().forEach((w) => {
    w.forceClose = true;
  });
  stopHotkey();
  stopServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
