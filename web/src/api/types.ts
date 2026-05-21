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
  layers?: ExplorerLayer[];
};

export type SearchResult = {
  id: string;
  title: string;
  path: string;
  layer: ExplorerLayer;
  score: number;
  snippet: string;
};
