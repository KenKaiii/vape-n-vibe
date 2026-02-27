const fs = require("node:fs");
const path = require("node:path");
const { app, ipcMain, BrowserWindow, Tray, Menu, nativeImage } = require("electron");
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

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let recording = false;

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

  // Forward frequency data from renderer to overlay
  ipcMain.on("viz-freq", (_event, data) => {
    sendToOverlay("viz-freq", data);
  });

  // Receive recorded audio from renderer
  ipcMain.handle("audio-recorded", async (_event, wavBuffer) => {
    const wavPath = path.join(defaults.paths.tmp, "vapenvibe-recording.wav");
    fs.writeFileSync(wavPath, Buffer.from(wavBuffer));

    const win = getWin();
    try {
      sendToOverlay("viz-mode", "processing");
      win.webContents.send("transcription-status", "transcribing");
      console.log("[main] Transcribing audio...");
      let text = await transcribe(wavPath);
      console.log("[main] Transcription result:", text);

      if (text && store.get("cleanupEnabled")) {
        win.webContents.send("transcription-status", "cleaning");
        text = await cleanupText(text);
        console.log("[main] Cleaned text:", JSON.stringify(text));
      }

      win.webContents.send("transcription-status", "idle");
      sendToOverlay("viz-mode", "idle");

      if (text && text.trim()) {
        pasteText(text.trim());
      }
    } catch (err) {
      console.error("[main] Transcription error:", err);
      win.webContents.send("transcription-status", "idle");
      sendToOverlay("viz-mode", "idle");
    } finally {
      try {
        fs.unlinkSync(wavPath);
      } catch {}
    }

    return true;
  });

  mainWindow = createWindow();
  overlayWindow = createOverlay();

  // Auto-init LLM if cleanup is enabled and model exists
  if (store.get("cleanupEnabled") && fs.existsSync(defaults.llm.path)) {
    initModel(defaults.llm.path).catch(() => {});
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
    {
      label: "Check for updates",
      click: () => {
        /* TODO */
      },
    },
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
      sendToOverlay("viz-mode", "recording");
      const win = getWin();
      if (win) win.webContents.send("recording-toggle", true);
    },
    onUp: () => {
      if (!recording) return;
      recording = false;
      console.log("[main] Recording stopped");
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
    if (BrowserWindow.getAllWindows().length === 0) {
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
