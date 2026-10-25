import { describe, expect, it, vi } from 'vitest';
import { FeatureFlagsService } from '../src/flags/feature-flags.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import type { AuthStore } from '../src/auth/auth-store.js';
import { MemoryRateLimitStore } from '../src/policies/rate-limit.store.js';
import type { RateLimitStore } from '../src/policies/rate-limit.store.js';
import { MemoryConnectPresenceStore } from '../src/connect/connect-presence.store.js';
import type { ConnectRealtimePort } from '../src/connect/connect-realtime.port.js';
import { ConnectGateway } from '../src/connect/connect.gateway.js';
import { ConnectSocketMatchEvents } from '../src/connect/connect-match-events.js';

class FakeSocket {
  id = 'socket-1';
  handshake = { auth: { token: 'access-token' } };
  data: { principal?: { userId: string; accessToken: string; claims: never } } = {};
  events: { event: string; payload: unknown }[] = [];
  disconnected = false;
  joined: string[] = [];

  emit(event: string, payload: unknown) {
    this.events.push({ event, payload });
  }

  to(room: string) {
    return {
      emit: (event: string, payload: unknown) =>
        this.events.push({ event: `${room}:${event}`, payload }),
    };
  }

  async join(room: string) {
    this.joined.push(room);
  }

  disconnect() {
    this.disconnected = true;
  }
}

const makeGateway = (
  options: {
    age?: 'L0' | 'L1' | 'L2' | 'L3';
    status?: 'active' | 'suspended';
    rateLimits?: RateLimitStore;
  } = {},
) => {
  const authService = {
    verifyAccessToken: vi.fn().mockResolvedValue({
      sub: 'user-1',
      roles: ['member'],
      mfa: false,
      iat: 1,
      exp: 9_999_999_999,
    }),
  } as unknown as AuthService;
  const authStore = {
    getUserAuthState: vi.fn().mockResolvedValue({
      roles: ['member'],
      accountStatus: options.status ?? 'active',
      ageLevel: options.age ?? 'L2',
      encryptedTotpSecret: null,
      totpEnabled: false,
    }),
  } as unknown as AuthStore;
  const rateLimits = options.rateLimits ?? new MemoryRateLimitStore(() => 1_000);
  const presence = new MemoryConnectPresenceStore(() => 1_000);
  const connect: ConnectRealtimePort = {
    joinQueue: vi.fn().mockResolvedValue({ position: null, estWaitSec: null }),
    leaveQueue: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue({
      partnerUserId: 'user-2',
      senderAlias: 'QuietRiver',
      messageId: 'message-1',
      body: 'Hello',
      occurredAt: '2026-10-20T10:00:00.000Z',
    }),
    typing: vi.fn().mockResolvedValue('user-2'),
    endSession: vi.fn().mockResolvedValue('user-2'),
  };
  return {
    gateway: new ConnectGateway(
      authService,
      authStore,
      new FeatureFlagsService(),
      rateLimits,
      presence,
      connect,
      new ConnectSocketMatchEvents(),
    ),
    authStore,
    rateLimits,
    presence,
    connect,
  };
};

async function authenticate(gateway: ConnectGateway, socket: FakeSocket) {
  let middleware: ((client: FakeSocket, next: (error?: Error) => void) => void) | undefined;
  gateway.afterInit({
    use: (handler) => {
      middleware = handler;
    },
  } as never);
  if (!middleware) throw new Error('Socket middleware was not registered');
  const error = await new Promise<Error | undefined>((resolve) => middleware!(socket, resolve));
  if (!error) await gateway.handleConnection(socket as never);
  return error;
}

describe('Connect realtime gateway (P2-02)', () => {
  it('[B-S3-02] accepts only active guest sessions when the guest gate is enabled', async () => {
    const authService = {
      verifyAccessToken: vi.fn().mockResolvedValue({
        sub: 'guest-1',
        roles: ['guest'],
        mfa: false,
        iat: 1,
        exp: 9_999_999_999,
        chatAlias: 'Amber Fox',
      }),
    } as unknown as AuthService;
    const flags = new FeatureFlagsService(
      [{ key: 'GATE:GUEST_ACCESS', enabled: true }],
      [
        {
          key: 'GATE:GUEST_ACCESS',
          status: 'approved',
          approvedBy: 'local-test',
          evidenceRef: 'test-evidence',
          approvedAt: new Date('2026-10-23T00:00:00.000Z'),
        },
      ],
    );
    const authStore = { getUserAuthState: vi.fn() } as unknown as AuthStore;
    const guestSessions = { isActive: vi.fn().mockResolvedValue(true), aliasFor: vi.fn() };
    const gateway = new ConnectGateway(
      authService,
      authStore,
      flags,
      new MemoryRateLimitStore(() => 1_000),
      new MemoryConnectPresenceStore(() => 1_000),
      {} as ConnectRealtimePort,
      new ConnectSocketMatchEvents(),
      undefined,
      undefined,
      undefined,
      guestSessions,
    );
    const socket = new FakeSocket();
    expect(await authenticate(gateway, socket)).toBeUndefined();
    expect(authStore.getUserAuthState).not.toHaveBeenCalled();
    expect(guestSessions.isActive).toHaveBeenCalledWith('guest-1');

    const blocked = new ConnectGateway(
      authService,
      authStore,
      new FeatureFlagsService(),
      new MemoryRateLimitStore(() => 1_000),
      new MemoryConnectPresenceStore(() => 1_000),
      {} as ConnectRealtimePort,
      new ConnectSocketMatchEvents(),
      undefined,
      undefined,
      undefined,
      guestSessions,
    );
    expect((await authenticate(blocked, new FakeSocket()))?.message).toBe('UNAUTHORIZED');
  });

  it('rejects invalid tokens and under-age accounts during namespace middleware', async () => {
    const invalid = makeGateway({ age: 'L2' });
    const socket = new FakeSocket();
    socket.handshake.auth.token = '';
    const authError = await authenticate(invalid.gateway, socket);
    expect(authError?.message).toBe('UNAUTHORIZED');

    const underAge = makeGateway({ age: 'L1' });
    const ageError = await authenticate(underAge.gateway, new FakeSocket());
    expect(ageError?.message).toBe('AGE_LEVEL_REQUIRED');
    expect(underAge.authStore.getUserAuthState).toHaveBeenCalledOnce();
  });

  it('tracks only authenticated L2 sockets and expires presence after a missed heartbeat', async () => {
    const { gateway, presence } = makeGateway();
    const socket = new FakeSocket();
    expect(await authenticate(gateway, socket)).toBeUndefined();
    expect(socket.joined).toEqual(['user-1']);
    expect(await presence.isOnline('user-1')).toBe(true);
    let now = 46_001;
    const expiringPresence = new MemoryConnectPresenceStore(() => now);
    await expiringPresence.refresh('user-1', 'socket-1');
    now += 45_001;
    expect(await expiringPresence.isOnline('user-1')).toBe(false);
  });

  it('validates queue payloads and leaves video unavailable while its gate is OFF', async () => {
    const { gateway, connect } = makeGateway();
    const socket = new FakeSocket();
    await authenticate(gateway, socket);
    await gateway.queueJoin(socket as never, { mode: 'video', lang: 'en', interests: [] });
    expect(socket.events.at(-1)).toEqual({ event: 'error', payload: { code: 'GATE_DISABLED' } });
    expect(connect.joinQueue).not.toHaveBeenCalled();
    await gateway.queueJoin(socket as never, { mode: 'text', lang: 'not_a_locale' });
    expect(socket.events.at(-1)).toEqual({ event: 'error', payload: { code: 'VALIDATION_ERROR' } });
    await gateway.queueJoin(socket as never, { mode: 'text', lang: 'en', interests: ['music'] });
    expect(socket.events.at(-1)).toEqual({
      event: 'queue.state',
      payload: { position: null, estWaitSec: null },
    });
  });

  it('applies the five-per-second chat limit and warns before a temporary flood mute', async () => {
    const { gateway, connect } = makeGateway();
    const socket = new FakeSocket();
    await authenticate(gateway, socket);
    const payload = {
      sessionId: '019a4c00-0000-7000-8000-000000000001',
      body: 'Hello',
      clientMsgId: 'client-1',
    };
    for (let i = 0; i < 6; i += 1) await gateway.chatSend(socket as never, payload);
    expect(connect.sendMessage).toHaveBeenCalledTimes(5);
    expect(socket.events.filter((event) => event.event === 'user-2:chat.message')).toHaveLength(5);
    expect(socket.events.at(-1)).toMatchObject({
      event: 'safety.warning',
      payload: { code: 'RATE_LIMITED' },
    });
    expect(JSON.stringify(socket.events)).not.toContain('user-1');
  });

  it('temporarily mutes repeated chat flood violations', async () => {
    const { gateway, connect } = makeGateway();
    const socket = new FakeSocket();
    await authenticate(gateway, socket);
    const payload = {
      sessionId: '019a4c00-0000-7000-8000-000000000001',
      body: 'Hello',
      clientMsgId: 'client-flood',
    };
    for (let i = 0; i < 8; i += 1) await gateway.chatSend(socket as never, payload);
    expect(connect.sendMessage).toHaveBeenCalledTimes(5);
    expect(socket.events.filter((event) => event.event === 'safety.warning')).toMatchObject([
      { payload: { code: 'RATE_LIMITED' } },
      { payload: { code: 'TEMPORARILY_MUTED' } },
      { payload: { code: 'TEMPORARILY_MUTED' } },
    ]);
  });

  it('rechecks current account age and status for every event', async () => {
    const { gateway, authStore } = makeGateway();
    const socket = new FakeSocket();
    await authenticate(gateway, socket);
    vi.mocked(authStore.getUserAuthState).mockResolvedValue({
      roles: ['member'],
      accountStatus: 'suspended',
      ageLevel: 'L2',
      encryptedTotpSecret: null,
      totpEnabled: false,
    });
    await gateway.queueLeave(socket as never, {});
    expect(socket.events.at(-1)).toMatchObject({
      event: 'error',
      payload: { code: 'ACCOUNT_INACTIVE' },
    });
    expect(socket.disconnected).toBe(true);
  });

  it('fails closed when the shared rate-limit store is unavailable', async () => {
    const rateLimits: RateLimitStore = {
      consume: vi.fn().mockRejectedValue(new Error('redis unavailable')),
    };
    const { gateway, connect } = makeGateway({ rateLimits });
    const socket = new FakeSocket();
    await authenticate(gateway, socket);
    await gateway.queueJoin(socket as never, { mode: 'text', lang: 'en', interests: [] });
    expect(socket.events.at(-1)).toEqual({
      event: 'error',
      payload: { code: 'RATE_LIMIT_UNAVAILABLE' },
    });
    expect(connect.joinQueue).not.toHaveBeenCalled();
  });
});
