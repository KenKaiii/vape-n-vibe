const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const http = require("node:http");
const crypto = require("node:crypto");
const defaults = require("../config/defaults");
const { startServer } = require("./whisper-server");

const MAX_RESUME_ATTEMPTS = 10;
const STALL_TIMEOUT_MS = 60000;
const MAX_REDIRECTS = 5;

async function computeFileHash(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

/**
 * Follow redirects manually using Node's built-in http/https modules.
 * Accepts optional headers (used for Range-based resume).
 */
function httpGet(url, headers = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > MAX_REDIRECTS) {
      return reject(new Error("Too many redirects"));
    }

    const parsed = new URL(url);
    const proto = parsed.protocol === "https:" ? https : http;
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      headers,
    };

    const req = proto.get(opts, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const location = res.headers.location;
        if (!location) return reject(new Error("Redirect with no Location"));
        res.resume();
        const next = new URL(location, url).href;
        return resolve(httpGet(next, headers, redirectCount + 1));
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      resolve(res);
    });

    req.on("error", reject);
  });
}

/**
 * Download a file with automatic resume on ECONNRESET / abort.
 *
 * When the CDN drops the connection mid-transfer (common with large files
 * in Electron's main process), we keep the partial .tmp file and resume
 * using an HTTP Range header.  The server's `accept-ranges: bytes` support
 * makes this safe — we simply request `Range: bytes=<downloaded>-` and
 * append to the existing file.
 */
async function downloadFile(url, destPath, onProgress, expectedHash) {
  const dir = path.dirname(destPath);
  const tmpPath = destPath + ".tmp";

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  let totalBytes = 0;
  let downloaded = 0;

  // Resume from a previous partial download if one exists
  if (fs.existsSync(tmpPath)) {
    downloaded = fs.statSync(tmpPath).size;
    console.log(
      `[download] Resuming from ${(downloaded / 1024 / 1024).toFixed(0)}MB`,
    );
  }

  for (let attempt = 1; attempt <= MAX_RESUME_ATTEMPTS; attempt++) {
    const headers = {};
    if (downloaded > 0) {
      headers.Range = `bytes=${downloaded}-`;
    }

    let res;
    try {
      res = await httpGet(url, headers);
    } catch (err) {
      console.error(
        `[download] Connection failed (attempt ${attempt}):`,
        err.message,
      );
      if (attempt < MAX_RESUME_ATTEMPTS) {
        await new Promise((r) => setTimeout(r, attempt * 1000));
        continue;
      }
      throw err;
    }

    // Determine total size from first request or from Content-Range on resume
    if (res.statusCode === 206) {
      // Partial content — parse total from Content-Range: bytes 12345-99999/100000
      const range = res.headers["content-range"] || "";
      const match = range.match(/\/(\d+)$/);
      if (match) totalBytes = parseInt(match[1], 10);
    } else if (res.statusCode === 200) {
      // Server ignored Range or this is the first request — start over
      totalBytes = parseInt(res.headers["content-length"], 10) || 0;
      if (downloaded > 0) {
        console.log("[download] Server returned 200, restarting from scratch");
        downloaded = 0;
      }
    }

    console.log(
      `[download] Attempt ${attempt}: status=${res.statusCode}, ` +
        `offset=${(downloaded / 1024 / 1024).toFixed(0)}MB, ` +
        `total=${(totalBytes / 1024 / 1024).toFixed(0)}MB`,
    );

    // Write mode: append if resuming partial, truncate if starting fresh
    const fileFlags = downloaded > 0 ? "a" : "w";

    const success = await new Promise((resolve) => {
      const file = fs.createWriteStream(tmpPath, { flags: fileFlags });

      let stallTimer = null;
      const resetStallTimer = () => {
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(() => {
          console.error("[download] Stall detected, aborting chunk");
          res.destroy();
        }, STALL_TIMEOUT_MS);
      };

      // Throttle progress to max 4 updates/sec
      let lastProgressTime = 0;
      const sendProgress = () => {
        const now = Date.now();
        if (
          totalBytes > 0 &&
          (now - lastProgressTime >= 250 || downloaded >= totalBytes)
        ) {
          lastProgressTime = now;
          onProgress(downloaded, totalBytes);
        }
      };

      resetStallTimer();

      res.on("data", (chunk) => {
        downloaded += chunk.length;
        file.write(chunk);
        resetStallTimer();
        sendProgress();
      });

      res.on("end", () => {
        clearTimeout(stallTimer);
        file.end(() => resolve(true));
      });

      res.on("error", (err) => {
        clearTimeout(stallTimer);
        file.end();
        console.error(
          `[download] Stream error at ${(downloaded / 1024 / 1024).toFixed(0)}MB:`,
          err.message,
        );
        resolve(false); // don't reject — we'll retry with resume
      });

      res.on("aborted", () => {
        clearTimeout(stallTimer);
        file.end();
        console.error(
          `[download] Aborted at ${(downloaded / 1024 / 1024).toFixed(0)}MB / ${(totalBytes / 1024 / 1024).toFixed(0)}MB`,
        );
        resolve(false);
      });
    });

    if (success && downloaded >= totalBytes && totalBytes > 0) {
      // Download complete
      break;
    }

    if (attempt < MAX_RESUME_ATTEMPTS) {
      const delay = Math.min(attempt * 1000, 5000);
      console.log(
        `[download] Resuming in ${(delay / 1000).toFixed(0)}s from ${(downloaded / 1024 / 1024).toFixed(0)}MB…`,
      );
      await new Promise((r) => setTimeout(r, delay));
    } else {
      throw new Error(
        `Download failed after ${MAX_RESUME_ATTEMPTS} resume attempts ` +
          `(got ${(downloaded / 1024 / 1024).toFixed(0)}MB of ${(totalBytes / 1024 / 1024).toFixed(0)}MB)`,
      );
    }
  }

  // Verify integrity
  if (expectedHash) {
    onProgress(downloaded, totalBytes);
    console.log("[download] Verifying file integrity…");
    const actualHash = await computeFileHash(tmpPath);
    if (actualHash !== expectedHash) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // best-effort cleanup
      }
      throw new Error(
        `Integrity check failed for ${path.basename(destPath)}: ` +
          `expected ${expectedHash}, got ${actualHash}`,
      );
    }
    console.log("[download] Integrity check passed");
  }

  fs.renameSync(tmpPath, destPath);
}

async function downloadModels(win) {
  if (fs.existsSync(defaults.model.path)) {
    win.webContents.send("downloads-complete");
    return;
  }

  try {
    console.log(`[download] Starting download of ${defaults.model.file}`);
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

    startServer().catch((err) => {
      console.error("[download] Whisper server failed to start:", err.message);
    });
  } catch (err) {
    console.error("[download] Final failure:", err.message);
    win.webContents.send("downloads-error", err.message);
  }
}

module.exports = { downloadModels };
