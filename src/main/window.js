const { BrowserWindow } = require("electron");
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
  return win;
}

module.exports = { createWindow };
