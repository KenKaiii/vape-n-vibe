const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

let wasMutedBefore = false;

async function getOutputMuted() {
  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("osascript", [
        "-e",
        "output muted of (get volume settings)",
      ]);
      return stdout.trim() === "true";
    } catch {
      return false;
    }
  }
  // TODO: Windows/Linux support
  return false;
}

async function setOutputMuted(muted) {
  if (process.platform === "darwin") {
    await execFileAsync("osascript", [
      "-e",
      `set volume output muted ${muted}`,
    ]);
  }
  // TODO: Windows/Linux support
}

async function muteSystem() {
  try {
    wasMutedBefore = await getOutputMuted();
    if (!wasMutedBefore) {
      await setOutputMuted(true);
      console.log("[audio] System audio muted");
    }
  } catch (err) {
    console.error("[audio] Failed to mute:", err.message);
  }
}

async function unmuteSystem() {
  try {
    if (!wasMutedBefore) {
      await setOutputMuted(false);
      console.log("[audio] System audio unmuted");
    }
  } catch (err) {
    console.error("[audio] Failed to unmute:", err.message);
  }
}

module.exports = { muteSystem, unmuteSystem };
