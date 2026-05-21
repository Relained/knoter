// Logging wrapper around consola

import { consola } from "consola";

let verboseMode = false;

export const logger = {
  debug: (message: string, ...args: any[]) => {
    if (verboseMode) {
      consola.debug(message, ...args);
    }
  },

  info: (message: string, ...args: any[]) => {
    if (verboseMode) {
      consola.info(message, ...args);
    }
  },

  warn: (message: string, ...args: any[]) => {
    consola.warn(message, ...args);
  },

  error: (message: string, ...args: any[]) => {
    consola.error(message, ...args);
  },

  log: (message: string, ...args: any[]) => {
    if (verboseMode) {
      consola.log(message, ...args);
    }
  },
};

export function setVerbose(enabled: boolean): void {
  verboseMode = enabled;
}

export function getVerbose(): boolean {
  return verboseMode;
}

/**
 * Force all log output (including warn/error) onto stderr.
 * Used by stdio-transport commands (e.g. `kn mcp --transport stdio`) so that
 * stdout is reserved exclusively for protocol framing.
 */
export function redirectLogsToStderr(): void {
  consola.setReporters([
    {
      log: (logObj) => {
        const msg =
          (logObj.args ?? []).map((a: unknown) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
        process.stderr.write(`[${logObj.type}] ${msg}\n`);
      },
    },
  ]);
}
