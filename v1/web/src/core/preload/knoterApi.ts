import type { KnotenApiClient } from "../api/graphApi";
import type { IpcInvoke } from "../ipc/contracts";

export function createIpcKnotenApi(invoke: IpcInvoke): KnotenApiClient {
  return {
    vault: {
      getActive: () => invoke("vault:getActive", undefined),
      switch: (vaultId) => invoke("vault:switch", { vaultId }),
      list: () => invoke("vault:list", undefined),
      status: () => invoke("vault:status", undefined),
      create: (input) => invoke("vault:create", input),
    },
    dialog: {
      pickDirectory: (input) => invoke("dialog:pickDirectory", input),
    },
    explorer: {
      list: (input) => invoke("explorer:list", input),
      read: (input) => invoke("explorer:read", input),
      refresh: () => invoke("explorer:refresh", undefined),
    },
    graph: {
      get: (input) => invoke("graph:get", input),
      refresh: () => invoke("graph:refresh", undefined),
    },
    search: {
      query: (input) => invoke("search:query", input),
    },
    source: {
      addFromPicker: () => invoke("source:addFromPicker", undefined),
      addFromFolder: (input) => invoke("source:addFromFolder", input),
    },
    note: {
      save: (input) => invoke("note:save", input),
    },
    template: {
      get: () => invoke("template:get", undefined),
      list: () => invoke("template:list", undefined),
      getDocument: (input) => invoke("template:getDocument", input),
    },
    html: {
      openWindow: (input) => invoke("html:openWindow", input),
    },
  };
}
