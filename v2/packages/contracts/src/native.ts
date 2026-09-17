import { z } from 'zod';

export const PROTOCOL = 1;
export const MAX_SOURCE_BYTES = 256 * 1024;
export const MAX_WIRE_BYTES = 8 * 1024 * 1024;
export const PIPELINE = 'markdown-wiki-1';
export const MODEL = 'gpt-5.6-luna';
export const CLI_VERSION = '0.154.0';
const id = z.string().uuid();
const text = z.string().max(200_000);
const title = z.string().trim().min(1).max(200);
const nil = z.object({}).strict();
export const settingsPatch = z
  .object({
    theme: z.enum(['light', 'dark']).optional(),
    workerPaused: z.boolean().optional(),
    leftSidebarWidth: z.number().min(184).max(380).optional(),
    rightSidebarWidth: z.number().min(280).max(600).optional(),
    leftSidebarCompact: z.boolean().optional(),
    leftSidebarCollapsed: z.boolean().optional(),
    rightSidebarCollapsed: z.boolean().optional(),
  })
  .strict();
export const commands = {
  snapshot: nil,
  saveDocument: z
    .object({ id, title, body: text, baseRevision: z.number().int().positive() })
    .strict(),
  createDocument: nil,
  deleteDocument: z.object({ id }).strict(),
  restoreDocument: z.object({ id }).strict(),
  toggleFavorite: z.object({ id }).strict(),
  restoreRevision: z.object({ id }).strict(),
  updateSettings: settingsPatch,
  retrySource: z.object({ id }).strict(),
  cancelJob: z.object({ id }).strict(),
  runNow: nil,
  resolveProposal: z.object({ id, accept: z.boolean() }).strict(),
  sourceVersion: z.object({ id }).strict(),
  events: z.object({ cursor: z.number().int().nonnegative() }).strict(),
  watches: nil,
  addWatch: z.object({ path: z.string().min(1).max(4096) }).strict(),
  removeWatch: z.object({ id }).strict(),
  sourceSnapshot: z
    .object({
      watchId: id.nullable(),
      path: z.string().min(1).max(4096),
      filename: title,
      bytes: z.string().max(MAX_SOURCE_BYTES * 2),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .strict(),
  scanComplete: z
    .object({
      watchId: id,
      paths: z.array(z.string().max(4096)).max(2000),
      error: z.string().max(1000).nullable(),
    })
    .strict(),
  configureCli: z.object({ path: z.string().min(1).max(4096) }).strict(),
  checkCli: nil,
  backup: z.object({ path: z.string().min(1).max(4096) }).strict(),
  restoreBackup: z.object({ path: z.string().min(1).max(4096) }).strict(),
  exportWiki: z.object({ path: z.string().min(1).max(4096) }).strict(),
} as const;
export type Command = keyof typeof commands;
export const rendererCommands = new Set<Command>([
  'snapshot',
  'saveDocument',
  'createDocument',
  'deleteDocument',
  'restoreDocument',
  'toggleFavorite',
  'restoreRevision',
  'updateSettings',
  'retrySource',
  'cancelJob',
  'runNow',
  'resolveProposal',
  'sourceVersion',
  'checkCli',
  'removeWatch',
]);
export const desktopActions = z.enum([
  'enable',
  'disable',
  'restart',
  'status',
  'approvalSettings',
  'chooseCli',
  'chooseFolder',
  'importMarkdown',
  'backup',
  'restoreBackup',
  'exportWiki',
]);
export type DesktopAction = z.infer<typeof desktopActions>;
export interface NativeBridge {
  request(command: Command, payload: unknown): Promise<unknown>;
  desktop(action: DesktopAction): Promise<unknown>;
}
export const requestSchema = z
  .object({
    protocol: z.literal(PROTOCOL),
    requestId: id,
    token: z.string().min(32).max(128),
    command: z.string().max(60),
    payload: z.unknown(),
  })
  .strict();
export const responseSchema = z
  .object({
    protocol: z.literal(PROTOCOL),
    requestId: id,
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.object({ code: z.string(), message: z.string() }).optional(),
  })
  .strict();

export const citationSchema = z
  .object({ sourceId: id, versionId: id, segmentId: z.string().max(100) })
  .strict();
export const operationSchema = z
  .object({
    op: z.enum(['create', 'replace']),
    documentId: id.nullable(),
    expectedRevision: z.number().int().nonnegative(),
    title,
    body: text,
    description: z.string().max(500),
    category: title,
    citations: z.array(citationSchema).max(300),
    reason: z.string().min(1).max(2000),
  })
  .strict();
export const proposalSchema = z
  .object({
    outcome: z.enum(['changes', 'no_change', 'needs_review']),
    summary: z.string().min(1).max(3000),
    operations: z.array(operationSchema).max(12),
    warnings: z.array(z.string().max(1000)).max(20),
  })
  .strict();
export type Proposal = z.infer<typeof proposalSchema>;
export type Citation = z.infer<typeof citationSchema>;
export interface Segment {
  id: string;
  heading: string;
  text: string;
  startLine: number;
  endLine: number;
}
export interface EvidenceVersion {
  id: string;
  sourceId: string;
  version: number;
  hash: string;
  filename: string;
  segments: Segment[];
}
export type JobStatus =
  'queued' | 'running' | 'retry_wait' | 'needs_review' | 'succeeded' | 'failed' | 'cancelled';
export interface JobInfo {
  id: string;
  sourceId: string;
  versionId: string;
  status: JobStatus;
  stage: string;
  attempts: number;
  nextRun: number;
  error: string | null;
  createdAt: string;
  successorId: string | null;
}
export interface WatchInfo {
  id: string;
  path: string;
  lastScan: string | null;
  error: string | null;
}
export interface WorkerInfo {
  connected: boolean;
  error?: string;
  registered?: string;
  pid: number;
  cursor: number;
  lastTick: number | null;
  nextTick: number;
  cli: { path: string; version: string; status: string; message: string };
  model: string;
  skillHash: string;
  callsToday: number;
  dailyLimit: number;
  resetsAt: string;
  timezone: string;
  jobs: JobInfo[];
  watches: WatchInfo[];
  proposals: { id: string; jobId: string; createdAt: string; proposal: Proposal }[];
  pendingSources?: string[];
}
