import { existsSync, mkdirSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
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
  workspace?: string;
  embedProvider?: EmbeddingProvider;
  useDeterministicEmbeddings?: boolean;
  runner?: LlmRewriteRunner;
}

export interface LlmRewriteResult {
  sourcePath: string;
  rewrittenPath: string;
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
  artifacts: Array<{
    path: string;
    noteId: string;
    status: "added" | "updated" | "skipped";
    chunkCount: number;
  }>;
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
  artifactFiles: LlmArtifactOutput[];
  lastMessage: string;
  stdout: string;
  stderr: string;
}

export type LlmRewriteRunner = (input: LlmRewriteRunnerInput) => Promise<LlmRewriteRunnerResult>;

export interface LlmArtifactOutput {
  path: string;
  content: string;
}

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
    const workspace = input.workspace ?? join(input.vaultRoot, ".kn", "agent-runs", randomUUID());
    mkdirSync(workspace, { recursive: true });

    const prompt = buildCodexRewritePrompt({
      context: rewriteContext,
      templateContent,
      sourceNote,
      rewrittenVaultPath: rewrittenPath,
      rewrittenOutputPath: "rewritten.md",
      artifactOutputDir: "artifacts",
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
    const artifacts: LlmRewriteResult["artifacts"] = [];
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

      for (const artifactOutput of agentResult.artifactFiles) {
        const result = await addMarkdownNoteToVault({
          vaultRoot: input.vaultRoot,
          vaultName: input.vaultName,
          relPath: validateAgentArtifactPath(artifactOutput.path),
          content: artifactOutput.content,
          force: input.force,
          vaultConfig,
          embedProvider: resolveEmbedProvider(input, vaultConfig),
          vectorCollection,
        });
        artifacts.push({
          path: result.filePath,
          noteId: result.noteId,
          status: result.status,
          chunkCount: result.chunkCount,
        });
      }
    } finally {
      vectorCollection.destroySync?.();
    }

    return {
      sourcePath: sourceNote.file_path,
      rewrittenPath,
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
      artifacts,
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
  rewrittenOutputPath: string;
  artifactOutputDir: string;
}): string {
  return [
    "You are Codex acting as knoter's external rewrite and artifact agent.",
    "Task: produce a chunk-friendly rewritten-source Markdown file, then decide which durable artifact files should be created or updated from the template.",
    "",
    "Hard requirements:",
    "- Use only facts present in the source evidence and template. Do not invent tasks, counts, dates, meals, workouts, or project status.",
    "- Write the rewritten note only to the exact rewritten output path below.",
    "- Read the Template Markdown Scenario Templates and choose artifact families yourself.",
    "- Write artifact files only under the artifact output directory below, using durable scenario paths from the template such as artifacts/diet/diet-dashboard.md, artifacts/workout/workout-dashboard.md, artifacts/tasks/task-priority.md, artifacts/study/study-index.md, artifacts/projects/capdi-project-status.md, artifacts/progress/exam-progress.md, artifacts/ideas/ideas-backlog.md, or artifacts/reflection/reflection-log.md.",
    "- Do not create per-source or per-day artifact paths like artifacts/YYYY-MM-DD/<source>-artifact.md unless the template explicitly requires that durable path.",
    "- If the source does not support any artifact scenario, create no artifact files.",
    "- The rewritten file must include YAML frontmatter with layer: rewritten.",
    "- Every artifact file you create must include YAML frontmatter with layer: artifact.",
    `- In rewritten frontmatter, set source_note_id: ${input.sourceNote.id}.`,
    `- In rewritten frontmatter, set source_path: ${input.sourceNote.file_path}.`,
    "- In rewritten frontmatter, set rewrite_agent: codex-cli.",
    "- In rewritten frontmatter, set rewrite_prompt_hash: codex-cli-v1.",
    `- In artifact frontmatter, set source_path: ${input.rewrittenVaultPath}.`,
    "- In artifact frontmatter, set artifact_template_id to the scenario template id or artifact-workflow when the template does not define a narrower id.",
    "- Preserve task checkbox state exactly when tasks exist.",
    "- Mark uncertainty as inference instead of fact.",
    "- Include source paths in a Sources/Evidence section.",
    "",
    `Rewritten output path: ${input.rewrittenOutputPath}`,
    `Artifact output directory: ${input.artifactOutputDir}`,
    `Vault rewritten path after import: ${input.rewrittenVaultPath}`,
    "Vault artifact paths after import: same relative paths you write under the artifact output directory.",
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
  const artifactRoot = join(input.workspace, "artifacts");

  await Bun.write(promptPath, input.prompt);
  await Bun.write(sourcePath, input.sourceContent);
  await Bun.write(templatePath, input.templateContent);
  mkdirSync(artifactRoot, { recursive: true });

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

    const missing = [rewrittenPath].filter((path) => !existsSync(path));
    if (missing.length > 0) {
      throw new KnError(ErrorCode.FILE_NOT_FOUND, `Codex CLI did not create expected output: ${missing.join(", ")}`);
    }

    return {
      rewrittenContent: await Bun.file(rewrittenPath).text(),
      artifactFiles: await readArtifactOutputs(input.workspace, artifactRoot),
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

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

async function readArtifactOutputs(workspace: string, artifactRoot: string): Promise<LlmArtifactOutput[]> {
  const files = await listMarkdownFiles(artifactRoot);
  const root = resolve(workspace);
  const outputs: LlmArtifactOutput[] = [];
  for (const file of files) {
    const relPath = relative(root, file).replace(/\\/g, "/");
    outputs.push({
      path: validateAgentArtifactPath(relPath),
      content: await Bun.file(file).text(),
    });
  }
  return outputs.sort((a, b) => a.path.localeCompare(b.path));
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  try {
    const entries = await Array.fromAsync(new Bun.Glob("**/*.md").scan({ cwd: root, absolute: true }));
    return entries.sort();
  } catch {
    return [];
  }
}

function validateAgentArtifactPath(rawPath: string): string {
  const normalized = rawPath.replace(/\\/g, "/");
  if (isAbsolute(normalized) || normalized.includes(`..${sep}`) || normalized.startsWith("../") || normalized === "..") {
    throw new KnError(ErrorCode.CONFIG_INVALID, `Artifact path must stay inside the vault: ${rawPath}`);
  }
  if (!normalized.startsWith("artifacts/") || !normalized.endsWith(".md")) {
    throw new KnError(ErrorCode.CONFIG_INVALID, `Artifact path must be artifacts/**/*.md: ${rawPath}`);
  }
  return normalized;
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
