import { mkdir, cp, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('..', import.meta.url));
const windows = process.platform === 'win32';
const native = join(root, 'dist/native'),
  runtime = join(root, 'dist/runtime'),
  node = join(runtime, windows ? 'node.exe' : 'node');
if (windows) {
  // The bundled runtime is this Node, so the installed SQLite binding must load in it.
  if (process.arch !== 'x64') throw new Error('Windows packaging is verified only for x64.');
  if (Number(process.versions.node.split('.')[0]) < 22)
    throw new Error('Package with Node 22.14 or newer.');
  execFileSync(
    process.execPath,
    ['-e', "new (require('better-sqlite3'))(':memory:').prepare('select 1').get()"],
    { cwd: root, stdio: 'inherit' },
  );
} else {
  if (process.platform !== 'darwin' || process.arch !== 'arm64')
    throw new Error('This demo packaging is verified only for macOS arm64 and Windows x64.');
  if (process.version !== 'v22.14.0')
    throw new Error('Package with Node v22.14.0 so the bundled runtime and SQLite ABI match.');
}
await mkdir(runtime, { recursive: true });
if (!windows) {
  await mkdir(native, { recursive: true });
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
}
await cp(process.execPath, node);
// The Windows installer places no LICENSE beside node.exe; the official one for this exact
// version is fetched instead, unless a copy is already there.
const license = windows
  ? join(dirname(process.execPath), 'LICENSE')
  : join(dirname(dirname(process.execPath)), 'LICENSE');
if (existsSync(license)) await cp(license, join(runtime, 'LICENSE'));
else {
  const url = `https://raw.githubusercontent.com/nodejs/node/${process.version}/LICENSE`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Node license could not be fetched from ${url}.`);
  await writeFile(join(runtime, 'LICENSE'), await response.text());
}
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
        .update(await readFile(node))
        .digest('hex'),
    },
    null,
    2,
  ),
);
