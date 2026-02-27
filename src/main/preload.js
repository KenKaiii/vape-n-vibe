const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vapenvibe", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  setHotkey: (hotkey) => ipcRenderer.invoke("set-hotkey", hotkey),
  setLanguage: (lang) => ipcRenderer.invoke("set-language", lang),
  startDownloads: () => ipcRenderer.invoke("start-downloads"),
  onDownloadsProgress: (cb) => {
    const handler = (_e, pct) => cb(pct);
    ipcRenderer.on("downloads-progress", handler);
    return () => ipcRenderer.removeListener("downloads-progress", handler);
  },
  onDownloadsComplete: (cb) => {
    const handler = () => cb();
    ipcRenderer.on("downloads-complete", handler);
    return () => ipcRenderer.removeListener("downloads-complete", handler);
  },
  onDownloadsError: (cb) => {
    const handler = (_e, msg) => cb(msg);
    ipcRenderer.on("downloads-error", handler);
    return () => ipcRenderer.removeListener("downloads-error", handler);
  },
  toggleCleanup: (enabled) => ipcRenderer.invoke("toggle-cleanup", enabled),
  cleanupText: (text) => ipcRenderer.invoke("cleanup-text", text),
  onRecordingToggle: (cb) => {
    const handler = (_e, on) => cb(on);
    ipcRenderer.on("recording-toggle", handler);
    return () => ipcRenderer.removeListener("recording-toggle", handler);
  },
  sendAudio: (wavBuffer) => ipcRenderer.invoke("audio-recorded", wavBuffer),
  onTranscriptionStatus: (cb) => {
    const handler = (_e, status) => cb(status);
    ipcRenderer.on("transcription-status", handler);
    return () => ipcRenderer.removeListener("transcription-status", handler);
  },
  requestAccessibility: () => ipcRenderer.invoke("request-accessibility"),
  checkAccessibility: () => ipcRenderer.invoke("check-accessibility"),
  sendVizFreq: (data) => ipcRenderer.send("viz-freq", data),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateStatus: (cb) => {
    const handler = (_e, data) => cb(data);
    ipcRenderer.on("update-status", handler);
    return () => ipcRenderer.removeListener("update-status", handler);
  },
});
