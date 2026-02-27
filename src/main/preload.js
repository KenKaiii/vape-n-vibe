const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("vapenvibe", {
  getConfig: () => ipcRenderer.invoke("get-config"),
  setHotkey: (hotkey) => ipcRenderer.invoke("set-hotkey", hotkey),
  startDownloads: () => ipcRenderer.invoke("start-downloads"),
  onDownloadsProgress: (cb) => ipcRenderer.on("downloads-progress", (_e, pct) => cb(pct)),
  onDownloadsComplete: (cb) => ipcRenderer.on("downloads-complete", () => cb()),
  onDownloadsError: (cb) => ipcRenderer.on("downloads-error", (_e, msg) => cb(msg)),
  toggleCleanup: (enabled) => ipcRenderer.invoke("toggle-cleanup", enabled),
  cleanupText: (text) => ipcRenderer.invoke("cleanup-text", text),
  onRecordingToggle: (cb) => ipcRenderer.on("recording-toggle", (_e, on) => cb(on)),
  sendAudio: (wavBuffer) => ipcRenderer.invoke("audio-recorded", wavBuffer),
  onTranscriptionStatus: (cb) =>
    ipcRenderer.on("transcription-status", (_e, status) => cb(status)),
  requestAccessibility: () => ipcRenderer.invoke("request-accessibility"),
  checkAccessibility: () => ipcRenderer.invoke("check-accessibility"),
  sendVizFreq: (data) => ipcRenderer.send("viz-freq", data),
});
