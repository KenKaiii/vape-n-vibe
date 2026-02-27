const { execFile } = require("node:child_process");

let wasMutedBefore = false;

function getOutputMuted() {
  return new Promise((resolve) => {
    if (process.platform === "darwin") {
      execFile(
        "osascript",
        ["-e", "output muted of (get volume settings)"],
        (err, stdout) => {
          if (err) {
            resolve(false);
            return;
          }
          resolve(stdout.trim() === "true");
        },
      );
    } else {
      // TODO: Windows/Linux support
      resolve(false);
    }
  });
}

function setOutputMuted(muted) {
  return new Promise((resolve, reject) => {
    if (process.platform === "darwin") {
      execFile(
        "osascript",
        ["-e", `set volume output muted ${muted}`],
        (err) => (err ? reject(err) : resolve()),
      );
    } else {
      // TODO: Windows/Linux support
      resolve();
    }
  });
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
