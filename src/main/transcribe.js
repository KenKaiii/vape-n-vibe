const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const defaults = require("../config/defaults");
const { getWhisperBinaryPath } = require("../config/paths");

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

  console.log("[transcribe] running:", WHISPER_CPP, args.join(" "));

  const { stdout } = await execFileAsync(WHISPER_CPP, args, {
    timeout: 30000,
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
    .join(" ");
}

module.exports = { transcribe, parseOutput };
