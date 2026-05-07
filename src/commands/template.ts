import { Command } from "commander";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { resolveVaultRoot, loadGlobalConfig } from "../core/config";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose } from "../core/logger";

type TemplateSource = "vault" | "fallback" | "path";

interface ParsedTemplate {
  content: string;
  metadata: Record<string, unknown> | null;
  hasFrontmatter: boolean;
  frontmatterError: string | null;
}

interface ValidationResult {
  source: TemplateSource;
  path: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const FALLBACK_TEMPLATE_PATH = fileURLToPath(new URL("../../docs/template.md", import.meta.url));

export function registerTemplateCommand(program: Command): void {
  const templateCmd = program
    .command("template")
    .description("Manage vault-local templates");

  templateCmd
    .command("get")
    .description("Get effective template (vault-local with fallback)")
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);
      const vaultOpt = globalOpts.vault;

      try {
        const vaultName = await resolveVaultName(vaultOpt);
        const resolved = await resolveTemplateSource(vaultOpt);
        const parsed = await readTemplateFile(resolved.path);

        const response = success("template get", {
          source: resolved.source,
          path: resolved.path,
          content: parsed.content,
          ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
        }, vaultName);

        render(response, format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("template get", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });

  templateCmd
    .command("list")
    .description("List effective template (vault-local with fallback)")
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);
      const vaultOpt = globalOpts.vault;

      try {
        const vaultName = await resolveVaultName(vaultOpt);
        const resolved = await resolveTemplateSource(vaultOpt);
        const parsed = await readTemplateFile(resolved.path);

        const response = success("template list", {
          source: resolved.source,
          path: resolved.path,
          content: parsed.content,
          ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
        }, vaultName);

        render(response, format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("template list", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });

  templateCmd
    .command("validate [path]")
    .description("Validate a template file or the effective template")
    .action(async (path, _options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      const errors: string[] = [];
      const warnings: string[] = [];
      let source: TemplateSource = "path";
      let templatePath = "";
      let resolved: ParsedTemplate | null = null;

      try {
        if (path) {
          templatePath = resolve(path);
          source = "path";
          resolved = await readTemplateFile(templatePath);
        } else {
          const effective = await resolveTemplateSource(globalOpts.vault);
          source = effective.source;
          templatePath = effective.path;
          resolved = await readTemplateFile(templatePath);
        }

        if (!resolved.content.trim()) {
          errors.push("Template content is empty");
        }

        if (!hasMarkdownHeading(resolved.content)) {
          errors.push("Template contains no markdown heading");
        }

        if (resolved.hasFrontmatter && resolved.frontmatterError) {
          errors.push(`Invalid frontmatter: ${resolved.frontmatterError}`);
        }

        const result: ValidationResult = {
          source,
          path: templatePath,
          valid: errors.length === 0,
          errors,
          warnings,
        };

        render(success("template validate", result), format);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const result: ValidationResult = {
          source,
          path: templatePath || "(unknown)",
          valid: false,
          errors: [
            ...errors,
            `Unable to validate template: ${msg}`,
          ],
          warnings,
        };
        render(success("template validate", result), format);
      }
    });
}

async function resolveTemplateSource(vaultOpt?: string): Promise<{ source: Exclude<TemplateSource, "path">; path: string }> {
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
      "No vault template was found and bundled fallback template.md is missing"
    );
  }
  return { source: "fallback", path: FALLBACK_TEMPLATE_PATH };
}

async function resolveVaultName(vaultOpt?: string): Promise<string | undefined> {
  if (vaultOpt) {
    return vaultOpt;
  }
  const config = await loadGlobalConfig();
  return config.activeVault ?? undefined;
}

async function readTemplateFile(path: string): Promise<ParsedTemplate> {
  let raw: string;
  try {
    raw = await Bun.file(path).text();
  } catch (err) {
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

function hasMarkdownHeading(content: string): boolean {
  return /^#{1,6}\s+.+$/m.test(content);
}
