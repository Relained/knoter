// Claude Code adapter for the wiki worker. The CLI receives no built-in tools; the
// bundled MCP bridge is its only capability, and each attempt re-checks the tool
// surface the CLI reports because its auto-updates can change defaults.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { accessSync, constants } from 'node:fs';
import { isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import {
  CLAUDE_MIN_VERSION,
  CLAUDE_MODEL,
  EVIDENCE_TOOLS,
  providerProfiles,
} from '@knoter/contracts/native';
import { AppError, requireThat } from './common.js';
import type { CliInfo, CliSession } from './worker.js';
const exec = promisify(execFile);
const evidenceTools = EVIDENCE_TOOLS.map((name) => `mcp__wiki__${name}`);
// --json-schema is delivered through this built-in tool.
const allowedTools = new Set([...evidenceTools, 'StructuredOutput']);
export function versionAtLeast(version: string, minimum: string) {
  const a = version.split('.').map(Number),
    b = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
}
export function claudeEnvironment() {
  // Same minimal inheritance as Codex: no API keys, app IPC capabilities, or shell
  // configuration. OAuth credentials stay in the user's keychain/config directory.
  const env: NodeJS.ProcessEnv = {
    HOME: homedir(),
    USER: process.env.USER,
    LOGNAME: process.env.LOGNAME,
    TMPDIR: process.env.TMPDIR ?? '/tmp',
    PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
    DISABLE_AUTOUPDATER: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    MCP_TIMEOUT: '15000',
    MCP_TOOL_TIMEOUT: '15000',
    // A large note can exceed the default MCP result cap, which would truncate evidence.
    MAX_MCP_OUTPUT_TOKENS: '80000',
  };
  if (process.env.CLAUDE_CONFIG_DIR) env.CLAUDE_CONFIG_DIR = process.env.CLAUDE_CONFIG_DIR;
  return env;
}
export async function checkClaude(path: string): Promise<CliInfo> {
  const base = { provider: 'claude' as const, path };
  try {
    requireThat(isAbsolute(path), 'CLI', 'Choose the absolute path of an installed Claude Code.');
    accessSync(path, constants.X_OK);
  } catch (e) {
    return {
      ...base,
      version: '',
      status: 'missing',
      message: e instanceof AppError ? e.message : 'Claude Code executable could not be opened.',
    };
  }
  let version = '';
  try {
    const { stdout } = await exec(path, ['--version'], {
      timeout: 10_000,
      env: claudeEnvironment(),
      maxBuffer: 32_000,
    });
    version = stdout.match(/^([\d.]+) \(Claude Code\)/m)?.[1] ?? '';
  } catch {
    return {
      ...base,
      version,
      status: 'missing',
      message:
        'Claude Code did not start without shell PATH. Select the native or Homebrew executable.',
    };
  }
  if (!version || !versionAtLeast(version, CLAUDE_MIN_VERSION))
    return {
      ...base,
      version,
      status: 'incompatible',
      message: `Demo requires Claude Code ${CLAUDE_MIN_VERSION} or newer; selected ${version || 'unknown version'}.`,
    };
  try {
    const { stdout } = await exec(path, ['auth', 'status', '--json'], {
      timeout: 10_000,
      env: claudeEnvironment(),
      maxBuffer: 32_000,
    });
    // Keep only the login state: the status also lists account and organization details.
    if (JSON.parse(stdout).loggedIn !== true) throw new Error('logged out');
  } catch {
    return {
      ...base,
      version,
      status: 'auth_required',
      message: 'Run claude auth login in your terminal, then reconnect.',
    };
  }
  // The launcher path is kept rather than its versioned target, so updates stay connected.
  return {
    ...base,
    version,
    status: 'ready',
    message: 'Claude login available. Model access is verified by a real job.',
  };
}
export function claudeArgs(input: { mcpConfig: string; schema: string; skill: string }) {
  return [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--model',
    CLAUDE_MODEL,
    '--effort',
    providerProfiles.claude.effort,
    '--tools',
    '',
    '--strict-mcp-config',
    '--mcp-config',
    input.mcpConfig,
    '--allowedTools',
    evidenceTools.join(','),
    '--permission-mode',
    'dontAsk',
    '--setting-sources',
    '',
    '--settings',
    JSON.stringify({ disableAllHooks: true }),
    '--disable-slash-commands',
    '--no-session-persistence',
    '--system-prompt',
    input.skill,
    '--json-schema',
    input.schema,
  ];
}
interface ClaudeResult {
  subtype?: string;
  is_error?: boolean;
  api_error_status?: number | null;
  result?: unknown;
  structured_output?: unknown;
  usage?: unknown;
}
export function claudeSession(input: {
  mcpConfig: string;
  schema: string;
  skill: string;
}): CliSession {
  let result: ClaudeResult | null = null,
    apiError = '',
    version = '';
  const session: CliSession = {
    label: 'Claude Code',
    args: claudeArgs(input),
    env: claudeEnvironment(),
    tail: '',
    usage: null,
    tools: [],
    version: () => version,
    event(event) {
      if (event.type === 'system' && event.subtype === 'init') {
        version = String(event.claude_code_version ?? '');
        const tools: string[] = Array.isArray(event.tools) ? event.tools : [];
        const unexpected = tools.filter((tool) => !allowedTools.has(tool));
        if (unexpected.length)
          return new AppError('TOOLS', `Unexpected worker capability: ${unexpected.join(', ')}`);
        const servers: { name?: string; status?: string }[] = event.mcp_servers ?? [];
        if (
          !evidenceTools.every((tool) => tools.includes(tool)) ||
          servers.some((s) => s.name !== 'wiki' || s.status !== 'connected')
        )
          return new AppError('TOOLS', 'Wiki evidence tools are unavailable to Claude Code.');
        if (!versionAtLeast(version, CLAUDE_MIN_VERSION))
          return new AppError('CLI', `Claude Code ${version} is older than the verified version.`);
      } else if (event.type === 'assistant') {
        if (event.error) apiError = String(event.error);
        for (const block of event.message?.content ?? []) {
          if (block.type === 'tool_use') {
            if (!allowedTools.has(block.name))
              return new AppError('TOOLS', 'Unexpected worker tool.');
            if (block.name !== 'StructuredOutput')
              session.tools.push(block.name.replace('mcp__wiki__', 'wiki.'));
          } else if (['server_tool_use', 'mcp_tool_use'].includes(block.type))
            return new AppError('TOOLS', `Unexpected worker capability: ${block.type}`);
        }
      } else if (event.type === 'result') {
        result = event;
        session.usage = event.usage ?? null;
      }
      return null;
    },
    finish(code) {
      if (code !== 0 || !result || result.is_error) {
        const status = result?.api_error_status ?? 0;
        const reason = `${apiError} ${typeof result?.result === 'string' ? result.result : ''} ${session.tail}`;
        const kind =
          status === 401 || status === 403 || /authentication|billing|oauth|login/i.test(apiError)
            ? 'AUTH'
            : status === 404 || /model_not_found/.test(apiError)
              ? 'MODEL'
              : status === 429 ||
                  status >= 500 ||
                  /rate.?limit|overloaded|server_error|network|connection|ECONN/i.test(reason)
                ? 'TRANSIENT'
                : 'CLI';
        // Do not persist raw CLI diagnostics: they can contain account metadata or paths.
        throw new AppError(
          kind,
          `Claude Code exited with code ${code}${result?.subtype && result.subtype !== 'success' ? ` (${result.subtype})` : ''}. ${kind === 'AUTH' ? 'Reconnect the Claude login.' : kind === 'MODEL' ? 'Selected model is unavailable.' : kind === 'TRANSIENT' ? 'Temporary provider or network failure.' : 'Check CLI compatibility and worker configuration.'}`,
        );
      }
      requireThat(version, 'FORMAT', 'Claude Code did not report its tool surface.');
      requireThat(
        result.structured_output !== undefined,
        'FORMAT',
        'Claude Code returned no structured proposal.',
      );
      return result.structured_output;
    },
  };
  return session;
}
