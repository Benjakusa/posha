import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { PII_REDACTION, serializeRequest } from '../src/logging.js';

describe('PII-safe request logging', () => {
  it('[P0-06] redacts direct and nested PII before writing JSON logs', () => {
    const chunks: string[] = [];
    const destination = new Writable({
      write(chunk: Buffer | string, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const logger = pino({ redact: PII_REDACTION }, destination);
    logger.info({
      email: 'member@example.test',
      phone: '+254700000000',
      password: 'fixture-password',
      profile: { email: 'nested@example.test' },
      req: {
        headers: { authorization: 'Bearer private-token', cookie: 'session=private' },
        body: { email: 'request@example.test', details: 'private report text' },
      },
    });

    const output = chunks.join('');
    for (const privateValue of [
      'member@example.test',
      '+254700000000',
      'fixture-password',
      'nested@example.test',
      'Bearer private-token',
      'session=private',
      'request@example.test',
      'private report text',
    ]) {
      expect(output).not.toContain(privateValue);
    }
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(8);
    logger.flush();
    destination.end();
  });

  it('[P0-06] logs only the matched route template instead of URL or headers', () => {
    const serialized = serializeRequest({
      id: 'trace-03',
      method: 'GET',
      route: { path: '/users/:userId' },
      url: '/users/private-id?email=member@example.test',
      headers: { authorization: 'Bearer private-token' },
    } as Parameters<typeof serializeRequest>[0] & { url: string; headers: object });

    expect(serialized).toEqual({ id: 'trace-03', method: 'GET', path: '/users/:userId' });
    expect(JSON.stringify(serialized)).not.toContain('private-id');
    expect(JSON.stringify(serialized)).not.toContain('member@example.test');
  });
});
