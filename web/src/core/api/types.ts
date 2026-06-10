export type ExplorerLayer = "source" | "rewritten" | "artifact" | "template";
export type SidebarSurface = "explorer" | "search" | "graph" | "tasks" | "settings";

export type VaultSummary = {
  id: string;
  name: string;
  root: string;
  active: boolean;
};

export type ExplorerItem = {
  id: string;
  layer: ExplorerLayer;
  title: string;
  path: string;
  kind: string | null;
  docDate: string | null;
  updatedAt: string | null;
  graphNodeId: string | null;
};

export type ExplorerListInput = {
  layers: ExplorerLayer[];
  query?: string;
};

export type ExplorerRefreshResult = {
  vaultId: string;
  itemCount: number;
  refreshedAt: string;
  cachePath: string | null;
};

export type ExplorerReadInput = {
  path: string;
};

export type ExplorerReadResult = {
  title: string;
  path: string;
  layer: ExplorerLayer;
  content: string;
};

export type GraphNodeType = "note" | "chunk" | "template";
export type GraphEdgeType = "source_rewritten" | "artifact_template" | "note_chunk" | "chunk_prev" | "chunk_next";

export type GraphNode = {
  id: string;
  type: GraphNodeType;
  label: string;
  layer?: "source" | "rewritten" | "artifact";
  metadata: Record<string, unknown>;
};

export type GraphEdge = {
  fromId: string;
  toId: string;
  type: GraphEdgeType;
  metadata: Record<string, unknown>;
};

export type GraphPayload = {
  vaultId: string;
  generatedAt: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type GraphGetInput = {
  includeChunks?: boolean;
};

export type GraphRefreshResult = {
  vaultId: string;
  nodeCount: number;
  edgeCount: number;
  refreshedAt: string;
  cachePath: string | null;
};

export type SearchInput = {
  query: string;
  mode: "keyword" | "semantic" | "hybrid";
  includeArtifacts?: boolean;
};

export type SearchResult = {
  id: string;
  title: string;
  path: string;
  layer: ExplorerLayer;
  score: number;
  snippet: string;
};

export type VaultStatus = {
  vault: string;
  path: string;
  noteCount: number;
  chunkCount: number;
  tagCount: number;
  sourceCount: number;
  rewrittenCount: number;
  artifactCount: number;
  lastIndexedAt: string | null;
  embeddingModel: string | null;
};

export type SyncRunInput = {
  full?: boolean;
  changed?: boolean;
  prune?: boolean;
};

export type SyncRunResult = {
  recovered: number;
  added: number;
  updated: number;
  pruned: number;
  reconciled: number;
  errors: string[];
};

export type AddedFileDetail = {
  filePath: string;
  status: string;
  chunkCount: number;
};

export type AddSourcesInput = {
  tags?: string[];
};

export type AddSourcesResult = {
  canceled: boolean;
  filesProcessed: number;
  filesAdded: number;
  filesUpdated: number;
  filesSkipped: number;
  details: AddedFileDetail[];
};

export type NoteSaveInput = {
  fileName: string;
  content: string;
  tags?: string[];
};

export type NoteSaveResult = {
  filePath: string;
  status: string;
  chunkCount: number;
};

export type TemplateInfo = {
  source: string;
  path: string;
  content: string;
  metadata: {
    id?: string;
    name?: string;
    version?: number;
    kind?: string;
  } | null;
};

export type TagInfo = {
  tag: string;
  count: number;
};

export type TagUpdateInput = {
  action: "add" | "remove";
  target: string;
  tags: string[];
};

export type ReportContextInput = {
  date: string;
  includeArtifacts?: boolean;
};

export type LlmRewriteRunInput = {
  source: string;
  agent: "codex" | "claude";
};

export type LlmRewriteRunResult = {
  sourcePath: string;
  rewrittenPath: string;
  agent: string;
  rewritten: {
    status: string;
    chunkCount: number;
  };
  artifacts: Array<{
    path: string;
    status: string;
  }>;
};

export type HtmlWindowTheme = {
  mode: "dark" | "light";
  background: string;
  surface: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  fontFamily: string;
};

export type VaultCreateInput = {
  name: string;
  directory: string;
};

export type PickDirectoryResult = {
  canceled: boolean;
  path: string | null;
};

export type AddFolderInput = {
  path: string;
  tags?: string[];
};

export type AddFolderResult = {
  filesProcessed: number;
  filesAdded: number;
  filesUpdated: number;
  filesSkipped: number;
  details: AddedFileDetail[];
};

export type TemplateScaffoldResult = {
  created: Array<{ name: string; path: string }>;
  skipped: Array<{ name: string; path: string; reason: string }>;
};
