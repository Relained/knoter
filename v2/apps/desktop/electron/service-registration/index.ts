import { macOSRegistration } from './macos.js';
import { windowsRegistration } from './windows.js';
import { executeHelper, type ExecuteHelper } from './helper.js';
import type { RegistrationResult, ServiceAction, ServiceRegistration } from './types.js';
export type { RegistrationResult, ServiceRegistration } from './types.js';

export function createServiceRegistration(
  options: {
    platform: NodeJS.Platform;
    isPackaged: boolean;
    executablePath: string;
    resourcesPath: string;
    systemRoot?: string;
  },
  execute: ExecuteHelper = executeHelper,
): ServiceRegistration {
  if (!options.isPackaged) {
    return {
      async run(action) {
        if (action === 'status') return { status: 'development' };
        throw new Error(
          'Install the packaged demo app to register its background service. Development mode uses a separately started service.',
        );
      },
    };
  }
  switch (options.platform) {
    case 'darwin':
      return macOSRegistration(options.executablePath, execute);
    case 'win32':
      return windowsRegistration(
        options.resourcesPath,
        options.systemRoot ?? 'C:\\Windows',
        execute,
      );
    default:
      return {
        async run(action) {
          if (action === 'status') return { status: 'unsupported' };
          throw new Error(
            `Background service registration is not supported on ${options.platform}.`,
          );
        },
      };
  }
}

export type RegistrationAction = 'enable' | 'disable' | 'restart' | 'status' | 'approvalSettings';

export async function controlRegistration(
  service: ServiceRegistration,
  action: RegistrationAction,
  onResult: (result: RegistrationResult) => void = () => {},
) {
  const run = async (nativeAction: ServiceAction) => {
    const result = await service.run(nativeAction);
    onResult(result);
    return result;
  };
  if (action === 'restart') {
    await run('unregister');
    return run('register');
  }
  const nativeAction: ServiceAction =
    action === 'enable' ? 'register' : action === 'disable' ? 'unregister' : action;
  return run(nativeAction);
}
