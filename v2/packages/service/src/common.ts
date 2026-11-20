import { createHash, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
  chmodSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
export const uuid = randomUUID;
export const now = () => new Date().toISOString();
export const sha = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
export const windows = process.platform === 'win32';
export const systemRoot = () => process.env.SystemRoot ?? 'C:\\Windows';
export const defaultDataDir = () =>
  windows
    ? join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Knoter Wiki Demo')
    : join(homedir(), 'Library', 'Application Support', 'Knoter Wiki Demo');
// Windows has no socket files: the service listens on a named pipe, which only its
// creator can write to. The data directory lies in the user's profile, so its hash is per user.
export const socketFor = (dir: string) =>
  windows
    ? `\\\\.\\pipe\\knoter-${sha(dir).slice(0, 32)}`
    : join('/tmp', `knoter-${process.getuid?.()}-${sha(dir).slice(0, 16)}`, 'service.sock');
/**
 * The environment a worker CLI starts with: no API keys, app IPC capabilities, or shell
 * configuration. Windows programs need the system variables to start at all.
 */
export function minimalEnvironment(): NodeJS.ProcessEnv {
  if (!windows)
    return {
      HOME: homedir(),
      USER: process.env.USER,
      LOGNAME: process.env.LOGNAME,
      TMPDIR: process.env.TMPDIR ?? '/tmp',
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    };
  const root = systemRoot();
  const env: NodeJS.ProcessEnv = {
    PATH: [
      join(root, 'System32'),
      root,
      join(root, 'System32', 'Wbem'),
      join(root, 'System32', 'WindowsPowerShell', 'v1.0'),
    ].join(';'),
  };
  for (const name of [
    'SystemRoot',
    'SystemDrive',
    'windir',
    'ComSpec',
    'PATHEXT',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'USERNAME',
    'USERDOMAIN',
    'APPDATA',
    'LOCALAPPDATA',
    'ProgramData',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'TEMP',
    'TMP',
    'OS',
    'PROCESSOR_ARCHITECTURE',
    'NUMBER_OF_PROCESSORS',
  ])
    if (process.env[name]) env[name] = process.env[name];
  return env;
}
export function secureDir(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  chmodSync(path, 0o700);
}
export function atomicWrite(path: string, bytes: string | Buffer) {
  secureDir(dirname(path));
  const temp = `${path}.${uuid()}.tmp`;
  const fd = openSync(temp, 'wx', 0o600);
  try {
    writeFileSync(fd, bytes);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temp, path);
  // Windows cannot open a directory to flush it.
  if (windows) return;
  const parent = openSync(dirname(path), 'r');
  try {
    fsyncSync(parent);
  } finally {
    closeSync(parent);
  }
}
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function requireThat(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new AppError(code, message);
}
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function nextDay() {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.toISOString();
}
