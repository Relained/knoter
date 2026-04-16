import { logger } from "../core/logger";
import type { EmbeddingProvider } from "../pipeline/embedder";
import type { LLMProvider } from "./ollama";

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  readonly name = "openai";
  readonly isLocal: boolean;

  constructor(config?: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  }) {
    this.baseUrl = config?.baseUrl ?? "https://api.openai.com";
    this.apiKey = config?.apiKey ?? "";
    this.model = config?.model ?? "text-embedding-3-small";
    this.isLocal = this.baseUrl.includes("localhost") || this.baseUrl.includes("127.0.0.1");
    if (!this.apiKey && !this.isLocal) {
      throw new Error("OpenAI API key is required for non-local embedding provider");
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const url = `${this.baseUrl}/v1/embeddings`;
    const body = {
      model: this.model,
      input: texts,
    };

    logger.debug(
      `OpenAI embedding: ${texts.length} texts with model ${this.model}`
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenAI embedding API error ${response.status}: ${errorText}`
        );
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };
      return data.data.map((d) => d.embedding);
    } catch (err) {
      logger.error(
        `OpenAI embedding failed: ${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
    }
  }
}

export class OpenAILLMProvider implements LLMProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  readonly name = "openai";
  readonly isLocal: boolean;

  constructor(config?: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  }) {
    this.baseUrl = config?.baseUrl ?? "https://api.openai.com";
    this.apiKey = config?.apiKey ?? "";
    this.model = config?.model ?? "gpt-4o-mini";
    this.isLocal = this.baseUrl.includes("localhost") || this.baseUrl.includes("127.0.0.1");
    if (!this.apiKey && !this.isLocal) {
      throw new Error("OpenAI API key is required for non-local LLM provider");
    }
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const body = {
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };

    logger.debug(`OpenAI generation with model ${this.model}`);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenAI chat API error ${response.status}: ${errorText}`
        );
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };
      const choice = data.choices[0];
      if (!choice) throw new Error("OpenAI API returned empty choices array");
      return choice.message.content;
    } catch (err) {
      logger.error(
        `OpenAI generation failed: ${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
    }
  }
}
