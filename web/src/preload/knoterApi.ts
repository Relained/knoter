import type { KnotenApiClient } from "../api/graphApi";
import type { IpcInvoke } from "../ipc/contracts";

export function createIpcKnotenApi(invoke: IpcInvoke): KnotenApiClient {
  return {
    vault: {
      getActive: () => invoke("vault:getActive", undefined),
      switch: (vaultId) => invoke("vault:switch", { vaultId })
    },
    explorer: {
      list: (input) => invoke("explorer:list", input),
      refresh: () => invoke("explorer:refresh", undefined)
    },
    graph: {
      get: (input) => invoke("graph:get", input),
      refresh: () => invoke("graph:refresh", undefined)
    },
    search: {
      query: (input) => invoke("search:query", input)
    }
  };
}
