import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

interface Node {
  type: string;
  value?: string;
  children?: Node[];
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: { hProperties?: Record<string, unknown> };
}

// Note text is untrusted: `trust: false` keeps \href, \url, and \html* commands
// disabled, and size limits bound pathological input. Shared by reader and editor.
export const katexOptions = {
  trust: false,
  strict: 'ignore',
  throwOnError: false,
  maxSize: 50,
  maxExpand: 500,
} as const;

/** A paragraph holding only a `$$x$$` formula written on one line. */
function standaloneFormula(node: Node, source: string) {
  if (node.type !== 'paragraph' || node.children?.length !== 1) return undefined;
  const [only] = node.children;
  const start = only.position?.start.offset;
  return only.type === 'inlineMath' && start !== undefined && source.startsWith('$$', start)
    ? only
    : undefined;
}

/**
 * remark-math reads `$$x$$` written on one line as inline math. When such a formula
 * is a paragraph on its own, show it as display math, as most Markdown editors do.
 */
export function remarkDisplayMath() {
  return (tree: Node, file: { value: unknown }) => {
    const source = String(file.value);
    const visit = (node: Node) => {
      const formula = standaloneFormula(node, source);
      if (formula)
        formula.data = {
          ...formula.data,
          hProperties: {
            ...formula.data?.hProperties,
            className: ['language-math', 'math-display'],
          },
        };
      else node.children?.forEach(visit);
    };
    visit(tree);
  };
}

/**
 * The editor saves inline math with single dollars, which would turn a standalone
 * one-line `$$x$$` into inline math. Give such top-level formulas the `$$` block
 * form before editing so they stay display math.
 */
export function blockDisplayMath(markdown: string) {
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown) as Node;
  const edits = (tree.children ?? []).flatMap((node) => {
    const formula = standaloneFormula(node, markdown);
    const end = formula?.position?.end.offset;
    return formula && end !== undefined
      ? [{ start: formula.position!.start.offset!, end, value: formula.value?.trim() ?? '' }]
      : [];
  });
  for (const edit of edits.reverse())
    markdown = `${markdown.slice(0, edit.start)}$$\n${edit.value}\n$$${markdown.slice(edit.end)}`;
  return markdown;
}
