import { logger } from "../core/logger";

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  readonly name: string;
  readonly isLocal: boolean;
}

export interface EmbedderConfig {
  provider: EmbeddingProvider;
  fallback?: EmbeddingProvider;
  maxConcurrency?: number; // for non-local, default 4
  batchSize?: number; // for non-local, default 32
  maxRetries?: number; // default 3
  retryBaseMs?: number; // default 1000
}

export class Embedder {
  private provider: EmbeddingProvider;
  private fallback?: EmbeddingProvider;
  private maxConcurrency: number;
  private batchSize: number;
  private maxRetries: number;
  private retryBaseMs: number;

  constructor(config: EmbedderConfig) {
    this.provider = config.provider;
    this.fallback = config.fallback;
    this.maxConcurrency = config.maxConcurrency ?? 4;
    this.batchSize = config.batchSize ?? 32;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryBaseMs = config.retryBaseMs ?? 1000;
  }

  async embedAll(texts: string[]): Promise<number[][]> {
    try {
      return await this.embedWithProvider(this.provider, texts);
    } catch (err) {
      if (this.fallback) {
        logger.warn(
          `Primary provider "${this.provider.name}" failed, trying fallback "${this.fallback.name}"`
        );
        return await this.embedWithProvider(this.fallback, texts);
      }
      throw err;
    }
  }

  private async embedWithProvider(
    provider: EmbeddingProvider,
    texts: string[]
  ): Promise<number[][]> {
    if (provider.isLocal) {
      return this.embedSequential(provider, texts);
    }
    return this.embedConcurrent(provider, texts);
  }

  private async embedSequential(
    provider: EmbeddingProvider,
    texts: string[]
  ): Promise<number[][]> {
    const results: number[][] = [];
    for (const text of texts) {
      const [embedding] = await this.withRetry(() => provider.embed([text]));
      if (!embedding) {
        throw new Error("Embedding provider returned no embedding");
      }
      results.push(embedding);
    }
    return results;
  }

  private async embedConcurrent(
    provider: EmbeddingProvider,
    texts: string[]
  ): Promise<number[][]> {
    // Split into batches
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += this.batchSize) {
      batches.push(texts.slice(i, i + this.batchSize));
    }

    // Process batches in waves of maxConcurrency
    const results: number[][][] = [];
    for (let i = 0; i < batches.length; i += this.maxConcurrency) {
      const wave = batches.slice(i, i + this.maxConcurrency);
      const waveResults = await Promise.all(
        wave.map((batch) => this.withRetry(() => provider.embed(batch)))
      );
      results.push(...waveResults);
    }

    return results.flat();
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          const delay = this.retryBaseMs * Math.pow(2, attempt);
          logger.debug(`Retry ${attempt + 1}/${this.maxRetries} after ${delay}ms`);
          await Bun.sleep(delay);
        }
      }
    }
    throw lastError;
  }
}

/**
 * Format chunk with structural context for embedding.
 * "title: X | section: Y | text: content"
 */
export function formatForEmbedding(chunk: {
  docTitle?: string;
  headingPath?: string[];
  content: string;
}): string {
  const parts: string[] = [];
  if (chunk.docTitle) parts.push(`title: ${chunk.docTitle}`);
  if (chunk.headingPath?.length)
    parts.push(`section: ${chunk.headingPath.join(" > ")}`);
  parts.push(`text: ${chunk.content}`);
  return parts.join(" | ");
}
