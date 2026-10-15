import type { Segment } from '@knoter/contracts/native';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { requireThat } from './common.js';

export function resolveWikiLinks(body: string, documents: { id: string; title: string }[]) {
  const root = fromMarkdown(body),
    edits: { start: number; end: number; text: string }[] = [];
  type Node = typeof root | (typeof root.children)[number];
  const normalize = (text: string) => text.normalize('NFKC').trim().toLowerCase();
  const visit = (node: Node) => {
    if (node.type === 'link' && node.position) {
      let target = node.url;
      if (target.startsWith('#/wiki/')) {
        try {
          target = decodeURIComponent(target.slice(7));
        } catch {
          return;
        }
      }
      const matches = documents.filter(
        (doc) => doc.id === target || normalize(doc.title) === normalize(target),
      );
      if (matches.length === 1) {
        const start = node.position.start.offset!,
          end = node.position.end.offset!;
        const raw = body.slice(start, end),
          closingLabel = raw.lastIndexOf('](');
        if (closingLabel >= 0)
          edits.push({
            start,
            end,
            text: `${raw.slice(0, closingLabel + 1)}(#/wiki/${matches[0].id})`,
          });
      }
      return;
    }
    if (
      ['code', 'inlineCode', 'link', 'linkReference', 'image', 'imageReference'].includes(node.type)
    )
      return;
    if (node.type === 'text' && node.position) {
      const start = node.position.start.offset!,
        end = node.position.end.offset!;
      const raw = body.slice(start, end);
      const text = raw.replace(/(?<!\\)\[\[([^\]\n]+)\]\]/g, (_all, inner: string) => {
        const [target, ...labels] = inner.split('|');
        const matches = documents.filter(
          (doc) => doc.id === target.trim() || normalize(doc.title) === normalize(target),
        );
        requireThat(
          matches.length === 1,
          'EVIDENCE',
          `Wiki link must name one active or proposed document: ${target}`,
        );
        return `[[${matches[0].id}|${labels.join('|').trim() || matches[0].title}]]`;
      });
      if (text !== raw) edits.push({ start, end, text });
    }
    if ('children' in node) node.children.forEach(visit);
  };
  visit(root);
  for (const edit of edits.sort((a, b) => b.start - a.start))
    body = body.slice(0, edit.start) + edit.text + body.slice(edit.end);
  return body;
}

// Korean particles that may follow a linked term: "스택은", "스택에서" still link "스택".
const PARTICLES =
  '(?:으로서|으로써|이라는|에서는|에게서|이라고|으로는|에서|에게|한테|까지|부터|보다|처럼|이나|이란|라는|라고|으로|이다|은|는|이|가|을|를|의|에|로|와|과|도|만|나|란|다|께)';
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Link the first unlinked mention of a term to a page. Headings, code, links, images, and
 * raw [[...]] links are skipped; a mention must stand as a word, optionally followed by a
 * Korean particle. Returns the body unchanged when the page already links the target or no
 * mention is found.
 */
export function insertWikiLink(body: string, mentions: string[], targetId: string) {
  if (body.includes(`#/wiki/${targetId}`) || body.includes(`[[${targetId}`)) return body;
  const patterns = mentions.map(
    (m) =>
      new RegExp(
        `(?<![\\p{L}\\p{N}_])(${escape(m)})(?=${PARTICLES}?(?![\\p{L}\\p{N}_]))`,
        'iu',
      ),
  );
  const root = fromMarkdown(body);
  type Node = typeof root | (typeof root.children)[number];
  let hit: { start: number; end: number; text: string } | undefined;
  const visit = (node: Node) => {
    if (hit) return;
    if (
      ['heading', 'code', 'inlineCode', 'link', 'linkReference', 'image', 'imageReference', 'definition', 'html'].includes(node.type)
    )
      return;
    if (node.type === 'text' && node.position) {
      const start = node.position.start.offset!,
        raw = body.slice(start, node.position.end.offset!);
      // Mask raw [[...]] wiki links so a term inside one is not linked twice.
      const masked = raw.replace(/\[\[[^\]\n]*\]\]/g, (m) => ' '.repeat(m.length));
      for (const pattern of patterns) {
        const m = pattern.exec(masked);
        if (m) {
          hit = { start: start + m.index, end: start + m.index + m[1].length, text: raw.slice(m.index, m.index + m[1].length) };
          return;
        }
      }
    }
    if ('children' in node) node.children.forEach(visit);
  };
  visit(root);
  if (!hit) return body;
  return `${body.slice(0, hit.start)}[${hit.text}](#/wiki/${targetId})${body.slice(hit.end)}`;
}

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
    result.length <= 2000,
    'LIMIT',
    'Markdown exceeds 2,000 evidence segments. Split the file.',
  );
  return result;
}
