import { logger } from "../core/logger";
import { fetchWithContainerRetry } from "../core/container";
import type { EmbeddingProvider } from "../pipeline/embedder";
import type { ContainerSpec } from "./types";

function isLocalUrl(url: string): boolean {
  return url.includes("localhost") || url.includes("127.0.0.1");
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private container?: ContainerSpec;

  readonly name = "openai";
  readonly isLocal: boolean;

  constructor(config?: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
    container?: ContainerSpec;
  }) {
    this.baseUrl = config?.baseUrl ?? "https://api.openai.com";
    this.apiKey = config?.apiKey ?? "";
    this.model = config?.model ?? "text-embedding-3-small";
    this.isLocal = isLocalUrl(this.baseUrl);
    this.container = config?.container;
    if (!this.apiKey && !this.isLocal) {
      throw new Error("OpenAI API key is required for non-local embedding provider");
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const url = `${this.baseUrl}/v1/embeddings`;
    const body = { model: this.model, input: texts };

    logger.debug(`OpenAI embedding: ${texts.length} texts with model ${this.model}`);

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

      const response = await fetchWithContainerRetry(
        url,
        { method: "POST", headers, body: JSON.stringify(body) },
        this.isLocal ? this.container : undefined
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI embedding API error ${response.status}: ${errorText}`);
      }

      const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
      return data.data.map((d) => d.embedding);
    } catch (err) {
      logger.error(
        `OpenAI embedding failed: ${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
    }
  }
}

