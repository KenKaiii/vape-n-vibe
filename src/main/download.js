const https = require("node:https");
const fs = require("node:fs");
const path = require("node:path");
const defaults = require("../config/defaults");

function followRedirect(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(res.headers.location);
        } else {
          resolve(url);
        }
        res.resume();
      })
      .on("error", reject);
  });
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(destPath);
    const tmpPath = destPath + ".tmp";

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    followRedirect(url)
      .then((finalUrl) => {
        https
          .get(finalUrl, (res) => {
            if (res.statusCode !== 200) {
              return reject(new Error(`HTTP ${res.statusCode}`));
            }

            const totalBytes = parseInt(res.headers["content-length"], 10) || 0;
            let downloaded = 0;
            const file = fs.createWriteStream(tmpPath);

            res.on("data", (chunk) => {
              downloaded += chunk.length;
              onProgress(downloaded, totalBytes);
            });

            res.pipe(file);

            file.on("finish", () => {
              file.close(() => {
                fs.renameSync(tmpPath, destPath);
                resolve();
              });
            });

            file.on("error", (err) => {
              fs.unlink(tmpPath, () => {});
              reject(err);
            });
          })
          .on("error", reject);
      })
      .catch(reject);
  });
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
      win.webContents.send("downloads-progress", Math.round((downloaded / total) * 100));
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
