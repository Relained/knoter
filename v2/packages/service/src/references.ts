import type { ReferenceEvidence } from '@knoter/contracts/native';
import { extract } from './markdown.js';
import { AppError, now, requireThat, sha, uuid } from './common.js';

// This demo uses the publisher's public Markdown repository, never arbitrary
// URLs, redirects, credentials, or source text in an outbound request.
export function mdnLocation(path: string) {
  requireThat(
    /^(?:Web|Learn_web_development|Glossary)(?:\/[A-Za-z0-9_-]+){1,12}$/.test(path) &&
      path.length <= 240,
    'EVIDENCE',
    'Use an MDN documentation path, without a URL, query, fragment, or traversal.',
  );
  return {
    url: `https://developer.mozilla.org/en-US/docs/${path}`,
    contentUrl: `https://raw.githubusercontent.com/mdn/content/main/files/en-us/${path.toLowerCase()}/index.md`,
  };
}

export async function fetchMdnReference(path: string): Promise<ReferenceEvidence> {
  const location = mdnLocation(path);
  let response: Response;
  try {
    response = await fetch(location.contentUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppError(
      'EVIDENCE',
      'The MDN reference could not be fetched. Do not substitute model knowledge.',
    );
  }
  requireThat(
    response.ok && response.body,
    'EVIDENCE',
    `MDN reference unavailable (${response.status}).`,
  );
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      requireThat(
        length <= 256 * 1024,
        'LIMIT',
        'Official reference exceeds 256 KiB. Choose a narrower page.',
      );
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = Buffer.concat(chunks),
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const slug = text.match(/^slug:\s*(.+)$/m)?.[1]?.trim();
  requireThat(
    slug?.toLowerCase() === path.toLowerCase(),
    'EVIDENCE',
    'MDN page identity did not match the requested path.',
  );
  return {
    id: uuid(),
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
    segments: extract(bytes),
  };
}
