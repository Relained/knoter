import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { RegistrationResult } from './types.js';

export type ExecuteHelper = (
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number; windowsHide: boolean },
) => Promise<{ stdout: string }>;

export const executeHelper: ExecuteHelper = promisify(execFile);

function resultFrom(stdout: string): RegistrationResult {
  const value: unknown = JSON.parse(stdout.replace(/^\uFEFF/, '').trim());
  if (
    !value ||
    typeof value !== 'object' ||
    !('status' in value) ||
    typeof value.status !== 'string' ||
    !value.status ||
    ('registration' in value && typeof value.registration !== 'string')
  ) {
    throw new Error('Invalid service registration response.');
  }
  if (value.status === 'error') {
    throw new Error(
      'message' in value && typeof value.message === 'string'
        ? value.message
        : 'Service registration failed.',
    );
  }
  return value as RegistrationResult;
}

export async function runHelper(
  execute: ExecuteHelper,
  file: string,
  args: string[],
): Promise<RegistrationResult> {
  // execFile keeps paths/arguments out of the shell on both platforms.
  const { stdout } = await execute(file, args, {
    timeout: 15_000,
    maxBuffer: 32_000,
    windowsHide: true,
  });
  return resultFrom(stdout);
}
