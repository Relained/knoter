import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
await mkdir(new URL('../.test-build/', import.meta.url), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['tests/service-registration.test.ts'],
  outfile: '.test-build/service-registration.test.mjs',
  platform: 'node',
  format: 'esm',
  target: 'node22',
  bundle: true,
});
const result = spawnSync(
  process.execPath,
  ['--test', '.test-build/service-registration.test.mjs'],
  {
    cwd: root,
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
