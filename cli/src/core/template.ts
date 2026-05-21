import { join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { resolveVaultRoot, loadGlobalConfig } from "./config";
import { KnError, ErrorCode } from "./errors";

export type TemplateSource = "vault" | "fallback" | "path";

export interface ParsedTemplate {
  content: string;
  metadata: Record<string, unknown> | null;
  hasFrontmatter: boolean;
  frontmatterError: string | null;
}

export interface ResolvedTemplateSource {
  source: Exclude<TemplateSource, "path">;
  path: string;
}

export interface EffectiveTemplate {
  source: Exclude<TemplateSource, "path">;
  path: string;
  content: string;
  metadata?: Record<string, unknown>;
}

const FALLBACK_TEMPLATE_PATH = fileURLToPath(
  new URL("../../../docs/template.md", import.meta.url),
);

export async function resolveTemplateSource(vaultOpt?: string): Promise<ResolvedTemplateSource> {
  let vaultRoot: string | undefined;

  if (vaultOpt) {
    vaultRoot = await resolveVaultRoot(vaultOpt);
  } else {
    const config = await loadGlobalConfig();
    if (config.activeVault) {
      vaultRoot = await resolveVaultRoot();
    }
  }

  if (vaultRoot) {
    const vaultTemplatePath = join(vaultRoot, ".kn", "template.md");
    if (await Bun.file(vaultTemplatePath).exists()) {
      return { source: "vault", path: vaultTemplatePath };
    }
  }

  const bundledExists = await Bun.file(FALLBACK_TEMPLATE_PATH).exists();
  if (!bundledExists) {
    throw new KnError(
      ErrorCode.FILE_NOT_FOUND,
      "No vault template was found and bundled fallback template.md is missing",
    );
  }
  return { source: "fallback", path: FALLBACK_TEMPLATE_PATH };
}

export async function readTemplateFile(path: string): Promise<ParsedTemplate> {
  let raw: string;
  try {
    raw = await Bun.file(path).text();
  } catch {
    throw new KnError(ErrorCode.FILE_NOT_FOUND, `Template file is not readable: ${path}`);
  }

  const hasFrontmatter = hasTopLevelFrontmatter(raw);
  if (!hasFrontmatter) {
    return {
      content: raw,
      metadata: null,
      hasFrontmatter: false,
      frontmatterError: null,
    };
  }

  try {
    const parsed = matter(raw);
    const data = parsed.data;
    const metadata = normalizeMetadataObject(data);

    if (!hasClosingFrontmatter(raw)) {
      return {
        content: parsed.content,
        metadata: null,
        hasFrontmatter: true,
        frontmatterError: "Frontmatter start marker found but closing delimiter is missing",
      };
    }

    if (metadata === null) {
      return {
        content: parsed.content,
        metadata: null,
        hasFrontmatter: true,
        frontmatterError: "Frontmatter exists but is not an object",
      };
    }

    return {
      content: parsed.content,
      metadata,
      hasFrontmatter: true,
      frontmatterError: null,
    };
  } catch (err) {
    return {
      content: raw,
      metadata: null,
      hasFrontmatter: true,
      frontmatterError: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getEffectiveTemplate(vaultOpt?: string): Promise<EffectiveTemplate> {
  const resolved = await resolveTemplateSource(vaultOpt);
  const parsed = await readTemplateFile(resolved.path);
  return {
    source: resolved.source,
    path: resolved.path,
    content: parsed.content,
    ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
  };
}

export async function resolveVaultName(vaultOpt?: string): Promise<string | undefined> {
  if (vaultOpt) {
    return vaultOpt;
  }
  const config = await loadGlobalConfig();
  return config.activeVault ?? undefined;
}

function hasTopLevelFrontmatter(raw: string): boolean {
  return /^---(?:\r?\n|$)/.test(raw);
}

function hasClosingFrontmatter(raw: string): boolean {
  const lines = raw.split(/\r?\n/);
  if (lines.length < 2) return false;

  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === "---" || lines[i] === "...") {
      return true;
    }
  }

  return false;
}

function normalizeMetadataObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
