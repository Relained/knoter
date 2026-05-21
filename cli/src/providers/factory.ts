import { logger } from "../core/logger";
import type { VaultConfig } from "../core/config";
import type { EmbeddingProvider } from "../pipeline/embedder";
import { OpenAIEmbeddingProvider } from "./openai";

export function createEmbeddingProvider(config: VaultConfig): EmbeddingProvider {
  const { baseUrl, apiKey, model, container } = config.embedding;
  logger.debug(`Creating OpenAI-compatible embedding provider (model: ${model})`);
  return new OpenAIEmbeddingProvider({ baseUrl, apiKey, model, container });
}
