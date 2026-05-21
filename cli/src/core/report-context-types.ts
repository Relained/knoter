import type { DocumentLayer, MetaDB, NoteRow } from "../stores/meta-store";
import type { EffectiveTemplate } from "./template";

export type ReportLayer = DocumentLayer | "all";
export type RetrievalGroup = "date" | "tasks" | "workouts" | "areas";

export interface ReportContextInput {
  metaDb: MetaDB;
  vaultName: string;
  date: string;
  templateArg?: string;
  templateVaultOpt?: string;
  templateOverride?: EffectiveTemplate;
  layer: ReportLayer;
  top: number;
  includeArtifacts: boolean;
  timezone?: string;
}

export interface ReportSignalGroups {
  tasks: unknown[];
  workouts: unknown[];
  daily: unknown[];
  areas: unknown[];
  metrics: unknown[];
  all: unknown[];
}

export interface ReportRetrievalInput {
  metaDb: MetaDB;
  vaultId: string;
  date: string;
  top: number;
  layer: ReportLayer;
  includeArtifacts: boolean;
  notesById: Map<string, NoteRow>;
}
