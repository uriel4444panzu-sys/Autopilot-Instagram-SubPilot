const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (payload) => ipcRenderer.invoke("config:save", payload),
  testConnection: () => ipcRenderer.invoke("config:testConnection"),

  dispatchWorkflow: (kind, inputs) => ipcRenderer.invoke("workflow:dispatch", { kind, inputs }),
  workflowStatus: (kind) => ipcRenderer.invoke("workflow:status", { kind }),

  listDrafts: () => ipcRenderer.invoke("drafts:list"),
  updateDraft: (id, changes) => ipcRenderer.invoke("drafts:update", { id, changes }),
  deleteDraft: (id) => ipcRenderer.invoke("drafts:delete", { id }),

  listVideos: () => ipcRenderer.invoke("videos:list"),
  pickVideo: () => ipcRenderer.invoke("videos:pick"),
  uploadVideo: (localPath) => ipcRenderer.invoke("videos:upload", { localPath }),

  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url),
});
