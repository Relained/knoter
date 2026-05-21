import { Command } from "commander";
import { resolveVaultRoot, loadGlobalConfig } from "../core/config";
import { success, error, render, type OutputFormat } from "../core/output";
import { KnError, ErrorCode } from "../core/errors";
import { setVerbose, logger } from "../core/logger";
import { MetaDB } from "../stores/meta-store";
import { openVaultCollection } from "../stores/vec-store";
import { dbscan, type Point } from "../cluster/dbscan";
import { join } from "node:path";

export function registerClusterCommand(program: Command): void {
  program
    .command("cluster")
    .description("Analyze and manage note clusters")
    .option("--min-cluster <n>", "Minimum cluster size", "3")
    .option("--epsilon <f>", "DBSCAN epsilon (cosine distance threshold)", "0.25")
    .option("--tag <tag...>", "Filter by tags")
    .option("--suggest-merge", "Include merge suggestions in output")
    .option("--apply", "Write suggested tags back to vault")
    .action(async (options, cmd) => {
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

        const minCluster = parseInt(options.minCluster) || 3;
        const epsilon = parseFloat(options.epsilon) || 0.25;
        const tags = options.tag;

        const result = await performClustering(vaultRoot, vaultName, {
          minCluster,
          epsilon,
          tags,
          suggestMerge: options.suggestMerge,
          apply: options.apply,
        });

        const envelope = success("cluster", result, vaultName);
        render(envelope, format);
      } catch (err) {
        const fmt = (cmd.optsWithGlobals?.()?.format || "text") as OutputFormat;
        const msg = err instanceof Error ? err.message : String(err);
        const code = err instanceof KnError ? err.code : ErrorCode.UNKNOWN;
        render(error("cluster", code, msg), fmt);
        process.exit(err instanceof KnError ? err.exitCode : 1);
      }
    });
}

interface ClusterOptions {
  minCluster: number;
  epsilon: number;
  tags?: string[];
  suggestMerge?: boolean;
  apply?: boolean;
}

async function performClustering(
  vaultRoot: string,
  vaultName: string,
  opts: ClusterOptions
) {
  const metaDb = new MetaDB(vaultRoot);
  const collection = openVaultCollection(join(vaultRoot, ".kn", "vectors"), {});

  try {
    // Fetch all chunks for this vault
    const allNotes = metaDb.listNotes(vaultName, 10000, 0);
    const noteIds = allNotes.map((n) => n.id);

    if (noteIds.length === 0) {
      return {
        clusters: [],
        noiseCount: 0,
        message: "No notes found in vault",
      };
    }

    // Collect all chunk IDs across notes
    const chunkIds: string[] = [];
    const noteIdByChunkId = new Map<string, string>();

    for (const noteId of noteIds) {
      const chunks = metaDb.getChunksByNote(noteId);
      for (const chunk of chunks) {
        chunkIds.push(chunk.id);
        noteIdByChunkId.set(chunk.id, noteId);
      }
    }

    if (chunkIds.length === 0) {
      return {
        clusters: [],
        noiseCount: 0,
        message: "No chunks found in vault",
      };
    }

    // Fetch vectors for all chunks
    const points: Point[] = [];
    const chunkDataMap = new Map<string, any>();

    logger.debug(`Fetching ${chunkIds.length} chunks with vectors`);

    for (const chunkId of chunkIds) {
      try {
        const docs = collection.fetchSync(chunkId);
        if (docs && typeof docs === "object") {
          const doc = docs[chunkId];
          if (doc && doc.vectors) {
            const embedding = doc.vectors.embedding;
            if (embedding && Array.isArray(embedding)) {
              points.push({
                id: chunkId,
                vector: embedding as number[],
              });
              chunkDataMap.set(chunkId, doc);
            }
          }
        }
      } catch (e) {
        logger.debug(`Could not fetch chunk ${chunkId}: ${e}`);
      }
    }

    if (points.length === 0) {
      return {
        clusters: [],
        noiseCount: 0,
        message: "No vectors found for chunks",
      };
    }

    logger.info(`Clustering ${points.length} points with epsilon=${opts.epsilon}, minPoints=${opts.minCluster}`);

    // Run DBSCAN
    const clusterResult = dbscan(points, {
      epsilon: opts.epsilon,
      minPoints: opts.minCluster,
    });

    // Build output with sample chunks per cluster
    const outputClusters = clusterResult.clusters
      .filter((c) => c.memberIds.length >= opts.minCluster)
      .map((c) => {
        const sampleChunks: any[] = [];
        const notesInCluster = new Set<string>();

        // Collect up to 3 sample chunks and track distinct notes
        for (let i = 0; i < Math.min(3, c.memberIds.length); i++) {
          const chunkId = c.memberIds[i];
          if (!chunkId) continue;
          const chunk = metaDb.getChunk(chunkId);
          if (chunk) {
            sampleChunks.push({
              id: chunkId,
              content: chunk.content.substring(0, 100) + (chunk.content.length > 100 ? "..." : ""),
            });
            const noteId = noteIdByChunkId.get(chunkId);
            if (noteId) notesInCluster.add(noteId);
          }
        }

        // Build merge suggestion if requested
        let mergeSuggestion: string | undefined;
        if (opts.suggestMerge && notesInCluster.size >= 3) {
          mergeSuggestion = `Consider merging these ${notesInCluster.size} notes (cluster has ${c.memberIds.length} chunks)`;
        }

        return {
          id: c.id,
          size: c.memberIds.length,
          distinctNotes: notesInCluster.size,
          sampleChunks,
          mergeSuggestion,
        };
      });

    // Apply tags if requested
    if (opts.apply) {
      for (const cluster of clusterResult.clusters) {
        if (cluster.memberIds.length >= opts.minCluster) {
          const noteIds = new Set<string>();
          for (const chunkId of cluster.memberIds) {
            const noteId = noteIdByChunkId.get(chunkId);
            if (noteId) noteIds.add(noteId);
          }

          // Add cluster tag to each note
          const tagName = `cluster-${cluster.id}`;
          for (const noteId of noteIds) {
            metaDb.addTag(noteId, tagName, "auto");
          }
        }
      }
      logger.info(`Applied ${outputClusters.length} cluster tags`);
    }

    return {
      clusters: outputClusters,
      noiseCount: clusterResult.noise.length,
      totalProcessed: points.length,
      applied: opts.apply ? outputClusters.length : undefined,
    };
  } finally {
    metaDb.close();
  }
}
