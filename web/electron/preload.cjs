const { contextBridge, ipcRenderer } = require("electron");

const api = {
  vault: {
    getActive: () => ipcRenderer.invoke("vault:getActive"),
    switch: (vaultId) => ipcRenderer.invoke("vault:switch", { vaultId }),
    list: () => ipcRenderer.invoke("vault:list"),
    status: () => ipcRenderer.invoke("vault:status"),
    create: (input) => ipcRenderer.invoke("vault:create", input)
  },
  dialog: {
    pickDirectory: (input) => ipcRenderer.invoke("dialog:pickDirectory", input)
  },
  explorer: {
    list: (input) => ipcRenderer.invoke("explorer:list", input),
    read: (input) => ipcRenderer.invoke("explorer:read", input),
    refresh: () => ipcRenderer.invoke("explorer:refresh")
  },
  graph: {
    get: (input) => ipcRenderer.invoke("graph:get", input),
    refresh: () => ipcRenderer.invoke("graph:refresh")
  },
  search: {
    query: (input) => ipcRenderer.invoke("search:query", input)
  },
  sync: {
    run: (input) => ipcRenderer.invoke("sync:run", input)
  },
  source: {
    addFromPicker: (input) => ipcRenderer.invoke("source:addFromPicker", input),
    addFromFolder: (input) => ipcRenderer.invoke("source:addFromFolder", input)
  },
  note: {
    save: (input) => ipcRenderer.invoke("note:save", input)
  },
  template: {
    get: () => ipcRenderer.invoke("template:get"),
    list: () => ipcRenderer.invoke("template:list"),
    scaffold: () => ipcRenderer.invoke("template:scaffold")
  },
  tag: {
    list: () => ipcRenderer.invoke("tag:list"),
    update: (input) => ipcRenderer.invoke("tag:update", input)
  },
  report: {
    context: (input) => ipcRenderer.invoke("report:context", input)
  },
  llm: {
    rewrite: (input) => ipcRenderer.invoke("llm:rewrite", input)
  },
  html: {
    openWindow: (input) => ipcRenderer.invoke("html:openWindow", input)
  }
};

contextBridge.exposeInMainWorld("knoterApi", api);

contextBridge.exposeInMainWorld("knoterShell", {
  platform: process.platform,
  onFullScreenChange: (listener) => {
    const handler = (_event, isFullScreen) => listener(isFullScreen);
    ipcRenderer.on("shell:fullscreen-changed", handler);
    return () => ipcRenderer.removeListener("shell:fullscreen-changed", handler);
  }
});
