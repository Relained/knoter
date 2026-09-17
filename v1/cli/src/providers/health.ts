import { logger } from "../core/logger";
import type { EmbeddingProvider } from "../pipeline/embedder";
import type { HealthStatus } from "./types";

export async function checkEmbeddingHealth(provider: EmbeddingProvider): Promise<HealthStatus> {
  const startTime = performance.now();
  try {
    logger.debug(`Checking health of embedding provider: ${provider.name}`);
    await provider.embed(["ping"]);
    const latencyMs = Math.round(performance.now() - startTime);
    logger.debug(`Embedding provider health check passed (${latencyMs}ms)`);
    return { ok: true, provider: provider.name, kind: "embedding", latencyMs };
  } catch (err) {
    const latencyMs = Math.round(performance.now() - startTime);
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Embedding provider health check failed: ${message}`);
    return { ok: false, provider: provider.name, kind: "embedding", message, latencyMs };
  }
}
