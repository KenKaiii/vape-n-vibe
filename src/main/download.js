const fs = require("node:fs");
const path = require("node:path");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const defaults = require("../config/defaults");

async function downloadFile(url, destPath, onProgress) {
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

  body.on("data", (chunk) => {
    downloaded += chunk.length;
    onProgress(downloaded, totalBytes);
  });

  try {
    await pipeline(body, file);
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

function downloadModels(win) {
  const needWhisper = !fs.existsSync(defaults.model.path);
  const needLlm = !fs.existsSync(defaults.llm.path);

  if (!needWhisper && !needLlm) {
    win.webContents.send("downloads-complete");
    return Promise.resolve();
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
      downloadFile(defaults.model.url, defaults.model.path, (dl, total) => {
        state.whisper = dl;
        state.whisperTotal = total;
        sendProgress();
      }),
    );
  }

  if (needLlm) {
    jobs.push(
      downloadFile(defaults.llm.url, defaults.llm.path, (dl, total) => {
        state.llm = dl;
        state.llmTotal = total;
        sendProgress();
      }),
    );
  }

  return Promise.all(jobs)
    .then(() => {
      win.webContents.send("downloads-complete");
    })
    .catch((err) => {
      win.webContents.send("downloads-error", err.message);
    });
}

module.exports = { downloadModels };
