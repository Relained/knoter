import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import type { WikiDocument } from '@knoter/contracts';
import { routeHref } from '../routing/paths';

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  identifier?: string;
  children?: MarkdownNode[];
}
const normalize = (text: string) => text.normalize('NFC').trim().toLocaleLowerCase();
export function resolveDocument(target: string, documents: WikiDocument[]) {
  const exact = documents.find((d) => d.id === target);
  if (exact) return exact;
  const matches = documents.filter((d) => normalize(d.title) === normalize(target));
  return matches.length === 1 ? matches[0] : undefined;
}
export const documentHref = (id: string) => routeHref({ view: 'wiki', documentId: id });
export const documentMarkdownLink = (doc: WikiDocument) =>
  `[${doc.title.replace(/[\\[\]]/g, '\\$&')}](${documentHref(doc.id)})`;
export function internalTarget(url?: string) {
  if (!url?.startsWith('#/wiki/')) return undefined;
  const target = url.slice('#/wiki/'.length);
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

// Transform only prose text nodes: code, images and existing Markdown links stay literal.
export function remarkWikiLinks() {
  return (tree: MarkdownNode) => {
    const walk = (node: MarkdownNode) => {
      if (
        !node.children ||
        ['link', 'linkReference', 'image', 'code', 'inlineCode'].includes(node.type)
      )
        return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text') {
          walk(child);
          return [child];
        }
        const text = child.value || '';
        const nodes: MarkdownNode[] = [];
        let cursor = 0;
        for (const match of text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
          const [target, ...alias] = match[1].split('|');
          if (!target.trim()) continue;
          nodes.push({ type: 'text', value: text.slice(cursor, match.index) });
          nodes.push({
            type: 'link',
            url: documentHref(target.trim()),
            children: [{ type: 'text', value: alias.join('|').trim() || target.trim() }],
          });
          cursor = match.index! + match[0].length;
        }
        nodes.push({ type: 'text', value: text.slice(cursor) });
        return nodes;
      });
    };
    walk(tree);
  };
}

export interface WikiEdge {
  source: string;
  target: string;
  kind: 'link' | 'related';
}
export interface WikiLinks {
  edges: WikiEdge[];
  unresolved: { source: string; target: string }[];
}
export function buildWikiLinks(documents: WikiDocument[]): WikiLinks {
  const edges = new Map<string, WikiEdge>();
  const unresolved: WikiLinks['unresolved'] = [];
  const processor = unified().use(remarkParse).use(remarkGfm).use(remarkWikiLinks);
  for (const doc of documents) {
    for (const target of doc.relatedIds) {
      if (target !== doc.id && documents.some((d) => d.id === target))
        edges.set(`${doc.id}:${target}`, { source: doc.id, target, kind: 'related' });
    }
    const tree = processor.runSync(processor.parse(doc.body)) as MarkdownNode;
    const definitions = new Map<string, string>();
    const collect = (node: MarkdownNode) => {
      if (node.type === 'definition' && node.identifier && node.url)
        definitions.set(node.identifier, node.url);
      node.children?.forEach(collect);
    };
    collect(tree);
    const visit = (node: MarkdownNode) => {
      const target = internalTarget(
        node.type === 'linkReference'
          ? definitions.get(node.identifier || '')
          : node.type === 'link'
            ? node.url
            : undefined,
      );
      if (target) {
        const found = resolveDocument(target, documents);
        if (found && found.id !== doc.id)
          edges.set(`${doc.id}:${found.id}`, { source: doc.id, target: found.id, kind: 'link' });
        else if (
          !found &&
          !unresolved.some((link) => link.source === doc.id && link.target === target)
        )
          unresolved.push({ source: doc.id, target });
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  }
  return { edges: [...edges.values()], unresolved };
}
