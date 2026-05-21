export type CacheManifest = {
  version: 1;
  vaultId: string;
  vaultRoot: string;
  generatedAt: string;
  sourceRevision: {
    metaDbMtime: number | null;
    vaultScanHash: string;
  };
  files: {
    explorerSnapshot: string;
    graphSnapshot: string;
    sqliteCache: string;
  };
};

export type RecoverableCacheState = {
  manifest: CacheManifest;
  canRebuildFromVault: boolean;
};
