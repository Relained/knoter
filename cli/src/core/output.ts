// Standard output envelope for consistent command responses

import ansis from "ansis";

export type OutputFormat = "text" | "json" | "jsonl";

export interface SuccessEnvelope<T = any> {
  ok: true;
  command: string;
  vault?: string;
  timestamp: string;
  data: T;
}

export interface ErrorEnvelope {
  ok: false;
  command: string;
  vault?: string;
  timestamp: string;
  error: {
    code: string;
    message: string;
  };
}

export type OutputEnvelope<T = any> = SuccessEnvelope<T> | ErrorEnvelope;

/**
 * Create a success output envelope
 */
export function success<T = any>(
  command: string,
  data: T,
  vault?: string
): SuccessEnvelope<T> {
  return {
    ok: true,
    command,
    vault,
    timestamp: new Date().toISOString(),
    data,
  };
}

/**
 * Create an error output envelope
 */
export function error(
  command: string,
  code: string,
  message: string,
  vault?: string
): ErrorEnvelope {
  return {
    ok: false,
    command,
    vault,
    timestamp: new Date().toISOString(),
    error: {
      code,
      message,
    },
  };
}

/**
 * Render envelope to stdout in the specified format
 */
export function render(envelope: OutputEnvelope, format: OutputFormat): void {
  let output: string;

  switch (format) {
    case "json":
      output = JSON.stringify(envelope, null, 2);
      break;

    case "jsonl":
      output = JSON.stringify(envelope);
      break;

    case "text":
      output = renderText(envelope);
      break;

    default:
      const _exhaustive: never = format;
      return _exhaustive;
  }

  console.log(output);
}

/**
 * Render envelope as human-readable text
 */
function renderText(envelope: OutputEnvelope): string {
  if (envelope.ok) {
    const lines: string[] = [];
    lines.push(ansis.green("✓ Success"));

    if (envelope.vault) {
      lines.push(`Vault: ${envelope.vault}`);
    }

    lines.push(`Command: ${envelope.command}`);
    lines.push(`Time: ${envelope.timestamp}`);

    if (envelope.data) {
      lines.push("");
      lines.push(JSON.stringify(envelope.data, null, 2));
    }

    return lines.join("\n");
  } else {
    const lines: string[] = [];
    lines.push(ansis.red("✗ Error"));

    if (envelope.vault) {
      lines.push(`Vault: ${envelope.vault}`);
    }

    lines.push(`Command: ${envelope.command}`);
    lines.push(`Code: ${envelope.error.code}`);
    lines.push(`Message: ${envelope.error.message}`);
    lines.push(`Time: ${envelope.timestamp}`);

    return lines.join("\n");
  }
}
