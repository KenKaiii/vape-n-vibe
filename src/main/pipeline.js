const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const store = require("./store");
// Imported as a module object (not destructured) so tests can monkey-patch
// individual exports.  vi.mock does not intercept CJS requires reliably
// in this Vitest setup; mutating module.exports is the supported path.
const transcribeMod = require("./transcribe");
const { pasteText } = require("./paste");

async function runPipeline(wavBuffer, { sendStatus, sendOverlay }) {
  const buf = Buffer.from(wavBuffer);

  // Single source of truth for "is this clip worth transcribing?" lives
  // in transcribe.js (`analyzeWav` — duration + RMS-based silence check).
  // We run it once here so we can short-circuit before touching disk and
  // pass the result through to transcribe() so the WAV isn't re-read.
  const analysis = transcribeMod.analyzeWav(buf);
  if (!analysis.hasSpeech) {
    console.log(
      `[pipeline] Audio too short or silent (${analysis.duration.toFixed(2)}s), skipping`,
    );
    sendStatus("idle");
    sendOverlay("idle");
    return;
  }

  const wavPath = path.join(
    os.tmpdir(),
    `vapenvibe-${Date.now()}-${crypto.randomUUID()}.wav`,
  );
  await fs.writeFile(wavPath, buf);

  try {
    sendOverlay("processing");
    sendStatus("transcribing");
    console.log("[pipeline] Transcribing audio...");
    let text = await transcribeMod.transcribe(wavPath, store.get("language"), {
      rawWav: buf,
      analysis,
    });
    console.log("[pipeline] Transcription result:", text);

    sendStatus("idle");
    sendOverlay("idle");

    if (text && text.trim()) {
      try {
        await pasteText(text.trim());
      } catch (err) {
        console.error("[pipeline] Paste failed:", err.message);
      }
    }
  } catch (err) {
    console.error("[pipeline] Transcription error:", err);
    sendStatus("idle");
    sendOverlay("idle");
  } finally {
    try {
      await fs.unlink(wavPath);
    } catch {
      // best-effort cleanup
    }
  }
}

module.exports = { runPipeline };
