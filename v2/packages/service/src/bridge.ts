// This process owns no database or credentials. Its expiring capability grants
// only three reads against one fixed attempt, validated by the service each time.
import { request } from './transport.js';
import { MAX_WIRE_BYTES } from '@knoter/contracts/native';
const socket = process.env.KNOTER_WORKER_SOCKET!,
  capability = process.env.KNOTER_WORKER_CAPABILITY!;
const tools = [
  {
    name: 'source_read',
    description:
      'Read an immutable Markdown source version and its exact citation segments from this job.',
    inputSchema: {
      type: 'object',
      properties: { versionId: { type: 'string' } },
      required: ['versionId'],
      additionalProperties: false,
    },
  },
  {
    name: 'wiki_search',
    description:
      'Search the fixed wiki topic catalog. An empty query lists all topics including Trash tombstones.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'wiki_read',
    description: 'Read a fixed wiki revision, protection state, and source dependencies.',
    inputSchema: {
      type: 'object',
      properties: { documentId: { type: 'string' } },
      required: ['documentId'],
      additionalProperties: false,
    },
  },
].map((tool) => ({
  ...tool,
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
}));
let pending = Buffer.alloc(0);
const reply = (id: unknown, result: unknown, error?: { code: number; message: string }) =>
  process.stdout.write(
    JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) }) + '\n',
  );
async function handle(value: Record<string, unknown>) {
  if (value.id === undefined) return;
  try {
    if (value.method === 'initialize')
      return reply(value.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'knoter-evidence', version: '1.0.0' },
      });
    if (value.method === 'ping') return reply(value.id, {});
    if (value.method === 'tools/list') return reply(value.id, { tools });
    if (value.method === 'resources/list') return reply(value.id, { resources: [] });
    if (value.method === 'resources/templates/list')
      return reply(value.id, { resourceTemplates: [] });
    if (value.method === 'tools/call') {
      const params = value.params as { name: string; arguments: unknown };
      if (!tools.some((t) => t.name === params.name)) throw new Error('Tool is not allowed.');
      const result = await request(socket, capability, 'workerRead', {
        tool: params.name,
        args: params.arguments,
      });
      return reply(value.id, { content: [{ type: 'text', text: JSON.stringify(result) }] });
    }
    reply(value.id, null, { code: -32601, message: 'Method not found' });
  } catch (e) {
    reply(value.id, { isError: true, content: [{ type: 'text', text: (e as Error).message }] });
  }
}
process.stdin.on('data', (chunk: Buffer) => {
  pending = Buffer.concat([pending, chunk]);
  if (pending.length > MAX_WIRE_BYTES) process.exit(1);
  let end: number;
  while ((end = pending.indexOf(10)) >= 0) {
    const line = pending.subarray(0, end).toString();
    pending = pending.subarray(end + 1);
    try {
      void handle(JSON.parse(line));
    } catch {
      reply(null, null, { code: -32700, message: 'Invalid JSON' });
    }
  }
});
process.stdin.on('end', () => process.exit(0));
