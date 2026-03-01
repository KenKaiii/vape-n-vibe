const { app, BrowserWindow } = require("electron");

let windows = null;

function send(data) {
  const win = windows && windows.main;
  if (win && !win.isDestroyed()) {
    win.webContents.send("update-status", data);
  }
}

function initUpdater(appWindows) {
  windows = appWindows;

  if (!app.isPackaged) {
    console.log("[updater] Skipping — not packaged");
    return;
  }

  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on("checking-for-update", () => {
    send({ state: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    send({ state: "available", version: info.version });
  });

  autoUpdater.on("update-not-available", () => {
    send({ state: "up-to-date" });
  });

  autoUpdater.on("download-progress", (progress) => {
    send({ state: "downloading", percent: Math.round(progress.percent) });
  });

  autoUpdater.on("update-downloaded", () => {
    send({ state: "downloaded" });
  });

  autoUpdater.on("error", (err) => {
    console.error("[updater] Error:", err.message);
    send({ state: "error" });
  });
}

function checkForUpdates() {
  if (!app.isPackaged) {
    send({ state: "up-to-date" });
    return;
  }
  const { autoUpdater } = require("electron-updater");
  // Force electron-updater to create a fresh HTTP client on each check,
  // bypassing GitHub CDN caching of the releases Atom feed.
  autoUpdater.clientPromise = null;
  autoUpdater.checkForUpdates().catch((err) => {
    console.error("[updater] Check error:", err.message);
    send({ state: "error" });
  });
}

function downloadUpdate() {
  if (!app.isPackaged) return;
  const { autoUpdater } = require("electron-updater");
  autoUpdater.downloadUpdate().catch((err) => {
    console.error("[updater] Download error:", err.message);
    send({ state: "error" });
  });
}

function installUpdate() {
  if (!app.isPackaged) return;
  // Mark all windows for force-close so the hide-on-close handler
  // in window.js doesn't prevent the app from actually quitting.
  BrowserWindow.getAllWindows().forEach((w) => {
    w.forceClose = true;
  });
  const { autoUpdater } = require("electron-updater");
  autoUpdater.quitAndInstall();
}

module.exports = {
  initUpdater,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
};
