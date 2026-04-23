/**
 * Pure-JS DBSCAN implementation for clustering chunk embeddings.
 * Uses cosine distance metric (1 - cosine similarity).
 */

export interface Point {
  id: string;           // chunk id
  vector: number[];     // dense embedding
}

export interface ClusterResult {
  clusters: Array<{
    id: number;
    memberIds: string[];
    centroid: number[];
  }>;
  noise: string[];      // ids not assigned to any cluster
}

export interface DbscanOptions {
  epsilon?: number;     // cosine distance threshold (default 0.25)
  minPoints?: number;   // default 3
}

/**
 * Compute cosine similarity between two vectors.
 * Returns value in [-1, 1], where 1 = identical, 0 = orthogonal, -1 = opposite.
 */
function cosineSimilarity(v1: number[], v2: number[]): number {
  if (!v1 || !v2 || v1.length !== v2.length) return 0;
  if (v1.length === 0) return 0;

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < v1.length; i++) {
    const val1 = v1[i];
    const val2 = v2[i];
    if (val1 === undefined || val2 === undefined) return 0;
    dotProduct += val1 * val2;
    norm1 += val1 * val1;
    norm2 += val2 * val2;
  }

  const magnitudes = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (magnitudes === 0) return 0;

  return dotProduct / magnitudes;
}

/**
 * Compute cosine distance = 1 - cosine similarity.
 * Ranges from 0 (identical) to 2 (opposite).
 */
function cosineDistance(v1: number[], v2: number[]): number {
  return 1 - cosineSimilarity(v1, v2);
}

/**
 * Find all points within epsilon distance of a given point.
 * O(n) for each query.
 */
function regionQuery(
  points: Point[],
  centerIdx: number,
  epsilon: number
): number[] {
  const neighbors: number[] = [];
  const center = points[centerIdx];

  if (!center) return neighbors;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (!pt) continue;
    const dist = cosineDistance(center.vector, pt.vector);
    if (dist <= epsilon) {
      neighbors.push(i);
    }
  }

  return neighbors;
}

/**
 * Compute L2-normalized centroid of vectors.
 */
function computeCentroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];

  const first = vectors[0];
  if (!first) return [];

  const dim = first.length;
  const centroid = new Array(dim).fill(0);

  for (const vec of vectors) {
    if (!vec) continue;
    for (let i = 0; i < dim; i++) {
      const val = vec[i];
      if (val !== undefined) {
        centroid[i] += val;
      }
    }
  }

  for (let i = 0; i < dim; i++) {
    centroid[i] /= vectors.length;
  }

  // L2 normalize
  let norm = 0;
  for (const val of centroid) {
    norm += val * val;
  }
  norm = Math.sqrt(norm);

  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      centroid[i] /= norm;
    }
  }

  return centroid;
}

/**
 * DBSCAN clustering algorithm.
 * - epsilon: cosine distance threshold (default 0.25)
 * - minPoints: minimum points in a cluster (default 3)
 *
 * Returns clusters with IDs starting at 0, and separate noise array.
 */
export function dbscan(
  points: Point[],
  opts?: DbscanOptions
): ClusterResult {
  const epsilon = opts?.epsilon ?? 0.25;
  const minPoints = opts?.minPoints ?? 3;

  const n = points.length;
  const visited = new Array(n).fill(false);
  const clustered = new Array(n).fill(false);
  const clusters: Array<{ id: number; memberIndices: number[] }> = [];
  let clusterId = 0;

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;

    visited[i] = true;
    const neighbors = regionQuery(points, i, epsilon);

    // If not enough neighbors, mark as noise (unless later absorbed)
    if (neighbors.length < minPoints) {
      continue;
    }

    // Start new cluster
    const cluster: { id: number; memberIndices: number[] } = {
      id: clusterId++,
      memberIndices: [],
    };

    // Expand cluster via BFS
    const queue = [...neighbors];
    const queueSet = new Set(neighbors);

    while (queue.length > 0) {
      const idx = queue.shift()!;

      if (visited[idx]) {
        if (clustered[idx]) continue; // Already in a cluster
        visited[idx] = true;
      } else {
        visited[idx] = true;
      }

      if (!clustered[idx]) {
        clustered[idx] = true;
        cluster.memberIndices.push(idx);

        const ptNeighbors = regionQuery(points, idx, epsilon);
        if (ptNeighbors.length >= minPoints) {
          for (const neighbor of ptNeighbors) {
            if (!queueSet.has(neighbor)) {
              queue.push(neighbor);
              queueSet.add(neighbor);
            }
          }
        }
      }
    }

    clusters.push(cluster);
  }

  // Build result
  const noise: string[] = [];
  const result: ClusterResult = {
    clusters: [],
    noise,
  };

  for (const cluster of clusters) {
    const memberIds = cluster.memberIndices
      .map((idx) => points[idx])
      .filter((p): p is Point => p !== undefined)
      .map((p) => p.id);
    const vectors = cluster.memberIndices
      .map((idx) => points[idx])
      .filter((p): p is Point => p !== undefined)
      .map((p) => p.vector);
    const centroid = computeCentroid(vectors);

    result.clusters.push({
      id: cluster.id,
      memberIds,
      centroid,
    });
  }

  // Collect noise points
  for (let i = 0; i < n; i++) {
    const pt = points[i];
    if (pt && !clustered[i]) {
      noise.push(pt.id);
    }
  }

  return result;
}
