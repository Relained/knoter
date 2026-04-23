// OS scheduler abstraction for systemd (Linux) and launchd (macOS)

import { join } from "node:path";
import { homedir, platform } from "node:os";
import { mkdirSync, unlinkSync } from "node:fs";
import { KnError, ErrorCode } from "./errors";
import { logger } from "./logger";

const KN_DIR = join(homedir(), ".kn");
const SCHEDULE_STATE_PATH = join(KN_DIR, "schedule.json");

export interface ScheduleSpec {
  interval: string;   // e.g., "1h", "30m", "6h", "1d"
  command: string[];  // ["kn", "sync", "--prune"] or shell command as array
  vaultName?: string; // optional, for log labeling
}

export interface ScheduleState {
  enabled: boolean;
  platform: "linux" | "macos" | "other";
  interval: string | null;
  lastRun?: string | null;    // ISO timestamp, best-effort via systemctl/launchctl
  nextRun?: string | null;    // ISO timestamp, best-effort
}

/**
 * Parse interval string to seconds
 * Supports: s (seconds), m (minutes), h (hours), d (days)
 */
function parseInterval(interval: string): number {
  const match = interval.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      `Invalid interval: "${interval}". Use format like "1h", "30m", "1d"`
    );
  }

  const value = parseInt(match[1]!, 10);
  const unit = match[2]!;

  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    case "d":
      return value * 86400;
    default:
      throw new KnError(ErrorCode.CONFIG_INVALID, `Unknown time unit: ${unit}`);
  }
}

/**
 * Load schedule state from disk
 */
async function loadScheduleState(): Promise<{
  enabled: boolean;
  interval: string | null;
  installedAt: string | null;
  command: string[];
  vaultName?: string;
} | null> {
  try {
    const file = Bun.file(SCHEDULE_STATE_PATH);
    const exists = await file.exists();
    if (!exists) {
      return null;
    }
    const content = await file.text();
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Save schedule state to disk
 */
async function saveScheduleState(state: {
  enabled: boolean;
  interval: string | null;
  installedAt: string | null;
  command: string[];
  vaultName?: string;
}): Promise<void> {
  try {
    mkdirSync(KN_DIR, { recursive: true });
    await Bun.write(SCHEDULE_STATE_PATH, JSON.stringify(state, null, 2));
  } catch (e) {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      `Failed to save schedule state: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

/**
 * Get the current platform
 */
function getPlatform(): "linux" | "macos" | "other" {
  const p = platform();
  if (p === "linux") return "linux";
  if (p === "darwin") return "macos";
  return "other";
}

/**
 * Format command array to shell command string
 */
function formatCommand(command: string[]): string {
  return command.map(c => (c.includes(" ") ? `"${c}"` : c)).join(" ");
}

/**
 * Linux (systemd) scheduler implementation
 */
namespace LinuxScheduler {
  const SYSTEMD_USER_DIR = join(homedir(), ".config", "systemd", "user");
  const SERVICE_FILE = join(SYSTEMD_USER_DIR, "kn-scheduler.service");
  const TIMER_FILE = join(SYSTEMD_USER_DIR, "kn-scheduler.timer");

  export async function enable(spec: ScheduleSpec): Promise<ScheduleState> {
    const intervalSec = parseInterval(spec.interval);
    const cmdStr = formatCommand(spec.command);

    // Create systemd unit files
    const serviceContent = `[Unit]
Description=kn scheduled indexing
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/sh -c "${cmdStr}"
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
`;

    const timerContent = `[Unit]
Description=kn scheduler timer
Requires=kn-scheduler.service

[Timer]
OnBootSec=30s
OnUnitActiveSec=${intervalSec}s
Persistent=true

[Install]
WantedBy=timers.target
`;

    try {
      // Ensure systemd user directory exists
      mkdirSync(SYSTEMD_USER_DIR, { recursive: true });

      // Write service file
      await Bun.write(SERVICE_FILE, serviceContent);
      logger.debug(`Wrote systemd service: ${SERVICE_FILE}`);

      // Write timer file
      await Bun.write(TIMER_FILE, timerContent);
      logger.debug(`Wrote systemd timer: ${TIMER_FILE}`);

      // Reload systemd
      const reloadProc = Bun.spawn(["systemctl", "--user", "daemon-reload"]);
      const reloadCode = await reloadProc.exited;

      if (reloadCode !== 0) {
        throw new KnError(
          ErrorCode.CONFIG_INVALID,
          `systemctl daemon-reload failed with exit code ${reloadCode}`
        );
      }

      // Enable and start timer
      const enableProc = Bun.spawn(["systemctl", "--user", "enable", "--now", "kn-scheduler.timer"]);
      const enableCode = await enableProc.exited;

      if (enableCode !== 0) {
        throw new KnError(
          ErrorCode.CONFIG_INVALID,
          `systemctl enable failed with exit code ${enableCode}`
        );
      }

      logger.info("Scheduler enabled via systemd");

      return {
        enabled: true,
        platform: "linux",
        interval: spec.interval,
        lastRun: null,
        nextRun: null,
      };
    } catch (e) {
      if (e instanceof KnError) throw e;
      throw new KnError(
        ErrorCode.CONFIG_INVALID,
        `Failed to enable scheduler: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  export async function disable(): Promise<ScheduleState> {
    try {
      // Disable and stop timer
      const disableProc = Bun.spawn(["systemctl", "--user", "disable", "--now", "kn-scheduler.timer"]);
      const disableCode = await disableProc.exited;

      if (disableCode !== 0) {
        logger.warn(`systemctl disable exited with code ${disableCode}, continuing`);
      }

      // Remove service file
      try {
        unlinkSync(SERVICE_FILE);
        logger.debug(`Removed ${SERVICE_FILE}`);
      } catch {
        // File may not exist
      }

      // Remove timer file
      try {
        unlinkSync(TIMER_FILE);
        logger.debug(`Removed ${TIMER_FILE}`);
      } catch {
        // File may not exist
      }

      // Reload systemd
      const reloadProc = Bun.spawn(["systemctl", "--user", "daemon-reload"]);
      await reloadProc.exited;

      logger.info("Scheduler disabled via systemd");

      return {
        enabled: false,
        platform: "linux",
        interval: null,
        lastRun: null,
        nextRun: null,
      };
    } catch (e) {
      if (e instanceof KnError) throw e;
      throw new KnError(
        ErrorCode.CONFIG_INVALID,
        `Failed to disable scheduler: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  export async function status(): Promise<{ lastRun?: string; nextRun?: string }> {
    try {
      const proc = Bun.spawn([
        "systemctl",
        "--user",
        "show",
        "kn-scheduler.timer",
        "--property=ActiveState,LastTriggerUSec,NextElapseUSecRealtime",
      ]);

      const stdout = await new Response(proc.stdout).text();
      const code = await proc.exited;

      if (code !== 0 || !stdout.trim()) {
        return {};
      }

      const result: { lastRun?: string; nextRun?: string } = {};

      // Parse systemd properties
      const lines = stdout.trim().split("\n");
      for (const line of lines) {
        const [key, value] = line.split("=");
        if (!key || !value) continue;

        if (key === "LastTriggerUSec" && value !== "0") {
          const ms = parseInt(value, 10) / 1000;
          if (Number.isFinite(ms) && ms > 0) {
            result.lastRun = new Date(ms).toISOString();
          }
        } else if (key === "NextElapseUSecRealtime" && value !== "0") {
          const ms = parseInt(value, 10) / 1000;
          if (Number.isFinite(ms) && ms > 0) {
            result.nextRun = new Date(ms).toISOString();
          }
        }
      }

      return result;
    } catch (e) {
      logger.warn(`Failed to get systemd status: ${e instanceof Error ? e.message : String(e)}`);
      return {};
    }
  }

  export async function runNow(): Promise<{ stdout: string; stderr: string; code: number }> {
    try {
      const proc = Bun.spawn(["systemctl", "--user", "start", "kn-scheduler.service"]);
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const code = await proc.exited;

      return { stdout, stderr, code };
    } catch (e) {
      throw new KnError(
        ErrorCode.CONFIG_INVALID,
        `Failed to run scheduler: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
}

/**
 * macOS (launchd) scheduler implementation
 */
namespace MacOSScheduler {
  const LAUNCH_AGENT_DIR = join(homedir(), "Library", "LaunchAgents");
  const PLIST_FILE = join(LAUNCH_AGENT_DIR, "com.kn.scheduler.plist");
  const LABEL = "com.kn.scheduler";

  function arrayToPlist(arr: string[]): string {
    const escaped = arr
      .map(s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"))
      .map(s => `<string>${s}</string>`);
    return `<array>\n${escaped.map(s => `    ${s}`).join("\n")}\n</array>`;
  }

  export async function enable(spec: ScheduleSpec): Promise<ScheduleState> {
    const intervalSec = parseInterval(spec.interval);

    // Build launchd plist (XML format)
    const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LABEL}</string>
    <key>ProgramArguments</key>
    ${arrayToPlist(spec.command)}
    <key>StartInterval</key>
    <integer>${intervalSec}</integer>
    <key>StandardOutPath</key>
    <string>${join(homedir(), ".kn", "scheduler.log")}</string>
    <key>StandardErrorPath</key>
    <string>${join(homedir(), ".kn", "scheduler.err")}</string>
</dict>
</plist>`;

    try {
      mkdirSync(LAUNCH_AGENT_DIR, { recursive: true });
      await Bun.write(PLIST_FILE, plistContent);
      logger.debug(`Wrote launchd plist: ${PLIST_FILE}`);

      // Load plist
      const proc = Bun.spawn(["launchctl", "load", PLIST_FILE]);
      const code = await proc.exited;

      if (code !== 0) {
        throw new KnError(
          ErrorCode.CONFIG_INVALID,
          `launchctl load failed with exit code ${code}`
        );
      }

      logger.info("Scheduler enabled via launchd");

      return {
        enabled: true,
        platform: "macos",
        interval: spec.interval,
        lastRun: null,
        nextRun: null,
      };
    } catch (e) {
      if (e instanceof KnError) throw e;
      throw new KnError(
        ErrorCode.CONFIG_INVALID,
        `Failed to enable scheduler: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  export async function disable(): Promise<ScheduleState> {
    try {
      // Unload plist
      const proc = Bun.spawn(["launchctl", "unload", PLIST_FILE]);
      const code = await proc.exited;

      if (code !== 0) {
        logger.warn(`launchctl unload exited with code ${code}, continuing`);
      }

      // Remove plist file
      try {
        unlinkSync(PLIST_FILE);
        logger.debug(`Removed ${PLIST_FILE}`);
      } catch {
        // File may not exist
      }

      logger.info("Scheduler disabled via launchd");

      return {
        enabled: false,
        platform: "macos",
        interval: null,
        lastRun: null,
        nextRun: null,
      };
    } catch (e) {
      if (e instanceof KnError) throw e;
      throw new KnError(
        ErrorCode.CONFIG_INVALID,
        `Failed to disable scheduler: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  export async function status(): Promise<{ lastRun?: string; nextRun?: string }> {
    try {
      const proc = Bun.spawn(["launchctl", "list", LABEL]);
      const stdout = await new Response(proc.stdout).text();
      const code = await proc.exited;

      if (code !== 0 || !stdout.trim()) {
        return {};
      }

      // launchctl list output is not easily parseable for time info
      // For now, just return empty (best-effort)
      return {};
    } catch (e) {
      logger.warn(`Failed to get launchd status: ${e instanceof Error ? e.message : String(e)}`);
      return {};
    }
  }

  export async function runNow(): Promise<{ stdout: string; stderr: string; code: number }> {
    try {
      const proc = Bun.spawn(["launchctl", "start", LABEL]);
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      const code = await proc.exited;

      return { stdout, stderr, code };
    } catch (e) {
      throw new KnError(
        ErrorCode.CONFIG_INVALID,
        `Failed to run scheduler: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }
}

/**
 * Enable scheduled job
 */
export async function enableSchedule(spec: ScheduleSpec): Promise<ScheduleState> {
  const p = getPlatform();

  if (p === "other") {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      "Scheduled jobs are supported on Linux (systemd) and macOS (launchd) only"
    );
  }

  // Check if already enabled, disable first
  const existingState = await loadScheduleState();
  if (existingState?.enabled) {
    logger.warn("Scheduler already enabled, disabling first");
    await (p === "linux" ? LinuxScheduler.disable() : MacOSScheduler.disable());
  }

  let state: ScheduleState;

  if (p === "linux") {
    state = await LinuxScheduler.enable(spec);
  } else {
    state = await MacOSScheduler.enable(spec);
  }

  // Save state
  await saveScheduleState({
    enabled: true,
    interval: spec.interval,
    installedAt: new Date().toISOString(),
    command: spec.command,
    vaultName: spec.vaultName,
  });

  return state;
}

/**
 * Disable scheduled job
 */
export async function disableSchedule(): Promise<ScheduleState> {
  const p = getPlatform();

  if (p === "other") {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      "Scheduled jobs are supported on Linux (systemd) and macOS (launchd) only"
    );
  }

  let state: ScheduleState;

  if (p === "linux") {
    state = await LinuxScheduler.disable();
  } else {
    state = await MacOSScheduler.disable();
  }

  // Clear state file
  await saveScheduleState({
    enabled: false,
    interval: null,
    installedAt: null,
    command: [],
  });

  return state;
}

/**
 * Get schedule status
 */
export async function scheduleStatus(): Promise<ScheduleState> {
  const p = getPlatform();
  const savedState = await loadScheduleState();

  if (p === "other") {
    return {
      enabled: false,
      platform: "other",
      interval: savedState?.interval || null,
    };
  }

  const platformStatus =
    p === "linux"
      ? await LinuxScheduler.status()
      : await MacOSScheduler.status();

  return {
    enabled: savedState?.enabled || false,
    platform: p,
    interval: savedState?.interval || null,
    lastRun: platformStatus.lastRun,
    nextRun: platformStatus.nextRun,
  };
}

/**
 * Run scheduled job immediately
 */
export async function runScheduleNow(): Promise<{ stdout: string; stderr: string; code: number }> {
  const p = getPlatform();

  if (p === "other") {
    throw new KnError(
      ErrorCode.CONFIG_INVALID,
      "Scheduled jobs are supported on Linux (systemd) and macOS (launchd) only"
    );
  }

  if (p === "linux") {
    return await LinuxScheduler.runNow();
  } else {
    return await MacOSScheduler.runNow();
  }
}
