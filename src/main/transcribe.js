const path = require("node:path");
const { execFile } = require("node:child_process");
const defaults = require("../config/defaults");

const WHISPER_CPP = path.join(
  __dirname,
  "..",
  "..",
  "node_modules",
  "whisper-node",
  "lib",
  "whisper.cpp",
  "main"
);

function transcribe(wavPath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-l", defaults.model.lang,
      "-m", defaults.model.path,
      "-f", wavPath,
      "--no-timestamps",
    ];

    console.log("[transcribe] running:", WHISPER_CPP, args.join(" "));

    execFile(WHISPER_CPP, args, { timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        console.error("[transcribe] error:", err.message);
        return reject(err);
      }

      // whisper.cpp outputs text lines to stdout (with --no-timestamps, plain text)
      const text = stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .join(" ");

      console.log("[transcribe] result:", text);
      resolve(text);
    });
  });
}

module.exports = { transcribe };
