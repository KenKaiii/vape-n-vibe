const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const defaults = require("../config/defaults");

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

  const res = await fetch(url, { redirect: "follow" });

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

async function downloadModels(win) {
  if (fs.existsSync(defaults.model.path)) {
    win.webContents.send("downloads-complete");
    return;
  }

  try {
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
    win.webContents.send("downloads-complete");
  } catch (err) {
    win.webContents.send("downloads-error", err.message);
  }
}

module.exports = { downloadModels };
