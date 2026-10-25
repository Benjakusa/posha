import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpPoshaApiClient } from './client.js';

afterEach(() => vi.unstubAllGlobals());

describe('HttpPoshaApiClient', () => {
  it('calls the browser fetch function with its required global receiver', async () => {
    const fetcher = function (this: unknown): Promise<Response> {
      expect(this).toBe(globalThis);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            accessToken: 'guest-token',
            tokenType: 'Bearer',
            expiresAt: '2030-01-01T00:00:00.000Z',
            alias: 'Amber Fox',
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      );
    } as typeof fetch;
    vi.stubGlobal('fetch', fetcher);

    const session = await new HttpPoshaApiClient().createGuestSession();

    expect(session.accessToken).toBe('guest-token');
    expect(session.alias).toBe('Amber Fox');
  });
});
