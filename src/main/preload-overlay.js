const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vizBridge", {
  onVizMode: (cb) => {
    const handler = (_e, mode) => cb(mode);
    ipcRenderer.on("viz-mode", handler);
    return () => ipcRenderer.removeListener("viz-mode", handler);
  },
  onVizFreq: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("viz-freq", handler);
    return () => ipcRenderer.removeListener("viz-freq", handler);
  },
});
