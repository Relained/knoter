import { existsSync, mkdirSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { addMarkdownNoteToVault } from "./add-note";
import { loadVaultConfig, type VaultConfig } from "./config";
import { listDocumentTemplatesForRoot } from "./document-templates";
import { KnError, ErrorCode } from "./errors";
import { buildRewriteContextBundle } from "./rewrite-context";
import type { EmbeddingProvider } from "../pipeline/embedder";
import { MetaDB, type NoteRow } from "../stores/meta-store";
import { createVaultCollection, EMBEDDING_DIMENSIONS, openVaultCollection } from "../stores/vec-store";

export type LlmAgent = "codex" | "claude";

export const LLM_AGENTS: readonly LlmAgent[] = ["codex", "claude"];

export interface LlmRewriteInput {
  vaultRoot: string;
  vaultName: string;
  sourcePath: string;
  agent?: LlmAgent;
  codexBin?: string;
  claudeBin?: string;
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
  /** Legacy rewritten import path; null when the agent produced artifacts only. */
  rewrittenPath: string | null;
  workspace: string;
  agent: LlmAgent;
  lastMessage: string;
  stdoutTail: string;
  stderrTail: string;
  /** Legacy rewritten import result; null when the agent produced artifacts only. */
  rewritten: {
    noteId: string;
    status: "added" | "updated" | "skipped";
    chunkCount: number;
  } | null;
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
  agent: LlmAgent;
  agentBin: string;
}

export interface LlmRewriteRunnerResult {
  /** Legacy rewritten.md content when the agent wrote one; null otherwise. */
  rewrittenContent: string | null;
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
  if (!LLM_AGENTS.includes(agent)) {
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

    const legacyRewrittenPath = input.rewrittenPath ?? defaultRewrittenPath(sourceNote);
    const workspace = input.workspace ?? join(input.vaultRoot, ".kn", "agent-runs", randomUUID());
    mkdirSync(workspace, { recursive: true });
    const seededArtifacts = await seedWorkspaceArtifacts(input.vaultRoot, workspace);
    const seededTemplates = await seedWorkspaceTemplates(input.vaultRoot, workspace);

    const prompt = buildRewritePrompt({
      agent,
      context: rewriteContext,
      templateContent,
      sourceNote,
      artifactOutputDir: "artifacts",
      wikiPath: "artifacts/llm-wiki.md",
      seededArtifacts,
      seededTemplates,
    });

    const runner = input.runner ?? (agent === "claude" ? runClaudeCliAgent : runCodexCliAgent);
    const agentBin =
      agent === "claude"
        ? input.claudeBin ?? process.env.KN_CLAUDE_BIN ?? "claude"
        : input.codexBin ?? process.env.KN_CODEX_BIN ?? "codex";
    const agentResult = await runner({
      workspace,
      prompt,
      sourceContent,
      templateContent,
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      agent,
      agentBin,
    });
    if (agentResult.artifactFiles.length === 0) {
      throw new KnError(
        ErrorCode.UNKNOWN,
        "Agent produced no artifact outputs. The contract requires at least one artifacts/**/*.md (llm-wiki update or scenario artifact).",
      );
    }

    const vectorCollection = openOrCreateVectorCollection(input.vaultRoot, vaultConfig);
    let rewritten: Awaited<ReturnType<typeof addMarkdownNoteToVault>> | null = null;
    const artifacts: LlmRewriteResult["artifacts"] = [];
    try {
      // Legacy compatibility: import a rewritten note only when the agent
      // still authored one; the artifact-first contract no longer asks for it.
      if (agentResult.rewrittenContent !== null) {
        rewritten = await addMarkdownNoteToVault({
          vaultRoot: input.vaultRoot,
          vaultName: input.vaultName,
          relPath: legacyRewrittenPath,
          content: agentResult.rewrittenContent,
          force: input.force,
          vaultConfig,
          embedProvider: resolveEmbedProvider(input, vaultConfig),
          vectorCollection,
        });
      }

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
      rewrittenPath: rewritten ? legacyRewrittenPath : null,
      workspace,
      agent,
      lastMessage: agentResult.lastMessage,
      stdoutTail: tail(agentResult.stdout),
      stderrTail: tail(agentResult.stderr),
      rewritten: rewritten
        ? {
            noteId: rewritten.noteId,
            status: rewritten.status,
            chunkCount: rewritten.chunkCount,
          }
        : null,
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

export function buildRewritePrompt(input: {
  agent: LlmAgent;
  context: Record<string, unknown>;
  templateContent: string;
  sourceNote: NoteRow;
  artifactOutputDir: string;
  wikiPath: string;
  seededArtifacts: string[];
  seededTemplates: string[];
}): string {
  const agentName = input.agent === "claude" ? "Claude" : "Codex";
  const seededList =
    input.seededArtifacts.length > 0
      ? input.seededArtifacts.map((path) => `  - ${path}`).join("\n")
      : "  - (none)";
  const templateList =
    input.seededTemplates.length > 0
      ? input.seededTemplates.map((path) => `  - ${path}`).join("\n")
      : "  - (none)";
  return [
    `You are ${agentName} acting as knoter's external knowledge agent.`,
    "Task: read the source evidence and update the vault's durable artifacts — the llm-wiki knowledge base plus any template-justified scenario artifacts.",
    "",
    "Hard requirements:",
    "- Use only facts present in the source evidence, the seeded artifacts, and the templates. Do not invent tasks, counts, dates, meals, workouts, or project status.",
    `- Update the llm-wiki knowledge base at ${input.wikiPath}: integrate durable, public, permanent knowledge from the source and add a dated line to its Recent Updates section. Edit the seeded wiki in place instead of starting over.`,
    "- Read the per-artifact scenario templates seeded under the templates directory below and choose scenario artifact families yourself.",
    "- Write artifact files only under the artifact output directory below, at the durable artifactPath each scenario template declares in its frontmatter.",
    "- Do not create per-source or per-day artifact paths like artifacts/YYYY-MM-DD/<source>-artifact.md unless a template explicitly requires that durable path.",
    "- If the source supports no scenario artifact, the llm-wiki update is still required.",
    "- Do not write rewritten.md or any file outside the artifact output directory; the rewritten layer is legacy.",
    "- Every artifact file must include YAML frontmatter with layer: artifact.",
    `- In the llm-wiki frontmatter, set kind: llm-wiki.`,
    `- In artifact frontmatter, set source_note_id: ${input.sourceNote.id}.`,
    `- In artifact frontmatter, set source_path: ${input.sourceNote.file_path}.`,
    "- In artifact frontmatter, set artifact_template_id to the scenario template's templateId, llm-wiki for the wiki, or artifact-workflow when no template defines a narrower id.",
    "- Preserve task checkbox state exactly when tasks exist.",
    "- Mark uncertainty as inference instead of fact.",
    "- Include source paths in a Sources/Evidence section.",
    "",
    `Artifact output directory: ${input.artifactOutputDir}`,
    "Scenario templates seeded into the workspace (read before choosing):",
    templateList,
    "Existing artifacts seeded into the workspace (edit in place):",
    seededList,
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
  const paths = await prepareAgentWorkspace(input);
  const command = [
    shellQuote(input.agentBin),
    "exec",
    "--cd",
    shellQuote(input.workspace),
    "--skip-git-repo-check",
    "--sandbox",
    "workspace-write",
    "--output-last-message",
    shellQuote(paths.lastMessagePath),
    "-",
    "<",
    shellQuote(paths.promptPath),
  ].join(" ");

  const { stdout, stderr } = await runAgentCommand("Codex CLI", command, {
    timeoutMs: input.timeoutMs,
  });

  return {
    rewrittenContent: existsSync(paths.rewrittenPath)
      ? await Bun.file(paths.rewrittenPath).text()
      : null,
    artifactFiles: await readArtifactOutputs(input.workspace, paths.artifactRoot),
    lastMessage: existsSync(paths.lastMessagePath) ? await Bun.file(paths.lastMessagePath).text() : "",
    stdout,
    stderr,
  };
}

export async function runClaudeCliAgent(input: LlmRewriteRunnerInput): Promise<LlmRewriteRunnerResult> {
  const paths = await prepareAgentWorkspace(input);
  // Claude Code CLI has no --cd flag; cwd confines file tools to the workspace.
  const command = [
    shellQuote(input.agentBin),
    "--print",
    "--output-format",
    "text",
    "--allowedTools",
    "Read",
    "Write",
    "Edit",
    "Glob",
    "Grep",
    "<",
    shellQuote(paths.promptPath),
  ].join(" ");

  const { stdout, stderr } = await runAgentCommand("Claude CLI", command, {
    cwd: input.workspace,
    timeoutMs: input.timeoutMs,
  });

  return {
    rewrittenContent: existsSync(paths.rewrittenPath)
      ? await Bun.file(paths.rewrittenPath).text()
      : null,
    artifactFiles: await readArtifactOutputs(input.workspace, paths.artifactRoot),
    lastMessage: stdout.trim(),
    stdout,
    stderr,
  };
}

interface AgentWorkspacePaths {
  promptPath: string;
  lastMessagePath: string;
  rewrittenPath: string;
  artifactRoot: string;
}

async function prepareAgentWorkspace(input: LlmRewriteRunnerInput): Promise<AgentWorkspacePaths> {
  if (!Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0) {
    throw new KnError(ErrorCode.CONFIG_INVALID, "timeoutMs must be a positive integer.");
  }

  const paths: AgentWorkspacePaths = {
    promptPath: join(input.workspace, "prompt.md"),
    lastMessagePath: join(input.workspace, "last-message.txt"),
    rewrittenPath: join(input.workspace, "rewritten.md"),
    artifactRoot: join(input.workspace, "artifacts"),
  };

  await Bun.write(paths.promptPath, input.prompt);
  await Bun.write(join(input.workspace, "source.md"), input.sourceContent);
  await Bun.write(join(input.workspace, "template.md"), input.templateContent);
  mkdirSync(paths.artifactRoot, { recursive: true });
  return paths;
}

async function runAgentCommand(
  label: string,
  command: string,
  options: { timeoutMs: number; cwd?: string },
): Promise<{ stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bash", "-lc", command], {
    cwd: options.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, options.timeoutMs);

  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);

    if (timedOut) {
      throw new KnError(ErrorCode.UNKNOWN, `${label} timed out after ${options.timeoutMs}ms`);
    }
    if (exitCode !== 0) {
      throw new KnError(ErrorCode.UNKNOWN, `${label} exited with ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
    }

    return { stdout, stderr };
  } finally {
    clearTimeout(timer);
  }
}

function defaultRewrittenPath(sourceNote: NoteRow): string {
  const date = sourceNote.doc_date ?? "undated";
  return `rewritten/${date}/${basename(sourceNote.file_path)}`;
}

/**
 * Mirrors the effective per-artifact document templates (bundled defaults
 * plus vault overrides) into the workspace `templates/` directory so the
 * agent can read scenario contracts without CLI access.
 */
async function seedWorkspaceTemplates(vaultRoot: string, workspace: string): Promise<string[]> {
  const templates = await listDocumentTemplatesForRoot(vaultRoot);
  const seeded: string[] = [];
  for (const template of templates) {
    const relPath = `templates/${template.name}.md`;
    const target = join(workspace, relPath);
    mkdirSync(dirname(target), { recursive: true });
    await Bun.write(target, await Bun.file(template.path).text());
    seeded.push(relPath);
  }
  return seeded.sort();
}

/**
 * Mirrors the vault's current artifacts/**\/*.md into the agent workspace so
 * the agent updates the durable documents (llm-wiki, scenario dashboards)
 * in place instead of overwriting them blind.
 */
async function seedWorkspaceArtifacts(vaultRoot: string, workspace: string): Promise<string[]> {
  const files = await listMarkdownFiles(join(vaultRoot, "artifacts"));
  const seeded: string[] = [];
  for (const file of files) {
    const relPath = relative(resolve(vaultRoot), file).replace(/\\/g, "/");
    if (!relPath.startsWith("artifacts/")) continue;
    const target = join(workspace, relPath);
    mkdirSync(dirname(target), { recursive: true });
    await Bun.write(target, await Bun.file(file).text());
    seeded.push(relPath);
  }
  return seeded.sort();
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
