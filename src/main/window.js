const { BrowserWindow, screen } = require("electron");
const path = require("node:path");
const defaults = require("../config/defaults");

function createWindow() {
  const win = new BrowserWindow({
    width: defaults.window.width,
    height: defaults.window.height,
    webPreferences: {
      preload: path.join(__dirname, "..", "main", "preload.js"),
    },
  });

  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  // Hide instead of destroy so the renderer stays alive for recording
  win.on("close", (e) => {
    if (!win.forceClose) {
      e.preventDefault();
      win.hide();
    }
  });

  return win;
}

function createOverlay() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const width = 80;
  const height = 80;

  const overlay = new BrowserWindow({
    width,
    height,
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + workArea.height - height + 12),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  overlay.setIgnoreMouseEvents(true);
  overlay.setVisibleOnAllWorkspaces(true);
  overlay.loadFile(path.join(__dirname, "..", "renderer", "visualizer.html"));

  return overlay;
}

module.exports = { createWindow, createOverlay };
