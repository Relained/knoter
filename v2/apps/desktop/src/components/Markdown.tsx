import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function Markdown({
  children,
  onSource,
  compact = false,
}: {
  children: string;
  onSource?: (id: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={`markdown ${compact ? 'markdown-compact' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a: ({ href, children }) =>
            href?.startsWith('#source-') ? (
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
            ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
