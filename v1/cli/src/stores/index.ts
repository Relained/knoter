export { MetaDB, VAULT_DB_DIR } from "./meta-store";
export type {
  NoteRow,
  NoteInput,
  ChunkRow,
  ChunkInsert,
  FtsResult,
  VaultStatus,
  VectorSyncStatus,
  SearchScope,
  AgentWorkItem,
  AgentWorkChange,
  AgentWorkStatus,
} from "./meta-store";
export { buildFtsQuery, normalizeBM25 } from "./meta-store";
export { VaultStore, extractSection } from "./vault-store";
export type { UpsertNoteResult, NotePayload } from "./vault-store";
export {
  createVaultCollection,
  openVaultCollection,
  createChunkSchema,
  formatForEmbedding,
  toZVecDoc,
  EMBEDDING_DIMENSIONS,
  DEFAULT_FUSION_ALPHA,
} from "./vec-store";
export type { EmbeddingModel, ChunkInput } from "./vec-store";
