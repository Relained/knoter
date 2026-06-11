export type ExplorerLayer = "source" | "artifact" | "template";

export type SearchScope = "llm-wiki" | "artifacts" | "sources" | "all";
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
  /** Default "llm-wiki" (semantic+keyword); other scopes are keyword-only. */
  scope?: SearchScope;
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
  pendingWorkCount: number;
  sourceCount: number;
  artifactCount: number;
  lastIndexedAt: string | null;
  lastSyncAt: string | null;
  embeddingModel: string | null;
};

export type AddedFileDetail = {
  filePath: string;
  status: string;
};

export type AddSourcesResult = {
  canceled: boolean;
  filesProcessed: number;
  filesAdded: number;
  details: AddedFileDetail[];
};

export type NoteSaveInput = {
  fileName: string;
  content: string;
};

export type NoteSaveResult = {
  filePath: string;
  status: string;
};

/** The vault workflow contract (templates/workflow.md). */
export type TemplateInfo = {
  path: string;
  content: string;
};

/** A template file in <vault>/templates/ (markdown + optional default HTML). */
export type DocumentTemplateSummary = {
  name: string;
  path: string;
  hasHtml: boolean;
};

export type DocumentTemplate = DocumentTemplateSummary & {
  content: string;
  html: string | null;
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
  /** Optional parent directory; omitted = CLI default (~/Documents/<name>). */
  directory?: string | null;
};

export type PickDirectoryResult = {
  canceled: boolean;
  path: string | null;
};

export type AddFolderInput = {
  path: string;
};

export type AddFolderResult = {
  filesProcessed: number;
  filesAdded: number;
  details: AddedFileDetail[];
};
