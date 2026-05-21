import type { KnotenApiClient } from "../api/graphApi";
import type { CacheManifest } from "../cache/types";

export type DaemonStatus = {
  running: boolean;
  pid: number | null;
  endpoint: string | null;
  activeVaultId: string | null;
};

export type WebDaemonClient = KnotenApiClient & {
  status(): Promise<DaemonStatus>;
  rebuildCache(vaultId: string): Promise<CacheManifest>;
};
