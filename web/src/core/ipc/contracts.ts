import type {
  AddFolderInput,
  AddFolderResult,
  AddSourcesInput,
  AddSourcesResult,
  ExplorerItem,
  ExplorerListInput,
  ExplorerReadResult,
  ExplorerRefreshResult,
  GraphGetInput,
  GraphPayload,
  GraphRefreshResult,
  HtmlWindowTheme,
  LlmRewriteRunInput,
  LlmRewriteRunResult,
  NoteSaveInput,
  NoteSaveResult,
  PickDirectoryResult,
  ReportContextInput,
  SearchInput,
  SearchResult,
  SyncRunInput,
  SyncRunResult,
  TagInfo,
  TagUpdateInput,
  TemplateInfo,
  TemplateScaffoldResult,
  VaultCreateInput,
  VaultStatus,
  VaultSummary,
} from "../api/types";

export type IpcRequestMap = {
  "vault:getActive": void;
  "vault:switch": { vaultId: string };
  "vault:list": void;
  "vault:status": void;
  "vault:create": VaultCreateInput;
  "dialog:pickDirectory": { title?: string };
  "explorer:list": ExplorerListInput;
  "explorer:read": { path: string };
  "explorer:refresh": void;
  "graph:get": GraphGetInput | void;
  "graph:refresh": void;
  "search:query": SearchInput;
  "sync:run": SyncRunInput;
  "source:addFromPicker": AddSourcesInput;
  "source:addFromFolder": AddFolderInput;
  "note:save": NoteSaveInput;
  "template:get": void;
  "template:list": void;
  "template:scaffold": void;
  "tag:list": void;
  "tag:update": TagUpdateInput;
  "report:context": ReportContextInput;
  "llm:rewrite": LlmRewriteRunInput;
  "html:openWindow": { title: string; html: string; theme?: HtmlWindowTheme };
};

export type IpcResponseMap = {
  "vault:getActive": VaultSummary | null;
  "vault:switch": VaultSummary;
  "vault:list": VaultSummary[];
  "vault:status": VaultStatus;
  "vault:create": VaultSummary;
  "dialog:pickDirectory": PickDirectoryResult;
  "explorer:list": ExplorerItem[];
  "explorer:read": ExplorerReadResult;
  "explorer:refresh": ExplorerRefreshResult;
  "graph:get": GraphPayload;
  "graph:refresh": GraphRefreshResult;
  "search:query": SearchResult[];
  "sync:run": SyncRunResult;
  "source:addFromPicker": AddSourcesResult;
  "source:addFromFolder": AddFolderResult;
  "note:save": NoteSaveResult;
  "template:get": TemplateInfo;
  "template:list": TemplateInfo;
  "template:scaffold": TemplateScaffoldResult;
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
