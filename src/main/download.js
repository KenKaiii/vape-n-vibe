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

/** Whether every file of a model is present on disk. */
function modelExists(modelKey) {
  const model = defaults.getModel(modelKey);
  return model.files.every((f) => f.path && fs.existsSync(f.path));
}

/**
 * Fetch the byte size of each remote file via HEAD so multi-file
 * downloads can report a single aggregate percentage.  Unknown sizes
 * resolve to 0 — progress then under-reports slightly instead of lying.
 */
async function fetchFileSizes(files) {
  return Promise.all(
    files.map(async (f) => {
      try {
        const res = await fetch(f.url, {
          method: "HEAD",
          redirect: "follow",
          signal: AbortSignal.timeout(15000),
        });
        return parseInt(res.headers.get("content-length"), 10) || 0;
      } catch {
        return 0;
      }
    }),
  );
}

/**
 * Download every missing file of a model, reporting aggregate progress.
 * After completion, starts the matching engine if the model is the
 * currently selected one.
 */
async function downloadModels(win, modelKey) {
  const store = require("./store");
  const key = modelKey || store.get("selectedModel") || defaults.defaultModel;
  const model = defaults.getModel(key);

  if (modelExists(key)) {
    win.webContents.send("downloads-complete");
    return;
  }

  try {
    const sizes = await fetchFileSizes(model.files);
    const totalBytes = sizes.reduce((a, b) => a + b, 0);
    let completedBytes = 0;

    for (let i = 0; i < model.files.length; i++) {
      const f = model.files[i];
      if (fs.existsSync(f.path)) {
        completedBytes += sizes[i];
        continue;
      }
      await downloadFile(
        f.url,
        f.path,
        (dl) => {
          if (totalBytes > 0) {
            const pct = Math.round(((completedBytes + dl) / totalBytes) * 100);
            win.webContents.send("downloads-progress", Math.min(pct, 99));
          }
        },
        f.sha256,
      );
      completedBytes += sizes[i];
    }

    win.webContents.send("downloads-progress", 100);
    win.webContents.send("downloads-complete");

    // Model just downloaded — start its engine if it's the selected one
    if (key === (store.get("selectedModel") || defaults.defaultModel)) {
      startEngineForModel(key);
    }
  } catch (err) {
    win.webContents.send("downloads-error", err.message);
  }
}

/** Start the engine matching a model's type (best-effort, non-blocking). */
function startEngineForModel(modelKey) {
  const store = require("./store");
  const model = defaults.getModel(modelKey);
  if (model.engine === "whisper") {
    const { startServer } = require("./whisper-server");
    startServer(store.get("language")).catch((err) => {
      console.error("[download] Whisper server failed to start:", err.message);
    });
  } else if (model.engine === "parakeet") {
    const { ensureParakeet } = require("./parakeet");
    ensureParakeet().catch((err) => {
      console.error("[download] Parakeet failed to start:", err.message);
    });
  }
}

module.exports = { downloadModels, modelExists, startEngineForModel };
