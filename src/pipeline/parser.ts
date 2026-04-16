import matter from "gray-matter";
import { basename, extname } from "node:path";

export interface ParsedNote {
  title: string;
  tags: string[];
  frontmatter: Record<string, any>;
  content: string;
  rawContent: string;
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
  };
}
