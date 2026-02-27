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
  const needWhisper = !fs.existsSync(defaults.model.path);
  const needLlm = !fs.existsSync(defaults.llm.path);

  if (!needWhisper && !needLlm) {
    win.webContents.send("downloads-complete");
    return;
  }

  const state = { whisper: 0, llm: 0, whisperTotal: 0, llmTotal: 0 };

  function sendProgress() {
    const downloaded = state.whisper + state.llm;
    const total = state.whisperTotal + state.llmTotal;
    if (total > 0) {
      win.webContents.send(
        "downloads-progress",
        Math.round((downloaded / total) * 100),
      );
    }
  }

  const jobs = [];

  if (needWhisper) {
    jobs.push(
      downloadFile(
        defaults.model.url,
        defaults.model.path,
        (dl, total) => {
          state.whisper = dl;
          state.whisperTotal = total;
          sendProgress();
        },
        defaults.model.sha256,
      ),
    );
  }

  if (needLlm) {
    jobs.push(
      downloadFile(
        defaults.llm.url,
        defaults.llm.path,
        (dl, total) => {
          state.llm = dl;
          state.llmTotal = total;
          sendProgress();
        },
        defaults.llm.sha256,
      ),
    );
  }

  try {
    await Promise.all(jobs);
    win.webContents.send("downloads-complete");
  } catch (err) {
    win.webContents.send("downloads-error", err.message);
  }
}

module.exports = { downloadModels };
