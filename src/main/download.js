const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const defaults = require("../config/defaults");
const { startServer } = require("./whisper-server");

async function computeFileHash(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function downloadFile(url, destPath, onProgress, expectedHash) {
  const dir = path.dirname(destPath);
  const tmpPath = destPath + ".tmp";

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(300000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const totalBytes = parseInt(res.headers.get("content-length"), 10) || 0;
  let downloaded = 0;

  const body = Readable.fromWeb(res.body);
  const file = fs.createWriteStream(tmpPath);

  const progress = new Transform({
    transform(chunk, _enc, cb) {
      downloaded += chunk.length;
      onProgress(downloaded, totalBytes);
      cb(null, chunk);
    },
  });

  try {
    await pipeline(body, progress, file);

    if (expectedHash) {
      const actualHash = await computeFileHash(tmpPath);
      if (actualHash !== expectedHash) {
        throw new Error(
          `Integrity check failed for ${path.basename(destPath)}: expected ${expectedHash}, got ${actualHash}`,
        );
      }
    }

    fs.renameSync(tmpPath, destPath);
  } catch (err) {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // best-effort cleanup
    }
    throw err;
  }
}

/**
 * Ensure the Silero VAD model is on disk. <1MB, so no progress UI —
 * called both from the explicit download flow and automatically at app
 * startup so existing installs (which already have the whisper model
 * and never hit the download button) still pick it up.
 * Non-fatal on failure: the server runs without VAD, just slower on
 * pause-heavy speech.
 */
async function ensureVadModel() {
  if (fs.existsSync(defaults.vadModel.path)) return true;
  try {
    await downloadFile(
      defaults.vadModel.url,
      defaults.vadModel.path,
      () => {},
      defaults.vadModel.sha256,
    );
    console.log("[download] VAD model downloaded");
    return true;
  } catch (err) {
    console.error("[download] VAD model download failed:", err.message);
    return false;
  }
}

async function downloadModels(win) {
  const needWhisper = !fs.existsSync(defaults.model.path);
  const needVad = !fs.existsSync(defaults.vadModel.path);

  if (!needWhisper && !needVad) {
    win.webContents.send("downloads-complete");
    return;
  }

  try {
    // VAD model first — in place before the server starts after the
    // whisper download.
    if (needVad) {
      await ensureVadModel();
    }

    if (needWhisper) {
      await downloadFile(
        defaults.model.url,
        defaults.model.path,
        (dl, total) => {
          if (total > 0) {
            win.webContents.send(
              "downloads-progress",
              Math.round((dl / total) * 100),
            );
          }
        },
        defaults.model.sha256,
      );
    }
    win.webContents.send("downloads-complete");

    if (needWhisper) {
      // Model just downloaded — start the whisper server
      startServer().catch((err) => {
        console.error(
          "[download] Whisper server failed to start:",
          err.message,
        );
      });
    }
  } catch (err) {
    win.webContents.send("downloads-error", err.message);
  }
}

module.exports = { downloadModels, ensureVadModel };
