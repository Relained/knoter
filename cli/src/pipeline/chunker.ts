export interface ChunkResult {
  content: string;
  heading: string | null;        // immediate heading above this chunk
  headingPath: string[];         // heading ancestry: ["# Intro", "## Setup"]
  seqIndex: number;              // 0-based position among chunks of same note
  offsetStart: number;           // character offset in source content
  offsetEnd: number;             // character offset end
  tokenCount: number;            // approximate token count
}

export interface ChunkerOptions {
  targetSize?: number;       // target chunk size in tokens (default: 512)
  overlapRatio?: number;     // overlap ratio (default: 0.15 = 15%)
  minSize?: number;          // minimum chunk size in tokens (default: 100)
}

interface BreakPoint {
  position: number;
  score: number;
  type: string;
}

interface HeadingEntry {
  level: number;
  text: string;
  position: number;
}

const DEFAULTS = {
  targetSize: 512,
  overlapRatio: 0.15,
  minSize: 100,
};

const CHARS_PER_TOKEN = 4;

/**
 * Detect the ratio of CJK characters in text.
 * CJK ranges:
 * - CJK Unified Ideographs: U+4E00–U+9FFF
 * - Hangul Syllables: U+AC00–U+D7AF
 * - Hiragana: U+3040–U+309F
 * - Katakana: U+30A0–U+30FF
 */
function detectCJKRatio(text: string): number {
  if (text.length === 0) return 0;

  let cjkCount = 0;
  let nonWhitespaceCount = 0;

  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    if (/\s/.test(char)) continue;
    nonWhitespaceCount++;

    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
      (code >= 0x20000 && code <= 0x2a6df) || // CJK Extension B
      (code >= 0x2a700 && code <= 0x2ebef) || // CJK Extensions C–F
      (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
      (code >= 0x3040 && code <= 0x309f) || // Hiragana
      (code >= 0x30a0 && code <= 0x30ff)    // Katakana
    ) {
      cjkCount++;
    }
  }

  return nonWhitespaceCount === 0 ? 0 : cjkCount / nonWhitespaceCount;
}

/**
 * Detect document language based on CJK character ratio.
 */
export function detectLanguage(text: string): "cjk" | "latin" | "mixed" {
  const ratio = detectCJKRatio(text);
  if (ratio > 0.5) return "cjk";
  if (ratio < 0.1) return "latin";
  return "mixed";
}

/**
 * Detect CJK locale heuristically based on character frequency.
 */
function detectCJKLocale(text: string): "ko" | "ja" | "zh" {
  let hangulCount = 0;
  let hiraganaCount = 0;
  let katakanaCount = 0;

  for (const char of text) {
    const code = char.codePointAt(0);
    if (!code) continue;

    if (code >= 0xac00 && code <= 0xd7af) {
      hangulCount++;
    } else if (code >= 0x3040 && code <= 0x309f) {
      hiraganaCount++;
    } else if (code >= 0x30a0 && code <= 0x30ff) {
      katakanaCount++;
    }
  }

  if (hangulCount > hiraganaCount && hangulCount > katakanaCount) {
    return "ko";
  }
  if (hiraganaCount + katakanaCount > hangulCount) {
    return "ja";
  }
  return "zh";
}

/**
 * Find sentence boundaries using Intl.Segmenter.
 * Returns array of character offsets marking the end of each sentence.
 */
function findSentenceBoundaries(text: string, locale: "ko" | "ja" | "zh" | "en" | "und"): number[] {
  const boundaries: number[] = [];

  try {
    const segmenter = new Intl.Segmenter(locale, { granularity: "sentence" });
    const segments = segmenter.segment(text);

    let offset = 0;
    for (const segment of segments) {
      offset += segment.segment.length;
      boundaries.push(offset);
    }
  } catch (err) {
    // If Intl.Segmenter fails, return empty array (fallback to no boundary boost)
  }

  return boundaries;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function findBreakPoints(content: string): BreakPoint[] {
  const breakPoints: BreakPoint[] = [];
  const lines = content.split("\n");
  let currentPosition = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLength = line.length + 1; // +1 for newline

    // Heading detection: /^(#{1,6})\s+(.+)$/
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const score = 100 - (level - 1) * 10; // 100, 90, 80, 70, 60, 50
      breakPoints.push({
        position: currentPosition,
        score,
        type: `heading-h${level}`,
      });
    }

    // Code fence boundary: /^```/
    if (line.match(/^```/)) {
      breakPoints.push({
        position: currentPosition,
        score: 80,
        type: "code-fence",
      });
    }

    // Horizontal rule: /^(---+|\*\*\*+|___+)\s*$/
    if (line.match(/^(---+|\*\*\*+|___+)\s*$/)) {
      breakPoints.push({
        position: currentPosition,
        score: 60,
        type: "horizontal-rule",
      });
    }

    // Blank line: /^\s*$/
    if (line.match(/^\s*$/)) {
      breakPoints.push({
        position: currentPosition,
        score: 20,
        type: "blank-line",
      });
    }

    // List item: /^(\s*[-*]|\s*\d+\.)\s/
    if (line.match(/^(\s*[-*]|\s*\d+\.)\s/)) {
      breakPoints.push({
        position: currentPosition,
        score: 5,
        type: "list-item",
      });
    }

    // Bare newline (always present between lines)
    if (i < lines.length - 1) {
      breakPoints.push({
        position: currentPosition + line.length,
        score: 1,
        type: "newline",
      });
    }

    currentPosition += lineLength;
  }

  return breakPoints;
}

function isInsideCodeFence(
  content: string,
  position: number,
  breakPoints: BreakPoint[]
): boolean {
  const codeFencePoints = breakPoints.filter((bp) => bp.type === "code-fence");

  let insideFence = false;
  for (const fence of codeFencePoints) {
    if (fence.position < position) {
      insideFence = !insideFence;
    } else {
      break;
    }
  }

  return insideFence;
}

function buildHeadingStack(
  content: string,
  upToPosition: number
): HeadingEntry[] {
  const headingRegex = /^(#{1,6})\s+(.+)$/gm;
  const stack: HeadingEntry[] = [];

  let match;
  while ((match = headingRegex.exec(content)) !== null) {
    const position = match.index;
    if (position >= upToPosition) {
      break;
    }

    const level = match[1].length;
    const text = match[2];

    // Pop all headings with level >= current level
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    stack.push({ level, text, position });
  }

  return stack;
}

function getHeadingPath(stack: HeadingEntry[]): string[] {
  return stack.map((h) => {
    const prefix = "#".repeat(h.level);
    return `${prefix} ${h.text}`;
  });
}

export function chunkDocument(
  content: string,
  options?: ChunkerOptions
): ChunkResult[] {
  const opts = {
    targetSize: options?.targetSize ?? DEFAULTS.targetSize,
    overlapRatio: options?.overlapRatio ?? DEFAULTS.overlapRatio,
    minSize: options?.minSize ?? DEFAULTS.minSize,
  };

  // Adjust chunk size for CJK content (high CJK ratio → smaller chunks)
  const cjkRatio = detectCJKRatio(content);
  let adjustedTargetSize = opts.targetSize;
  let adjustedMinSize = opts.minSize;
  if (cjkRatio > 0.3) {
    // For CJK-heavy content, reduce target to ~60% and min to ~60 tokens
    adjustedTargetSize = Math.round(opts.targetSize * 0.6);
    adjustedMinSize = Math.round(opts.minSize * 0.6);
    // Ensure minimum bounds
    adjustedMinSize = Math.max(adjustedMinSize, 30);
  }

  const targetSizeChars = adjustedTargetSize * CHARS_PER_TOKEN;
  const overlapChars = Math.round(adjustedTargetSize * opts.overlapRatio * CHARS_PER_TOKEN);
  const windowChars = 200 * CHARS_PER_TOKEN; // 800 chars

  // Step 1: Find all break points
  const allBreakPoints = findBreakPoints(content);

  // Step 2: Filter out break points inside code fences (use original list for fence detection)
  const breakPoints = allBreakPoints.filter((bp) => !isInsideCodeFence(content, bp.position, allBreakPoints));

  // Step 3: Detect sentence boundaries for CJK-heavy content
  const sentenceBoundaries = new Set<number>();
  if (cjkRatio > 0.3) {
    const locale = detectCJKLocale(content);
    const boundaries = findSentenceBoundaries(content, locale);
    for (const b of boundaries) {
      sentenceBoundaries.add(b);
    }
  }

  // Step 4: Chunking loop
  const chunks: Array<{
    content: string;
    offsetStart: number;
    offsetEnd: number;
    heading: string | null;
    headingPath: string[];
  }> = [];
  let position = 0;

  while (position < content.length) {
    const targetEnd = position + targetSizeChars;

    if (targetEnd >= content.length) {
      // Last chunk — take everything remaining
      const lastContent = content.substring(position);
      const stack = buildHeadingStack(content, position);
      const currentHeadingPath = getHeadingPath(stack);

      chunks.push({
        content: lastContent,
        offsetStart: position,
        offsetEnd: content.length,
        heading: stack.length > 0 ? stack[stack.length - 1].text : null,
        headingPath: currentHeadingPath,
      });
      break;
    }

    // Search window: [targetEnd - windowChars, targetEnd]
    const windowStart = Math.max(0, targetEnd - windowChars);

    // Find all break points in the window (must be after chunk start)
    const candidates = breakPoints.filter(
      (bp) => bp.position > position && bp.position >= windowStart && bp.position <= targetEnd
    );

    // Score with quadratic distance decay, with boost for sentence boundaries
    const scored = candidates.map((candidate) => {
      const distance = targetEnd - candidate.position;
      const decay = 1 - Math.pow(distance / windowChars, 2) * 0.7;
      let adjustedScore = candidate.score * decay;

      // Boost score if near a sentence boundary (CJK-aware)
      if (sentenceBoundaries.size > 0) {
        let nearBoundary = false;
        for (const boundary of sentenceBoundaries) {
          if (Math.abs(boundary - candidate.position) <= 10) {
            nearBoundary = true;
            break;
          }
        }
        if (nearBoundary) {
          adjustedScore += 3; // Add boost for sentence boundary alignment
        }
      }

      return { ...candidate, adjustedScore };
    });

    // Pick highest adjusted score
    let cutPosition = targetEnd;
    if (scored.length > 0) {
      const bestBreak = scored.sort((a, b) => b.adjustedScore - a.adjustedScore)[0];
      cutPosition = bestBreak.position;
    }

    // Ensure we make progress (don't go backwards or stay in place)
    if (cutPosition <= position) {
      cutPosition = Math.min(position + targetSizeChars, content.length);
    }

    // Emit chunk
    const chunkContent = content.substring(position, cutPosition);
    const stack = buildHeadingStack(content, position);
    const currentHeadingPath = getHeadingPath(stack);

    chunks.push({
      content: chunkContent,
      offsetStart: position,
      offsetEnd: cutPosition,
      heading: stack.length > 0 ? stack[stack.length - 1].text : null,
      headingPath: currentHeadingPath,
    });

    // Next position: cutPosition - overlapChars (for overlap)
    let nextPosition = cutPosition - overlapChars;
    nextPosition = Math.max(nextPosition, position + 1);

    position = nextPosition;
  }

  // Step 5: Minimum chunk merging
  const mergedChunks: Array<{
    content: string;
    offsetStart: number;
    offsetEnd: number;
    heading: string | null;
    headingPath: string[];
  }> = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const tokenCount = estimateTokens(chunk.content);

    if (tokenCount < adjustedMinSize) {
      if (i === 0 && chunks.length > 1) {
        // First chunk is too small — merge with next
        const nextChunk = chunks[i + 1];
        mergedChunks.push({
          content: chunk.content + nextChunk.content,
          offsetStart: chunk.offsetStart,
          offsetEnd: nextChunk.offsetEnd,
          heading: chunk.heading,
          headingPath: chunk.headingPath,
        });
        i++; // Skip the next chunk since we merged it
      } else if (i > 0) {
        // Merge with predecessor
        const lastChunk = mergedChunks[mergedChunks.length - 1];
        lastChunk.content += chunk.content;
        lastChunk.offsetEnd = chunk.offsetEnd;
      } else {
        // Single small chunk — keep it as is
        mergedChunks.push(chunk);
      }
    } else {
      mergedChunks.push(chunk);
    }
  }

  // Step 6: Build results
  const results: ChunkResult[] = mergedChunks.map((chunk, seqIndex) => ({
    content: chunk.content,
    heading: chunk.heading,
    headingPath: chunk.headingPath,
    seqIndex,
    offsetStart: chunk.offsetStart,
    offsetEnd: chunk.offsetEnd,
    tokenCount: estimateTokens(chunk.content),
  }));

  return results;
}
