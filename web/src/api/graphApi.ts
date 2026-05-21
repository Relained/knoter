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
} from "./types";

export type KnotenApi = {
  vault: {
    getActive(): Promise<VaultSummary | null>;
    switch(vaultId: string): Promise<VaultSummary>;
  };
  explorer: {
    list(input: ExplorerListInput): Promise<ExplorerItem[]>;
    refresh(): Promise<ExplorerRefreshResult>;
  };
  graph: {
    get(input?: GraphGetInput): Promise<GraphPayload>;
    refresh(): Promise<GraphRefreshResult>;
  };
  search: {
    query(input: SearchInput): Promise<SearchResult[]>;
  };
};

export type KnotenApiClient = Pick<KnotenApi, "vault" | "explorer" | "graph" | "search">;
