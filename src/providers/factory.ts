import { logger } from "../core/logger";
import type { VaultConfig } from "../core/config";
import type { EmbeddingProvider } from "../pipeline/embedder";
import type { LLMProvider } from "./ollama";
import { OllamaEmbeddingProvider, OllamaLLMProvider } from "./ollama";
import { OpenAIEmbeddingProvider, OpenAILLMProvider } from "./openai";

/**
 * Detect provider type from baseUrl pattern.
 * - localhost:11434 → ollama
 * - api.openai.com or other → openai (OpenAI-compatible)
 */
function detectProviderType(baseUrl?: string): "ollama" | "openai" {
  if (!baseUrl) return "ollama";
  if (baseUrl.includes("localhost:11434") || baseUrl.includes("127.0.0.1:11434")) {
    return "ollama";
  }
  return "openai";
}

export function createEmbeddingProvider(config: VaultConfig): EmbeddingProvider {
  const { baseUrl, apiKey, model } = config.embedding;
  const type = detectProviderType(baseUrl);

  logger.debug(`Creating ${type} embedding provider (model: ${model})`);

  if (type === "ollama") {
    return new OllamaEmbeddingProvider({ baseUrl, model });
  }
  return new OpenAIEmbeddingProvider({ baseUrl, apiKey, model });
}

export function createLLMProvider(config: VaultConfig): LLMProvider {
  const { baseUrl, apiKey, model } = config.llm;
  const type = detectProviderType(baseUrl);

  logger.debug(`Creating ${type} LLM provider (model: ${model || "default"})`);

  if (type === "ollama") {
    return new OllamaLLMProvider({ baseUrl, model });
  }
  return new OpenAILLMProvider({ baseUrl, apiKey, model });
}
