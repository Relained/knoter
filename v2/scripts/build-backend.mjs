import { build } from 'esbuild';
import { mkdir, cp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
await mkdir(join(root, 'dist', 'app'), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: {
    service: 'packages/service/src/index.ts',
    bridge: 'packages/service/src/bridge.ts',
  },
  outdir: 'dist/backend',
  outExtension: { '.js': '.mjs' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['better-sqlite3'],
});
await build({
  absWorkingDir: root,
  entryPoints: ['apps/desktop/electron/main.ts'],
  outfile: 'dist/app/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron'],
});
await cp(join(root, 'apps/desktop/electron/preload.cjs'), join(root, 'dist/app/preload.cjs'));
await cp(join(root, 'apps/desktop/dist'), join(root, 'dist/app/renderer'), { recursive: true });
await cp(join(root, 'resources'), join(root, 'dist/resources'), { recursive: true });
await writeFile(
  join(root, 'dist/backend/build.json'),
  JSON.stringify({ node: process.version, arch: process.arch }, null, 2),
);
