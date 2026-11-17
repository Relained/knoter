import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import type { WikiDocument } from '@knoter/contracts';
import { routeHref } from '../routing/paths';

interface MarkdownNode {
  type: string;
  value?: string;
  url?: string;
  identifier?: string;
  children?: MarkdownNode[];
  /** Set on a link made from `[[...]]`, which is otherwise the same node as `[...](...)`. */
  data?: { wikiLink?: boolean };
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
            data: { wikiLink: true },
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

/**
 * How two notes are connected. A `word` link is the kind the glossary adds (D17): a
 * `[name](#/wiki/id)` link whose text is only a name of the page it opens. A `semantic`
 * link was written for its context: a `[[...]]` link, which is how the agent links pages,
 * a link worded differently from the page's name, or a related-note hint.
 */
export type LinkKind = 'semantic' | 'word';
export interface WikiEdge {
  source: string;
  target: string;
  kind: LinkKind;
  /** Whether the note's text links the target; false for a related-note hint alone. */
  inBody: boolean;
}
export interface WikiLinks {
  edges: WikiEdge[];
  unresolved: { source: string; target: string }[];
}
// Parse math like the reader so a [[a, b]] matrix is not counted as a link.
const processor = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkWikiLinks);
interface ParsedLink {
  target: string;
  /** The link's visible text, or null for a `[[...]]` link, which is never a word link. */
  text: string | null;
}
/**
 * Links by note, kept while a note's text is unchanged: snapshots arrive every few
 * seconds, and parsing every note again each time stalls a large wiki.
 */
const parsedLinks = new Map<string, { body: string; links: ParsedLink[] }>();
const textOf = (node: MarkdownNode): string =>
  node.value ?? node.children?.map(textOf).join('') ?? '';
function bodyLinks(doc: WikiDocument) {
  const cached = parsedLinks.get(doc.id);
  if (cached?.body === doc.body) return cached.links;
  const tree = processor.runSync(processor.parse(doc.body)) as MarkdownNode;
  const definitions = new Map<string, string>();
  const collect = (node: MarkdownNode) => {
    if (node.type === 'definition' && node.identifier && node.url)
      definitions.set(node.identifier, node.url);
    node.children?.forEach(collect);
  };
  collect(tree);
  const links: ParsedLink[] = [];
  const visit = (node: MarkdownNode) => {
    const target = internalTarget(
      node.type === 'linkReference'
        ? definitions.get(node.identifier || '')
        : node.type === 'link'
          ? node.url
          : undefined,
    );
    if (target) links.push({ target, text: node.data?.wikiLink ? null : textOf(node) });
    node.children?.forEach(visit);
  };
  visit(tree);
  parsedLinks.set(doc.id, { body: doc.body, links });
  return links;
}

// The service's glossary compares terms this way (`normalizeTerms` in its store).
const termKey = (text: string) =>
  text.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 40).toLocaleLowerCase();
/** The words that name a page in the glossary: its leaf title, the parts of "A (B)", and its terms. */
function pageNames(doc: WikiDocument) {
  const leaf = doc.title.split('/').at(-1)!.trim();
  const parts = /^(.*?)\s*\((.+)\)\s*$/.exec(leaf);
  return new Set([leaf, ...(parts ? [parts[1], parts[2]] : []), ...(doc.terms ?? [])].map(termKey));
}

export function buildWikiLinks(documents: WikiDocument[]): WikiLinks {
  const edges = new Map<string, WikiEdge>();
  const unresolved: WikiLinks['unresolved'] = [];
  const unresolvedKeys = new Set<string>();
  // The same lookup as `resolveDocument`, indexed once for every link in the wiki.
  const byId = new Map(documents.map((d) => [d.id, d]));
  const byTitle = new Map<string, WikiDocument[]>();
  for (const d of documents) {
    const key = normalize(d.title);
    const same = byTitle.get(key);
    if (same) same.push(d);
    else byTitle.set(key, [d]);
  }
  const resolve = (target: string) => {
    const exact = byId.get(target);
    if (exact) return exact;
    const matches = byTitle.get(normalize(target));
    return matches?.length === 1 ? matches[0] : undefined;
  };
  const names = new Map<string, Set<string>>();
  const namesOf = (doc: WikiDocument) => {
    let known = names.get(doc.id);
    if (!known) names.set(doc.id, (known = pageNames(doc)));
    return known;
  };
  // One edge per direction: any semantic connection between two notes outranks a word link.
  const connect = (source: string, target: string, kind: LinkKind, inBody: boolean) => {
    const key = `${source}:${target}`;
    const known = edges.get(key);
    edges.set(key, {
      source,
      target,
      kind: known?.kind === 'semantic' ? 'semantic' : kind,
      inBody: inBody || !!known?.inBody,
    });
  };
  for (const id of parsedLinks.keys()) if (!byId.has(id)) parsedLinks.delete(id);
  for (const doc of documents) {
    for (const target of doc.relatedIds)
      if (target !== doc.id && byId.has(target)) connect(doc.id, target, 'semantic', false);
    for (const link of bodyLinks(doc)) {
      const found = resolve(link.target);
      if (found && found.id !== doc.id) {
        const word = link.text !== null && namesOf(found).has(termKey(link.text));
        connect(doc.id, found.id, word ? 'word' : 'semantic', true);
      } else if (!found && !unresolvedKeys.has(`${doc.id}\n${link.target}`)) {
        unresolvedKeys.add(`${doc.id}\n${link.target}`);
        unresolved.push({ source: doc.id, target: link.target });
      }
    }
  }
  return { edges: [...edges.values()], unresolved };
}
