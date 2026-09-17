import type { NoteLineage } from "../stores/meta-store";

export function extractLineageFromFrontmatter(frontmatter: Record<string, any>): NoteLineage {
  return {
    sourceNoteId: firstFrontmatterString(frontmatter.source_note_id, frontmatter.sourceNoteId),
    sourcePath: firstFrontmatterString(frontmatter.source_path, frontmatter.sourcePath),
    rewriteAgent: firstFrontmatterString(frontmatter.rewrite_agent, frontmatter.rewriteAgent),
    rewritePromptHash: firstFrontmatterString(frontmatter.rewrite_prompt_hash, frontmatter.rewritePromptHash),
    artifactTemplateId: firstFrontmatterString(frontmatter.artifact_template_id, frontmatter.artifactTemplateId),
  };
}

function firstFrontmatterString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}
