const { clipboard } = require("electron");
const { execSync } = require("node:child_process");

function pasteText(text) {
  const platform = process.platform;

  // Save current clipboard, paste text, restore after short delay
  const prev = clipboard.readText();
  clipboard.writeText(text);

  if (platform === "darwin") {
    execSync(
      `osascript -e 'tell application "System Events" to keystroke "v" using command down'`,
    );
  } else if (platform === "win32") {
    execSync(
      `powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"`,
    );
  } else {
    execSync(`xdotool key ctrl+v`);
  }

  // Restore previous clipboard after a short delay
  setTimeout(() => clipboard.writeText(prev), 500);
}

module.exports = { pasteText };
