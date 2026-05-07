import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MetaDB, type NoteRow } from "../stores/meta-store";
import { search } from "../search/hybrid";
import { logger } from "../core/logger";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readTemplateFile, type EffectiveTemplate } from "../core/template";
import {
  buildReportContextBundle,
  parseDateOption,
  parseLayerOption,
  parseTopOption,
} from "../core/report-context";

// ─── MCP Server Factory ──────────────────────────────────────────────────────

export async function createMcpServer(
  vaultRoot: string,
  vaultName: string
): Promise<McpServer> {
  // Validate vault and open persistent MetaDB
  const metaDb = new MetaDB(vaultRoot);

  // Create MCP server
  const server = new McpServer({
    name: "knoter",
    version: "0.1.0",
  });

  // ── Tool: kn_search ────────────────────────────────────────────────────────

  server.registerTool(
    "kn_search",
    {
      title: "Search vault",
      description: "Search notes using semantic and keyword similarity",
      inputSchema: z.object({
        query: z.string().describe("Search query"),
        top: z.number().optional().describe("Number of results (default: 10)"),
        mode: z.enum(["semantic", "keyword", "hybrid"]).optional().describe("Search mode"),
        tag: z.array(z.string()).optional().describe("Filter by tags"),
      }),
    },
    async ({ query, top, mode, tag }) => {
      try {
        logger.debug(`[MCP] kn_search: "${query}"`);
        const result = await search(vaultRoot, vaultName, query, {
          mode: (mode || "hybrid") as any,
          top: top || 10,
          tags: tag,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                query,
                mode: result.mode,
                totalFound: result.totalFound,
                strongSignal: result.strongSignal,
                results: result.results.map((r) => ({
                  id: r.chunkId,
                  noteId: r.noteId,
                  filePath: r.filePath,
                  title: r.title,
                  heading: r.heading,
                  content: r.content.substring(0, 200),
                  tags: r.tags,
                  score: r.score,
                })),
              }),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    }
  );

  // ── Tool: kn_get ───────────────────────────────────────────────────────────

  server.registerTool(
    "kn_get",
    {
      title: "Get note content",
      description: "Retrieve full note content by path",
      inputSchema: z.object({
        path: z.string().describe("Note file path"),
        section: z.string().optional().describe("Extract specific heading"),
        maxChars: z.number().optional().describe("Truncate output"),
      }),
    },
    async ({ path, section, maxChars }) => {
      try {
        logger.debug(`[MCP] kn_get: "${path}"`);

        const payload = await buildGetPayload(metaDb, vaultRoot, vaultName, path, {
          section,
          maxChars,
        });

        if (!payload) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ error: `Note not found: ${path}` }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(payload),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    }
  );

  // ── Tool: kn_vault_status ──────────────────────────────────────────────────

  server.registerTool(
    "kn_vault_status",
    {
      title: "Get vault status",
      description: "Get indexing status and statistics for the vault",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        logger.debug("[MCP] kn_vault_status");
        const status = metaDb.getVaultStatus(vaultName);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                noteCount: status.noteCount,
                chunkCount: status.chunkCount,
                tagCount: status.tagCount,
                pendingCount: status.pendingCount,
                lastIndexedAt: status.lastIndexedAt,
                embeddingModel: status.embeddingModel,
              }),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    }
  );

  // ── Tool: kn_add_note (stub) ───────────────────────────────────────────────

  server.registerTool(
    "kn_add_note",
    {
      title: "Add note (not yet implemented)",
      description: "Add a new note to the vault",
      inputSchema: z.object({
        path: z.string().describe("Note file path"),
        tag: z.array(z.string()).optional().describe("Tags to add"),
      }),
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "kn_add_note not yet implemented in MCP server",
            }),
          },
        ],
        isError: true,
      };
    }
  );

  // ── Tool: kn_get_batch ─────────────────────────────────────────────────────

  server.registerTool(
    "kn_get_batch",
    {
      title: "Get multiple notes",
      description: "Retrieve multiple notes by path or note ID",
      inputSchema: z.object({
        targets: z.array(z.string()).describe("Note paths or note IDs"),
        section: z.string().optional().describe("Extract specific heading"),
        maxChars: z.number().optional().describe("Truncate each output"),
      }),
    },
    async ({ targets, section, maxChars }) => {
      try {
        logger.debug(`[MCP] kn_get_batch: ${targets.length} targets`);

        const found: any[] = [];
        const notFound: { target: string; suggestions: string[] }[] = [];

        for (const target of targets) {
          const payload = await buildGetPayload(metaDb, vaultRoot, vaultName, target, {
            section,
            maxChars,
          });

          if (payload) {
            found.push(payload);
          } else {
            notFound.push({
              target,
              suggestions: getPathSuggestions(metaDb, vaultName, target),
            });
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ found, notFound }),
            },
          ],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    }
  );

  // ── Tool: kn_template_get ──────────────────────────────────────────────────

  server.registerTool(
    "kn_template_get",
    {
      title: "Get effective template",
      description: "Return effective template data used by template get JSON output",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        logger.debug("[MCP] kn_template_get");
        const payload = await buildTemplateGetPayload(vaultRoot);
        return {
          content: [{ type: "text", text: JSON.stringify(payload) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    }
  );

  // ── Tool: kn_report_context ────────────────────────────────────────────────

  server.registerTool(
    "kn_report_context",
    {
      title: "Build report context",
      description: "Return report context bundle without CLI invocation",
      inputSchema: z.object({
        date: z.string().describe("Target logical date (YYYY-MM-DD)"),
        template: z.string().optional().describe("Template label to echo in output"),
        layer: z.enum(["source", "rewritten", "artifact", "all"]).optional().describe("Document layer filter"),
        top: z.number().optional().describe("FTS results per retrieval query (default: 20)"),
        includeArtifacts: z.boolean().optional().describe("Include artifact notes in dailyNotes and retrieval"),
      }),
    },
    async ({ date, template, layer, top, includeArtifacts }) => {
      try {
        logger.debug(`[MCP] kn_report_context: ${date}`);
        const payload = await buildReportContextBundle({
          metaDb,
          vaultName,
          date: parseDateOption(date),
          templateArg: template,
          templateOverride: await resolveEffectiveTemplateForVaultRoot(vaultRoot),
          layer: parseLayerOption(layer || "rewritten"),
          top: parseTopOption(String(top ?? 20)),
          includeArtifacts: !!includeArtifacts,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(payload) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    }
  );

  // ── Cleanup hook (close MetaDB on shutdown) ────────────────────────────────

  // Store reference to close on server shutdown
  (server as any).__metaDb = metaDb;

  return server;
}

export async function buildTemplateGetPayload(vaultRoot: string): Promise<Record<string, unknown>> {
  const template = await resolveEffectiveTemplateForVaultRoot(vaultRoot);
  const parsed = await readTemplateFile(template.path);
  const validationErrors: string[] = [];
  if (!parsed.content.trim()) {
    validationErrors.push("Template content is empty");
  }
  if (!/^#{1,6}\s+.+$/m.test(parsed.content)) {
    validationErrors.push("Template contains no markdown heading");
  }
  if (parsed.hasFrontmatter && parsed.frontmatterError) {
    validationErrors.push(`Invalid frontmatter: ${parsed.frontmatterError}`);
  }

  return {
    ...template,
    body: template.content,
    text: template.content,
    validation: {
      valid: validationErrors.length === 0,
      errors: validationErrors,
      warnings: [],
      hasFrontmatter: parsed.hasFrontmatter,
      frontmatterError: parsed.frontmatterError,
    },
  };
}

async function resolveEffectiveTemplateForVaultRoot(vaultRoot: string): Promise<EffectiveTemplate> {
  const vaultTemplatePath = join(vaultRoot, ".kn", "template.md");
  if (await Bun.file(vaultTemplatePath).exists()) {
    const parsed = await readTemplateFile(vaultTemplatePath);
    return {
      source: "vault",
      path: vaultTemplatePath,
      content: parsed.content,
      ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
    };
  }

  const fallbackTemplatePath = fileURLToPath(
    new URL("../../docs/template.md", import.meta.url),
  );
  const parsed = await readTemplateFile(fallbackTemplatePath);
  return {
    source: "fallback",
    path: fallbackTemplatePath,
    content: parsed.content,
    ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
  };
}

async function buildGetPayload(
  metaDb: MetaDB,
  vaultRoot: string,
  vaultName: string,
  target: string,
  options: { section?: string; maxChars?: number }
): Promise<any | null> {
  const note = resolveNote(metaDb, vaultName, target);
  if (!note) return null;

  let content: string;
  try {
    const filePath = join(vaultRoot, note.file_path);
    content = await Bun.file(filePath).text();
  } catch {
    content = "[File not found on disk]";
  }

  if (options.section) {
    content = extractSection(content, options.section);
  }

  if (options.maxChars && options.maxChars > 0) {
    content = content.substring(0, options.maxChars);
  }

  const tags = metaDb.getTagsByNote(note.id).map((t) => t.tag);
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

function resolveNote(metaDb: MetaDB, vaultName: string, target: string): NoteRow | null {
  let note = metaDb.getNoteByPath(vaultName, target);

  if (!note) {
    note = metaDb.db
      .query("SELECT * FROM notes WHERE vault_id = ? AND file_path LIKE ? LIMIT 1")
      .get(vaultName, `%/${target}`) as NoteRow | null;
  }

  if (!note) {
    note = metaDb.db
      .query("SELECT * FROM notes WHERE vault_id = ? AND file_path LIKE ? LIMIT 1")
      .get(vaultName, `%${target}%`) as NoteRow | null;
  }

  if (!note) {
    note = metaDb.getNote(target);
  }

  return note;
}

function getPathSuggestions(metaDb: MetaDB, vaultName: string, target: string): string[] {
  const targetLower = target.toLowerCase();

  return metaDb
    .listNotes(vaultName, 1000, 0)
    .map((note) => note.file_path)
    .filter((path) => {
      const lower = path.toLowerCase();
      return lower.includes(targetLower) || targetLower.split("/").some((part) => lower.includes(part));
    })
    .slice(0, 5);
}

function extractSection(content: string, headingName: string): string {
  const lines = content.split("\n");
  let collecting = false;
  let matchLevel = 0;
  const result: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const text = headingMatch[2]!.trim();

      if (collecting && level <= matchLevel) {
        break;
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
