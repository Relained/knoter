import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createServiceRegistration,
  controlRegistration,
  type ServiceRegistration,
} from '../apps/desktop/electron/service-registration/index.js';
import {
  runHelper,
  type ExecuteHelper,
} from '../apps/desktop/electron/service-registration/helper.js';

const packaged = {
  platform: 'darwin' as NodeJS.Platform,
  isPackaged: true,
  executablePath: '/Applications/한글 & Demo.app/Contents/MacOS/Knoter Wiki Demo',
  resourcesPath: '/Applications/한글 & Demo.app/Contents/Resources',
};
const actions = ['register', 'unregister', 'status', 'approvalSettings'] as const;

function helper(stdout: string) {
  const calls: Parameters<ExecuteHelper>[] = [];
  const execute: ExecuteHelper = async (...args) => {
    calls.push(args);
    return { stdout };
  };
  return { calls, execute };
}

test('macOS retains the helper location, native actions and result', async () => {
  const response = { status: 'local_agent_running', registration: 'local LaunchAgent demo' };
  const { execute, calls } = helper(JSON.stringify(response));
  const service = createServiceRegistration(packaged, execute);
  for (const action of actions) assert.deepEqual(await service.run(action), response);
  assert.deepEqual(
    calls.map((call) => call[1]),
    actions.map((action) => [action]),
  );
  for (const [file, , options] of calls) {
    assert.equal(file, '/Applications/한글 & Demo.app/Contents/MacOS/KnoterServiceControl');
    assert.deepEqual(options, { timeout: 15_000, maxBuffer: 32_000, windowsHide: true });
  }
});

test('Windows runs the packaged helper with literal Unicode/shell-like paths and system PowerShell', async () => {
  const { execute, calls } = helper(
    '\uFEFF{"status":"task_queued","registration":"per-user Task Scheduler"}\r\n',
  );
  const resourcesPath = "D:\\한글 & $data; O'Brien\\Knoter Wiki Demo\\resources";
  const service = createServiceRegistration(
    {
      ...packaged,
      platform: 'win32',
      resourcesPath,
      systemRoot: 'D:\\Windows',
    },
    execute,
  );
  for (const action of actions) {
    assert.equal((await service.run(action)).status, 'task_queued');
  }
  for (const [i, [file, args, options]] of calls.entries()) {
    assert.equal(file, 'D:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
    assert.deepEqual(args, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      resourcesPath + '\\windows\\ServiceControl.ps1',
      '-Action',
      actions[i],
      '-ResourcesPath',
      resourcesPath,
    ]);
    assert.equal(options.windowsHide, true);
  }
});

test('development registration is read-only on every platform', async () => {
  const { execute, calls } = helper('{"status":"unexpected"}');
  for (const platform of ['darwin', 'win32', 'linux'] as const) {
    const service = createServiceRegistration(
      { ...packaged, platform, isPackaged: false },
      execute,
    );
    assert.deepEqual(await service.run('status'), { status: 'development' });
    for (const action of ['register', 'unregister', 'approvalSettings'] as const) {
      await assert.rejects(
        service.run(action),
        /Development mode uses a separately started service/,
      );
    }
  }
  assert.equal(calls.length, 0);
});

test('unsupported packaged platforms report unsupported without spawning helpers', async () => {
  const { execute, calls } = helper('{"status":"unexpected"}');
  const service = createServiceRegistration({ ...packaged, platform: 'linux' }, execute);
  assert.deepEqual(await service.run('status'), { status: 'unsupported' });
  for (const action of ['register', 'unregister', 'approvalSettings'] as const) {
    await assert.rejects(service.run(action), /not supported on linux/);
  }
  assert.equal(calls.length, 0);
});

test('desktop controls map to the same native contract and restart stops before starting', async () => {
  const calls: string[] = [];
  const service: ServiceRegistration = {
    async run(action) {
      calls.push(action);
      return { status: action === 'unregister' ? 'disabled' : 'running' };
    },
  };
  for (const action of ['enable', 'disable', 'status', 'approvalSettings', 'restart'] as const) {
    await controlRegistration(service, action);
  }
  assert.deepEqual(calls, [
    'register',
    'unregister',
    'status',
    'approvalSettings',
    'unregister',
    'register',
  ]);
});

test('restart never registers when stopping fails', async () => {
  const calls: string[] = [];
  const service: ServiceRegistration = {
    async run(action) {
      calls.push(action);
      throw new Error('Access denied');
    },
  };
  await assert.rejects(controlRegistration(service, 'restart'), /Access denied/);
  assert.deepEqual(calls, ['unregister']);
});

test('native errors/timeouts are propagated and cannot become a successful status', async () => {
  for (const platform of ['darwin', 'win32'] as const) {
    const failure = Object.assign(new Error('helper failed'), { code: 'ETIMEDOUT' });
    const service = createServiceRegistration({ ...packaged, platform }, async () => {
      throw failure;
    });
    await assert.rejects(service.run('register'), (error) => error === failure);
  }
});

for (const output of [
  'not JSON',
  'null',
  '[]',
  '{}',
  '{"status":1}',
  '{"status":""}',
  '{"status":"running","registration":42}',
]) {
  test(`rejects malformed helper response: ${output}`, async () => {
    await assert.rejects(runHelper(helper(output).execute, '/helper', ['status']));
  });
}

test('rejects an error response even if the helper exits successfully', async () => {
  await assert.rejects(
    runHelper(
      helper('{"status":"error","message":"Task Scheduler unavailable"}').execute,
      '/helper',
      ['status'],
    ),
    /Task Scheduler unavailable/,
  );
});

test('restart retains the stopped status if subsequent registration fails', async () => {
  const statuses: string[] = [];
  const service: ServiceRegistration = {
    async run(action) {
      if (action === 'register') throw new Error('Failed to register');
      return { status: 'local_agent_disabled' };
    },
  };
  await assert.rejects(
    controlRegistration(service, 'restart', (result) => statuses.push(result.status)),
    /Failed to register/,
  );
  assert.deepEqual(statuses, ['local_agent_disabled']);
});
