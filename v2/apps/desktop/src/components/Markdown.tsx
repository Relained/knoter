import { useEffect, useState } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkCjkFriendly from 'remark-cjk-friendly/parseOnly';
import remarkMath from 'remark-math';
import type { PluggableList } from 'unified';
import type { WikiDocument } from '@knoter/contracts';
import { documentHref, internalTarget, remarkWikiLinks, resolveDocument } from '../wiki/links';
import { DocumentContextMenu } from './DocumentMenu';
import { remarkSectionIds } from '../wiki/structure';
import { remarkDisplayMath } from '../wiki/math';

// KaTeX loads once, the first time a rendered note contains a dollar sign. Until
// then math is shown as its TeX source.
let mathPlugins: PluggableList | null = null;
const loadMath = () => import('./math').then(({ rehypeMath }) => (mathPlugins = rehypeMath));

export function Markdown({
  children,
  onSource,
  compact = false,
  documents = [],
  onOpen,
}: {
  children: string;
  onSource?: (id: string) => void;
  compact?: boolean;
  documents?: WikiDocument[];
  onOpen?: (id: string) => void;
}) {
  const hasMath = children.includes('$');
  const [math, setMath] = useState(mathPlugins);
  useEffect(() => {
    if (hasMath && !math) void loadMath().then(setMath);
  }, [hasMath, math]);
  return (
    <div className={`markdown ${compact ? 'markdown-compact' : ''}`}>
      <ReactMarkdown
        // CJK-friendly emphasis closes `**` before Hangul particles, as in **"수요일"**로.
        remarkPlugins={[
          remarkGfm,
          remarkCjkFriendly,
          remarkMath,
          remarkDisplayMath,
          remarkWikiLinks,
          remarkSectionIds,
        ]}
        rehypePlugins={hasMath && math ? math : undefined}
        skipHtml
        urlTransform={(url) =>
          /^source:[a-f0-9-]{36}$/i.test(url) ? `#source-${url.slice(7)}` : defaultUrlTransform(url)
        }
        components={{
          a: ({ href, children }) => {
            const target = internalTarget(href);
            if (target) {
              const doc = resolveDocument(target, documents);
              return doc ? (
                <DocumentContextMenu doc={doc}>
                  <a
                    className="wiki-link"
                    href={documentHref(doc.id)}
                    title={`${doc.title}\n${doc.description}`}
                    onClick={(event) => {
                      if (
                        onOpen &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        !event.shiftKey &&
                        !event.altKey &&
                        event.button === 0
                      ) {
                        event.preventDefault();
                        onOpen(doc.id);
                      }
                    }}
                  >
                    {children}
                  </a>
                </DocumentContextMenu>
              ) : (
                <span
                  className="wiki-link unresolved-link"
                  title="No unique matching note. Use an existing note title or ID."
                >
                  {children}
                  <sup>?</sup>
                </span>
              );
            }
            return href?.startsWith('#source-') ? (
              <button
                className="citation"
                onClick={() => onSource?.(href.slice(8))}
                aria-label={`Open source ${typeof children === 'string' ? children : ''}`}
              >
                {children}
              </button>
            ) : (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
