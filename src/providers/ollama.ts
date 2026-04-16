import { logger } from "../core/logger";
import type { EmbeddingProvider } from "../pipeline/embedder";

export interface LLMProvider {
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
  readonly name: string;
  readonly isLocal: boolean;
}

export class OllamaEmbeddingProvider implements EmbeddingProvider {
  private baseUrl: string;
  private model: string;

  readonly name = "ollama";
  readonly isLocal = true;

  constructor(config?: { baseUrl?: string; model?: string }) {
    this.baseUrl = config?.baseUrl ?? "http://localhost:11434";
    this.model = config?.model ?? "nomic-embed-text";
  }

  async embed(texts: string[]): Promise<number[][]> {
    const url = `${this.baseUrl}/api/embed`;
    const body = {
      model: this.model,
      input: texts,
    };

    logger.debug(
      `Ollama embedding: ${texts.length} texts with model ${this.model}`
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama embedding API error ${response.status}: ${errorText}`
        );
      }

      const data = (await response.json()) as { embeddings: number[][] };
      return data.embeddings;
    } catch (err) {
      logger.error(
        `Ollama embedding failed: ${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
    }
  }
}

export class OllamaLLMProvider implements LLMProvider {
  private baseUrl: string;
  private model: string;

  readonly name = "ollama";
  readonly isLocal = true;

  constructor(config?: { baseUrl?: string; model?: string }) {
    this.baseUrl = config?.baseUrl ?? "http://localhost:11434";
    this.model = config?.model ?? "llama3";
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = `${this.baseUrl}/api/chat`;
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
    };

    logger.debug(`Ollama generation with model ${this.model}`);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Ollama chat API error ${response.status}: ${errorText}`
        );
      }

      const data = (await response.json()) as {
        message: { content: string };
      };
      return data.message.content;
    } catch (err) {
      logger.error(
        `Ollama generation failed: ${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
    }
  }
}
