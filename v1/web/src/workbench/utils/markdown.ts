import { marked } from "marked";

export function markdownToHtml(markdown: string): string {
  const body = stripFrontmatter(markdown);
  return marked.parse(body, { async: false, gfm: true, breaks: true });
}

export function stripFrontmatter(markdown: string): string {
  const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? markdown.slice(match[0].length) : markdown;
}
