const fs = require("node:fs");
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

/**
 * Vendored modern whisper.cpp server binary (built by
 * scripts/build-whisper-server.sh — current upstream whisper.cpp with
 * flash-attention and built-in Silero VAD, Metal shader embedded).
 * Returns null if not built.
 */
function getVendoredServerPath() {
  const binaryName =
    process.platform === "win32" ? "whisper-server.exe" : "whisper-server";
  const relativePath = path.join("vendor", "whisper.cpp", binaryName);

  const root = app ? app.getAppPath() : process.cwd();
  const candidate = isPackaged
    ? path.join(root.replace("app.asar", "app.asar.unpacked"), relativePath)
    : path.join(root, relativePath);

  return fs.existsSync(candidate) ? candidate : null;
}

/**
 * Legacy whisper.cpp server bundled with whisper-node (old whisper.cpp,
 * no flash-attention / VAD). Fallback when the vendored binary is absent.
 */
function getLegacyServerPath() {
  const binaryName = process.platform === "win32" ? "server.exe" : "server";
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

/**
 * Whisper server binary path — prefers the vendored modern build,
 * falls back to the legacy whisper-node binary.
 * Returns { bin, modern } so callers can gate flags that only the
 * modern server understands (--vad, --suppress-nst, …).
 */
function getWhisperServer() {
  const vendored = getVendoredServerPath();
  if (vendored) return { bin: vendored, modern: true };
  return { bin: getLegacyServerPath(), modern: false };
}

/**
 * Whisper.cpp directory — contains binaries and Metal shader.
 * Used as cwd when spawning the server so ggml-metal.metal is found.
 */
function getWhisperCppDir() {
  const relativePath = path.join(
    "node_modules",
    "whisper-node",
    "lib",
    "whisper.cpp",
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

module.exports = {
  getModelsDir,
  getNativeAddonPath,
  getWhisperBinaryPath,
  getWhisperServer,
  getWhisperCppDir,
};
