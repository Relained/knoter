import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { KnError, ErrorCode } from "./errors";

interface LockFile {
  pid: number;
  timestamp: number;
}

const LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function getLockPath(vaultRoot: string): string {
  return join(vaultRoot, ".db", "vault.lock");
}

export async function acquireLock(vaultRoot: string): Promise<void> {
  const lockPath = getLockPath(vaultRoot);

  try {
    // Check if lock file exists
    const lockFile = Bun.file(lockPath);
    const exists = await lockFile.exists();

    if (exists) {
      const content = await lockFile.text();
      const lock = JSON.parse(content) as LockFile;

      const isStale = Date.now() - lock.timestamp > LOCK_TIMEOUT_MS;
      const isAlive = isProcessAlive(lock.pid);

      if (!isStale && isAlive) {
        throw new KnError(
          ErrorCode.LOCK_CONTENTION,
          `Vault is locked by process ${lock.pid}`
        );
      }
    }

    // Create .db directory if it doesn't exist
    const dbDir = join(vaultRoot, ".db");
    mkdirSync(dbDir, { recursive: true });

    // Write new lock file
    const lockData: LockFile = {
      pid: process.pid,
      timestamp: Date.now(),
    };
    await Bun.write(lockPath, JSON.stringify(lockData));
  } catch (e) {
    if (e instanceof KnError) {
      throw e;
    }
    throw new KnError(
      ErrorCode.LOCK_CONTENTION,
      `Failed to acquire lock: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export async function releaseLock(vaultRoot: string): Promise<void> {
  const lockPath = getLockPath(vaultRoot);

  try {
    const { unlinkSync } = await import("node:fs");
    const lockFile = Bun.file(lockPath);
    const exists = await lockFile.exists();
    if (exists) {
      unlinkSync(lockPath);
    }
  } catch (e) {
    throw new KnError(
      ErrorCode.LOCK_CONTENTION,
      `Failed to release lock: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export async function withLock<T>(
  vaultRoot: string,
  fn: () => Promise<T>
): Promise<T> {
  await acquireLock(vaultRoot);
  try {
    return await fn();
  } finally {
    await releaseLock(vaultRoot);
  }
}
