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
export const defaultDataDir = () =>
  join(homedir(), 'Library', 'Application Support', 'Knoter Wiki Demo');
export const socketFor = (dir: string) =>
  join('/tmp', `knoter-${process.getuid?.()}-${sha(dir).slice(0, 16)}`, 'service.sock');
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
