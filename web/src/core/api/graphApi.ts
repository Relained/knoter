import type {
  AddSourcesInput,
  AddSourcesResult,
  ExplorerItem,
  ExplorerListInput,
  ExplorerReadInput,
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
  VaultSummary
} from "./types";

export type KnotenApi = {
  vault: {
    getActive(): Promise<VaultSummary | null>;
    switch(vaultId: string): Promise<VaultSummary>;
    list(): Promise<VaultSummary[]>;
    status(): Promise<VaultStatus>;
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
  sync: {
    run(input: SyncRunInput): Promise<SyncRunResult>;
  };
  source: {
    addFromPicker(input: AddSourcesInput): Promise<AddSourcesResult>;
  };
  note: {
    save(input: NoteSaveInput): Promise<NoteSaveResult>;
  };
  template: {
    get(): Promise<TemplateInfo>;
    list(): Promise<TemplateInfo>;
  };
  tag: {
    list(): Promise<TagInfo[]>;
    update(input: TagUpdateInput): Promise<Record<string, unknown>>;
  };
  report: {
    context(input: ReportContextInput): Promise<Record<string, unknown>>;
  };
  llm: {
    rewrite(input: LlmRewriteRunInput): Promise<LlmRewriteRunResult>;
  };
  html: {
    openWindow(input: { title: string; html: string }): Promise<{ opened: true }>;
  };
};

export type KnotenApiClient = KnotenApi;
