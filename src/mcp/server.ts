import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MetaDB } from "../stores/meta-store";
import { search } from "../search/hybrid";
import { logger } from "../core/logger";
import { join } from "node:path";

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

        // Resolve note by path
        let note = metaDb.getNoteByPath(vaultName, path);

        if (!note) {
          const suffix = metaDb.db
            .query("SELECT * FROM notes WHERE vault_id = ? AND file_path LIKE ? LIMIT 1")
            .get(vaultName, `%/${path}`) as any;
          note = suffix;
        }

        if (!note) {
          const sub = metaDb.db
            .query("SELECT * FROM notes WHERE vault_id = ? AND file_path LIKE ? LIMIT 1")
            .get(vaultName, `%${path}%`) as any;
          note = sub;
        }

        if (!note) {
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

        // Read file
        let content: string;
        try {
          const filePath = join(vaultRoot, note.file_path);
          content = await Bun.file(filePath).text();
        } catch {
          content = "[File not found on disk]";
        }

        // Extract section if specified
        if (section) {
          const lines = content.split("\n");
          let collecting = false;
          let matchLevel = 0;
          const result: string[] = [];

          for (const line of lines) {
            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
              const level = headingMatch[1]!.length;
              const text = headingMatch[2]!.trim();

              if (collecting) {
                if (level <= matchLevel) break;
              }

              if (text.toLowerCase() === section.toLowerCase()) {
                collecting = true;
                matchLevel = level;
              }
            }

            if (collecting) {
              result.push(line);
            }
          }

          content = result.length > 0 ? result.join("\n") : `[Section "${section}" not found]`;
        }

        // Apply max chars
        if (maxChars && maxChars > 0) {
          content = content.substring(0, maxChars);
        }

        const tags = metaDb.getTagsByNote(note.id).map((t) => t.tag);
        const chunks = metaDb.getChunksByNote(note.id);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                id: note.id,
                filePath: note.file_path,
                title: note.title,
                tags,
                chunkCount: chunks.length,
                content,
                createdAt: note.created_at,
                updatedAt: note.updated_at,
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

  // ── Tool: kn_multi_get (stub) ──────────────────────────────────────────────

  server.registerTool(
    "kn_multi_get",
    {
      title: "Get multiple notes (not yet implemented)",
      description: "Retrieve multiple notes by path",
      inputSchema: z.object({
        paths: z.array(z.string()).describe("Note paths"),
      }),
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "kn_multi_get not yet implemented",
            }),
          },
        ],
        isError: true,
      };
    }
  );

  // ── Tool: kn_tag_auto (stub) ───────────────────────────────────────────────

  server.registerTool(
    "kn_tag_auto",
    {
      title: "Auto-tag note (not yet implemented)",
      description: "Automatically generate tags for a note",
      inputSchema: z.object({
        noteId: z.string().describe("Note ID"),
      }),
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "kn_tag_auto not yet implemented",
            }),
          },
        ],
        isError: true,
      };
    }
  );

  // ── Tool: kn_cluster (stub) ────────────────────────────────────────────────

  server.registerTool(
    "kn_cluster",
    {
      title: "Cluster notes (not yet implemented)",
      description: "Find semantic clusters of similar notes",
      inputSchema: z.object({
        minSize: z.number().optional().describe("Minimum cluster size"),
      }),
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "kn_cluster not yet implemented in MCP server",
            }),
          },
        ],
        isError: true,
      };
    }
  );

  // ── Tool: kn_update (stub) ─────────────────────────────────────────────────

  server.registerTool(
    "kn_update",
    {
      title: "Update note (not yet implemented)",
      description: "Update note metadata or content",
      inputSchema: z.object({
        noteId: z.string().describe("Note ID"),
        title: z.string().optional().describe("New title"),
        tags: z.array(z.string()).optional().describe("New tags"),
      }),
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "kn_update not yet implemented",
            }),
          },
        ],
        isError: true,
      };
    }
  );

  // ── Cleanup hook (close MetaDB on shutdown) ────────────────────────────────

  // Store reference to close on server shutdown
  (server as any).__metaDb = metaDb;

  return server;
}
