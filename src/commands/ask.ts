import { Command } from "commander";
import { search } from "../search/hybrid";
import { MetaDB, type ChunkRow } from "../stores/meta-store";
import { resolveVaultRoot, loadGlobalConfig, loadVaultConfig } from "../core/config";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose, logger } from "../core/logger";
import { hashContent } from "../pipeline/hasher";

// ─── Placeholder LLM Provider ────────────────────────────────────────────────

class PlaceholderLLMProvider {
  readonly name = "placeholder";

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    // Count context chunks from system prompt (rough estimate)
    const sourceCount = (systemPrompt.match(/\[Source:/g) || []).length;
    return `[Placeholder LLM Response]\n\nQuestion: ${userPrompt.substring(0, 100)}${userPrompt.length > 100 ? "..." : ""}\n\nThis is a placeholder response. Configure an LLM provider to get real answers.\nContext was provided from ${sourceCount} sources.`;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface ContextAssemblyResult {
  formattedContext: string;
  chunkIds: string[];
  sourceCount: number;
}

interface AskResult {
  question: string;
  answer: string;
  sources?: Array<{
    filePath: string;
    heading?: string | null;
    headingPath?: string | null;
    content: string;
  }>;
  cached: boolean;
  model: string;
  routing: string;
}

// ─── Exports ────────────────────────────────────────────────────────────────

export function registerAskCommand(program: Command): void {
  program
    .command("ask <question>")
    .description("Ask a question using RAG (search + context + LLM)")
    .option("--context-limit <n>", "Number of top results to use for context", "5")
    .option("--context-window <int>", "Number of neighbor chunks on each side", "1")
    .option("--model <name>", "LLM model to use", "default")
    .option("--routing <type>", "Routing strategy: auto, local, or cloud", "auto")
    .option("--show-sources", "Include source information in output")
    .option("--raw", "Output answer text only (no envelope)")
    .action(async (question, options, cmd) => {
      try {
        const globalOpts = cmd.optsWithGlobals?.() || {};
        const format = (globalOpts.format || "text") as OutputFormat;
        setVerbose(!!globalOpts.verbose);

        const vaultOpt = globalOpts.vault;
        const vaultRoot = await resolveVaultRoot(vaultOpt);
        let vaultName = vaultOpt;
        if (!vaultName) {
          const config = await loadGlobalConfig();
          vaultName = config.activeVault || "default";
        }

        const result = await executeAsk(
          vaultRoot,
          vaultName,
          question,
          {
            contextLimit: parseInt(options.contextLimit) || 5,
            contextWindow: parseInt(options.contextWindow) || 1,
            model: options.model || "default",
            routing: options.routing || "auto",
            showSources: !!options.showSources,
            raw: !!options.raw,
          }
        );

        // Handle raw output
        if (options.raw) {
          console.log(result.answer);
          return;
        }

        const envelope = success("ask", result, vaultName);
        render(envelope, format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("ask", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });
}

// ─── Main Ask Logic ─────────────────────────────────────────────────────────

async function executeAsk(
  vaultRoot: string,
  vaultId: string,
  question: string,
  options: {
    contextLimit: number;
    contextWindow: number;
    model: string;
    routing: string;
    showSources: boolean;
    raw: boolean;
  }
): Promise<AskResult> {
  const metaDb = new MetaDB(vaultRoot);

  try {
    logger.debug(`Ask: "${question}"`);

    // Load vault config to get model profile and max context
    const vaultConfig = await loadVaultConfig(vaultRoot);
    const modelProfile = vaultConfig.modelProfiles[options.model];
    const maxContextTokens = modelProfile?.maxContext ?? 4000;
    const reservedTokens = 500; // overhead for system prompt
    const availableTokens = Math.max(100, maxContextTokens - reservedTokens);

    logger.debug(`Model context budget: ${availableTokens} tokens (max: ${maxContextTokens}, reserved: ${reservedTokens})`);

    // Step 1: Retrieve via hybrid search
    logger.debug("Step 1: Searching for relevant chunks...");
    const searchResult = await search(vaultRoot, vaultId, question, {
      mode: "hybrid",
      top: options.contextLimit * 2, // Request 2x to have flexibility
      alpha: vaultConfig.search.fusionAlpha,
    });

    if (searchResult.results.length === 0) {
      logger.warn("No search results found");
      return {
        question,
        answer: "No relevant information found to answer the question.",
        cached: false,
        model: options.model,
        routing: options.routing,
      };
    }

    logger.debug(`Found ${searchResult.results.length} search results`);

    // Step 2: Expand context and assemble
    logger.debug("Step 2: Expanding context with neighbor chunks...");
    const contextResult = assembleContext(metaDb, vaultId, searchResult.results, options, availableTokens);
    logger.debug(`Assembled context from ${contextResult.sourceCount} sources`);

    // Step 3: Compute cache key
    const cacheInput = `${options.model}|${question}|${contextResult.chunkIds.sort().join(",")}`;
    const cacheKey = hashContent(cacheInput);
    logger.debug(`Cache key: ${cacheKey}`);

    // Step 4: Check LLM cache
    const cachedAnswer = metaDb.getLlmCache(cacheKey);
    if (cachedAnswer) {
      logger.debug("Cache hit!");
      return {
        question,
        answer: cachedAnswer,
        sources: options.showSources ? extractSources(searchResult.results) : undefined,
        cached: true,
        model: options.model,
        routing: options.routing,
      };
    }

    logger.debug("Cache miss, calling LLM...");

    // Step 5: Assemble prompts and call LLM
    const systemPrompt = `You are a helpful assistant answering questions based on provided context.\n\n${contextResult.formattedContext}`;
    const llmProvider = new PlaceholderLLMProvider();
    const answer = await llmProvider.generate(systemPrompt, question);

    // Step 6: Store in cache
    metaDb.setLlmCache(cacheKey, "ask", answer);
    logger.debug("Answer cached");

    return {
      question,
      answer,
      sources: options.showSources ? extractSources(searchResult.results) : undefined,
      cached: false,
      model: options.model,
      routing: options.routing,
    };
  } finally {
    metaDb.close();
  }
}

// ─── Context Assembly ───────────────────────────────────────────────────────

/**
 * Assemble context from search results with neighbor chunk expansion.
 * Respects token budget by dropping lowest-scored results first.
 */
function assembleContext(
  metaDb: MetaDB,
  vaultId: string,
  results: any[],
  options: {
    contextLimit: number;
    contextWindow: number;
  },
  tokenBudget: number
): ContextAssemblyResult {
  const contextBlocks: string[] = [];
  const chunkIds: string[] = [];
  let tokensUsed = 0;

  // Sort by score descending to process highest-scored results first
  const sortedResults = [...results].sort((a, b) => b.score - a.score);

  for (const result of sortedResults) {
    if (chunkIds.length >= options.contextLimit) {
      logger.debug(`Reached context limit of ${options.contextLimit}`);
      break;
    }

    // Expand context window
    const expandedContent = expandContextWindow(metaDb, result, options.contextWindow);
    const expandedChunkIds = expandedContent.chunkIds;

    // Estimate token count (rough: 1 token per 4 chars)
    const contentSize = expandedContent.content.length;
    const estimatedTokens = Math.ceil(contentSize / 4);

    if (tokensUsed + estimatedTokens > tokenBudget) {
      logger.debug(`Token budget exceeded (${tokensUsed} + ${estimatedTokens} > ${tokenBudget}), dropping result`);
      break;
    }

    // Get context description if registered
    const contextDescription = metaDb.getContextForPath(vaultId, result.filePath);
    const descriptionLine = contextDescription ? `\n${contextDescription}\n` : "";

    // Format result - parse headingPath if it's a JSON array
    let headingDisplay = result.heading;
    if (!headingDisplay && result.headingPath) {
      try {
        const parsed = JSON.parse(result.headingPath);
        if (Array.isArray(parsed)) {
          headingDisplay = parsed.join(" > ");
        } else {
          headingDisplay = result.headingPath;
        }
      } catch {
        headingDisplay = result.headingPath;
      }
    }
    const headingLine = headingDisplay ? `Section: ${headingDisplay}` : "";
    const sourceHeader = `[Source: ${result.filePath}${headingLine ? " | " + headingLine : ""}]`;

    const block = `${sourceHeader}${descriptionLine}\n${expandedContent.content}`;
    contextBlocks.push(block);

    for (const cid of expandedChunkIds) {
      if (!chunkIds.includes(cid)) {
        chunkIds.push(cid);
      }
    }

    tokensUsed += estimatedTokens;
    logger.debug(`Added context block (tokens: ${tokensUsed}/${tokenBudget})`);
  }

  if (chunkIds.length === 0) {
    logger.warn("No valid context blocks assembled");
    return {
      formattedContext: "",
      chunkIds: [],
      sourceCount: 0,
    };
  }

  return {
    formattedContext: contextBlocks.join("\n\n---\n\n"),
    chunkIds,
    sourceCount: contextBlocks.length,
  };
}

/**
 * Expand context for a single search result by following prev/next chunk links.
 */
function expandContextWindow(
  metaDb: MetaDB,
  result: any,
  windowSize: number
): { content: string; chunkIds: string[] } {
  const chunkIds: string[] = [result.chunkId];
  const chunks: ChunkRow[] = [];

  // Get the main chunk
  const mainChunk = metaDb.getChunk(result.chunkId);
  if (!mainChunk) {
    logger.warn(`Chunk ${result.chunkId} not found in database`);
    return { content: result.content, chunkIds };
  }

  chunks.push(mainChunk);

  // Expand backwards (prev_chunk_id)
  let prevId = mainChunk.prev_chunk_id;
  for (let i = 0; i < windowSize && prevId; i++) {
    const prevChunk = metaDb.getChunk(prevId);
    if (!prevChunk) break;
    chunks.unshift(prevChunk);
    chunkIds.unshift(prevId);
    prevId = prevChunk.prev_chunk_id;
  }

  // Expand forwards (next_chunk_id)
  let nextId = mainChunk.next_chunk_id;
  for (let i = 0; i < windowSize && nextId; i++) {
    const nextChunk = metaDb.getChunk(nextId);
    if (!nextChunk) break;
    chunks.push(nextChunk);
    chunkIds.push(nextId);
    nextId = nextChunk.next_chunk_id;
  }

  // Merge chunks into single content block
  const content = chunks.map(c => c.content).join("\n");

  logger.debug(`Expanded context from 1 to ${chunks.length} chunks`);

  return { content, chunkIds };
}

/**
 * Extract source information from search results for display.
 */
function extractSources(
  results: any[]
): Array<{
  filePath: string;
  heading?: string | null;
  headingPath?: string | null;
  content: string;
}> {
  return results.map(result => ({
    filePath: result.filePath,
    heading: result.heading || undefined,
    headingPath: result.headingPath || undefined,
    content: result.content.substring(0, 200) + (result.content.length > 200 ? "..." : ""),
  }));
}
