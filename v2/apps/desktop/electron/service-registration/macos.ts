import { dirname, join } from 'node:path';
import { executeHelper, runHelper, type ExecuteHelper } from './helper.js';
import type { ServiceRegistration } from './types.js';

export function macOSRegistration(
  executablePath: string,
  execute: ExecuteHelper = executeHelper,
): ServiceRegistration {
  const helper = join(dirname(executablePath), 'KnoterServiceControl');
  return { run: (action) => runHelper(execute, helper, [action]) };
}
