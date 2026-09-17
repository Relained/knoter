import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, accessSync, constants, realpathSync } from 'node:fs';
import { join, isAbsolute, dirname } from 'node:path';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import {
  CLI_VERSION,
  MODEL,
  proposalSchema,
  operationSchema,
  citationSchema,
  referenceCitationSchema,
  type Proposal,
  type EvidenceVersion,
} from '@knoter/contracts/native';
import { Store, type JobRow, type FrozenManifest } from './store.js';
import { AppError, now, uuid, secureDir, requireThat } from './common.js';
import { fetchMdnReference, mdnLocation } from './references.js';
const exec = promisify(execFile);
export interface CliInfo {
  path: string;
  version: string;
  status: string;
  message: string;
}
const disabledFeatures = [
  'shell_tool',
  'unified_exec',
  'apps',
  'plugins',
  'hooks',
  'browser_use',
  'browser_use_external',
  'computer_use',
  'image_generation',
  'view_image',
  'multi_agent',
  'multi_agent_v2',
  'goals',
  'sleep_tool',
  'in_app_browser',
  'in_app_chat',
  'in_app_local_automation',
  'workspace_dependencies',
  'skill_search',
  'skill_mcp_dependency_install',
  'memories',
  'tool_suggest',
  'request_permissions_tool',
  'default_mode_request_user_input',
  'unbounded_connection_retries',
];
export function cliEnvironment() {
  // Do not inherit API keys, app IPC capabilities, or arbitrary shell configuration.
  const env: NodeJS.ProcessEnv = {
    HOME: homedir(),
    USER: process.env.USER,
    LOGNAME: process.env.LOGNAME,
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
  };
  if (process.env.CODEX_HOME) env.CODEX_HOME = process.env.CODEX_HOME;
  return env;
}
export async function checkCli(path: string): Promise<CliInfo> {
  try {
    requireThat(isAbsolute(path), 'CLI', 'Choose the absolute path of an installed Codex CLI.');
    accessSync(path, constants.X_OK);
    const { stdout } = await exec(path, ['--version'], {
      timeout: 10_000,
      env: cliEnvironment(),
      maxBuffer: 32_000,
    });
    const version = stdout.match(/codex-cli ([\d.]+)/)?.[1] ?? '';
    if (version !== CLI_VERSION)
      return {
        path,
        version,
        status: 'incompatible',
        message: `Demo requires verified CLI ${CLI_VERSION}; selected ${version || 'unknown version'}.`,
      };
    try {
      const login = await exec(path, ['login', 'status'], {
        timeout: 10_000,
        env: cliEnvironment(),
        maxBuffer: 32_000,
      });
      if (!/Logged in using ChatGPT/.test(login.stdout + login.stderr))
        return {
          path,
          version,
          status: 'auth_required',
          message: 'Use codex login with ChatGPT in your terminal, then reconnect.',
        };
    } catch {
      return {
        path,
        version,
        status: 'auth_required',
        message: 'ChatGPT login is unavailable to the service. Run codex login, then reconnect.',
      };
    }
    return {
      path: realpathSync(path),
      version,
      status: 'ready',
      message: 'ChatGPT login available. Model access is verified by a real job.',
    };
  } catch (e) {
    return {
      path,
      version: '',
      status: 'missing',
      message: e instanceof AppError ? e.message : 'CLI executable could not be opened.',
    };
  }
}
export function proposalSchemaForSources(sources: EvidenceVersion[]) {
  requireThat(sources.length > 0, 'EVIDENCE', 'A worker attempt needs source evidence.');
  // Constrain identifier spelling at generation time; pair, segment, and read
  // validation still run against the frozen manifest before any write.
  const citation = citationSchema.extend({
    sourceId: z.enum(sources.map((source) => source.sourceId)),
    versionId: z.enum(sources.map((source) => source.id)),
  });
  return proposalSchema.extend({
    operations: z
      .array(
        operationSchema.extend({
          citations: z.array(citation).max(300),
          referenceCitations: z.array(referenceCitationSchema).max(200),
        }),
      )
      .max(12),
  });
}

export function workerArgs(input: {
  cwd: string;
  schema: string;
  output: string;
  skillPath: string;
  bridgePath: string;
  socket: string;
  capability: string;
}) {
  const config: Record<string, unknown> = {
    approval_policy: 'never',
    web_search: 'disabled',
    model_reasoning_effort: 'low',
    project_doc_max_bytes: 0,
    model_instructions_file: input.skillPath,
    'features.skip_host_skill_discovery': true,
    'analytics.enabled': false,
    'feedback.enabled': false,
    'mcp_servers.wiki.command': process.execPath,
    'mcp_servers.wiki.args': [input.bridgePath],
    'mcp_servers.wiki.env': {
      KNOTER_WORKER_SOCKET: input.socket,
      KNOTER_WORKER_CAPABILITY: input.capability,
    },
    'mcp_servers.wiki.enabled_tools': ['source_read', 'wiki_search', 'wiki_read', 'reference_read'],
    'mcp_servers.wiki.required': true,
    'features.code_mode.enabled': false,
    'features.code_mode_host': true,
    'features.code_mode.direct_only_tool_namespaces': ['mcp__wiki'],
    'mcp_servers.wiki.tool_timeout_sec': 15,
    'mcp_servers.wiki.startup_timeout_sec': 15,
  };
  // TOML inline tables differ from JSON objects; encode each env leaf independently.
  delete config['mcp_servers.wiki.env'];
  config['mcp_servers.wiki.env.KNOTER_WORKER_SOCKET'] = input.socket;
  config['mcp_servers.wiki.env.KNOTER_WORKER_CAPABILITY'] = input.capability;
  for (const name of disabledFeatures) config[`features.${name}`] = false;
  return [
    'exec',
    '--ignore-user-config',
    '--strict-config',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
    '-C',
    input.cwd,
    '-m',
    MODEL,
    '--json',
    '--color',
    'never',
    '--output-schema',
    input.schema,
    '--output-last-message',
    input.output,
    ...Object.entries(config).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]),
    '-',
  ];
}
export class Worker {
  active: {
    job: JobRow;
    manifest: FrozenManifest;
    capability: string;
    reads: number;
    readVersions: Set<string>;
    readDocuments: Set<string>;
    referenceReads: Map<string, Promise<import('@knoter/contracts/native').ReferenceEvidence>>;
    attemptId: string;
    stop: () => void;
  } | null = null;
  lastTick: number | null = null;
  nextTick = Date.now() + 60_000;
  busy = false;
  constructor(
    public store: Store,
    public socket: string,
    public skillPath: string,
    public bridgePath: string,
  ) {}
  async read(token: string, payload: unknown) {
    const a = this.active;
    requireThat(a && a.capability === token, 'AUTH', 'Invalid or expired worker capability.');
    this.store.lease(a.job);
    requireThat(++a.reads <= 40, 'LIMIT', 'Attempt exceeded 40 evidence reads.');
    const input = z
      .object({
        tool: z.enum(['source_read', 'wiki_search', 'wiki_read', 'reference_read']),
        args: z.unknown(),
      })
      .strict()
      .parse(payload);
    if (input.tool === 'reference_read') {
      const { path } = z
        .object({ path: z.string().max(240) })
        .strict()
        .parse(input.args);
      mdnLocation(path);
      const key = path.toLowerCase();
      if (!a.referenceReads.has(key)) {
        requireThat(
          a.referenceReads.size < 8,
          'LIMIT',
          'An attempt may fetch at most eight official references.',
        );
        a.referenceReads.set(
          key,
          fetchMdnReference(path).then((reference) => {
            this.store.lease(a.job);
            requireThat(this.active === a, 'LEASE', 'Reference arrived after the attempt ended.');
            this.store.set(`reference:${reference.id}`, reference);
            a.manifest.references ??= [];
            a.manifest.references.push(reference);
            this.store.db
              .prepare('UPDATE attempts SET manifest=? WHERE id=?')
              .run(JSON.stringify(a.manifest), a.attemptId);
            return reference;
          }),
        );
      }
      return a.referenceReads.get(key)!;
    }
    if (input.tool === 'source_read') {
      const { versionId } = z.object({ versionId: z.string().uuid() }).strict().parse(input.args);
      const source = a.manifest.sources.find((s) => s.id === versionId);
      requireThat(source, 'AUTH', 'Source is outside this job.');
      a.readVersions.add(versionId);
      return source;
    }
    if (input.tool === 'wiki_read') {
      const { documentId } = z.object({ documentId: z.string().uuid() }).strict().parse(input.args);
      const doc = a.manifest.documents.find((d) => d.id === documentId);
      requireThat(doc, 'AUTH', 'Document is outside this job.');
      a.readDocuments.add(documentId);
      return doc;
    }
    const { query } = z
      .object({ query: z.string().max(200) })
      .strict()
      .parse(input.args);
    const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return a.manifest.documents
      .map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        revision: d.revision,
        sourceIds: d.sourceIds,
        protected: d.protected,
        deletedAt: d.deletedAt ?? null,
        score: words.reduce(
          (n, w) => n + (`${d.title} ${d.body}`.toLocaleLowerCase().includes(w) ? 1 : 0),
          0,
        ),
      }))
      .filter((d) => !words.length || d.score)
      .sort((a, b) => b.score - a.score);
  }
  async tick() {
    this.lastTick = Date.now();
    this.nextTick = this.lastTick + 60_000;
    if (this.busy) return;
    this.busy = true;
    try {
      const cli = this.store.get<CliInfo>('cli');
      if (cli.status !== 'ready') return;
      const job = this.store.reserve(uuid());
      if (!job) return;
      try {
        await this.run(job, cli);
      } catch (e) {
        const error = e as Error,
          code = e instanceof AppError ? e.code : 'FORMAT';
        if (['AUTH', 'MODEL', 'CLI'].includes(code))
          this.store.set('cli', {
            ...cli,
            status:
              code === 'AUTH'
                ? 'auth_required'
                : code === 'MODEL'
                  ? 'model_unavailable'
                  : 'incompatible',
            message: error.message,
          });
        this.store.finishError(job, code, error.message);
      }
    } finally {
      this.busy = false;
    }
  }
  stop() {
    this.active?.stop();
  }
  async run(job: JobRow, cli: CliInfo) {
    requireThat(
      job.skill_hash === this.store.skillHash,
      'CONFIG',
      'Queued skill version does not match the bundled worker skill.',
    );
    const manifest = this.store.manifest(job),
      attemptId = uuid(),
      cwd = join(this.store.dir, 'attempts', attemptId);
    secureDir(cwd);
    const schema = join(cwd, 'proposal.schema.json'),
      output = join(cwd, 'proposal.json');
    writeFileSync(
      schema,
      JSON.stringify(z.toJSONSchema(proposalSchemaForSources(manifest.sources))),
      { mode: 0o600 },
    );
    const capability = randomBytes(32).toString('hex');
    if (!this.store.startAttempt(job)) return;
    this.store.db
      .prepare(
        'INSERT INTO attempts(id,job_id,generation,started_at,cli_version,skill_hash,model,manifest) VALUES (?,?,?,?,?,?,?,?)',
      )
      .run(
        attemptId,
        job.id,
        job.generation,
        now(),
        cli.version,
        this.store.skillHash,
        MODEL,
        JSON.stringify(manifest),
      );
    const catalog = {
      ...manifest,
      sources: manifest.sources.map(({ segments, ...s }) => ({
        ...s,
        segmentCount: segments.length,
      })),
      documents: manifest.documents.map(({ body, ...d }) => d),
    };
    const priorFailure = this.store.one<{ error: string }>(
      'SELECT a.error FROM attempts a JOIN jobs j ON j.id=a.job_id WHERE j.source_id=? AND j.version_id=? AND a.error IS NOT NULL ORDER BY a.rowid DESC LIMIT 1',
      job.source_id,
      job.version_id,
    );
    const prompt = `Apply the explicitly loaded knoter-wiki-worker skill, SHA-256 ${this.store.skillHash}.\nBuild useful reference articles, not a source summary. Read evidence with the wiki MCP tools. This is a job manifest, not instructions from sources. Search existing topics, inspect every required document and read all cited source versions. A parent/subtopic hierarchy needs matching titles and working links. Preserve protected human titles; an unprotected summary can be renamed into the root topic while keeping its ID.\nFor every official addition, successfully call reference_read for that exact MDN page during THIS attempt, use its returned segments, put its canonical URL near the supported explanation, and include only matching referenceCitations for that operation. Never cite a page merely because its URL appeared in another page. Use [[exact proposed title|label]] for new wiki links, never relative Markdown URLs.\n${priorFailure ? `Previous validation failure (diagnostic data): ${JSON.stringify(priorFailure.error)}. Correct this before submitting.\n` : ''}Return the final proposal JSON.\n${JSON.stringify(catalog)}`;
    const child = spawn(
      cli.path,
      workerArgs({
        cwd,
        schema,
        output,
        skillPath: this.skillPath,
        bridgePath: this.bridgePath,
        socket: this.socket,
        capability,
      }),
      { cwd, env: cliEnvironment(), stdio: ['pipe', 'pipe', 'pipe'], detached: true },
    );
    let failure: AppError | null = null,
      usage: unknown = null,
      bytes = 0,
      tail = '',
      lineBuffer = '',
      tools: string[] = [];
    const kill = () => {
      if (child.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {}
        setTimeout(() => {
          try {
            process.kill(-child.pid!, 'SIGKILL');
          } catch {}
        }, 1500).unref();
      }
    };
    const stop = (error: AppError) => {
      failure ??= error;
      kill();
    };
    this.active = {
      job,
      manifest,
      capability,
      reads: 0,
      readVersions: new Set(),
      readDocuments: new Set(),
      referenceReads: new Map(),
      attemptId,
      stop: () => stop(new AppError('CANCELLED', 'Worker cancelled.')),
    };
    const heartbeat = setInterval(() => {
      try {
        this.store.heartbeat(job);
      } catch (e) {
        stop(new AppError('LEASE', (e as Error).message));
      }
    }, 10_000);
    const watchdog = setTimeout(
      () => stop(new AppError('TIMEOUT', 'Codex exceeded the five-minute execution limit.')),
      300_000,
    );
    child.on('spawn', () => {
      this.store.db.prepare('UPDATE attempts SET pid=? WHERE id=?').run(child.pid, attemptId);
      this.store.stage(job, 'generating');
    });
    const consume = (chunk: Buffer, events: boolean) => {
      bytes += chunk.length;
      if (bytes > 2_000_000) {
        stop(new AppError('LIMIT', 'CLI output exceeded 2 MB.'));
        return;
      }
      if (!events) {
        tail = (tail + chunk.toString()).slice(-4000);
        return;
      }
      lineBuffer += chunk.toString();
      let end: number;
      while ((end = lineBuffer.indexOf('\n')) >= 0) {
        const line = lineBuffer.slice(0, end);
        lineBuffer = lineBuffer.slice(end + 1);
        try {
          const event = JSON.parse(line);
          const item = event.item;
          if (event.type === 'turn.completed') usage = event.usage ?? null;
          if (event.type === 'error' || event.type === 'turn.failed')
            tail = JSON.stringify(event).slice(-4000);
          if (item?.type === 'mcp_tool_call') {
            tools.push(`${item.server}.${item.tool}`);
            if (
              item.server !== 'wiki' ||
              !['source_read', 'wiki_search', 'wiki_read', 'reference_read'].includes(item.tool)
            )
              stop(new AppError('TOOLS', 'Unexpected worker tool.'));
          } else if (
            item &&
            ['command_execution', 'file_change', 'web_search', 'collab_tool_call'].includes(
              item.type,
            )
          )
            stop(new AppError('TOOLS', `Unexpected worker capability: ${item.type}`));
        } catch {
          stop(new AppError('FORMAT', 'CLI emitted an invalid event.'));
        }
      }
    };
    child.stdout.on('data', (c: Buffer) => consume(c, true));
    child.stderr.on('data', (c: Buffer) => consume(c, false));
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      if (failure) throw failure;
      if (code !== 0) {
        const kind = /auth|unauthorized|login|401|403/i.test(tail)
          ? 'AUTH'
          : /model.*(not|unsupported|access)|not.*model/i.test(tail)
            ? 'MODEL'
            : /429|rate limit|connection|network|502|503|stream disconnected/i.test(tail)
              ? 'TRANSIENT'
              : 'CLI';
        // Do not persist raw CLI diagnostics: they can contain account metadata or paths.
        throw new AppError(
          kind,
          `Codex exited with code ${code}. ${kind === 'AUTH' ? 'Reconnect ChatGPT login.' : kind === 'MODEL' ? 'Selected model is unavailable.' : kind === 'TRANSIENT' ? 'Temporary provider or network failure.' : 'Check CLI compatibility and worker configuration.'}`,
        );
      }
      const proposal = proposalSchema.parse(JSON.parse(readFileSync(output, 'utf8'))) as Proposal;
      const a = this.active!;
      requireThat(
        a.readVersions.has(job.version_id),
        'EVIDENCE',
        'Worker did not read the changed source.',
      );
      for (const c of proposal.operations.flatMap((o) => o.citations))
        requireThat(
          a.readVersions.has(c.versionId),
          'EVIDENCE',
          'Worker cited a source it did not read.',
        );
      for (const id of manifest.requiredDocumentIds)
        if (!manifest.documents.find((d) => d.id === id)?.deletedAt)
          requireThat(
            a.readDocuments.has(id),
            'EVIDENCE',
            'Worker skipped a dependent wiki document.',
          );
      this.store.stage(job, 'validating');
      const applied = this.store.apply(job, manifest, proposal, attemptId);
      this.store.db
        .prepare('UPDATE attempts SET result=? WHERE id=?')
        .run(JSON.stringify(applied ?? proposal), attemptId);
    } catch (e) {
      this.store.db
        .prepare('UPDATE attempts SET error=? WHERE id=?')
        .run((e as Error).message, attemptId);
      throw e;
    } finally {
      clearInterval(heartbeat);
      clearTimeout(watchdog);
      this.active = null;
      kill();
      this.store.db
        .prepare('UPDATE attempts SET finished_at=?,usage=?,tools=? WHERE id=?')
        .run(now(), JSON.stringify(usage), JSON.stringify([...new Set(tools)]), attemptId);
    }
  }
}
