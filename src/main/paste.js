const { clipboard } = require("electron");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

async function simulatePaste() {
  const platform = process.platform;

  if (platform === "darwin") {
    await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to keystroke "v" using command down',
    ]);
  } else if (platform === "win32") {
    await execFileAsync("powershell", [
      "-command",
      "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')",
    ]);
  } else {
    await execFileAsync("xdotool", ["key", "ctrl+v"]);
  }
}

async function pasteText(text) {
  console.log("[paste] Pasting text:", JSON.stringify(text));
  const prev = clipboard.readText();
  clipboard.writeText(text);

  try {
    await simulatePaste();
    console.log("[paste] Keystroke dispatched, waiting for target app...");
  } catch (err) {
    console.error("[paste] Failed to simulate paste:", err.message);
  }

  // Wait for the target app to read the clipboard before restoring
  await new Promise((resolve) => setTimeout(resolve, 200));
  clipboard.writeText(prev);
  console.log("[paste] Clipboard restored");
}

module.exports = { pasteText };
