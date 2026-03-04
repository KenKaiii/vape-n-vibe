const fs = require("node:fs");
const defaults = require("../config/defaults");
const store = require("./store");
const { ensureServer, getServerUrl } = require("./whisper-server");

async function transcribe(wavPath, lang) {
  await ensureServer(lang);

  // Build prompt from built-in + user dictionary words
  const builtIn = defaults.dictionary.builtIn || [];
  const userWords = store.get("dictionaryWords") || [];
  const merged = [...new Set([...builtIn, ...userWords])];

  // Build multipart form data
  const wavData = fs.readFileSync(wavPath);
  const boundary = `----whisper${Date.now()}`;
  const parts = [];

  // Audio file part
  parts.push(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n' +
      "Content-Type: audio/wav\r\n\r\n",
  );
  parts.push(wavData);
  parts.push("\r\n");

  // Response format
  parts.push(
    `--${boundary}\r\n` +
      'Content-Disposition: form-data; name="response-format"\r\n\r\n' +
      "text\r\n",
  );

  // Prompt (dictionary words)
  if (merged.length > 0) {
    parts.push(
      `--${boundary}\r\n` +
        'Content-Disposition: form-data; name="prompt"\r\n\r\n' +
        merged.join(", ") +
        "\r\n",
    );
  }

  parts.push(`--${boundary}--\r\n`);

  // Combine parts into a single buffer
  const body = Buffer.concat(
    parts.map((p) => (typeof p === "string" ? Buffer.from(p) : p)),
  );

  // Timeout scales with audio length: 5x real-time + 10s base.
  // No model loading overhead, so base is lower than before.
  const fileSize = fs.statSync(wavPath).size;
  const audioDuration = Math.max(0, (fileSize - 44) / 32000);
  const timeout = Math.max(15000, audioDuration * 5000 + 10000);

  console.log(
    `[transcribe] POST ${getServerUrl()}/inference (${Math.round(audioDuration)}s audio, ${Math.round(timeout / 1000)}s timeout)`,
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${getServerUrl()}/inference`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Server returned ${response.status}: ${errText}`);
    }

    const text = parseOutput(await response.text());
    console.log("[transcribe] result:", text);
    return text;
  } finally {
    clearTimeout(timer);
  }
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
