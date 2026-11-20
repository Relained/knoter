import { app, BrowserWindow, ipcMain, dialog, powerMonitor, shell, Menu, session } from 'electron';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import {
  commands,
  rendererCommands,
  desktopActions,
  windowCommand,
  windowFrames,
  type Command,
  type DesktopAction,
  type WindowFrame,
  type WindowState,
} from '@knoter/contracts/native';
import { defaultDataDir, socketFor } from '../../../packages/service/src/common.js';
import { request } from '../../../packages/service/src/transport.js';
import { SourceWatcher } from './watcher.js';
const exec = promisify(execFile);
const dataDir = process.env.KNOTER_DATA_DIR ?? defaultDataDir();
const send = (command: string, payload: unknown) =>
  request(
    socketFor(dataDir),
    readFileSync(join(dataDir, 'connection.token'), 'utf8'),
    command,
    payload,
  );
const watcher = new SourceWatcher(send);
let window: BrowserWindow | null = null;
// Main owns the window preferences: the decoration must be known before a window exists,
// and hardware acceleration before the app is ready.
const windowPreferences = () => join(app.getPath('userData'), 'window-preferences.json');
function savedPreferences() {
  let saved: { frame?: unknown; hardwareAcceleration?: unknown } | null = null;
  try {
    saved = JSON.parse(readFileSync(windowPreferences(), 'utf8'));
  } catch {
    // Defaults apply until a preference is saved.
  }
  const savedFrame = windowFrames.safeParse(saved?.frame);
  return {
    frame: savedFrame.success ? savedFrame.data : ('custom' as WindowFrame),
    hardwareAcceleration: saved?.hardwareAcceleration !== false,
  };
}
const savePreferences = () =>
  writeFileSync(windowPreferences(), JSON.stringify({ frame, hardwareAcceleration }), {
    mode: 0o600,
  });
let frame: WindowFrame = 'custom';
let hardwareAcceleration = true;
let registration = 'not_registered';
// Windows has no LaunchAgent in this demo: the packaged app runs the bundled service as its
// own child, from start until quit. Disabling is remembered beside the window preferences.
const windows = process.platform === 'win32';
const servicePreference = () => join(app.getPath('userData'), 'service-preferences.json');
let service: ChildProcess | null = null;
let restart: NodeJS.Timeout | null = null;
let earlyExits = 0;
let quitting = false;
function serviceEnabled() {
  try {
    return JSON.parse(readFileSync(servicePreference(), 'utf8')).enabled !== false;
  } catch {
    return true;
  }
}
function startService() {
  if (service || quitting) return;
  const logs = app.getPath('logs');
  mkdirSync(logs, { recursive: true });
  const log = openSync(join(logs, 'service.log'), 'a');
  const child = spawn(
    join(process.resourcesPath, 'runtime', 'node.exe'),
    [join(process.resourcesPath, 'backend', 'service.mjs')],
    {
      env: {
        ...process.env,
        KNOTER_DATA_DIR: dataDir,
        KNOTER_RESOURCES: join(process.resourcesPath, 'resources'),
        KNOTER_STOP_ON_STDIN_CLOSE: '1',
      },
      // The service stops in order when this pipe closes, including when the app dies.
      stdio: ['pipe', log, log],
      // Detached, or Windows ends the service with this process before it has stopped a
      // running worker, closed the database, and removed its lock.
      detached: true,
      windowsHide: true,
    },
  );
  closeSync(log);
  service = child;
  const started = Date.now();
  child.stdin!.on('error', () => {});
  child.on('error', () => {});
  child.once('close', () => {
    if (service !== child) return;
    service = null;
    // Like launchd's KeepAlive: an enabled service that ends on its own is started again.
    // One that ends at once is usually waiting for the previous app's service to finish
    // stopping, so the first retries come sooner.
    earlyExits = Date.now() - started < 30_000 ? earlyExits + 1 : 0;
    if (!quitting && serviceEnabled())
      restart = setTimeout(startService, earlyExits > 0 && earlyExits <= 5 ? 3000 : 10_000);
  });
}
async function stopService() {
  if (restart) clearTimeout(restart);
  restart = null;
  const child = service;
  if (!child) return;
  service = null;
  const closed = new Promise((resolve) => child.once('close', resolve));
  child.stdin!.end();
  // The service allows a running worker four seconds to stop before it exits.
  const timer = setTimeout(() => child.kill(), 8000);
  await closed;
  clearTimeout(timer);
}
async function childServiceControl(action: string) {
  if (action === 'register' || action === 'unregister') {
    const enabled = action === 'register';
    writeFileSync(servicePreference(), JSON.stringify({ enabled }), { mode: 0o600 });
    if (enabled) startService();
    else await stopService();
  }
  registration = service ? 'app_child_running' : 'app_child_stopped';
  return { status: registration, registration: 'child of the open app' };
}
async function serviceControl(action: string) {
  if (!app.isPackaged) {
    registration = 'development';
    if (action === 'status') return { status: registration };
    throw new Error(
      'Install the packaged demo app to register its background service. Development mode uses a separately started service.',
    );
  }
  if (windows) return childServiceControl(action);
  const helper = join(dirname(process.execPath), 'KnoterServiceControl');
  const { stdout } = await exec(helper, [action], { timeout: 15_000, maxBuffer: 32_000 });
  const result = JSON.parse(stdout);
  registration = result.status;
  return result;
}
function trusted(event: Electron.IpcMainInvokeEvent) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error('Untrusted renderer frame.');
}
async function chooseDirectory(title: string) {
  const r = await dialog.showOpenDialog(window!, {
    title,
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : realpath(r.filePaths[0]);
}
async function desktop(action: DesktopAction) {
  if (['enable', 'disable', 'status', 'approvalSettings'].includes(action)) {
    const result = await serviceControl(
      action === 'enable' ? 'register' : action === 'disable' ? 'unregister' : action,
    );
    if (action === 'enable') {
      watcher.registered.clear();
      setTimeout(() => void watcher.scan(), 1000);
    }
    return result;
  }
  if (action === 'restart') {
    await serviceControl('unregister');
    const result = await serviceControl('register');
    watcher.registered.clear();
    setTimeout(() => void watcher.scan(), 1000);
    return result;
  }
  if (action === 'chooseCli') {
    const r = await dialog.showOpenDialog(window!, {
      title: 'Choose your installed Codex CLI executable',
      properties: ['openFile'],
      // Windows: the native codex.exe; Node cannot start an npm .cmd shim directly.
      ...(windows
        ? { filters: [{ name: 'Executable', extensions: ['exe'] }] }
        : { defaultPath: '/opt/homebrew/bin' }),
    });
    if (!r.canceled)
      return send('configureCli', { provider: 'codex', path: await realpath(r.filePaths[0]) });
    return null;
  }
  if (action === 'chooseClaudeCode') {
    const r = await dialog.showOpenDialog(window!, {
      title: 'Choose your installed Claude Code executable',
      // macOS otherwise resolves the symlink to a versioned target that updates remove.
      properties: ['openFile', 'treatPackageAsDirectory', 'noResolveAliases'],
      defaultPath: join(app.getPath('home'), '.local', 'bin'),
      ...(windows ? { filters: [{ name: 'Executable', extensions: ['exe'] }] } : {}),
    });
    // Keep the launcher path: the native installer repoints it on each self-update.
    if (!r.canceled) return send('configureCli', { provider: 'claude', path: r.filePaths[0] });
    return null;
  }
  if (action === 'chooseFolder') {
    const path = await chooseDirectory('Watch a folder containing Markdown sources');
    if (!path) return null;
    await send('addWatch', { path });
    await watcher.scan();
    return `Watching ${path}`;
  }
  if (action === 'importMarkdown') {
    const r = await dialog.showOpenDialog(window!, {
      title: 'Import immutable Markdown snapshots',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (r.canceled) return null;
    for (const path of r.filePaths) await watcher.register(await realpath(path), null);
    return null;
  }
  if (action === 'backup' || action === 'exportWiki') {
    const parent = await chooseDirectory(
      action === 'backup'
        ? 'Choose where to save a complete backup'
        : 'Choose where to export Markdown',
    );
    if (!parent) return null;
    const path = join(parent, `knoter-${action}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    await send(action, { path });
    return path;
  }
  const path = await chooseDirectory('Choose a knoter backup to restore into this empty workspace');
  if (path) {
    await send('restoreBackup', { path });
    watcher.registered.clear();
  }
  return path;
}
function windowState(target: BrowserWindow): WindowState {
  // chrome://gpu values: `enabled`, `enabled_on`, … use the GPU; `disabled_software` does not.
  const gpu = app.getGPUFeatureStatus();
  return {
    platform: process.platform,
    frame,
    maximized: target.isMaximized(),
    fullscreen: target.isFullScreen(),
    hardwareAcceleration,
    gpu: {
      compositing: gpu.gpu_compositing.startsWith('enabled'),
      rasterization: gpu.rasterization.startsWith('enabled'),
    },
  };
}
async function createWindow(previous?: BrowserWindow) {
  const next = new BrowserWindow({
    ...(previous ? previous.getNormalBounds() : { width: 1440, height: 940 }),
    minWidth: 780,
    minHeight: 580,
    title: 'knoter',
    backgroundColor: '#f8f7f4',
    // The renderer draws the title bar; macOS keeps its traffic lights inside it.
    ...(frame === 'custom'
      ? process.platform === 'darwin'
        ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 13, y: 13 } }
        : { frame: false }
      : {}),
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  next.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  next.webContents.on('will-navigate', (event) => event.preventDefault());
  next.on('closed', () => {
    if (window === next) window = null;
  });
  const maximized = previous?.isMaximized();
  previous?.hide();
  window = next;
  await next.loadFile(join(__dirname, 'renderer', 'index.html'));
  if (maximized) next.maximize();
  // The replaced window closes only after its successor has loaded.
  previous?.destroy();
}
app.setName('knoter');
// The name would also rename the user data folder. The window's settings and the workspace
// already live in the folder of the app's first name; keep using it rather than start an
// empty one. Electron's documentation says it refuses a folder that does not exist, as on
// a first launch before the service has run, so make it first.
mkdirSync(defaultDataDir(), { recursive: true, mode: 0o700 });
app.setPath('userData', defaultDataDir());
// Read after the user data folder is set, and before ready, the only time
// Chromium accepts a GPU choice. Enabled leaves Chromium's own GPU path and driver checks.
({ frame, hardwareAcceleration } = savedPreferences());
if (!hardwareAcceleration) app.disableHardwareAcceleration();
if (!app.requestSingleInstanceLock()) app.quit();
else
  app.whenReady().then(async () => {
    ipcMain.handle('knoter:request', async (event, command: string, payload: unknown) => {
      trusted(event);
      if (!rendererCommands.has(command as Command))
        throw new Error('Command is not available to the renderer.');
      commands[command as Command].parse(payload);
      const result = await send(command, payload);
      if (command === 'snapshot') {
        const snapshot = result as { worker: Record<string, unknown> };
        snapshot.worker.registered = registration;
        snapshot.worker.pendingSources = [...watcher.pending].map(([p, e]) => `${p}: ${e}`);
      }
      return result;
    });
    ipcMain.handle('knoter:desktop', async (event, action: unknown) => {
      trusted(event);
      return desktop(desktopActions.parse(action));
    });
    ipcMain.handle('knoter:window', async (event, payload: unknown) => {
      trusted(event);
      const command = windowCommand.parse(payload);
      const target = window!;
      if (command.action === 'minimize') target.minimize();
      if (command.action === 'toggleMaximize') {
        if (target.isMaximized()) target.unmaximize();
        else target.maximize();
      }
      if (command.action === 'close') target.close();
      if (command.action === 'setFrame' && command.frame !== frame) {
        frame = command.frame;
        savePreferences();
        // A frame cannot change on a live window: replace it after this reply is sent.
        setImmediate(() => void createWindow(target));
      }
      if (
        command.action === 'setHardwareAcceleration' &&
        command.enabled !== hardwareAcceleration
      ) {
        hardwareAcceleration = command.enabled;
        savePreferences();
        // Chromium chooses its GPU path once per launch: restart after this reply is sent.
        setImmediate(() => {
          app.relaunch();
          app.quit();
        });
      }
      return windowState(target);
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'appMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' },
      ]),
    );
    if (windows && app.isPackaged && serviceEnabled()) startService();
    await createWindow();
    void serviceControl('status').catch(() => {
      registration = 'error';
    });
    watcher.start();
    powerMonitor.on('resume', () => void watcher.scan());
    app.on('second-instance', () => {
      window?.show();
      window?.focus();
    });
  });
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  watcher.close();
  quitting = true;
  // Closing its stdin lets the service finish in order after this process has gone.
  void stopService();
});
