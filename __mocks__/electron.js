let _clipboardText = "";

module.exports = {
  clipboard: {
    readText: () => _clipboardText,
    writeText: (text) => {
      _clipboardText = text;
    },
  },
  app: {
    isPackaged: false,
    getAppPath: () => "/app",
    getPath: () => "/tmp",
    getVersion: () => "1.0.0",
    whenReady: () => Promise.resolve(),
  },
  ipcMain: {
    handle: () => {},
    on: () => {},
  },
  BrowserWindow: {
    getAllWindows: () => [],
    fromWebContents: () => null,
  },
  systemPreferences: {
    isTrustedAccessibilityClient: () => true,
  },
  shell: {
    openExternal: () => Promise.resolve(),
  },
  globalShortcut: {
    register: () => true,
    unregister: () => {},
  },
};
