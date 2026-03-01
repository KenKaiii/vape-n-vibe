module.exports = {
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
