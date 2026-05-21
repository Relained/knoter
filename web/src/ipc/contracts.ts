import type {
  ExplorerItem,
  ExplorerListInput,
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
  "explorer:refresh": void;
  "graph:get": GraphGetInput | void;
  "graph:refresh": void;
  "search:query": SearchInput;
};

export type IpcResponseMap = {
  "vault:getActive": VaultSummary | null;
  "vault:switch": VaultSummary;
  "explorer:list": ExplorerItem[];
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
