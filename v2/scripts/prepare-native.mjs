import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('..', import.meta.url));
if (process.platform !== 'darwin' || process.arch !== 'arm64')
  throw new Error('This demo packaging is verified only for macOS arm64.');
if (process.version !== 'v22.14.0')
  throw new Error('Package with Node v22.14.0 so the bundled runtime and SQLite ABI match.');
const native = join(root, 'dist/native'),
  runtime = join(root, 'dist/runtime');
await mkdir(native, { recursive: true });
await mkdir(runtime, { recursive: true });
for (const [source, name] of [
  ['ServiceControl', 'KnoterServiceControl'],
  ['ServiceLauncher', 'KnoterServiceLauncher'],
]) {
  execFileSync(
    '/usr/bin/xcrun',
    [
      'swiftc',
      '-target',
      'arm64-apple-macosx13.0',
      '-module-cache-path',
      join(root, 'dist/swift-cache'),
      '-O',
      join(root, `platform/macos/${source}.swift`),
      '-o',
      join(native, name),
    ],
    { stdio: 'inherit' },
  );
}
await cp(process.execPath, join(runtime, 'node'));
await cp(join(dirname(dirname(process.execPath)), 'LICENSE'), join(runtime, 'LICENSE'));
for (const name of ['better-sqlite3', 'bindings', 'file-uri-to-path'])
  await cp(join(root, 'node_modules', name), join(root, 'dist/node_modules', name), {
    recursive: true,
  });
await writeFile(
  join(runtime, 'manifest.json'),
  JSON.stringify(
    {
      version: process.version,
      arch: process.arch,
      sha256: createHash('sha256')
        .update(await readFile(join(runtime, 'node')))
        .digest('hex'),
    },
    null,
    2,
  ),
);
