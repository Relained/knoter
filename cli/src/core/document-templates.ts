import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, readdirSync } from "node:fs";
import { resolveVaultRoot, loadGlobalConfig } from "./config";
import { readTemplateFile } from "./template";
import { KnError, ErrorCode } from "./errors";

/**
 * Named document templates: starter artifact documents (markdown contract)
 * paired with a default HTML display template. Bundled defaults ship in
 * `cli/templates/`; a vault overrides or extends them through
 * `.kn/templates/<name>.md` (+ optional `<name>.html`).
 *
 * This is separate from the single artifact-workflow contract template
 * (`docs/template.md` / `.kn/template.md`) used by `kn template get` without
 * a name.
 */

export type DocumentTemplateSource = "bundled" | "vault";

export interface DocumentTemplateSummary {
  name: string;
  source: DocumentTemplateSource;
  path: string;
  kind: string | null;
  title: string | null;
  description: string | null;
  hasHtml: boolean;
  /** Whether `kn template scaffold` writes this template's starter artifact. */
  scaffold: boolean;
  /** Durable vault path the template's artifact lives at. */
  artifactPath: string;
}

export interface DocumentTemplate extends DocumentTemplateSummary {
  content: string;
  metadata: Record<string, unknown> | null;
  html: string | null;
}

export interface ScaffoldResult {
  created: { name: string; path: string }[];
  skipped: { name: string; path: string; reason: string }[];
}

export const DEFAULT_DOCUMENT_TEMPLATE_NAMES = [
  "llm-wiki",
  "calendar",
  "todo",
  "kanban",
] as const;

const BUNDLED_TEMPLATES_DIR = fileURLToPath(
  new URL("../../templates", import.meta.url),
);

const TEMPLATE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export async function listDocumentTemplates(
  vaultOpt?: string,
): Promise<DocumentTemplateSummary[]> {
  const vaultRoot = await resolveOptionalVaultRoot(vaultOpt);
  return listDocumentTemplatesForRoot(vaultRoot);
}

/** Same as listDocumentTemplates, but with an explicit (or absent) vault root. */
export async function listDocumentTemplatesForRoot(
  vaultRoot: string | null,
): Promise<DocumentTemplateSummary[]> {
  const entries = new Map<string, { source: DocumentTemplateSource; path: string }>();

  for (const name of scanTemplateNames(BUNDLED_TEMPLATES_DIR)) {
    entries.set(name, {
      source: "bundled",
      path: join(BUNDLED_TEMPLATES_DIR, `${name}.md`),
    });
  }

  const vaultDir = vaultRoot ? join(vaultRoot, ".kn", "templates") : null;
  if (vaultDir) {
    for (const name of scanTemplateNames(vaultDir)) {
      entries.set(name, { source: "vault", path: join(vaultDir, `${name}.md`) });
    }
  }

  const summaries: DocumentTemplateSummary[] = [];
  for (const [name, entry] of [...entries.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    summaries.push(await buildSummary(name, entry.source, entry.path));
  }
  return summaries;
}

export async function getDocumentTemplate(
  name: string,
  vaultOpt?: string,
): Promise<DocumentTemplate> {
  if (!TEMPLATE_NAME_PATTERN.test(name)) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      `Invalid template name "${name}". Use lowercase letters, digits, and dashes.`,
    );
  }

  const vaultRoot = await resolveOptionalVaultRoot(vaultOpt);
  const vaultPath = vaultRoot ? join(vaultRoot, ".kn", "templates", `${name}.md`) : null;
  const bundledPath = join(BUNDLED_TEMPLATES_DIR, `${name}.md`);

  let source: DocumentTemplateSource;
  let path: string;
  if (vaultPath && existsSync(vaultPath)) {
    source = "vault";
    path = vaultPath;
  } else if (existsSync(bundledPath)) {
    source = "bundled";
    path = bundledPath;
  } else {
    throw new KnError(
      ErrorCode.FILE_NOT_FOUND,
      `Document template "${name}" was not found (no vault or bundled template).`,
    );
  }

  const parsed = await readTemplateFile(path);
  const htmlPath = path.replace(/\.md$/, ".html");
  const html = existsSync(htmlPath) ? await Bun.file(htmlPath).text() : null;
  const summary = await buildSummary(name, source, path);

  return {
    ...summary,
    content: parsed.content,
    metadata: parsed.metadata,
    html,
  };
}

/**
 * Writes one starter artifact document per scaffold-enabled template
 * (frontmatter `scaffold: true`) into its declared `artifactPath`. Scenario
 * templates without the flag are agent-maintained and are not scaffolded.
 * Existing documents are skipped unless `force` is set. Indexing is left to
 * `kn add`/`kn sync`.
 */
export async function scaffoldDocumentTemplates(
  vaultRoot: string,
  options: { force?: boolean; vaultOpt?: string } = {},
): Promise<ScaffoldResult> {
  const result: ScaffoldResult = { created: [], skipped: [] };
  const templates = await listDocumentTemplatesForRoot(vaultRoot);

  for (const template of templates) {
    if (!template.scaffold) continue;
    const relPath = template.artifactPath;
    const targetPath = join(vaultRoot, relPath);
    if (existsSync(targetPath) && !options.force) {
      result.skipped.push({ name: template.name, path: relPath, reason: "exists" });
      continue;
    }
    const raw = await Bun.file(template.path).text();
    await Bun.write(targetPath, raw);
    result.created.push({ name: template.name, path: relPath });
  }

  return result;
}

async function buildSummary(
  name: string,
  source: DocumentTemplateSource,
  path: string,
): Promise<DocumentTemplateSummary> {
  const parsed = await readTemplateFile(path);
  const metadata = parsed.metadata ?? {};
  return {
    name,
    source,
    path,
    kind: optionalString(metadata.kind),
    title: optionalString(metadata.name) ?? optionalString(metadata.title),
    description: optionalString(metadata.description),
    hasHtml: existsSync(path.replace(/\.md$/, ".html")),
    scaffold: metadata.scaffold === true,
    artifactPath: resolveArtifactPath(name, metadata.artifactPath),
  };
}

function resolveArtifactPath(name: string, raw: unknown): string {
  const fallback = `artifacts/${name}.md`;
  const value = optionalString(raw);
  if (!value) return fallback;
  const normalized = value.replace(/\\/g, "/");
  const valid =
    normalized.startsWith("artifacts/") &&
    normalized.endsWith(".md") &&
    !normalized.includes("..") &&
    !normalized.includes("//");
  return valid ? normalized : fallback;
}

async function resolveOptionalVaultRoot(vaultOpt?: string): Promise<string | null> {
  if (vaultOpt) {
    return resolveVaultRoot(vaultOpt);
  }
  const config = await loadGlobalConfig();
  if (config.activeVault) {
    return resolveVaultRoot();
  }
  return null;
}

function scanTemplateNames(dir: string): string[] {
  let files: string[];
  try {
    files = readdirSync(dir);
  } catch {
    return [];
  }
  return files
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.slice(0, -3))
    .filter((name) => TEMPLATE_NAME_PATTERN.test(name));
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
