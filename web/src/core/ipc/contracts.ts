import type {
  AddSourcesInput,
  AddSourcesResult,
  ExplorerItem,
  ExplorerListInput,
  ExplorerReadResult,
  ExplorerRefreshResult,
  GraphGetInput,
  GraphPayload,
  GraphRefreshResult,
  LlmRewriteRunInput,
  LlmRewriteRunResult,
  NoteSaveInput,
  NoteSaveResult,
  ReportContextInput,
  SearchInput,
  SearchResult,
  SyncRunInput,
  SyncRunResult,
  TagInfo,
  TagUpdateInput,
  TemplateInfo,
  VaultStatus,
  VaultSummary,
} from "../api/types";

export type IpcRequestMap = {
  "vault:getActive": void;
  "vault:switch": { vaultId: string };
  "vault:list": void;
  "vault:status": void;
  "explorer:list": ExplorerListInput;
  "explorer:read": { path: string };
  "explorer:refresh": void;
  "graph:get": GraphGetInput | void;
  "graph:refresh": void;
  "search:query": SearchInput;
  "sync:run": SyncRunInput;
  "source:addFromPicker": AddSourcesInput;
  "note:save": NoteSaveInput;
  "template:get": void;
  "template:list": void;
  "tag:list": void;
  "tag:update": TagUpdateInput;
  "report:context": ReportContextInput;
  "llm:rewrite": LlmRewriteRunInput;
  "html:openWindow": { title: string; html: string };
};

export type IpcResponseMap = {
  "vault:getActive": VaultSummary | null;
  "vault:switch": VaultSummary;
  "vault:list": VaultSummary[];
  "vault:status": VaultStatus;
  "explorer:list": ExplorerItem[];
  "explorer:read": ExplorerReadResult;
  "explorer:refresh": ExplorerRefreshResult;
  "graph:get": GraphPayload;
  "graph:refresh": GraphRefreshResult;
  "search:query": SearchResult[];
  "sync:run": SyncRunResult;
  "source:addFromPicker": AddSourcesResult;
  "note:save": NoteSaveResult;
  "template:get": TemplateInfo;
  "template:list": TemplateInfo;
  "tag:list": TagInfo[];
  "tag:update": Record<string, unknown>;
  "report:context": Record<string, unknown>;
  "llm:rewrite": LlmRewriteRunResult;
  "html:openWindow": { opened: true };
};

export type IpcChannel = keyof IpcRequestMap;

export type IpcInvoke = <Channel extends IpcChannel>(
  channel: Channel,
  input: IpcRequestMap[Channel],
) => Promise<IpcResponseMap[Channel]>;
