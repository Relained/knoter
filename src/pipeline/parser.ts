import matter from "gray-matter";
import { basename, extname } from "node:path";

export interface ParsedNote {
  title: string;
  tags: string[];
  frontmatter: Record<string, any>;
  content: string;
  rawContent: string;
  docDate: string | null;
  layer: "source" | "rewritten" | "artifact";
  kind: string | null;
}

export function parseNote(content: string, filePath: string): ParsedNote {
  // 1. Extract YAML frontmatter using gray-matter
  const { data: frontmatter, content: bodyContent } = matter(content);

  // 2. Extract title with priority:
  //    a) frontmatter "title" or "name" field
  //    b) first # Heading in content
  //    c) first non-empty line
  //    d) filename stem (without extension)
  let title: string;

  if (frontmatter.title && typeof frontmatter.title === "string") {
    title = frontmatter.title;
  } else if (frontmatter.name && typeof frontmatter.name === "string") {
    title = frontmatter.name;
  } else {
    // Try to find first # heading in body content
    const headingMatch = bodyContent.match(/^#\s+(.+)$/m);
    if (headingMatch && headingMatch[1]) {
      title = headingMatch[1].trim();
    } else {
      // Try to find first non-empty line
      const lines = bodyContent.split("\n");
      const firstNonEmptyLine = lines.find((line) => line.trim().length > 0);
      if (firstNonEmptyLine) {
        title = firstNonEmptyLine.trim();
      } else {
        // Use filename stem as fallback
        title = basename(filePath, extname(filePath));
      }
    }
  }

  // 3. Extract tags:
  //    - frontmatter "tags" field (can be array or comma-separated string)
  //    - Return as string[]
  let tags: string[] = [];

  if (frontmatter.tags) {
    if (Array.isArray(frontmatter.tags)) {
      tags = frontmatter.tags
        .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
        .filter((tag) => tag.length > 0);
    } else if (typeof frontmatter.tags === "string") {
      tags = frontmatter.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    }
  }

  return {
    title,
    tags,
    frontmatter,
    content: bodyContent,
    rawContent: content,
    docDate: inferDocDate(frontmatter, filePath),
    layer: inferDocumentLayer(frontmatter, filePath),
    kind: inferExplicitKind(frontmatter),
  };
}

function inferDocDate(frontmatter: Record<string, any>, filePath: string): string | null {
  const fromFrontmatter = firstString(
    frontmatter.doc_date,
    frontmatter.docDate,
    frontmatter.date,
    frontmatter.created,
  );
  const normalizedFrontmatter = normalizeDateString(fromFrontmatter);
  if (normalizedFrontmatter) return normalizedFrontmatter;

  const pathDate = filePath.match(/(?:^|[^\d])(\d{4}-\d{2}-\d{2})(?:[^\d]|$)/);
  return pathDate?.[1] ?? null;
}

function inferDocumentLayer(
  frontmatter: Record<string, any>,
  filePath: string,
): "source" | "rewritten" | "artifact" {
  const raw = firstString(frontmatter.layer, frontmatter.documentLayer)?.toLowerCase();
  if (raw === "source" || raw === "rewritten" || raw === "artifact") return raw;

  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
  if (normalizedPath.startsWith("rewritten/")) return "rewritten";
  if (normalizedPath.startsWith("artifacts/")) return "artifact";
  if (normalizedPath.startsWith("sources/")) return "source";
  return "source";
}

function inferExplicitKind(frontmatter: Record<string, any>): string | null {
  return firstString(frontmatter.kind, frontmatter.type) ?? null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function normalizeDateString(input?: string): string | null {
  if (!input) return null;
  const dateOnly = input.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dateOnly?.[1]) return dateOnly[1];
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}
