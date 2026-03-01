const fs = require("node:fs/promises");
const path = require("node:path");
const defaults = require("../config/defaults");
const store = require("./store");
const { transcribe } = require("./transcribe");
const { pasteText } = require("./paste");

async function runPipeline(wavBuffer, { sendStatus, sendOverlay }) {
  const wavPath = path.join(defaults.paths.tmp, "vapenvibe-recording.wav");
  await fs.writeFile(wavPath, Buffer.from(wavBuffer));

  try {
    sendOverlay("processing");
    sendStatus("transcribing");
    console.log("[pipeline] Transcribing audio...");
    let text = await transcribe(wavPath, store.get("language"));
    console.log("[pipeline] Transcription result:", text);

    sendStatus("idle");
    sendOverlay("idle");

    if (text && text.trim()) {
      await pasteText(text.trim());
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
