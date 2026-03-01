const path = require("node:path");

const electron = require("electron");
const app = electron.app || null;

const isPackaged = app ? app.isPackaged : false;

/**
 * Models directory — writable location for downloaded models.
 * Packaged: userData/models (e.g. ~/Library/Application Support/vape-n-vibe/models)
 * Dev: ./models relative to project root
 */
function getModelsDir() {
  if (!app) return path.join(process.cwd(), "models");
  if (isPackaged) {
    return path.join(app.getPath("userData"), "models");
  }
  return path.join(app.getAppPath(), "models");
}

/**
 * Native fn_key_monitor.node addon path.
 * Packaged: resolved through app.asar.unpacked
 * Dev: build/Release/fn_key_monitor.node relative to project root
 */
function getNativeAddonPath() {
  const root = app ? app.getAppPath() : process.cwd();
  if (isPackaged) {
    return path.join(
      root.replace("app.asar", "app.asar.unpacked"),
      "build",
      "Release",
      "fn_key_monitor.node",
    );
  }
  return path.join(root, "build", "Release", "fn_key_monitor.node");
}

/**
 * Whisper binary path (whisper.cpp main executable).
 * Packaged: resolved through app.asar.unpacked/node_modules
 * Dev: node_modules/whisper-node/lib/whisper.cpp/main
 */
function getWhisperBinaryPath() {
  const binaryName = process.platform === "win32" ? "main.exe" : "main";
  const relativePath = path.join(
    "node_modules",
    "whisper-node",
    "lib",
    "whisper.cpp",
    binaryName,
  );

  const root = app ? app.getAppPath() : process.cwd();
  if (isPackaged) {
    return path.join(
      root.replace("app.asar", "app.asar.unpacked"),
      relativePath,
    );
  }
  return path.join(root, relativePath);
}

module.exports = { getModelsDir, getNativeAddonPath, getWhisperBinaryPath };
