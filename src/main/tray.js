const path = require("node:path");
const { app, Tray, Menu, nativeImage } = require("electron");
const { createWindow } = require("./window");

function createTray(windows) {
  const trayIcon = nativeImage.createFromPath(
    path.join(app.getAppPath(), "assets", "trayTemplate.png"),
  );
  trayIcon.setTemplateImage(true);

  const tray = new Tray(trayIcon);
  tray.setToolTip("Vape 'n' Vibe");

  const trayMenu = Menu.buildFromTemplate([
    { label: `Vape 'n' Vibe v${app.getVersion()}`, enabled: false },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);
  tray.setContextMenu(trayMenu);

  tray.on("click", () => {
    if (windows.main && !windows.main.isDestroyed()) {
      windows.main.show();
      windows.main.focus();
    } else {
      windows.main = createWindow();
    }
  });

  return tray;
}

module.exports = { createTray };
