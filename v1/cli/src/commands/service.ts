import { Command } from "commander";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import {
  loadGlobalConfig,
  loadVaultConfig,
  resolveVaultName,
  resolveVaultRoot,
} from "../core/config";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose, logger } from "../core/logger";
import { createEmbeddingProvider } from "../providers/factory";
import { checkEmbeddingHealth } from "../providers/health";

/**
 * kn service: OS-level scheduling for `kn sync`.
 *
 * `install` registers a macOS launchd agent that runs `kn sync` on the
 * configured interval (global config sync.intervalMinutes, overridable with
 * --interval). `uninstall` removes it. `status` reports the registration and
 * optionally probes the embedding endpoint.
 */

const LAUNCHD_LABEL = "com.knoter.sync";
const PLIST_PATH = join(homedir(), "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`);
const LOG_DIR = join(homedir(), ".config", "knoter", "logs");
const CLI_ENTRY = fileURLToPath(new URL("../cli.ts", import.meta.url));

export function registerServiceCommand(program: Command): void {
  const serviceCmd = program
    .command("service")
    .description("Manage the periodic sync service and inspect external endpoints");

  serviceCmd
    .command("install")
    .description("Register an OS service (launchd) that runs `kn sync` periodically")
    .option("--interval <minutes>", "Sync interval in minutes (default: global config sync.intervalMinutes)")
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      try {
        requireDarwin();
        const globalConfig = await loadGlobalConfig();
        const intervalMinutes = options.interval
          ? parsePositiveInt(options.interval, "--interval")
          : globalConfig.sync.intervalMinutes;

        mkdirSync(dirname(PLIST_PATH), { recursive: true });
        mkdirSync(LOG_DIR, { recursive: true });
        await Bun.write(PLIST_PATH, buildPlist(intervalMinutes));

        // Reload if already registered.
        await runLaunchctl(["unload", PLIST_PATH], { allowFailure: true });
        await runLaunchctl(["load", "-w", PLIST_PATH]);

        render(
          success("service install", {
            label: LAUNCHD_LABEL,
            plist: PLIST_PATH,
            intervalMinutes,
            command: [process.execPath, CLI_ENTRY, "sync"],
            logs: LOG_DIR,
          }),
          format,
        );
      } catch (err) {
        renderCommandError("service install", err, format);
      }
    });

  serviceCmd
    .command("uninstall")
    .description("Unregister the periodic sync service")
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      try {
        requireDarwin();
        const existed = existsSync(PLIST_PATH);
        if (existed) {
          await runLaunchctl(["unload", PLIST_PATH], { allowFailure: true });
          rmSync(PLIST_PATH, { force: true });
        }
        render(
          success("service uninstall", { label: LAUNCHD_LABEL, removed: existed }),
          format,
        );
      } catch (err) {
        renderCommandError("service uninstall", err, format);
      }
    });

  serviceCmd
    .command("status")
    .description("Show sync service registration and configured external endpoints")
    .option("--check", "Probe embedding endpoint health")
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals?.() || {};
      const format = (globalOpts.format || "text") as OutputFormat;
      setVerbose(!!globalOpts.verbose);

      try {
        const vaultOpt = globalOpts.vault as string | undefined;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        const vaultName = await resolveVaultName(vaultOpt);
        const vaultConfig = await loadVaultConfig(vaultRoot);
        const globalConfig = await loadGlobalConfig();

        const data: Record<string, unknown> = {
          syncService: {
            supported: process.platform === "darwin",
            installed: existsSync(PLIST_PATH),
            plist: PLIST_PATH,
            intervalMinutes: globalConfig.sync.intervalMinutes,
          },
          agent: {
            backend: vaultConfig.agent.backend,
            backends: Object.keys(vaultConfig.agent.backends),
          },
          embedding: {
            baseUrl: vaultConfig.embedding.baseUrl,
            model: vaultConfig.embedding.model,
            managedBy: "external",
          },
        };

        if (options.check) {
          const provider = createEmbeddingProvider(vaultConfig);
          data.health = { embedding: await checkEmbeddingHealth(provider) };
        }

        render(success("service status", data, vaultName), format);
      } catch (err) {
        renderCommandError("service status", err, format);
      }
    });
}

function buildPlist(intervalMinutes: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${CLI_ENTRY}</string>
    <string>sync</string>
  </array>
  <key>StartInterval</key>
  <integer>${intervalMinutes * 60}</integer>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${join(LOG_DIR, "sync.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(LOG_DIR, "sync.err.log")}</string>
</dict>
</plist>
`;
}

async function runLaunchctl(args: string[], options: { allowFailure?: boolean } = {}): Promise<void> {
  const child = Bun.spawn(["launchctl", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0 && !options.allowFailure) {
    const stderr = await new Response(child.stderr).text();
    throw new KnError(
      ErrorCode.UNKNOWN,
      `launchctl ${args[0]} failed (exit ${exitCode}): ${stderr.trim()}`,
    );
  }
  if (exitCode !== 0) {
    logger.debug(`launchctl ${args.join(" ")} exited ${exitCode} (ignored)`);
  }
}

function requireDarwin(): void {
  if (process.platform !== "darwin") {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      "Service registration currently supports macOS (launchd) only.",
    );
  }
}

function parsePositiveInt(raw: string, label: string): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new KnError(ErrorCode.CONFIG_INVALID, `${label} must be a positive integer.`);
  }
  return parsed;
}

function renderCommandError(command: string, err: unknown, format: OutputFormat): void {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
  render(error(command, code, msg), format);
  process.exit(err instanceof KnError ? err.exitCode : 1);
}
