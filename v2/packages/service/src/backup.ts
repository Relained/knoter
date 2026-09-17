import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Store } from './store.js';
import { atomicWrite, sha, requireThat, now } from './common.js';
export async function backup(store: Store, path: string) {
  requireThat(!existsSync(path), 'EXISTS', 'Choose a new backup folder.');
  mkdirSync(path, { recursive: true, mode: 0o700 });
  mkdirSync(join(path, 'blobs'), { mode: 0o700 });
  await store.db.backup(join(path, 'wiki.sqlite'));
  const snapshot = new Database(join(path, 'wiki.sqlite'), { readonly: true });
  try {
    const hashes = (
      snapshot.prepare('SELECT DISTINCT hash FROM versions').all() as { hash: string }[]
    ).map((r) => r.hash);
    for (const hash of hashes) {
      const bytes = readFileSync(join(store.dir, 'blobs', hash));
      requireThat(sha(bytes) === hash, 'HASH', 'Original checksum mismatch.');
      atomicWrite(join(path, 'blobs', hash), bytes);
    }
    atomicWrite(
      join(path, 'manifest.json'),
      JSON.stringify(
        {
          format: 'knoter-backup',
          version: 1,
          createdAt: now(),
          databaseHash: sha(readFileSync(join(path, 'wiki.sqlite'))),
          blobs: hashes,
        },
        null,
        2,
      ),
    );
  } finally {
    snapshot.close();
  }
  return path;
}
export function restoreEmpty(store: Store, path: string) {
  requireThat(
    store.documents().length === 0 && !store.one('SELECT id FROM sources LIMIT 1'),
    'NOT_EMPTY',
    'Restore requires an empty demo workspace. Existing data will not be replaced.',
  );
  const manifest = JSON.parse(readFileSync(join(path, 'manifest.json'), 'utf8')) as {
    format: string;
    version: number;
    databaseHash: string;
    blobs: string[];
  };
  requireThat(
    manifest.format === 'knoter-backup' && manifest.version === 1 && Array.isArray(manifest.blobs),
    'FORMAT',
    'Unsupported backup format.',
  );
  const dbBytes = readFileSync(join(path, 'wiki.sqlite'));
  requireThat(sha(dbBytes) === manifest.databaseHash, 'HASH', 'Backup database checksum mismatch.');
  const snapshot = new Database(join(path, 'wiki.sqlite'), { readonly: true });
  try {
    requireThat(
      snapshot.pragma('user_version', { simple: true }) === 1,
      'SCHEMA',
      'Unsupported backup schema.',
    );
    requireThat(
      snapshot.pragma('integrity_check', { simple: true }) === 'ok' &&
        (snapshot.pragma('foreign_key_check') as unknown[]).length === 0,
      'FORMAT',
      'Backup database failed integrity checks.',
    );
    const hashes = (
      snapshot.prepare('SELECT DISTINCT hash FROM versions').all() as { hash: string }[]
    ).map((r) => r.hash);
    for (const hash of hashes) {
      requireThat(
        /^[a-f0-9]{64}$/.test(hash) && manifest.blobs.includes(hash),
        'HASH',
        'Backup is missing an original.',
      );
      requireThat(
        sha(readFileSync(join(path, 'blobs', hash))) === hash,
        'HASH',
        'Backup source checksum mismatch.',
      );
    }
    const missing = snapshot
      .prepare('SELECT id FROM sources WHERE latest NOT IN (SELECT id FROM versions)')
      .get();
    requireThat(!missing, 'FORMAT', 'Backup source reference is broken.');
    for (const hash of hashes)
      atomicWrite(join(store.dir, 'blobs', hash), readFileSync(join(path, 'blobs', hash)));
  } finally {
    snapshot.close();
  }
  store.db.pragma('wal_checkpoint(TRUNCATE)');
  store.db.close();
  atomicWrite(join(store.dir, 'wiki.sqlite'), dbBytes);
  const restored = new Store(store.dir, store.skillHash);
  restored.db.transaction(() => {
    restored.db.prepare('UPDATE sources SET watch_id=NULL').run();
    restored.db.prepare('DELETE FROM watches').run();
    restored.set('cli', {
      path: '',
      version: '',
      status: 'missing',
      message: 'Reconnect this machine’s Codex CLI after restoring.',
    });
    restored.set('settings', { ...restored.get<object>('settings'), workerPaused: true });
    restored.event(
      'Backup restored',
      'Originals and wiki history restored. Reconnect CLI and select watched folders explicitly.',
    );
  })();
  return restored;
}
export function exportWiki(store: Store, path: string) {
  requireThat(!existsSync(path), 'EXISTS', 'Choose a new export folder.');
  mkdirSync(path, { recursive: true, mode: 0o700 });
  for (const doc of store.documents())
    if (!doc.deletedAt)
      atomicWrite(
        join(path, `${doc.id}.md`),
        `---\nid: ${doc.id}\ntitle: ${JSON.stringify(doc.title)}\nkind: llm-wiki\nschema: 1\nrevision: ${doc.revision}\nsourceIds: ${JSON.stringify(doc.sourceIds)}\n---\n\n# ${doc.title}\n\n${doc.body}\n` +
          ((doc.references?.length ?? 0) > 0
            ? `\n## Official references\n\n${doc.references!.map((r) => `- [${r.title.replace(/[\[\]]/g, '')}](${r.url}) · checked ${r.fetchedAt} · ${r.license} · explanations adapted in Korean ([license](https://creativecommons.org/licenses/by-sa/2.5/)).`).join('\n')}\n`
            : ''),
      );
  atomicWrite(
    join(path, 'citations.json'),
    JSON.stringify(
      store
        .documents()
        .filter((d) => !d.deletedAt)
        .map((d) => ({
          documentId: d.id,
          revision: d.revision,
          citations: store.citations(d.id),
          references: d.references ?? [],
        })),
      null,
      2,
    ),
  );
  return path;
}
