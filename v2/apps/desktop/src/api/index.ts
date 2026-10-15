import type { SourceImport } from '@knoter/contracts';
import { createMockClient } from './mockClient';
import { createConnectedClient } from './connectedClient';

// Composition root: inject a real IPC-backed KnoterClient here when available.
export const client = window.knoterNative
  ? createConnectedClient(window.knoterNative)
  : createMockClient();

// A disposable browser File lets the preview exercise the same import path.
export function createSampleFile(): File {
  return new File(
    [
      '# A small reading note\n\nConnect every summary to its source.\n\n## Next steps\n\n- Add a personal observation.\n- Reserve time for another reading session.\n',
    ],
    'sample-reading-note.md',
    { type: 'text/markdown' },
  );
}

export async function readImports(files: File[]): Promise<SourceImport[]> {
  if (files.some((f) => !/\.(pdf|md|txt)$/i.test(f.name)))
    throw new Error('Supported files: .pdf, .md, and .txt');
  if (files.some((f) => f.size > 25 * 1024 * 1024))
    throw new Error('Choose files smaller than 25 MB for this demo.');
  return Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      size: file.size,
      text: /\.(md|txt)$/i.test(file.name) ? await file.text() : undefined,
    })),
  );
}
