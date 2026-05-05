const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

let pasteLock = Promise.resolve();

// Resolved lazily so that test environments can provide a mock clipboard
// via the electron alias before the first pasteText() call.
function getClipboard() {
  return require("electron").clipboard;
}

async function simulatePaste() {
  const platform = process.platform;

  if (platform === "darwin") {
    await execFileAsync("osascript", [
      "-e",
      'tell application "System Events" to keystroke "v" using command down',
    ]);
  } else if (platform === "win32") {
    await execFileAsync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        'Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("^v")',
      ],
      { windowsHide: true },
    );
  } else {
    await execFileAsync("xdotool", ["key", "ctrl+v"]);
  }
}

async function pasteText(text) {
  const result = pasteLock.then(async () => {
    const clipboard = getClipboard();
    console.log("[paste] Pasting text:", JSON.stringify(text));
    const prev = clipboard.readText();
    clipboard.writeText(text);

    try {
      await simulatePaste();
      console.log("[paste] Keystroke dispatched, waiting for target app...");
    } catch (err) {
      console.error("[paste] Failed to simulate paste:", err.message);
      clipboard.writeText(prev);
      throw err;
    }

    // Wait for the target app to read the clipboard before restoring.
    // 500ms is safer — some apps (Slack, Teams, etc.) are slow to read.
    await new Promise((resolve) => setTimeout(resolve, 500));
    clipboard.writeText(prev);
    console.log("[paste] Clipboard restored");
  });

  // Chain future calls after this one (suppress unhandled rejection on the lock chain).
  pasteLock = result.catch(() => {});
  return result;
}

module.exports = { pasteText };
