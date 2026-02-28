const fs = require("node:fs");
const path = require("node:path");
const defaults = require("../config/defaults");
const store = require("./store");
const { transcribe } = require("./transcribe");
const { cleanupText } = require("./llm");
const { pasteText } = require("./paste");

async function runPipeline(wavBuffer, { sendStatus, sendOverlay }) {
  const wavPath = path.join(defaults.paths.tmp, "vapenvibe-recording.wav");
  fs.writeFileSync(wavPath, Buffer.from(wavBuffer));

  try {
    sendOverlay("processing");
    sendStatus("transcribing");
    console.log("[pipeline] Transcribing audio...");
    let text = await transcribe(wavPath, store.get("language"));
    console.log("[pipeline] Transcription result:", text);

    if (text && store.get("cleanupEnabled")) {
      sendStatus("cleaning");
      text = await cleanupText(text);
      console.log("[pipeline] Cleaned text:", JSON.stringify(text));
    }

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
      fs.unlinkSync(wavPath);
    } catch {
      // best-effort cleanup
    }
  }
}

module.exports = { runPipeline };
