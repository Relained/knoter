import { lookup, type LookupAddress } from 'node:dns';
import { isIP } from 'node:net';
import { request } from 'node:https';
import type { IncomingHttpHeaders } from 'node:http';
import { fromHtml } from 'hast-util-from-html';
import type { ReferenceEvidence } from '@knoter/contracts/native';
import { extract } from './markdown.js';
import { AppError, now, requireThat, sha, uuid } from './common.js';

// Supplement references: an https page, a Wikipedia article, or an MDN page. The service
// fetches them, never the model; only the model-chosen target leaves the machine, not
// source text. Every read is stored as a snapshot so citations stay inspectable.
const USER_AGENT = 'knoter-wiki-demo/0.1 (local personal app)';
const TIMEOUT = 15_000;

/** Resolve what a reference_read target names. */
export function referenceTarget(raw: string) {
  const target = raw.trim();
  const mdn = /^mdn:(.+)$/i.exec(target)?.[1] ?? (MDN_PATH.test(target) ? target : null);
  if (mdn) return { provider: 'mdn' as const, path: mdn };
  const wiki = /^(ko|en):(.+)$/.exec(target);
  if (wiki) return { provider: 'wikipedia' as const, lang: wiki[1] as 'ko' | 'en', title: wiki[2] };
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    throw new AppError(
      'EVIDENCE',
      'Pass an https URL, a Wikipedia title as ko:제목 or en:Title, or mdn:<path>.',
    );
  }
  const article = /^(ko|en)\.wikipedia\.org$/.exec(url.hostname);
  if (article && url.pathname.startsWith('/wiki/'))
    return {
      provider: 'wikipedia' as const,
      lang: article[1] as 'ko' | 'en',
      title: decodeURIComponent(url.pathname.slice(6)).replace(/_/g, ' '),
    };
  const docs = /^\/en-US\/docs\/(.+)$/.exec(url.pathname);
  if (url.hostname === 'developer.mozilla.org' && docs)
    return { provider: 'mdn' as const, path: docs[1] };
  return { provider: 'web' as const, url };
}

export async function fetchReference(target: string): Promise<ReferenceEvidence> {
  const t = referenceTarget(target);
  if (t.provider === 'mdn') return fetchMdnReference(t.path);
  if (t.provider === 'wikipedia') return fetchWikipedia(t.lang, t.title);
  return fetchWeb(t.url);
}

/** Reference identifiers compare without the optional mdn: prefix or percent-encoding. */
export function sameReference(a: string, b: string) {
  const key = (v: string) => {
    let s = v.trim().replace(/^mdn:/i, '');
    try {
      s = decodeURI(s);
    } catch {}
    return s.toLowerCase();
  };
  return key(a) === key(b);
}

// --- MDN: the publisher's public Markdown repository, never arbitrary URLs.
const MDN_PATH = /^(?:Web|Learn_web_development|Glossary)(?:\/[A-Za-z0-9_-]+){1,12}$/;
export function mdnLocation(path: string) {
  requireThat(
    MDN_PATH.test(path) && path.length <= 240,
    'EVIDENCE',
    'Use an MDN documentation path, without a URL, query, fragment, or traversal.',
  );
  return {
    url: `https://developer.mozilla.org/en-US/docs/${path}`,
    contentUrl: `https://raw.githubusercontent.com/mdn/content/main/files/en-us/${path.toLowerCase()}/index.md`,
  };
}

async function boundedFetch(url: string, max: number, what: string) {
  let response: Response;
  try {
    response = await fetch(url, {
      redirect: 'error',
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch {
    throw new AppError('EVIDENCE', `${what} could not be fetched.`);
  }
  requireThat(
    response.ok && response.body,
    'EVIDENCE',
    `${what} unavailable (${response.status}).`,
  );
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      requireThat(length <= max, 'LIMIT', `${what} is too large. Choose a narrower page.`);
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return Buffer.concat(chunks);
}

export async function fetchMdnReference(path: string): Promise<ReferenceEvidence> {
  const location = mdnLocation(path);
  const bytes = await boundedFetch(location.contentUrl, 256 * 1024, 'The MDN reference');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const slug = text.match(/^slug:\s*(.+)$/m)?.[1]?.trim();
  requireThat(
    slug?.toLowerCase() === path.toLowerCase(),
    'EVIDENCE',
    'MDN page identity did not match the requested path.',
  );
  return {
    id: uuid(),
    provider: 'mdn',
    path: slug!,
    title:
      text
        .match(/^title:\s*(.+)$/m)?.[1]
        ?.trim()
        .replace(/^['"]|['"]$/g, '') || slug!,
    ...mdnLocation(slug!),
    fetchedAt: now(),
    hash: sha(bytes),
    license: 'MDN contributors · CC BY-SA 2.5',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/2.5/',
    segments: extract(bytes),
  };
}

// --- Wikipedia: the article's plain-text extract from the official API.
async function fetchWikipedia(lang: 'ko' | 'en', title: string): Promise<ReferenceEvidence> {
  requireThat(
    title.trim().length > 0 && title.length <= 100 && !/[\r\n|#<>[\]{}]/.test(title),
    'EVIDENCE',
    'Use a plain Wikipedia article title of at most 100 characters.',
  );
  const api = `https://${lang}.wikipedia.org/w/api.php?${new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'extracts|info|pageprops',
    explaintext: '1',
    exsectionformat: 'wiki',
    redirects: '1',
    inprop: 'url',
    titles: title.trim(),
  })}`;
  const bytes = await boundedFetch(api, 2 * 1024 * 1024, 'The Wikipedia article');
  const page = (
    JSON.parse(bytes.toString('utf8')) as {
      query?: {
        pages?: {
          title: string;
          missing?: boolean;
          invalid?: boolean;
          extract?: string;
          fullurl?: string;
          pageprops?: Record<string, string>;
        }[];
      };
    }
  ).query?.pages?.[0];
  requireThat(
    page && !page.missing && !page.invalid && page.extract?.trim() && page.fullurl,
    'EVIDENCE',
    `Wikipedia (${lang}) has no article titled "${title}". Try another title or language.`,
  );
  requireThat(
    !page.pageprops || !('disambiguation' in page.pageprops),
    'EVIDENCE',
    'That title is a disambiguation page. Choose a specific article.',
  );
  // "== Section ==" headings become Markdown headings so segments keep their section.
  const markdown = Buffer.from(
    page.extract!.replace(
      /^(={2,6})\s*(.+?)\s*\1\s*$/gm,
      (_m, eq: string, h: string) => `${'#'.repeat(eq.length)} ${h}`,
    ),
  );
  return {
    id: uuid(),
    provider: 'wikipedia',
    path: `${lang}:${page.title}`,
    title: page.title,
    url: page.fullurl!,
    contentUrl: api,
    fetchedAt: now(),
    hash: sha(markdown),
    license: 'Wikipedia contributors · CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    segments: extract(markdown),
  };
}

// --- General web pages, guarded against requests into the local network.
export function privateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = address.toLowerCase();
  const mapped = /^(?:::ffff:|::)(\d+\.\d+\.\d+\.\d+)$/.exec(v6);
  if (mapped) return privateAddress(mapped[1]);
  return (
    v6 === '::' ||
    v6 === '::1' ||
    /^f[cd]/.test(v6) ||
    /^fe[89ab]/.test(v6) ||
    /^ff/.test(v6) ||
    v6.startsWith('64:ff9b:')
  );
}

function checkUrl(url: URL) {
  requireThat(url.protocol === 'https:', 'EVIDENCE', 'Only https pages can be read.');
  requireThat(
    !url.username && !url.password && (url.port === '' || url.port === '443'),
    'EVIDENCE',
    'Use a plain https URL without credentials or a custom port.',
  );
  const host = url.hostname.replace(/^\[|\]$/g, '');
  requireThat(
    host &&
      (!isIP(host) || !privateAddress(host)) &&
      !/(^|\.)(localhost|local|internal)$/i.test(host),
    'EVIDENCE',
    'That address is not a public website.',
  );
}

// Validating at connection time also covers DNS answers that change after a check.
function guardedLookup(
  hostname: string,
  options: { all?: boolean },
  callback: (err: Error | null, address: string | LookupAddress[], family?: number) => void,
) {
  lookup(hostname, { all: true }, (err, addresses) => {
    if (err) return callback(err, '');
    if (!addresses.length || addresses.some((a) => privateAddress(a.address)))
      return callback(new AppError('EVIDENCE', 'That address is not a public website.'), '');
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
}

function guardedGet(url: URL, max: number) {
  return new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>(
    (resolve, reject) => {
      const req = request(
        url,
        {
          method: 'GET',
          lookup: guardedLookup as never,
          agent: false,
          headers: {
            'user-agent': USER_AGENT,
            accept: 'text/html,application/xhtml+xml,text/plain,text/markdown;q=0.9',
            'accept-language': 'ko,en;q=0.8',
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400) {
            res.resume();
            return resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
          }
          const chunks: Buffer[] = [];
          let length = 0;
          res.on('data', (chunk: Buffer) => {
            length += chunk.length;
            if (length > max) req.destroy(new AppError('LIMIT', 'Web page exceeds 1 MiB.'));
            else chunks.push(chunk);
          });
          res.on('end', () =>
            resolve({ status, headers: res.headers, body: Buffer.concat(chunks) }),
          );
          res.on('error', reject);
        },
      );
      req.setTimeout(TIMEOUT, () => req.destroy(new AppError('EVIDENCE', 'Web page timed out.')));
      req.on('error', (e) =>
        reject(
          e instanceof AppError ? e : new AppError('EVIDENCE', 'Web page could not be fetched.'),
        ),
      );
      req.end();
    },
  );
}

const SKIP = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'nav',
  'footer',
  'header',
  'aside',
  'form',
  'iframe',
  'button',
  'select',
  'canvas',
  'object',
  'menu',
  'dialog',
]);
const BLOCK = new Set([
  'p',
  'div',
  'section',
  'article',
  'main',
  'li',
  'ul',
  'ol',
  'table',
  'tr',
  'blockquote',
  'dl',
  'dt',
  'dd',
  'figure',
  'figcaption',
  'br',
  'hr',
  'td',
  'th',
  'caption',
  'details',
  'summary',
]);
type HastNode = { type: string; tagName?: string; value?: string; children?: HastNode[] };
const textOf = (n: HastNode): string =>
  n.type === 'text' ? (n.value ?? '') : (n.children ?? []).map(textOf).join('');
function find(n: HastNode, tag: string): HastNode | undefined {
  if (n.tagName === tag) return n;
  for (const c of n.children ?? []) {
    const hit = find(c, tag);
    if (hit) return hit;
  }
}
/** Readable text of an HTML page with Markdown headings, for segment extraction. */
export function htmlToMarkdown(html: string) {
  const tree = fromHtml(html) as HastNode;
  const title = textOf(find(tree, 'title') ?? find(tree, 'h1') ?? { type: 'text', value: '' })
    .replace(/\s+/g, ' ')
    .trim();
  const root = find(tree, 'main') ?? find(tree, 'article') ?? find(tree, 'body') ?? tree;
  const blocks: string[] = [];
  let line = '';
  const flush = () => {
    const t = line.replace(/\s+/g, ' ').trim();
    if (t) blocks.push(t);
    line = '';
  };
  const walk = (n: HastNode) => {
    if (n.type === 'text') line += n.value ?? '';
    if (n.type !== 'element' && n.type !== 'root') return;
    const tag = n.tagName ?? '';
    if (SKIP.has(tag)) return;
    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      flush();
      const t = textOf(n).replace(/\s+/g, ' ').trim();
      if (t) blocks.push(`${'#'.repeat(Number(heading[1]))} ${t}`);
      return;
    }
    if (tag === 'pre') {
      flush();
      blocks.push(textOf(n).replace(/\n+$/, ''));
      return;
    }
    if (BLOCK.has(tag)) flush();
    if (tag === 'li') line += '- ';
    for (const c of n.children ?? []) walk(c);
    if (BLOCK.has(tag)) flush();
  };
  walk(root);
  flush();
  return { title, markdown: blocks.join('\n\n') };
}

async function fetchWeb(start: URL): Promise<ReferenceEvidence> {
  let url = start;
  for (let hop = 0; ; hop++) {
    checkUrl(url);
    const res = await guardedGet(url, 1024 * 1024);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      requireThat(hop < 3, 'EVIDENCE', 'Web page redirected too many times.');
      url = new URL(res.headers.location, url);
      continue;
    }
    requireThat(res.status === 200, 'EVIDENCE', `Web page unavailable (${res.status}).`);
    const type = String(res.headers['content-type'] ?? '').toLowerCase();
    const html = /text\/html|application\/xhtml\+xml/.test(type);
    requireThat(
      html || /text\/plain|text\/markdown/.test(type),
      'EVIDENCE',
      'Only HTML or text pages can be read.',
    );
    const charset =
      /charset=["']?([\w-]+)/.exec(type)?.[1] ??
      (html
        ? /<meta[^>]+charset=["']?([\w-]+)/i.exec(
            res.body.subarray(0, 4096).toString('latin1'),
          )?.[1]
        : undefined);
    let text: string;
    try {
      text = new TextDecoder(charset ?? 'utf-8').decode(res.body);
    } catch {
      text = new TextDecoder('utf-8').decode(res.body);
    }
    const page = html ? htmlToMarkdown(text) : { title: '', markdown: text };
    const markdown = Buffer.from(page.markdown.slice(0, 200_000));
    requireThat(markdown.toString().trim(), 'EVIDENCE', 'Web page has no readable text.');
    return {
      id: uuid(),
      provider: 'web',
      path: url.href,
      title: page.title || url.hostname,
      url: url.href,
      contentUrl: url.href,
      fetchedAt: now(),
      hash: sha(markdown),
      license: `© ${url.hostname} · paraphrased with attribution`,
      segments: extract(markdown),
    };
  }
}
