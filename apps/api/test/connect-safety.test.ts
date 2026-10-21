import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { UsersStore } from '../src/users/users-store.js';
import {
  AesGcmConnectMessageCipher,
  ConnectMessageService,
  KeywordModerationProvider,
  MemoryConnectMessageStore,
} from '../src/connect/connect-message.service.js';
import { ConnectSafetyService } from '../src/connect/connect-safety.service.js';
import { MemoryConnectSessionStore } from '../src/connect/connect-session.store.js';

function harness() {
  const now = new Date('2026-10-21T12:00:00Z');
  const sessions = new MemoryConnectSessionStore();
  const session = {
    id: randomUUID(),
    userA: randomUUID(),
    userB: randomUUID(),
    mode: 'text' as const,
    startedAt: now,
    endedAt: null,
    endReason: null,
    endedBy: null,
  };
  sessions.sessions.set(session.id, session);
  const messages = new MemoryConnectMessageStore(sessions);
  const cipher = new AesGcmConnectMessageCipher(randomBytes(32));
  const messageService = new ConnectMessageService(
    messages,
    cipher,
    new KeywordModerationProvider(),
    () => now,
    () => randomUUID(),
  );
  const query = vi.fn(async () => ({ rows: [{ id: 'report-id' }] }));
  const pool = { query } as unknown as Pool;
  const users = { blockUser: vi.fn(async () => undefined) } as unknown as UsersStore;
  const matchmaker = {
    endSession: vi.fn(async () => session.userB),
    leaveQueue: vi.fn(async () => undefined),
  } as never;
  const service = new ConnectSafetyService(
    pool,
    sessions,
    messages,
    cipher,
    users,
    matchmaker,
    () => now,
    () => randomUUID(),
  );
  return {
    now,
    session,
    sessions,
    messages,
    cipher,
    messageService,
    pool,
    query,
    users,
    matchmaker,
    service,
  };
}

describe('Connect reports and session blocks (P2-05)', () => {
  it('captures only the last 50 messages after explicit snapshot consent', async () => {
    const h = harness();
    await h.messageService.send(h.session.userA, {
      sessionId: h.session.id,
      body: 'Good morning',
      clientMsgId: 'chat-1',
    });
    const result = await h.service.report(
      h.session.userA,
      {
        sessionId: h.session.id,
        reasonCode: 'spam',
        snapshotConsent: true,
      },
      'report-key-0001',
    );
    expect(result).toEqual({ reportId: 'report-id', status: 'open' });
    const params = h.query.mock.calls[0]?.[1] as unknown[];
    const snapshotCiphertext = params[5] as Buffer;
    expect(JSON.parse(h.cipher.decrypt(snapshotCiphertext))).toEqual([
      { from: 'me', body: 'Good morning', createdAt: h.now.toISOString() },
    ]);
    expect(params[6]).toBe(true);
  });

  it('caps consented report snapshots at the latest 50 messages', async () => {
    const h = harness();
    for (let i = 0; i < 60; i += 1) {
      await h.messageService.send(h.session.userA, {
        sessionId: h.session.id,
        body: `Message ${i}`,
        clientMsgId: `chat-${i}`,
      });
    }
    await h.service.report(
      h.session.userA,
      {
        sessionId: h.session.id,
        reasonCode: 'other',
        snapshotConsent: true,
      },
      'report-key-0050',
    );
    const params = h.query.mock.calls[0]?.[1] as unknown[];
    const snapshot = JSON.parse(h.cipher.decrypt(params[5] as Buffer)) as { body: string }[];
    expect(snapshot).toHaveLength(50);
    expect(snapshot[0]?.body).toBe('Message 10');
    expect(snapshot.at(-1)?.body).toBe('Message 59');
  });

  it('stores no message snapshot without consent and rejects a report from a nonparticipant', async () => {
    const h = harness();
    await h.service.report(
      h.session.userA,
      {
        sessionId: h.session.id,
        reasonCode: 'other',
        snapshotConsent: false,
      },
      'report-key-0002',
    );
    const params = h.query.mock.calls[0]?.[1] as unknown[];
    expect(params[5]).toBeNull();
    expect(params[6]).toBe(false);
    await expect(
      h.service.report(
        randomUUID(),
        { sessionId: h.session.id, reasonCode: 'other' },
        'report-key-0003',
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('blocks the session partner without exposing their ID to the client', async () => {
    const h = harness();
    expect(await h.service.blockSession(h.session.userA, h.session.id)).toEqual({ blocked: true });
    expect(h.users.blockUser).toHaveBeenCalledWith(
      h.session.userA,
      h.session.userB,
      expect.any(String),
      h.now,
    );
    expect(h.matchmaker.leaveQueue).toHaveBeenCalledWith(h.session.userA);
    expect(h.matchmaker.endSession).toHaveBeenCalledWith(h.session.userA, h.session.id, 'block');
  });
});
