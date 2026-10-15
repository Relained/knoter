import { createConnection } from 'node:net';
import { randomUUID } from 'node:crypto';
import { MAX_WIRE_BYTES, PROTOCOL, responseSchema } from '@knoter/contracts/native';
import { AppError } from './common.js';
export function request(
  socket: string,
  token: string,
  command: string,
  payload: unknown,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const requestId = randomUUID();
    let received = Buffer.alloc(0),
      settled = false;
    const client = createConnection(socket);
    const finish = (error: Error | null, result?: unknown) => {
      if (settled) return;
      settled = true;
      client.destroy();
      if (error) reject(error);
      else resolve(result);
    };
    client.setTimeout(15_000, () =>
      finish(new AppError('OFFLINE', 'Service request timed out. Your draft is retained.')),
    );
    client.on('error', () =>
      finish(
        new AppError(
          'OFFLINE',
          'Background service is unavailable. Enable it or check its approval status.',
        ),
      ),
    );
    client.on('end', () => {
      if (!settled)
        finish(new AppError('OFFLINE', 'Service disconnected before confirming the request.'));
    });
    client.on('connect', () =>
      client.write(
        JSON.stringify({ protocol: PROTOCOL, requestId, token, command, payload }) + '\n',
      ),
    );
    client.on('data', (chunk) => {
      received = Buffer.concat([received, chunk]);
      if (received.length > MAX_WIRE_BYTES)
        return finish(new AppError('LIMIT', 'Service response too large.'));
      const end = received.indexOf(10);
      if (end < 0) return;
      try {
        const value = responseSchema.parse(JSON.parse(received.subarray(0, end).toString()));
        if (value.requestId !== requestId) throw new Error('Response ID mismatch.');
        finish(
          value.ok
            ? null
            : new AppError(
                value.error?.code ?? 'SERVICE',
                value.error?.message ?? 'Service request failed.',
              ),
          value.result,
        );
      } catch (error) {
        finish(error as Error);
      }
    });
  });
}
