import type { KnotenApiClient } from "../api/graphApi";
import type { IpcInvoke } from "../ipc/contracts";

export function createIpcKnotenApi(invoke: IpcInvoke): KnotenApiClient {
  return {
    vault: {
      getActive: () => invoke("vault:getActive", undefined),
      switch: (vaultId) => invoke("vault:switch", { vaultId }),
      list: () => invoke("vault:list", undefined),
      status: () => invoke("vault:status", undefined),
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
    sync: {
      run: (input) => invoke("sync:run", input),
    },
    source: {
      addFromPicker: (input) => invoke("source:addFromPicker", input),
    },
    note: {
      save: (input) => invoke("note:save", input),
    },
    template: {
      get: () => invoke("template:get", undefined),
      list: () => invoke("template:list", undefined),
    },
    tag: {
      list: () => invoke("tag:list", undefined),
      update: (input) => invoke("tag:update", input),
    },
    report: {
      context: (input) => invoke("report:context", input),
    },
    llm: {
      rewrite: (input) => invoke("llm:rewrite", input),
    },
    html: {
      openWindow: (input) => invoke("html:openWindow", input),
    },
  };
}
