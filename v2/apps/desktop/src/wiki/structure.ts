import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';

interface Node {
  type: string;
  depth?: number;
  value?: string;
  children?: Node[];
  data?: { hProperties?: Record<string, unknown> };
}
const label = (node: Node): string => node.value ?? node.children?.map(label).join('') ?? '';
function headings(tree: Node) {
  const result: Node[] = [];
  const visit = (node: Node) => {
    if (node.type === 'heading' && (node.depth === 2 || node.depth === 3)) result.push(node);
    node.children?.forEach(visit);
  };
  visit(tree);
  return result;
}
export function documentSections(body: string) {
  return headings(unified().use(remarkParse).use(remarkGfm).parse(body) as Node).map(
    (node, index) => ({
      id: `wiki-heading-${index}`,
      label: label(node),
      depth: node.depth!,
    }),
  );
}
export function remarkSectionIds() {
  return (tree: Node) => {
    headings(tree).forEach((node, index) => {
      node.data = {
        ...node.data,
        hProperties: { ...node.data?.hProperties, id: `wiki-heading-${index}` },
      };
    });
  };
}
