const path = require("node:path");
const { app, BrowserWindow } = require("electron");
const { createWindow, createOverlay } = require("./src/main/window");
const defaults = require("./src/config/defaults");
const { registerHotkey, stopHotkey } = require("./src/main/hotkey");
const { muteSystem, unmuteSystem } = require("./src/main/audio-control");
const { initUpdater } = require("./src/main/updater");
const {
  registerIpcHandlers,
  getWin,
  sendToOverlay,
} = require("./src/main/ipc");
const { createTray } = require("./src/main/tray");
const store = require("./src/main/store");

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
  defaults.resolveModelPaths();

  windows.main = createWindow();
  windows.overlay = createOverlay();

  registerIpcHandlers(windows);
  initUpdater(windows.main);

  createTray(windows);

  // Register push-to-talk hotkey
  const hotkey = store.get("hotkey");
  console.log("[main] Setting up hotkey:", hotkey);

  registerHotkey(hotkey, {
    onDown: async () => {
      if (recording) return;
      recording = true;
      console.log("[main] Recording started");
      if (defaults.recording.muteWhileRecording) await muteSystem();
      sendToOverlay("viz-mode", "recording");
      const win = getWin();
      if (win) win.webContents.send("recording-toggle", true);
    },
    onUp: async () => {
      if (!recording) return;
      recording = false;
      console.log("[main] Recording stopped");
      if (defaults.recording.muteWhileRecording) await unmuteSystem();
      const win = getWin();
      if (win) {
        win.webContents.send("recording-toggle", false);
      } else {
        sendToOverlay("viz-mode", "idle");
      }
    },
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
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
