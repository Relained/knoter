import type { Segment } from '@knoter/contracts/native';
import { requireThat } from './common.js';
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
