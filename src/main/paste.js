const { clipboard } = require("electron");
const { execFile } = require("node:child_process");

function simulatePaste() {
  return new Promise((resolve, reject) => {
    const platform = process.platform;

    if (platform === "darwin") {
      execFile(
        "osascript",
        [
          "-e",
          'tell application "System Events" to keystroke "v" using command down',
        ],
        (err) => (err ? reject(err) : resolve()),
      );
    } else if (platform === "win32") {
      execFile(
        "powershell",
        [
          "-command",
          "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')",
        ],
        (err) => (err ? reject(err) : resolve()),
      );
    } else {
      execFile("xdotool", ["key", "ctrl+v"], (err) =>
        err ? reject(err) : resolve(),
      );
    }
  });
}

async function pasteText(text) {
  // Save current clipboard, paste text, restore after short delay
  const prev = clipboard.readText();
  clipboard.writeText(text);

  try {
    await simulatePaste();
  } catch (err) {
    console.error("[paste] Failed to simulate paste:", err.message);
  }

  // Restore previous clipboard after a short delay
  setTimeout(() => clipboard.writeText(prev), 500);
}

module.exports = { pasteText };
