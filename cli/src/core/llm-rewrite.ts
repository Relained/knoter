import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { addMarkdownNoteToVault } from "./add-note";
import { loadVaultConfig, type VaultConfig } from "./config";
import { KnError, ErrorCode } from "./errors";
import { buildRewriteContextBundle } from "./rewrite-context";
import type { EmbeddingProvider } from "../pipeline/embedder";
import { MetaDB, type NoteRow } from "../stores/meta-store";
import { createVaultCollection, EMBEDDING_DIMENSIONS, openVaultCollection } from "../stores/vec-store";

export interface LlmRewriteInput {
  vaultRoot: string;
  vaultName: string;
  sourcePath: string;
  agent?: "codex";
  codexBin?: string;
  timeoutMs?: number;
  force?: boolean;
  rewrittenPath?: string;
  artifactPath?: string;
  workspace?: string;
  embedProvider?: EmbeddingProvider;
  useDeterministicEmbeddings?: boolean;
  runner?: LlmRewriteRunner;
}

export interface LlmRewriteResult {
  sourcePath: string;
  rewrittenPath: string;
  artifactPath: string;
  workspace: string;
  agent: "codex";
  lastMessage: string;
  stdoutTail: string;
  stderrTail: string;
  rewritten: {
    noteId: string;
    status: "added" | "updated" | "skipped";
    chunkCount: number;
  };
  artifact: {
    noteId: string;
    status: "added" | "updated" | "skipped";
    chunkCount: number;
  };
}

export interface LlmRewriteRunnerInput {
  workspace: string;
  prompt: string;
  sourceContent: string;
  templateContent: string;
  timeoutMs: number;
  codexBin: string;
}

export interface LlmRewriteRunnerResult {
  rewrittenContent: string;
  artifactContent: string;
  lastMessage: string;
  stdout: string;
  stderr: string;
}

export type LlmRewriteRunner = (input: LlmRewriteRunnerInput) => Promise<LlmRewriteRunnerResult>;

const DEFAULT_TIMEOUT_MS = 240_000;
const FALLBACK_TEMPLATE_PATH = fileURLToPath(new URL("../../../docs/template.md", import.meta.url));

export async function runLlmRewrite(input: LlmRewriteInput): Promise<LlmRewriteResult> {
  const agent = input.agent ?? "codex";
  if (agent !== "codex") {
    throw new KnError(ErrorCode.CONFIG_INVALID, `Unsupported LLM agent: ${agent}`);
  }

  const vaultConfig = await loadVaultConfig(input.vaultRoot);
  const metaDb = new MetaDB(input.vaultRoot);
  try {
    const sourceNote = metaDb.getNoteByPath(input.vaultName, input.sourcePath);
    if (!sourceNote || sourceNote.layer !== "source") {
      throw new KnError(ErrorCode.FILE_NOT_FOUND, `Source note not found in vault: ${input.sourcePath}`);
    }

    const sourceAbsPath = join(input.vaultRoot, sourceNote.file_path);
    if (!existsSync(sourceAbsPath)) {
      throw new KnError(ErrorCode.FILE_NOT_FOUND, `Source file is not readable: ${sourceNote.file_path}`);
    }

    const sourceContent = await Bun.file(sourceAbsPath).text();
    const templateContent = await readEffectiveTemplateContent(input.vaultRoot);
    const rewriteContext = await buildRewriteContextBundle({
      metaDb,
      vaultRoot: input.vaultRoot,
      vaultName: input.vaultName,
      source: sourceNote.file_path,
      includeContent: true,
      maxChars: 20_000,
    });

    const rewrittenPath = input.rewrittenPath ?? defaultRewrittenPath(sourceNote);
    const artifactPath = input.artifactPath ?? defaultArtifactPath(sourceNote);
    const workspace = input.workspace ?? join(input.vaultRoot, ".kn", "agent-runs", randomUUID());
    mkdirSync(workspace, { recursive: true });

    const prompt = buildCodexRewritePrompt({
      context: rewriteContext,
      templateContent,
      sourceNote,
      rewrittenVaultPath: rewrittenPath,
      artifactVaultPath: artifactPath,
      rewrittenOutputPath: "rewritten.md",
      artifactOutputPath: "artifact.md",
    });

    const runner = input.runner ?? runCodexCliAgent;
    const agentResult = await runner({
      workspace,
      prompt,
      sourceContent,
      templateContent,
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      codexBin: input.codexBin ?? process.env.KN_CODEX_BIN ?? "codex",
    });
    const vectorCollection = openOrCreateVectorCollection(input.vaultRoot, vaultConfig);
    let rewritten: Awaited<ReturnType<typeof addMarkdownNoteToVault>>;
    let artifact: Awaited<ReturnType<typeof addMarkdownNoteToVault>>;
    try {
      rewritten = await addMarkdownNoteToVault({
        vaultRoot: input.vaultRoot,
        vaultName: input.vaultName,
        relPath: rewrittenPath,
        content: agentResult.rewrittenContent,
        force: input.force,
        vaultConfig,
        embedProvider: resolveEmbedProvider(input, vaultConfig),
        vectorCollection,
      });

      artifact = await addMarkdownNoteToVault({
        vaultRoot: input.vaultRoot,
        vaultName: input.vaultName,
        relPath: artifactPath,
        content: agentResult.artifactContent,
        force: input.force,
        vaultConfig,
        embedProvider: resolveEmbedProvider(input, vaultConfig),
        vectorCollection,
      });
    } finally {
      vectorCollection.destroySync?.();
    }

    return {
      sourcePath: sourceNote.file_path,
      rewrittenPath,
      artifactPath,
      workspace,
      agent,
      lastMessage: agentResult.lastMessage,
      stdoutTail: tail(agentResult.stdout),
      stderrTail: tail(agentResult.stderr),
      rewritten: {
        noteId: rewritten.noteId,
        status: rewritten.status,
        chunkCount: rewritten.chunkCount,
      },
      artifact: {
        noteId: artifact.noteId,
        status: artifact.status,
        chunkCount: artifact.chunkCount,
      },
    };
  } finally {
    metaDb.close();
  }
}

function resolveEmbedProvider(input: LlmRewriteInput, vaultConfig: VaultConfig): EmbeddingProvider | undefined {
  if (input.embedProvider) return input.embedProvider;
  if (input.useDeterministicEmbeddings) return new DeterministicEmbeddingProvider(vaultConfig);
  return undefined;
}

function openOrCreateVectorCollection(vaultRoot: string, vaultConfig: VaultConfig): {
  upsertSync: (docs: unknown[]) => void;
  deleteSync?: (ids: string[]) => void;
  destroySync?: () => void;
} {
  const vectorIndexPath = join(vaultRoot, ".kn", "vectors");
  try {
    return openVaultCollection(vectorIndexPath, {}) as unknown as {
      upsertSync: (docs: unknown[]) => void;
      deleteSync?: (ids: string[]) => void;
      destroySync?: () => void;
    };
  } catch {
    return createVaultCollection(vectorIndexPath, "vault", vaultConfig.embedding.model) as unknown as {
      upsertSync: (docs: unknown[]) => void;
      deleteSync?: (ids: string[]) => void;
      destroySync?: () => void;
    };
  }
}

async function readEffectiveTemplateContent(vaultRoot: string): Promise<string> {
  const vaultTemplatePath = join(vaultRoot, ".kn", "template.md");
  if (existsSync(vaultTemplatePath)) {
    return Bun.file(vaultTemplatePath).text();
  }
  return Bun.file(FALLBACK_TEMPLATE_PATH).text();
}

export function buildCodexRewritePrompt(input: {
  context: Record<string, unknown>;
  templateContent: string;
  sourceNote: NoteRow;
  rewrittenVaultPath: string;
  artifactVaultPath: string;
  rewrittenOutputPath: string;
  artifactOutputPath: string;
}): string {
  return [
    "You are Codex acting as knoter's external rewrite and artifact agent.",
    "Task: produce both a chunk-friendly rewritten-source Markdown file and a durable user-facing artifact Markdown file.",
    "",
    "Hard requirements:",
    "- Use only facts present in the source evidence and template. Do not invent tasks, counts, dates, meals, workouts, or project status.",
    "- Write files only to the exact output paths below.",
    "- Output Markdown only in those files.",
    "- The rewritten file must include YAML frontmatter with layer: rewritten.",
    "- The artifact file must include YAML frontmatter with layer: artifact.",
    `- In rewritten frontmatter, set source_note_id: ${input.sourceNote.id}.`,
    `- In rewritten frontmatter, set source_path: ${input.sourceNote.file_path}.`,
    "- In rewritten frontmatter, set rewrite_agent: codex-cli.",
    "- In rewritten frontmatter, set rewrite_prompt_hash: codex-cli-v1.",
    `- In artifact frontmatter, set source_path: ${input.rewrittenVaultPath}.`,
    "- In artifact frontmatter, set artifact_template_id to the scenario template id you used.",
    "- Preserve task checkbox state exactly when tasks exist.",
    "- Mark uncertainty as inference instead of fact.",
    "- Include source paths in a Sources/Evidence section.",
    "",
    `Rewritten output path: ${input.rewrittenOutputPath}`,
    `Artifact output path: ${input.artifactOutputPath}`,
    `Vault rewritten path after import: ${input.rewrittenVaultPath}`,
    `Vault artifact path after import: ${input.artifactVaultPath}`,
    "",
    "Template Markdown:",
    input.templateContent,
    "",
    "Rewrite context JSON:",
    JSON.stringify(input.context, null, 2),
  ].join("\n");
}

export async function runCodexCliAgent(input: LlmRewriteRunnerInput): Promise<LlmRewriteRunnerResult> {
  if (!Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new KnError(ErrorCode.CONFIG_INVALID, "timeoutMs must be a positive integer.");
  }

  const promptPath = join(input.workspace, "prompt.md");
  const lastMessagePath = join(input.workspace, "last-message.txt");
  const sourcePath = join(input.workspace, "source.md");
  const templatePath = join(input.workspace, "template.md");
  const rewrittenPath = join(input.workspace, "rewritten.md");
  const artifactPath = join(input.workspace, "artifact.md");

  await Bun.write(promptPath, input.prompt);
  await Bun.write(sourcePath, input.sourceContent);
  await Bun.write(templatePath, input.templateContent);

  const command = [
    shellQuote(input.codexBin),
    "exec",
    "--cd",
    shellQuote(input.workspace),
    "--skip-git-repo-check",
    "--sandbox",
    "workspace-write",
    "--output-last-message",
    shellQuote(lastMessagePath),
    "-",
    "<",
    shellQuote(promptPath),
  ].join(" ");

  const proc = Bun.spawn(["bash", "-lc", command], {
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, input.timeoutMs);

  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    if (timedOut) {
      throw new KnError(ErrorCode.UNKNOWN, `Codex CLI timed out after ${input.timeoutMs}ms`);
    }
    if (exitCode !== 0) {
      throw new KnError(ErrorCode.UNKNOWN, `Codex CLI exited with ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    }

    const missing = [rewrittenPath, artifactPath].filter((path) => !existsSync(path));
    if (missing.length > 0) {
      throw new KnError(ErrorCode.FILE_NOT_FOUND, `Codex CLI did not create expected output: ${missing.join(", ")}`);
    }

    return {
      rewrittenContent: await Bun.file(rewrittenPath).text(),
      artifactContent: await Bun.file(artifactPath).text(),
      lastMessage: existsSync(lastMessagePath) ? await Bun.file(lastMessagePath).text() : "",
      stdout,
      stderr,
    };
  } finally {
    clearTimeout(timer);
  }
}

function defaultRewrittenPath(sourceNote: NoteRow): string {
  const date = sourceNote.doc_date ?? "undated";
  return `rewritten/${date}/${basename(sourceNote.file_path)}`;
}

function defaultArtifactPath(sourceNote: NoteRow): string {
  const date = sourceNote.doc_date ?? "undated";
  const stem = basename(sourceNote.file_path, ".md");
  return `artifacts/${date}/${stem}-artifact.md`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function tail(value: string, maxChars = 4_000): string {
  return value.length > maxChars ? value.slice(value.length - maxChars) : value;
}

class DeterministicEmbeddingProvider implements EmbeddingProvider {
  readonly name = "deterministic-llm-rewrite";
  readonly isLocal = true;
  private readonly dimension: number;

  constructor(vaultConfig: VaultConfig) {
    this.dimension = EMBEDDING_DIMENSIONS[vaultConfig.embedding.model] ?? 768;
  }

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => deterministicVector(text, this.dimension));
  }
}

function deterministicVector(text: string, dimension: number): number[] {
  const bytes = createHash("sha256").update(text).digest();
  return Array.from({ length: dimension }, (_, index) => ((bytes[index % bytes.length] ?? 0) - 128) / 128);
}
