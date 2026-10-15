import type { WikiDocument } from '@knoter/contracts';

export function exportMarkdown(doc: WikiDocument) {
  const markdown = `---\nid: ${doc.id}\ntitle: ${JSON.stringify(doc.title)}\nkind: llm-wiki\nrevision: ${doc.revision}\n---\n\n# ${doc.title}\n\n${doc.body}\n`;
  const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${doc.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'note'}.md`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
