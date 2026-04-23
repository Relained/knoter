import { logger } from "./logger";
import type { ContainerSpec } from "../providers/types";

export function isConnectionError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  const cause = (err as { cause?: { code?: string } }).cause;
  return (
    cause?.code === "ECONNREFUSED" ||
    cause?.code === "ECONNRESET" ||
    msg.includes("ECONNREFUSED") ||
    msg.includes("Unable to connect") ||
    msg.includes("fetch failed")
  );
}

export async function tryStartContainer(spec: ContainerSpec): Promise<boolean> {
  const runtime = spec.runtime ?? "podman";
  logger.info(`Attempting ${runtime} start ${spec.name}`);
  try {
    const proc = Bun.spawn([runtime, "start", spec.name], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      logger.info(`Container ${spec.name} started`);
      return true;
    }
    const stderr = await new Response(proc.stderr).text();
    logger.warn(`${runtime} start ${spec.name} exited ${exitCode}: ${stderr.trim()}`);
    return false;
  } catch (err) {
    logger.warn(
      `Failed to invoke ${runtime}: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}

export async function waitForReady(
  url: string,
  timeoutMs = 30000,
  intervalMs = 500
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status === 404 || res.status === 405) return true;
    } catch {
      // not ready yet
    }
    await Bun.sleep(intervalMs);
  }
  return false;
}

/**
 * Wraps a fetch call with lazy container-start on connection failure.
 * If the first call fails with a connection error and a container spec is
 * provided, attempts to start the container once, waits for readiness, then
 * retries the call once.
 */
export async function fetchWithContainerRetry(
  input: string | URL | Request,
  init: RequestInit,
  container?: ContainerSpec
): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (err) {
    if (!container || !isConnectionError(err)) throw err;

    const started = await tryStartContainer(container);
    if (!started) throw err;

    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const origin = new URL(url).origin;
    const ready = await waitForReady(origin);
    if (!ready) {
      logger.warn(`Container ${container.name} did not become ready in time`);
    }
    return await fetch(input, init);
  }
}
