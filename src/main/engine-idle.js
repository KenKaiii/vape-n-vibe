/**
 * Idle-unload manager for the active transcription engine.
 *
 * Both engines (whisper.cpp server, parakeet utilityProcess worker) hold
 * their model resident in memory once started and never free it on their
 * own — by design, so back-to-back transcriptions stay fast. Left alone
 * that means hundreds of MB to ~1GB sit in RAM indefinitely after a single
 * use.
 *
 * This module arms a short timer every time a transcription finishes and
 * cancels it every time one starts. If nothing happens for IDLE_MS, the
 * active engine is stopped; it reloads lazily (ensureServer/ensureParakeet)
 * on the next hotkey press — a sub-second cost for whisper/parakeet on
 * this hardware, which lands after audio capture has already completed
 * (recording never waits on the model).
 */
const defaults = require("../config/defaults");
const store = require("./store");

/** Idle window before the resident model is unloaded. */
const IDLE_MS = 30000;

let timer = null;

function activeEngine() {
  const selected = store.get("selectedModel");
  const key =
    selected && defaults.models[selected] ? selected : defaults.defaultModel;
  return defaults.models[key].engine;
}

function stopActiveEngine() {
  const engine = activeEngine();
  try {
    if (engine === "whisper") {
      require("./whisper-server").stopServer();
    } else if (engine === "parakeet") {
      require("./parakeet").stopParakeet();
    }
  } catch (err) {
    console.error("[engine-idle] Failed to stop idle engine:", err.message);
  }
}

/** Cancel any pending idle-stop — call when a transcription starts. */
function cancelIdleStop() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/** (Re)arm the idle-stop timer — call when a transcription finishes. */
function scheduleIdleStop() {
  cancelIdleStop();
  timer = setTimeout(() => {
    timer = null;
    console.log(
      `[engine-idle] No activity for ${IDLE_MS / 1000}s — unloading ${activeEngine()} model`,
    );
    stopActiveEngine();
  }, IDLE_MS);
}

module.exports = { cancelIdleStop, scheduleIdleStop };
