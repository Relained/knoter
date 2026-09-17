const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'knoterNative',
  Object.freeze({
    request: (command, payload) => ipcRenderer.invoke('knoter:request', command, payload),
    desktop: (action) => ipcRenderer.invoke('knoter:desktop', action),
  }),
);
