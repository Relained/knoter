import type { Segment } from '@knoter/contracts/native';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { requireThat } from './common.js';

export function validateWikiMarkdown(body: string) {
  const root = fromMarkdown(body);
  type Node = typeof root | (typeof root.children)[number];
  const definitions = new Map<string, string>();
  const collect = (node: Node) => {
    if (node.type === 'definition' && !definitions.has(node.identifier))
      definitions.set(node.identifier, node.url);
    if ('children' in node) node.children.forEach(collect);
  };
  collect(root);
  const visit = (node: Node) => {
    requireThat(
      node.type !== 'html',
      'FORMAT',
      'Worker output contains raw HTML outside a code example.',
    );
    // Code and inlineCode are leaf nodes: their contents are inert examples.
    const url =
      'url' in node
        ? node.url
        : 'identifier' in node
          ? definitions.get(node.identifier)
          : undefined;
    if (url) {
      const normalized = url.replace(/[\u0000-\u0020\u007f]/g, '');
      requireThat(
        !/^(javascript|vbscript|data):/i.test(normalized),
        'FORMAT',
        'Worker output contains an unsafe URL.',
      );
      if (node.type === 'image' || node.type === 'imageReference')
        requireThat(
          !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(normalized),
          'FORMAT',
          'Worker output contains a remote image.',
        );
    }
    if ('children' in node) node.children.forEach(visit);
  };
  visit(root);
}

export function extract(bytes: Buffer): Segment[] {
  let decoded: string;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Markdown must be valid UTF-8.');
  }
  requireThat(!decoded.includes('\0'), 'FORMAT', 'Binary content is not Markdown.');
  const lines = decoded.replace(/\r\n?/g, '\n').split('\n');
  const result: Segment[] = [];
  let heading = '',
    start = 0,
    block: string[] = [];
  const flush = (end: number) => {
    if (block.join('\n').trim())
      result.push({
        id: `s${result.length + 1}`,
        heading,
        text: block.join('\n'),
        startLine: start + 1,
        endLine: end,
      });
    block = [];
  };
  for (let i = 0; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) {
      flush(i);
      heading = lines[i].replace(/^#+\s*/, '');
    }
    if (!block.length) start = i;
    block.push(lines[i]);
    if (!lines[i].trim() || block.join('\n').length > 5000) flush(i + 1);
  }
  flush(lines.length);
  requireThat(
    result.length <= 500,
    'LIMIT',
    'Markdown exceeds 500 evidence segments. Split the file.',
  );
  return result;
}
