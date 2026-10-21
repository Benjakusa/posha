import { randomBytes, randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AesGcmConnectMessageCipher,
  ConnectMessageService,
  KeywordModerationProvider,
  MemoryConnectMessageStore,
} from '../src/connect/connect-message.service.js';
import { MemoryConnectSessionStore } from '../src/connect/connect-session.store.js';

const NOW = new Date('2026-10-21T12:00:00.000Z');
function harness() {
  const sessions = new MemoryConnectSessionStore();
  const session = {
    id: randomUUID(),
    userA: randomUUID(),
    userB: randomUUID(),
    mode: 'text' as const,
    startedAt: NOW,
    endedAt: null,
    endReason: null,
    endedBy: null,
  };
  sessions.sessions.set(session.id, session);
  const store = new MemoryConnectMessageStore(sessions);
  const cipher = new AesGcmConnectMessageCipher(randomBytes(32));
  const service = new ConnectMessageService(
    store,
    cipher,
    new KeywordModerationProvider(),
    () => NOW,
    () => randomUUID(),
  );
  return { sessions, session, store, cipher, service };
}

describe('Connect message relay and retention (P2-04)', () => {
  it('encrypts messages at rest and returns the plaintext for the relay', async () => {
    const h = harness();
    const sent = await h.service.send(h.session.userA, {
      sessionId: h.session.id,
      body: 'Hello there',
      clientMsgId: 'client-1',
    });
    const stored = [...h.store.messages.values()][0]!;
    expect(stored.ciphertext.includes(Buffer.from('Hello there'))).toBe(false);
    expect(h.cipher.decrypt(stored.ciphertext)).toBe('Hello there');
    expect(sent).toMatchObject({
      partnerUserId: h.session.userB,
      body: 'Hello there',
      messageId: stored.id,
    });
    expect(stored.expiresAt.getTime() - stored.createdAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('uses sender-scoped client IDs to make retries idempotent', async () => {
    const h = harness();
    const input = { sessionId: h.session.id, body: 'Hello', clientMsgId: 'retry-1' };
    const first = await h.service.send(h.session.userA, input);
    const retry = await h.service.send(h.session.userA, input);
    expect(retry.messageId).toBe(first.messageId);
    expect(h.store.messages.size).toBe(1);
  });

  it('blocks and records flagged text without returning it for relay', async () => {
    const h = harness();
    await expect(
      h.service.send(h.session.userA, {
        sessionId: h.session.id,
        body: 'I will hurt you',
        clientMsgId: 'flag-1',
      }),
    ).rejects.toMatchObject({ code: 'SAFETY_ESCALATED' });
    expect(h.store.messages.size).toBe(1);
    expect(h.store.moderationFlags).toMatchObject([{ severity: 'urgent', categories: ['threat'] }]);
  });

  it('escalates repeated explicit-content flags within 24 hours', async () => {
    const h = harness();
    for (let i = 0; i < 2; i += 1) {
      await expect(
        h.service.send(h.session.userA, {
          sessionId: h.session.id,
          body: 'sexual content',
          clientMsgId: `explicit-${i}`,
        }),
      ).rejects.toMatchObject({ code: 'CONTENT_BLOCKED' });
    }
    await expect(
      h.service.send(h.session.userA, {
        sessionId: h.session.id,
        body: 'sexual content',
        clientMsgId: 'explicit-2',
      }),
    ).rejects.toMatchObject({ code: 'SAFETY_ESCALATED' });
    expect(h.store.moderationFlags.at(-1)?.severity).toBe('urgent');
  });

  it('rejects inactive or unrelated sessions and deletes expired messages in bounded batches', async () => {
    const h = harness();
    await expect(
      h.service.send(randomUUID(), { sessionId: h.session.id, body: 'Hello', clientMsgId: 'bad' }),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    h.store.messages.set('expired', {
      id: 'expired',
      sessionId: h.session.id,
      senderId: h.session.userA,
      clientMsgId: 'expired',
      ciphertext: h.cipher.encrypt('old'),
      createdAt: new Date(0),
      flagged: false,
      expiresAt: new Date(1),
    });
    expect(await h.store.deleteExpired(NOW, 1)).toBe(1);
    expect(h.store.messages.has('expired')).toBe(false);
  });
});
