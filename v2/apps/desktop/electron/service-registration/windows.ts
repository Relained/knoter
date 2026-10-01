import { win32 } from 'node:path';
import { executeHelper, runHelper, type ExecuteHelper } from './helper.js';
import type { ServiceRegistration } from './types.js';

export function windowsRegistration(
  resourcesPath: string,
  systemRoot: string,
  execute: ExecuteHelper = executeHelper,
): ServiceRegistration {
  const powershell = win32.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const helper = win32.join(resourcesPath, 'windows', 'ServiceControl.ps1');
  return {
    run: (action) =>
      runHelper(execute, powershell, [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        helper,
        '-Action',
        action,
        '-ResourcesPath',
        resourcesPath,
      ]),
  };
}
