// Preprocessor subprocess runtime — manages long-lived tokenizer processes
// Protocol: line-based JSON over stdin/stdout
// Input: {"text": "..."}
// Output: {"tokens": "space separated tokens"} or {"text": "transformed text"}

import { logger } from "../core/logger";
import type { Subprocess } from "bun";

type PreprocessorProc = Subprocess<"pipe", "pipe", "pipe">;

/**
 * Manages a single long-lived preprocessor subprocess.
 * Spawns on first use, keeps alive across calls, handles serialization of concurrent requests.
 */
export class PreprocessorRunner {
  private command: string;
  private proc: PreprocessorProc | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private lineBuffer: string = "";
  private stderrBuffer: string = "";
  private poisoned: boolean = false;

  constructor(command: string) {
    this.command = command;
  }

  /**
   * Send text to the preprocessor and await the result.
   * Spawns the subprocess on first call; reuses it thereafter.
   * Serializes writes to prevent interleaving.
   */
  async process(text: string): Promise<string> {
    if (!this.proc) {
      this.#spawn();
    }

    return this.#sendAndReceive(text);
  }

  /**
   * Close the subprocess and clean up resources.
   */
  async close(): Promise<void> {
    if (this.proc) {
      try {
        // Wait for any pending writes
        await this.writeQueue;

        // Close stdin to signal EOF
        this.proc.stdin?.end?.();

        // Wait for the process to exit
        const exitCode = await this.proc.exited;
        logger.debug(`Preprocessor exited with code ${exitCode}`);
      } catch (err) {
        logger.warn(`Error closing preprocessor: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        this.proc = null;
      }
    }
  }

  /**
   * Spawn the subprocess.
   * Parses the command string on whitespace; accepts ["bin", "arg", ...] array form too.
   */
  #spawn(): void {
    const args = this.command.split(/\s+/).filter(Boolean);
    if (args.length === 0) {
      throw new Error("Preprocessor command is empty");
    }
    const bin = args[0]!;
    const procArgs = args.slice(1);

    logger.debug(`Spawning preprocessor: ${bin} ${procArgs.join(" ")}`);

    this.proc = Bun.spawn([bin, ...procArgs], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    }) as PreprocessorProc;

    if (!this.proc.stdout) {
      throw new Error("Failed to open preprocessor stdout");
    }

    this.#drainStderr();
  }

  /**
   * Continuously drain stderr into a buffer to prevent pipe-buffer deadlock
   * and to surface error output when the process dies.
   */
  async #drainStderr(): Promise<void> {
    const proc = this.proc;
    if (!proc || !proc.stderr) return;
    try {
      const decoder = new TextDecoder();
      for await (const chunk of proc.stderr) {
        this.stderrBuffer += decoder.decode(chunk);
        if (this.stderrBuffer.length > 16_384) {
          this.stderrBuffer = this.stderrBuffer.slice(-8_192);
        }
      }
    } catch {
      // stream may be closed abruptly — ignore
    }
  }

  /**
   * Send one JSON line to stdin and read one line back from stdout.
   * Serializes writes with an internal promise chain.
   */
  #sendAndReceive(text: string): Promise<string> {
    const result = this.writeQueue.then(async () => {
      if (this.poisoned) {
        const tail = this.stderrBuffer.slice(-512);
        throw new Error(
          `Preprocessor is in a failed state${tail ? `: ${tail.trim()}` : ""}`
        );
      }
      if (!this.proc || !this.proc.stdin || !this.proc.stdout) {
        throw new Error("Preprocessor not initialized");
      }

      const input = JSON.stringify({ text });

      try {
        await this.proc.stdin.write(new TextEncoder().encode(input + "\n"));
        return await this.#readLine();
      } catch (err) {
        // Mark the runner as poisoned so subsequent calls fail fast instead of
        // writing to a dead/corrupted subprocess.
        this.poisoned = true;
        const tail = this.stderrBuffer.slice(-512);
        const base = err instanceof Error ? err.message : String(err);
        throw new Error(tail ? `${base} (stderr: ${tail.trim()})` : base);
      }
    });

    // Keep the queue chain alive even when a call rejects, so ordering is
    // preserved and a single failure doesn't break the serialization of
    // subsequent attempts (they will see `poisoned` and fail deterministically).
    this.writeQueue = result.then(
      () => undefined,
      () => undefined
    );

    return result;
  }

  /**
   * Read one full line from stdout, handle JSON parsing, extract result.
   * Uses async iteration over the stdout stream.
   */
  async #readLine(): Promise<string> {
    if (!this.proc || !this.proc.stdout) {
      throw new Error("Preprocessor stdout not available");
    }

    // Check if we already have a complete line in the buffer
    const nlIdx = this.lineBuffer.indexOf("\n");
    if (nlIdx >= 0) {
      const line = this.lineBuffer.slice(0, nlIdx);
      this.lineBuffer = this.lineBuffer.slice(nlIdx + 1);
      return this.#parseLine(line);
    }

    // Read from stdout until we get a complete line
    for await (const chunk of this.proc.stdout) {
      const text = new TextDecoder().decode(chunk);
      this.lineBuffer += text;

      const nlIdx = this.lineBuffer.indexOf("\n");
      if (nlIdx >= 0) {
        const line = this.lineBuffer.slice(0, nlIdx);
        this.lineBuffer = this.lineBuffer.slice(nlIdx + 1);
        return this.#parseLine(line);
      }
    }

    throw new Error("Preprocessor closed unexpectedly");
  }

  /**
   * Parse a JSON line from the preprocessor response.
   */
  #parseLine(line: string): string {
    if (!line) {
      throw new Error("Preprocessor returned empty response");
    }

    try {
      const response = JSON.parse(line);
      return response.tokens ?? response.text ?? "";
    } catch (err) {
      throw new Error(
        `Preprocessor returned invalid JSON: ${line.slice(0, 100)}`
      );
    }
  }
}

/**
 * One-shot convenience function: spawn, send, read, close.
 * For FTS reindex where we batch many calls, prefer reusing a single PreprocessorRunner.
 */
export async function processWithPreprocessor(
  command: string,
  text: string
): Promise<string> {
  const runner = new PreprocessorRunner(command);
  try {
    return await runner.process(text);
  } finally {
    await runner.close();
  }
}
