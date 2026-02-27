const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vizBridge", {
  onVizMode: (cb) => {
    ipcRenderer.removeAllListeners("viz-mode");
    ipcRenderer.on("viz-mode", (_e, mode) => cb(mode));
  },
  onVizFreq: (cb) => {
    ipcRenderer.removeAllListeners("viz-freq");
    ipcRenderer.on("viz-freq", (_e, data) => cb(data));
  },
});
