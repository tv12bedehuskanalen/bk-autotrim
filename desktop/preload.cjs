const { contextBridge, ipcRenderer, webUtils } = require("electron");
contextBridge.exposeInMainWorld("bk", {
  defaults: () => ipcRenderer.invoke("defaults"),
  recover: () => ipcRenderer.invoke("recover"),
  playback: (file, time) => ipcRenderer.invoke("playback", file, time),
  pick: (kind) => ipcRenderer.invoke("pick", kind),
  droppedPath: (file) => webUtils.getPathForFile(file),
  analyse: (file) => ipcRenderer.invoke("analyse", file),
  preview: (file, time) => ipcRenderer.invoke("preview", file, time),
  render: (job) => ipcRenderer.invoke("render", job),
  cancel: () => ipcRenderer.invoke("cancel"),
  open: (folder) => ipcRenderer.invoke("open", folder),
  update: () => ipcRenderer.invoke("update"),
  release: (url) => ipcRenderer.invoke("release", url),
  onProgress: (fn) => ipcRenderer.on("progress", (_, data) => fn(data)),
});
