import { Command } from "commander";
import { join } from "node:path";
import { MetaDB, type NoteRow } from "../stores/meta-store";
import { resolveVaultRoot, loadGlobalConfig } from "../core/config";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose, logger } from "../core/logger";

export function registerGetCommand(program: Command): void {
  program
    .command("get <targets...>")
    .description("Retrieve full note content")
    .option("--section <heading>", "Extract only named heading section")
    .option("--offset <n>", "Start from character offset")
    .option("--max-chars <n>", "Truncate output to N characters")
    .option("--json", "Return full metadata as JSON envelope")
    .action(async (targets, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      try {
        const vaultOpt = globalOpts.vault;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        let vaultName = vaultOpt;
        if (!vaultName) {
          const config = await loadGlobalConfig();
          vaultName = config.activeVault || "default";
        }

        const metaDb = new MetaDB(vaultRoot);
        try {
          const found: any[] = [];
          const notFound: { target: string; suggestions: string[] }[] = [];

          for (const target of targets) {
            const result = await resolveAndGet(metaDb, vaultRoot, vaultName, target, options);
            if (result) {
              found.push(result);
            } else {
              // Get suggestions
              const allNotes = metaDb.listNotes(vaultName, 1000, 0);
              const suggestions = allNotes
                .map(n => n.file_path)
                .filter(p => {
                  const lower = p.toLowerCase();
                  const targetLower = target.toLowerCase();
                  return lower.includes(targetLower) || targetLower.split("/").some(part => lower.includes(part));
                })
                .slice(0, 5);
              notFound.push({ target, suggestions });
            }
          }

          if (targets.length === 1 && found.length === 1) {
            // Single result mode
            render(success("get", found[0], vaultName), format);
          } else {
            // Batch mode
            render(success("get", { found, notFound }, vaultName), format);
          }
        } finally {
          metaDb.close();
        }
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("get", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });
}

async function resolveAndGet(
  metaDb: MetaDB,
  vaultRoot: string,
  vaultId: string,
  target: string,
  options: any
): Promise<any | null> {
  // Path resolution: exact -> suffix -> substring -> id
  let note: NoteRow | null = null;

  // 1. Exact path match
  note = metaDb.getNoteByPath(vaultId, target);

  // 2. Suffix match
  if (!note) {
    const suffix = metaDb.db.query(
      "SELECT * FROM notes WHERE vault_id = ? AND file_path LIKE ? LIMIT 1"
    ).get(vaultId, `%/${target}`) as NoteRow | null;
    note = suffix;
  }

  // 3. Substring match
  if (!note) {
    const sub = metaDb.db.query(
      "SELECT * FROM notes WHERE vault_id = ? AND file_path LIKE ? LIMIT 1"
    ).get(vaultId, `%${target}%`) as NoteRow | null;
    note = sub;
  }

  // 4. ID match
  if (!note) {
    note = metaDb.getNote(target);
  }

  if (!note) return null;

  // Read file content from disk
  const filePath = join(vaultRoot, note.file_path);
  let content: string;
  try {
    content = await Bun.file(filePath).text();
  } catch {
    content = "[File not found on disk]";
  }

  // Apply --section: extract named heading section
  if (options.section) {
    content = extractSection(content, options.section);
  }

  // Apply --offset
  if (options.offset) {
    const offset = parseInt(options.offset);
    if (!isNaN(offset) && offset > 0) {
      content = content.substring(offset);
    }
  }

  // Apply --max-chars
  if (options.maxChars) {
    const maxChars = parseInt(options.maxChars);
    if (!isNaN(maxChars) && maxChars > 0) {
      content = content.substring(0, maxChars);
    }
  }

  // Get metadata
  const tags = metaDb.getTagsByNote(note.id).map(t => t.tag);
  const chunks = metaDb.getChunksByNote(note.id);

  return {
    id: note.id,
    filePath: note.file_path,
    title: note.title,
    tags,
    chunkCount: chunks.length,
    content,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    frontmatter: note.frontmatter ? JSON.parse(note.frontmatter) : null,
  };
}

/**
 * Extract a section from markdown content by heading name (case-insensitive).
 * Returns content from the matching heading to the next heading of same or higher level.
 */
function extractSection(content: string, headingName: string): string {
  const lines = content.split("\n");
  let collecting = false;
  let matchLevel = 0;
  const result: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();

      if (collecting) {
        // Stop if we hit a heading of same or higher level
        if (level <= matchLevel) break;
      }

      if (text.toLowerCase() === headingName.toLowerCase()) {
        collecting = true;
        matchLevel = level;
      }
    }

    if (collecting) {
      result.push(line);
    }
  }

  return result.length > 0 ? result.join("\n") : `[Section "${headingName}" not found]`;
}
