import { z } from 'zod';

export const PROTOCOL = 1;
export const MAX_SOURCE_BYTES = 256 * 1024;
export const MAX_WIRE_BYTES = 8 * 1024 * 1024;
export const PIPELINE = 'markdown-wiki-2';
/** Notes started per local day; retries of a started note do not count (D9, 2026-10-16). */
export const DAILY_RUN_LIMIT = 200;
/** The wiki MCP tools; every CLI adapter must expose exactly these and nothing else. */
export const EVIDENCE_TOOLS = [
  'source_search',
  'source_read',
  'wiki_search',
  'wiki_read',
  'reference_read',
] as const;
export type EvidenceTool = (typeof EVIDENCE_TOOLS)[number];
export const MODEL = 'gpt-5.6-luna';
export const CLI_VERSION = '0.154.0';
// Claude Code updates itself frequently; versions at or above the verified one are
// accepted, and every attempt re-checks the CLI's reported tool surface instead.
export const CLAUDE_MODEL = 'claude-sonnet-5-5';
export const CLAUDE_MIN_VERSION = '2.1.294';
export const workerProviders = z.enum(['codex', 'claude']);
export type WorkerProvider = z.infer<typeof workerProviders>;
export const providerProfiles: Record<
  WorkerProvider,
  { label: string; model: string; effort: string }
> = {
  codex: { label: 'Codex CLI', model: MODEL, effort: 'low' },
  claude: { label: 'Claude Code', model: CLAUDE_MODEL, effort: 'medium' },
};
/** A model the side chat can run on, as the connected CLI offers it. */
export interface ChatModelOption {
  provider: WorkerProvider;
  model: string;
  label: string;
  efforts: string[];
  defaultEffort: string;
}
export const CLAUDE_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// Claude Code has no machine-readable model list; these are the models its picker
// offers. Effort levels are re-read from the selected CLI's --help when connecting.
export const claudeChatModels: ChatModelOption[] = [
  { model: 'claude-opus-5-5', label: 'Opus 5.5', defaultEffort: 'medium' },
  { model: CLAUDE_MODEL, label: 'Sonnet 5.5', defaultEffort: 'high' },
  { model: 'claude-haiku-5-5', label: 'Haiku 5.5', defaultEffort: 'medium' },
  { model: 'claude-fable-5-1', label: 'Fable 5.1', defaultEffort: 'high' },
].map((m) => ({ ...m, provider: 'claude' as const, efforts: CLAUDE_EFFORTS }));
// Used when the selected Codex CLI cannot render its model catalog.
export const codexFallbackModels: ChatModelOption[] = [
  {
    provider: 'codex',
    model: MODEL,
    label: 'GPT-5.6-Luna',
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'low',
  },
];
export const CHAT_DAILY_LIMIT = 100;
export const MAX_CHAT_ATTACHMENTS = 5;
export const MAX_CHAT_TEXT = 20_000;
export const chatAttachmentExtensions = /\.(md|markdown|txt)$/i;
/** The side chat's extra tool: a dry run of its proposal that never writes. */
export const CHAT_TOOLS = [...EVIDENCE_TOOLS, 'wiki_check'] as const;
const id = z.string().uuid();
const text = z.string().max(200_000);
const title = z.string().trim().min(1).max(200);
const nil = z.object({}).strict();
export const chatChoice = z
  .object({
    provider: workerProviders,
    model: z.string().min(1).max(100),
    effort: z.string().min(1).max(20),
  })
  .strict();
export type ChatChoice = z.infer<typeof chatChoice>;
/** Share of marked supplements a written page aims for, in percent (D23). */
export const DEFAULT_SUPPLEMENT_RATIO = 30;
export const supplementRatio = z.number().int().min(0).max(90);
/** Force strengths for the wiki graph layout; 1 is the default for each. */
export const graphForces = z
  .object({
    center: z.number().min(0).max(3),
    repel: z.number().min(0).max(3),
    link: z.number().min(0).max(3),
    distance: z.number().min(0.3).max(3),
  })
  .strict();
export type GraphForces = z.infer<typeof graphForces>;
/** Shortcut overrides: command ID → binding such as `Mod+Shift+K`, or '' to unbind. */
export const shortcutMap = z
  .record(
    z.string().regex(/^[a-zA-Z][\w.-]{0,39}$/),
    z.string().regex(/^((Mod|Ctrl|Alt|Shift|Meta)\+){0,4}[^+\s]{1,12}$|^$/),
  )
  .refine((map) => Object.keys(map).length <= 80, 'Too many shortcut overrides.');
export const settingsPatch = z
  .object({
    theme: z.enum(['light', 'dark']).optional(),
    workerPaused: z.boolean().optional(),
    leftSidebarWidth: z.number().min(184).max(380).optional(),
    rightSidebarWidth: z.number().min(280).max(600).optional(),
    leftSidebarCompact: z.boolean().optional(),
    leftSidebarCollapsed: z.boolean().optional(),
    rightSidebarCollapsed: z.boolean().optional(),
    chat: chatChoice.optional(),
    supplementRatio: supplementRatio.optional(),
    shortcuts: shortcutMap.optional(),
    graph: graphForces.optional(),
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
  referenceVersion: z.object({ id }).strict(),
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
  configureCli: z.object({ path: z.string().min(1).max(4096), provider: workerProviders }).strict(),
  checkCli: nil,
  backup: z.object({ path: z.string().min(1).max(4096) }).strict(),
  restoreBackup: z.object({ path: z.string().min(1).max(4096) }).strict(),
  exportWiki: z.object({ path: z.string().min(1).max(4096) }).strict(),
  chatSend: z
    .object({
      text: z.string().max(MAX_CHAT_TEXT),
      documentIds: z.array(id).max(20),
      attachments: z
        .array(
          z
            .object({
              filename: title.regex(chatAttachmentExtensions),
              // UTF-8 text only; the service checks the encoded byte limit.
              text: z.string().max(MAX_SOURCE_BYTES),
            })
            .strict(),
        )
        .max(MAX_CHAT_ATTACHMENTS),
      choice: chatChoice,
      supplementRatio: supplementRatio.optional(),
    })
    .strict(),
  chatCancel: nil,
  chatNewThread: nil,
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
  'referenceVersion',
  'checkCli',
  'removeWatch',
  'chatSend',
  'chatCancel',
  'chatNewThread',
]);
export const desktopActions = z.enum([
  'enable',
  'disable',
  'restart',
  'status',
  'approvalSettings',
  'chooseCli',
  'chooseClaudeCode',
  'chooseFolder',
  'importMarkdown',
  'backup',
  'restoreBackup',
  'exportWiki',
]);
export type DesktopAction = z.infer<typeof desktopActions>;
/** Window decoration: drawn by the app (`custom`) or by the operating system (`native`). */
export const windowFrames = z.enum(['custom', 'native']);
export type WindowFrame = z.infer<typeof windowFrames>;
export const windowCommand = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['state', 'minimize', 'toggleMaximize', 'close']) }).strict(),
  z.object({ action: z.literal('setFrame'), frame: windowFrames }).strict(),
]);
export type WindowCommand = z.infer<typeof windowCommand>;
export interface WindowState {
  platform: string;
  frame: WindowFrame;
  maximized: boolean;
  fullscreen: boolean;
}
export interface NativeBridge {
  request(command: Command, payload: unknown): Promise<unknown>;
  desktop(action: DesktopAction): Promise<unknown>;
  window(command: WindowCommand): Promise<WindowState>;
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
export const referenceCitationSchema = z
  .object({
    // The identifier passed to reference_read: an https URL, mdn:<path>, or ko:/en:<title>.
    path: z.string().min(1).max(2000),
    segmentId: z.string().min(1).max(100),
  })
  .strict();
export const MAX_TAGS = 8;
export const tagSchema = z.string().trim().min(1).max(32);
/** Glossary terms: words that name a page; their first mentions elsewhere link to it. */
export const MAX_TERMS = 8;
export const termSchema = z.string().trim().min(2).max(40);
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
    // Optional when reading pre-reference proposals; required for new worker output.
    referenceCitations: z.array(referenceCitationSchema).max(200).optional(),
    // Optional when reading proposals saved before tags; required for new worker output.
    tags: z.array(tagSchema).max(MAX_TAGS).optional(),
    terms: z.array(termSchema).max(MAX_TERMS).optional(),
    reason: z.string().min(1).max(2000),
  })
  .strict();
/** Wrap the first unlinked mention of a term in existing documents with a link to target. */
export const linkSchema = z
  .object({
    // An existing document ID, or the exact title of a page created in the same proposal.
    target: z.string().trim().min(1).max(200),
    mentions: z.array(z.string().trim().min(1).max(80)).min(1).max(3),
    documents: z
      .array(z.object({ documentId: id, expectedRevision: z.number().int().positive() }).strict())
      .min(1)
      .max(30),
    reason: z.string().min(1).max(500),
  })
  .strict();
/** Add to or revise one section of an existing page without rewriting the rest. */
export const sectionSchema = z
  .object({
    documentId: id,
    expectedRevision: z.number().int().positive(),
    heading: z.string().trim().min(1).max(120),
    // append: add to the section (or create it); replace: rewrite that section's body.
    mode: z.enum(['append', 'replace']),
    body: text,
    citations: z.array(citationSchema).max(300),
    referenceCitations: z.array(referenceCitationSchema).max(200).optional(),
    reason: z.string().min(1).max(2000),
  })
  .strict();
/** Where each part of the changed note went: a page, or nowhere with a reason. */
export const topicSchema = z
  .object({
    segmentIds: z.array(z.string().min(1).max(100)).min(1).max(500),
    // An existing page ID, the exact title of a page created in this proposal, or null.
    target: z.string().trim().min(1).max(200).nullable(),
    reason: z.string().min(1).max(300),
  })
  .strict();
/** Service-generated only: a protected document whose every source was removed. */
export const trashSchema = z
  .object({
    documentId: id,
    expectedRevision: z.number().int().positive(),
    reason: z.string().min(1).max(500),
  })
  .strict();
export const proposalSchema = z
  .object({
    outcome: z.enum(['changes', 'no_change', 'needs_review']),
    summary: z.string().min(1).max(3000),
    // Worker output allows 12; section edits expand into replacements, hence 24 stored.
    operations: z.array(operationSchema).max(24),
    sections: z.array(sectionSchema).max(12).optional(),
    topics: z.array(topicSchema).max(60).optional(),
    links: z.array(linkSchema).max(10).optional(),
    trash: z.array(trashSchema).max(50).optional(),
    warnings: z.array(z.string().max(1000)).max(20),
  })
  .strict();
export type Proposal = z.infer<typeof proposalSchema>;
/** A side-chat turn: the reply shown to the user plus an ordinary wiki proposal. */
export const chatResultSchema = proposalSchema.extend({
  reply: z.string().min(1).max(MAX_CHAT_TEXT),
});
export type ChatResult = z.infer<typeof chatResultSchema>;
export type LinkRequest = z.infer<typeof linkSchema>;
export type SectionEdit = z.infer<typeof sectionSchema>;
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
  /** Tombstone: the file disappeared; hash repeats the last content for blob integrity. */
  removed?: boolean;
}
export type ReferenceProvider = 'mdn' | 'wikipedia' | 'web';
export interface ReferenceEvidence {
  id: string;
  /** Absent on snapshots saved before providers existed, which were all MDN. */
  provider?: ReferenceProvider;
  licenseUrl?: string;
  path: string;
  title: string;
  url: string;
  contentUrl: string;
  fetchedAt: string;
  hash: string;
  license: string;
  segments: Segment[];
}
export interface ReferenceUse extends Omit<ReferenceEvidence, 'segments'> {
  segmentIds: string[];
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
  result?: Pick<Proposal, 'outcome' | 'summary' | 'warnings'>;
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
  cli: {
    provider: WorkerProvider;
    path: string;
    version: string;
    status: string;
    message: string;
  };
  model: string;
  effort: string;
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
