import { readdir, lstat, open, realpath } from 'node:fs/promises';
import { watch, constants, type FSWatcher } from 'node:fs';
import { join, relative, isAbsolute, basename } from 'node:path';
import { MAX_SOURCE_BYTES, type WatchInfo } from '@knoter/contracts/native';
import { sha } from '../../../packages/service/src/common.js';

type Send = (command: string, payload: unknown) => Promise<unknown>;
export class SourceWatcher {
  watchers = new Map<string, FSWatcher>();
  pending = new Map<string, string>();
  busy = false;
  timer: NodeJS.Timeout | null = null;
  pendingImports = new Set<string>();
  constructor(private send: Send) {}
  start() {
    this.timer = setInterval(() => void this.scan(), 10_000);
    void this.scan();
  }
  close() {
    if (this.timer) clearInterval(this.timer);
    for (const w of this.watchers.values()) w.close();
    this.watchers.clear();
  }
  async stableBytes(path: string) {
    const first = await lstat(path);
    if (first.isSymbolicLink() || !first.isFile())
      throw new Error('Only regular Markdown files are supported.');
    if (first.size > MAX_SOURCE_BYTES) throw new Error('Markdown exceeds the 256 KiB demo limit.');
    const canonical = await realpath(path);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      if (opened.ino !== first.ino || opened.dev !== first.dev)
        throw new Error('File changed before reading.');
      const bytes = await handle.readFile();
      await new Promise((r) => setTimeout(r, 350));
      const second = await lstat(path),
        after = await handle.stat();
      if (
        second.isSymbolicLink() ||
        bytes.length > MAX_SOURCE_BYTES ||
        first.ino !== second.ino ||
        first.mtimeMs !== after.mtimeMs ||
        first.size !== after.size ||
        (await realpath(path)) !== canonical
      )
        throw new Error('File is still changing; registration pending.');
      // A second content read catches edits that preserve timestamps and size.
      const again = Buffer.alloc(bytes.length);
      await handle.read(again, 0, again.length, 0);
      if (sha(bytes) !== sha(again))
        throw new Error('File content is still changing; registration pending.');
      return bytes;
    } finally {
      await handle.close();
    }
  }
  async register(path: string, watchId: string | null) {
    try {
      const bytes = await this.stableBytes(path);
      const result = await this.send('sourceSnapshot', {
        path,
        watchId,
        filename: basename(path),
        bytes: bytes.toString('base64'),
        hash: sha(bytes),
      });
      this.pending.delete(path);
      this.pendingImports.delete(path);
      return result;
    } catch (e) {
      this.pending.set(path, (e as Error).message);
      if (!watchId) this.pendingImports.add(path);
      throw e;
    }
  }
  async scan() {
    if (this.busy) return;
    this.busy = true;
    try {
      const locations = (await this.send('watches', {})) as WatchInfo[];
      for (const path of this.pendingImports)
        try {
          await this.register(path, null);
        } catch {
          /* Keep a visible pending entry until bytes can be registered. */
        }
      for (const [path, w] of this.watchers)
        if (!locations.some((l) => l.path === path)) {
          w.close();
          this.watchers.delete(path);
        }
      for (const location of locations) {
        const paths: string[] = [];
        let error: string | null = null;
        try {
          const root = await realpath(location.path);
          if (root !== location.path)
            throw new Error('Watched folder was replaced or redirected. Choose it again.');
          const visit = async (folder: string) => {
            for (const entry of await readdir(folder, { withFileTypes: true })) {
              if (entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
              const path = join(folder, entry.name);
              const canonical = await realpath(path);
              const rel = relative(root, canonical);
              if (rel.startsWith('..') || isAbsolute(rel)) continue;
              if (entry.isDirectory()) await visit(path);
              else if (entry.isFile() && /\.md$/i.test(entry.name)) {
                if (paths.length >= 2000)
                  throw new Error(
                    'Folder exceeds 2,000 Markdown files. Choose a smaller demo folder.',
                  );
                paths.push(path);
                try {
                  await this.register(path, location.id);
                } catch (e) {
                  error = (e as Error).message;
                }
              }
            }
          };
          await visit(root);
          if (!this.watchers.has(root)) {
            let debounce: NodeJS.Timeout;
            const w = watch(root, { recursive: true }, () => {
              clearTimeout(debounce);
              debounce = setTimeout(() => void this.scan(), 600);
            });
            w.on('error', () => {
              w.close();
              this.watchers.delete(root);
            });
            this.watchers.set(root, w);
          }
        } catch (e) {
          error = (e as Error).message;
          this.pending.set(location.path, error);
        }
        await this.send('scanComplete', { watchId: location.id, paths, error });
        if (!error) this.pending.delete(location.path);
      }
    } catch {
      /* Reconnect scan owns recovery; registered snapshots remain in the service. */
    } finally {
      this.busy = false;
    }
  }
}
