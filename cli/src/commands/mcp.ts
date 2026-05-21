import { Command } from "commander";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { resolveVaultRoot, loadGlobalConfig } from "../core/config";
import { logger, setVerbose, redirectLogsToStderr } from "../core/logger";
import { KnError, ErrorCode } from "../core/errors";
import { createMcpServer } from "../mcp/server";
import { join } from "node:path";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";

const PID_FILE = join(homedir(), ".kn", "mcp.pid");

export function registerMcpCommand(program: Command): void {
  const mcpCmd = program
    .command("mcp")
    .description("Run MCP server for the vault");

  mcpCmd
    .option("--transport <type>", "Transport (stdio or http)", "stdio")
    .option("--port <n>", "HTTP port (default: 3000)", "3000")
    .option("--host <host>", "HTTP host (default: 127.0.0.1)", "127.0.0.1")
    .option("--daemon", "Run as daemon")
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        setVerbose(!!globalOpts.verbose);

        const vaultOpt = globalOpts.vault;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        let vaultName = vaultOpt;
        if (!vaultName) {
          const config = await loadGlobalConfig();
          vaultName = config.activeVault || "default";
        }

        const transport = options.transport.toLowerCase() || "stdio";
        const port = parseInt(options.port) || 3000;
        const host = options.host || "127.0.0.1";

        // Daemon mode: spawn detached subprocess, stripping --daemon so the
        // child doesn't recursively re-fork.
        if (options.daemon) {
          const childArgv = process.argv.filter((a) => a !== "--daemon");
          const subprocess = Bun.spawn(childArgv, {
            cwd: process.cwd(),
            detached: true,
            stdio: ["ignore", "ignore", "ignore"],
          });
          subprocess.unref();
          const pid = subprocess.pid;
          writeFileSync(PID_FILE, pid.toString());
          console.log(`Server started in daemon mode (PID: ${pid})`);
          return;
        }

        // stdio transport must not have any non-protocol writes on stdout.
        // Force consola/logger output onto stderr.
        if (options.transport === "stdio") {
          redirectLogsToStderr();
        }

        // Create and connect MCP server
        const server = await createMcpServer(vaultRoot, vaultName);
        logger.info(`MCP server initialized for vault: ${vaultName}`);

        if (transport === "stdio") {
          // Stdio transport (default)
          const stdioTransport = new StdioServerTransport();
          logger.info(`Starting MCP server on stdio transport`);
          logger.info(`Vault: ${vaultName} (${vaultRoot})`);
          await server.connect(stdioTransport);
        } else if (transport === "http") {
          // HTTP transport using web-standard API
          const httpTransport = new WebStandardStreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
          });

          logger.info(`Starting MCP server on HTTP transport`);
          logger.info(`Listening on http://${host}:${port}`);
          logger.info(`Vault: ${vaultName} (${vaultRoot})`);

          await server.connect(httpTransport);

          Bun.serve({
            port,
            hostname: host,
            async fetch(req) {
              const url = new URL(req.url);

              if (req.method === "GET" && url.pathname === "/health") {
                return new Response(JSON.stringify({ ok: true }), {
                  headers: { "content-type": "application/json" },
                });
              }

              if (url.pathname === "/mcp") {
                return await httpTransport.handleRequest(req);
              }

              return new Response("Not Found", { status: 404 });
            },
          });

          // Keep process alive
          await new Promise(() => {});
        } else {
          throw new KnError(
            ErrorCode.CONFIG_INVALID,
            `Unsupported transport: ${transport}. Use 'stdio' or 'http'.`,
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Server error: ${msg}`);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });

  // Stop subcommand
  mcpCmd
    .command("stop")
    .description("Stop the running MCP server")
    .action(async () => {
      try {
        const pidStr = readFileSync(PID_FILE, "utf-8").trim();
        const pid = parseInt(pidStr);

        if (!isNaN(pid)) {
          process.kill(pid, "SIGTERM");
          unlinkSync(PID_FILE);
          console.log(`Stopped server (PID: ${pid})`);
        } else {
          console.log("No server PID found");
        }
      } catch (err) {
        if ((err as any).code === "ENOENT") {
          console.log("No server running");
        } else {
          console.error(
            `Error stopping server: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(1);
        }
      }
    });
}
