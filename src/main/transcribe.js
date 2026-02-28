const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const defaults = require("../config/defaults");
const { getWhisperBinaryPath } = require("../config/paths");

const execFileAsync = promisify(execFile);
const WHISPER_CPP = getWhisperBinaryPath();

// Whisper hallucinates these phrases on silence / trailing audio
const HALLUCINATIONS = [
  /\[BLANK_AUDIO\]/gi,
  /\(blank audio\)/gi,
  /\bGoodbye\.?\s*$/i,
  /\bThank you\.?\s*$/i,
  /\bThanks for watching\.?\s*$/i,
  /\bPlease subscribe\.?\s*$/i,
  /\bSee you next time\.?\s*$/i,
];

function stripHallucinations(text) {
  let cleaned = text;
  for (const pattern of HALLUCINATIONS) {
    cleaned = cleaned.replace(pattern, "");
  }
  return cleaned.trim();
}

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

  let text = stdout
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join(" ");

  text = stripHallucinations(text);

  console.log("[transcribe] result:", text);
  return text;
}

module.exports = { transcribe };
