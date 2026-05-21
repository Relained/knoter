const { contextBridge, ipcRenderer } = require("electron");

const api = {
  vault: {
    getActive: () => ipcRenderer.invoke("vault:getActive"),
    switch: (vaultId) => ipcRenderer.invoke("vault:switch", { vaultId })
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
  }
};

contextBridge.exposeInMainWorld("knoterApi", api);
