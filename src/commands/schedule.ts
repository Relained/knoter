import { Command } from "commander";
import {
  enableSchedule,
  disableSchedule,
  scheduleStatus,
  runScheduleNow,
} from "../core/scheduler";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose, logger } from "../core/logger";

export function registerScheduleCommand(program: Command): void {
  const scheduleCmd = program
    .command("schedule")
    .description("Schedule periodic indexing jobs (enable, disable, status, run-now)");

  // kn schedule enable --interval <duration>
  scheduleCmd
    .command("enable")
    .option("--interval <duration>", "Schedule interval (e.g., 1h, 30m, 6h, 1d)", "1h")
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        const interval = options.interval || "1h";

        // Build command chain using the actual Bun + entrypoint the user invoked,
        // so scheduled runs don't depend on `kn` being on PATH.
        // Use single-quote shell escaping to avoid injection via $, backticks, etc.
        // POSIX: close the quote, insert an escaped literal quote, reopen.
        const shellQuote = (s: string) => `'${s.replace(/'/g, "'\\''")}'`;
        const runtime = Bun.argv[0] ?? "bun";
        const entry = Bun.argv[1] ?? "kn";
        const invoke = `${shellQuote(runtime)} ${shellQuote(entry)}`;
        const command = [
          "/bin/sh",
          "-c",
          `${invoke} sync --prune && ${invoke} tag auto && ${invoke} cluster --suggest-merge`,
        ];

        const state = await enableSchedule({
          interval,
          command,
        });

        logger.info(`Scheduler enabled with interval: ${interval}`);

        render(success("schedule enable", state), format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("schedule enable", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });

  // kn schedule disable
  scheduleCmd
    .command("disable")
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        const state = await disableSchedule();

        logger.info("Scheduler disabled");

        render(success("schedule disable", state), format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("schedule disable", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });

  // kn schedule status
  scheduleCmd
    .command("status")
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        const state = await scheduleStatus();

        render(success("schedule status", state), format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("schedule status", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });

  // kn schedule run-now
  scheduleCmd
    .command("run-now")
    .action(async (options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        const result = await runScheduleNow();

        const data = {
          exitCode: result.code,
          stdout: result.stdout,
          stderr: result.stderr,
        };

        logger.info(`Scheduler ran immediately with exit code: ${result.code}`);

        render(success("schedule run-now", data), format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("schedule run-now", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });
}
