const { execFile } = require("node:child_process");
const fs = require("node:fs");
const { promisify } = require("node:util");
const defaults = require("../config/defaults");
const { getWhisperBinaryPath } = require("../config/paths");
const store = require("./store");

const execFileAsync = promisify(execFile);
const WHISPER_CPP = getWhisperBinaryPath();

async function transcribe(wavPath, lang) {
  const args = [
    "-l",
    lang || defaults.model.lang,
    "-m",
    defaults.model.path,
    "-f",
    wavPath,
    "--no-timestamps",
  ];

  // Build --prompt from built-in + user dictionary words
  const builtIn = defaults.dictionary.builtIn || [];
  const userWords = store.get("dictionaryWords") || [];
  const merged = [...new Set([...builtIn, ...userWords])];
  if (merged.length > 0) {
    args.push("--prompt", merged.join(", "));
  }

  // Timeout scales with audio length: 5x real-time + 30s base for model loading.
  // 16kHz 16-bit mono = 32000 bytes/sec; minimum 30s for very short recordings.
  const fileSize = fs.statSync(wavPath).size;
  const audioDuration = Math.max(0, (fileSize - 44) / 32000);
  const timeout = Math.max(30000, audioDuration * 5000 + 30000);

  console.log(
    "[transcribe] running:",
    WHISPER_CPP,
    args.join(" "),
    `(${Math.round(audioDuration)}s audio, ${Math.round(timeout / 1000)}s timeout)`,
  );

  const { stdout } = await execFileAsync(WHISPER_CPP, args, {
    timeout,
    killSignal: "SIGKILL",
    maxBuffer: 10 * 1024 * 1024,
  });

  const text = parseOutput(stdout);

  console.log("[transcribe] result:", text);
  return text;
}

function parseOutput(stdout) {
  return stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(" ")
    .replace(/^-\s*/, "");
}

module.exports = { transcribe, parseOutput };
