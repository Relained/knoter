import type {
  AddFolderInput,
  AddFolderResult,
  AddSourcesResult,
  DocumentTemplate,
  DocumentTemplateSummary,
  ExplorerItem,
  ExplorerListInput,
  ExplorerReadResult,
  ExplorerRefreshResult,
  GraphGetInput,
  GraphPayload,
  GraphRefreshResult,
  HtmlWindowTheme,
  NoteSaveInput,
  NoteSaveResult,
  PickDirectoryResult,
  SearchInput,
  SearchResult,
  TemplateInfo,
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
  "source:addFromPicker": void;
  "source:addFromFolder": AddFolderInput;
  "note:save": NoteSaveInput;
  "template:get": void;
  "template:list": void;
  "template:getDocument": { name: string };
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
  "source:addFromPicker": AddSourcesResult;
  "source:addFromFolder": AddFolderResult;
  "note:save": NoteSaveResult;
  "template:get": TemplateInfo;
  "template:list": DocumentTemplateSummary[];
  "template:getDocument": DocumentTemplate;
  "html:openWindow": { opened: true };
};

export type IpcChannel = keyof IpcRequestMap;

export type IpcInvoke = <Channel extends IpcChannel>(
  channel: Channel,
  input: IpcRequestMap[Channel],
) => Promise<IpcResponseMap[Channel]>;
