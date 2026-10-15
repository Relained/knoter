import { createServer } from 'node:net';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  unlinkSync,
  chmodSync,
  statSync,
  rmSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  commands,
  requestSchema,
  PROTOCOL,
  MAX_WIRE_BYTES,
  providerProfiles,
  type Command,
} from '@knoter/contracts/native';
import { Store } from './store.js';
import { Worker, checkCli, codexModels } from './worker.js';
import { claudeModels } from './claude.js';
import { ChatService } from './chat.js';
import { loadSkill } from './skill.js';
import {
  AppError,
  defaultDataDir,
  socketFor,
  secureDir,
  atomicWrite,
  requireThat,
} from './common.js';
import { backup, restoreEmpty, exportWiki } from './backup.js';

process.umask(0o077);
const here = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(process.env.KNOTER_DATA_DIR ?? defaultDataDir());
const resources = resolve(process.env.KNOTER_RESOURCES ?? join(here, '..', 'resources'));
const skill = loadSkill(join(resources, 'skills', 'wiki-worker'));
const chatSkillPath = join(resources, 'skills', 'wiki-chat', 'SKILL.md');
secureDir(dataDir);
// A PID lock is acquired before opening SQLite. A live owner's lock is never removed.
// The owner runs as this user and writes the lock after it starts, so a PID that cannot
// be signalled (EPERM) or whose process started after the lock was written was reused.
// ps truncates the start to the second, so a tie or an unreadable answer keeps the lock.
const lockPath = join(dataDir, 'service.lock');
if (existsSync(lockPath)) {
  const owner = Number(readFileSync(lockPath, 'utf8'));
  let alive = true;
  try {
    process.kill(owner, 0);
    const started = execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(owner)], {
      encoding: 'utf8',
      env: { ...process.env, LC_ALL: 'C', TZ: 'UTC0' },
    });
    if (Date.parse(`${started.trim()} UTC`) > statSync(lockPath).mtimeMs) alive = false;
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ESRCH' || code === 'EPERM') alive = false;
  }
  if (alive) throw new Error('Another service owns this workspace.');
  unlinkSync(lockPath);
}
writeFileSync(lockPath, String(process.pid), { flag: 'wx', mode: 0o600 });
const tokenPath = join(dataDir, 'connection.token');
if (!existsSync(tokenPath)) atomicWrite(tokenPath, randomBytes(32).toString('hex'));
const token = readFileSync(tokenPath, 'utf8');
const socket = socketFor(dataDir);
secureDir(dirname(socket));
if (existsSync(socket)) unlinkSync(socket);
let store = new Store(dataDir, skill.hash);
const worker = new Worker(store, socket, skill, join(here, 'bridge.mjs'));
const chat = new ChatService(store, socket, chatSkillPath, skill, join(here, 'bridge.mjs'));
let maintenance = false;
const sameToken = (candidate: string) =>
  candidate.length === token.length && timingSafeEqual(Buffer.from(candidate), Buffer.from(token));
async function dispatch(command: Command, payload: unknown) {
  // Validate again at the service boundary, independently of Electron main.
  const input = commands[command].parse(payload);
  if (maintenance && command !== 'snapshot')
    throw new AppError('BUSY', 'Backup restoration is in progress.');
  switch (command) {
    case 'snapshot':
      return {
        ...store.snapshot(worker.lastTick, worker.nextTick),
        messages: chat.messages(),
        chat: chat.info(),
      };
    case 'saveDocument':
      return store.saveDocument(commands.saveDocument.parse(input));
    case 'createDocument':
      return store.createDocument();
    case 'deleteDocument':
    case 'restoreDocument':
    case 'toggleFavorite':
      return store.mutateDocument(commands[command].parse(input).id, command);
    case 'restoreRevision':
      return store.restoreRevision(commands.restoreRevision.parse(input).id);
    case 'updateSettings': {
      store.set('settings', { ...store.get<object>('settings'), ...input });
      store.event('Preferences saved', 'Worker and appearance preferences updated.');
      return;
    }
    case 'retrySource':
      return store.retry(commands.retrySource.parse(input).id);
    case 'cancelJob': {
      store.cancel(commands.cancelJob.parse(input).id);
      if (worker.active?.job.id === commands.cancelJob.parse(input).id) worker.stop();
      return;
    }
    case 'runNow': {
      void worker.tick();
      return;
    }
    case 'resolveProposal': {
      const p = commands.resolveProposal.parse(input);
      return store.resolveProposal(p.id, p.accept);
    }
    case 'sourceVersion':
      return store.version(commands.sourceVersion.parse(input).id);
    case 'referenceVersion':
      return store.reference(commands.referenceVersion.parse(input).id);
    case 'events':
      return store.all(
        'SELECT cursor,data FROM events WHERE cursor>? ORDER BY cursor LIMIT 100',
        commands.events.parse(input).cursor,
      );
    case 'watches':
      return store.watches();
    case 'addWatch':
      return store.addWatch(commands.addWatch.parse(input).path);
    case 'removeWatch': {
      const p = commands.removeWatch.parse(input);
      store.db.transaction(() => {
        store.db.prepare('UPDATE sources SET watch_id=NULL WHERE watch_id=?').run(p.id);
        store.db.prepare('DELETE FROM watches WHERE id=?').run(p.id);
      })();
      return;
    }
    case 'sourceSnapshot':
      return store.ingest(commands.sourceSnapshot.parse(input));
    case 'scanComplete': {
      const p = commands.scanComplete.parse(input);
      return store.scanComplete(p.watchId, p.paths, p.error);
    }
    case 'configureCli':
    case 'checkCli': {
      const { provider, path } =
        command === 'configureCli' ? commands.configureCli.parse(input) : store.cli();
      const info = await checkCli(provider, path);
      store.set('cli', info);
      // The side chat can use every ready connection, with the models that CLI offers.
      store.setConnection({
        ...info,
        ...(info.status === 'ready'
          ? { models: await (provider === 'claude' ? claudeModels : codexModels)(info.path) }
          : {}),
      });
      store.event(`${providerProfiles[provider].label} connection checked`, info.message);
      return info;
    }
    case 'backup':
      return backup(store, commands.backup.parse(input).path);
    case 'exportWiki':
      return exportWiki(store, commands.exportWiki.parse(input).path);
    case 'chatSend':
      return chat.send(commands.chatSend.parse(input));
    case 'chatCancel':
      return chat.cancel();
    case 'chatNewThread':
      return chat.newThread();
    case 'restoreBackup': {
      requireThat(
        !worker.busy && !chat.active,
        'BUSY',
        'Pause and finish or cancel the current worker and chat reply before restoration.',
      );
      maintenance = true;
      try {
        store = restoreEmpty(store, commands.restoreBackup.parse(input).path);
        worker.store = store;
        chat.store = store;
        return;
      } finally {
        maintenance = false;
      }
    }
  }
}
const server = createServer((client) => {
  let pending = Buffer.alloc(0),
    handled = false;
  client.setTimeout(20_000, () => client.destroy());
  client.on('error', () => {});
  client.on('data', (chunk) => {
    if (handled) return;
    pending = Buffer.concat([pending, chunk]);
    if (pending.length > MAX_WIRE_BYTES) {
      client.destroy();
      return;
    }
    const end = pending.indexOf(10);
    if (end < 0) return;
    handled = true;
    void (async () => {
      let requestId = '00000000-0000-4000-8000-000000000000';
      try {
        const envelope = requestSchema.parse(JSON.parse(pending.subarray(0, end).toString()));
        requestId = envelope.requestId;
        let result: unknown;
        if (envelope.command === 'workerRead')
          result = chat.owns(envelope.token)
            ? await chat.read(envelope.token, envelope.payload)
            : await worker.read(envelope.token, envelope.payload);
        else {
          requireThat(sameToken(envelope.token), 'AUTH', 'Service handshake failed.');
          requireThat(Object.hasOwn(commands, envelope.command), 'COMMAND', 'Unknown command.');
          result = await dispatch(envelope.command as Command, envelope.payload);
        }
        const response = JSON.stringify({
          protocol: PROTOCOL,
          requestId,
          ok: true,
          result: result ?? null,
        });
        requireThat(
          Buffer.byteLength(response) < MAX_WIRE_BYTES,
          'LIMIT',
          'Response exceeds demo transport limit.',
        );
        client.end(response + '\n');
      } catch (e) {
        const code = e instanceof AppError ? e.code : 'INVALID_REQUEST';
        const message =
          e instanceof AppError
            ? e.message
            : 'Request could not be completed. Check the input and service configuration.';
        client.end(
          JSON.stringify({ protocol: PROTOCOL, requestId, ok: false, error: { code, message } }) +
            '\n',
        );
      }
    })();
  });
});
server.listen(socket, () => {
  chmodSync(socket, 0o600);
  console.log(JSON.stringify({ event: 'ready', pid: process.pid, socket }));
  void worker.tick();
});
const scheduler = setInterval(() => {
  if (!maintenance) void worker.tick();
}, 60_000);
async function shutdown() {
  clearInterval(scheduler);
  worker.stop();
  chat.stop();
  server.close();
  const until = Date.now() + 4000;
  while ((worker.busy || chat.active) && Date.now() < until)
    await new Promise((r) => setTimeout(r, 50));
  store.db.close();
  // server.close() already removed the socket; force keeps that from skipping the lock.
  try {
    rmSync(socket, { force: true });
    rmSync(lockPath, { force: true });
  } catch {}
  process.exit(0);
}
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
process.on('uncaughtException', (e) => {
  console.error(JSON.stringify({ event: 'fatal', message: e.message }));
  void shutdown();
});
