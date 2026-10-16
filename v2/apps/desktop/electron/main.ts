import { app, BrowserWindow, ipcMain, dialog, powerMonitor, shell, Menu, session } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { execFile } from 'node:child_process';
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
// Main owns the decoration preference: it must be known before a window exists.
const windowPreferences = () => join(app.getPath('userData'), 'window-preferences.json');
function savedFrame(): WindowFrame {
  try {
    return windowFrames.parse(JSON.parse(readFileSync(windowPreferences(), 'utf8')).frame);
  } catch {
    return 'custom';
  }
}
let frame: WindowFrame = 'custom';
let registration = 'not_registered';
async function serviceControl(action: string) {
  if (!app.isPackaged) {
    registration = 'development';
    if (action === 'status') return { status: registration };
    throw new Error(
      'Install the packaged demo app to register its background service. Development mode uses a separately started service.',
    );
  }
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
      defaultPath: '/opt/homebrew/bin',
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
  return {
    platform: process.platform,
    frame,
    maximized: target.isMaximized(),
    fullscreen: target.isFullScreen(),
  };
}
async function createWindow(previous?: BrowserWindow) {
  const next = new BrowserWindow({
    ...(previous ? previous.getNormalBounds() : { width: 1440, height: 940 }),
    minWidth: 780,
    minHeight: 580,
    title: 'Knoter Wiki Demo',
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
app.setName('Knoter Wiki Demo');
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
        writeFileSync(windowPreferences(), JSON.stringify({ frame: command.frame }), {
          mode: 0o600,
        });
        frame = command.frame;
        // A frame cannot change on a live window: replace it after this reply is sent.
        setImmediate(() => void createWindow(target));
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
    frame = savedFrame();
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
app.on('before-quit', () => watcher.close());
