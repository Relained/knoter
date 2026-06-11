import type {
  AddFolderInput,
  AddFolderResult,
  AddSourcesResult,
  DocumentTemplate,
  DocumentTemplateSummary,
  ExplorerItem,
  ExplorerListInput,
  ExplorerReadInput,
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
  VaultSummary
} from "./types";

export type KnotenApi = {
  vault: {
    getActive(): Promise<VaultSummary | null>;
    switch(vaultId: string): Promise<VaultSummary>;
    list(): Promise<VaultSummary[]>;
    status(): Promise<VaultStatus>;
    create(input: VaultCreateInput): Promise<VaultSummary>;
  };
  dialog: {
    pickDirectory(input: { title?: string }): Promise<PickDirectoryResult>;
  };
  explorer: {
    list(input: ExplorerListInput): Promise<ExplorerItem[]>;
    read(input: ExplorerReadInput): Promise<ExplorerReadResult>;
    refresh(): Promise<ExplorerRefreshResult>;
  };
  graph: {
    get(input?: GraphGetInput): Promise<GraphPayload>;
    refresh(): Promise<GraphRefreshResult>;
  };
  search: {
    query(input: SearchInput): Promise<SearchResult[]>;
  };
  source: {
    addFromPicker(): Promise<AddSourcesResult>;
    addFromFolder(input: AddFolderInput): Promise<AddFolderResult>;
  };
  note: {
    save(input: NoteSaveInput): Promise<NoteSaveResult>;
  };
  template: {
    get(): Promise<TemplateInfo>;
    list(): Promise<DocumentTemplateSummary[]>;
    getDocument(input: { name: string }): Promise<DocumentTemplate>;
  };
  html: {
    openWindow(input: {
      title: string;
      html: string;
      theme?: HtmlWindowTheme;
    }): Promise<{ opened: true }>;
  };
};

export type KnotenApiClient = KnotenApi;
