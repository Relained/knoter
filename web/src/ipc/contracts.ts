import type {
  ExplorerItem,
  ExplorerListInput,
  ExplorerReadResult,
  ExplorerRefreshResult,
  GraphGetInput,
  GraphPayload,
  GraphRefreshResult,
  SearchInput,
  SearchResult,
  VaultSummary
} from "../api/types";

export type IpcRequestMap = {
  "vault:getActive": void;
  "vault:switch": { vaultId: string };
  "explorer:list": ExplorerListInput;
  "explorer:read": { path: string };
  "explorer:refresh": void;
  "graph:get": GraphGetInput | void;
  "graph:refresh": void;
  "search:query": SearchInput;
};

export type IpcResponseMap = {
  "vault:getActive": VaultSummary | null;
  "vault:switch": VaultSummary;
  "explorer:list": ExplorerItem[];
  "explorer:read": ExplorerReadResult;
  "explorer:refresh": ExplorerRefreshResult;
  "graph:get": GraphPayload;
  "graph:refresh": GraphRefreshResult;
  "search:query": SearchResult[];
};

export type IpcChannel = keyof IpcRequestMap;

export type IpcInvoke = <Channel extends IpcChannel>(
  channel: Channel,
  input: IpcRequestMap[Channel]
) => Promise<IpcResponseMap[Channel]>;
