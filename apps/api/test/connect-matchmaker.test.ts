import { describe, expect, it, vi } from 'vitest';
import type { AuthStore } from '../src/auth/auth-store.js';
import type { ConnectMatchEvents } from '../src/connect/connect-matchmaker.js';
import { ConnectMatchmaker } from '../src/connect/connect-matchmaker.js';
import type { ConnectRealtimeError } from '../src/connect/connect-realtime.port.js';
import { MemoryConnectPresenceStore } from '../src/connect/connect-presence.store.js';
import { MemoryConnectSessionStore } from '../src/connect/connect-session.store.js';
import { MemoryMatchingStore, MemoryRecentSkipStore } from '../src/connect/matching-store.js';
import { ConnectObservabilityService } from '../src/connect/connect-observability.service.js';
import type { UsersStore } from '../src/users/users-store.js';

const NOW = new Date('2026-10-20T12:00:00.000Z');

function harness(options: { blocked?: readonly string[][]; now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date(NOW));
  let id = 0;
  const makeId = () => 'test-id-' + ++id;
  const matching = new MemoryMatchingStore(() => now().getTime());
  const skips = new MemoryRecentSkipStore(() => now().getTime());
  const presence = new MemoryConnectPresenceStore(() => now().getTime());
  const sessions = new MemoryConnectSessionStore();
  const blocked = new Set((options.blocked ?? []).map((pair) => [...pair].sort().join(':')));
  const users = {
    areBlockedEitherWay: vi.fn(async (a: string, b: string) =>
      blocked.has([a, b].sort().join(':')),
    ),
  } as unknown as UsersStore;
  const auth = {
    getUserAuthState: vi.fn().mockResolvedValue({
      roles: ['member'],
      accountStatus: 'active',
      ageLevel: 'L2',
      encryptedTotpSecret: null,
      totpEnabled: false,
    }),
  } as unknown as AuthStore;
  const events: ConnectMatchEvents & {
    matches: { userId: string; payload: unknown }[];
    ended: { userId: string; payload: unknown }[];
  } = {
    matches: [],
    ended: [],
    matchFound: vi.fn(async (userId, payload) => {
      events.matches.push({ userId, payload });
    }),
    sessionEnded: vi.fn(async (userId, payload) => {
      events.ended.push({ userId, payload });
    }),
  };
  const aliases = { getChatAlias: vi.fn(async (userId: string) => 'Alias' + userId) };
  const metrics = new ConnectObservabilityService();
  const matchmaker = new ConnectMatchmaker(
    matching,
    skips,
    users,
    auth,
    presence,
    sessions,
    aliases,
    events,
    now,
    makeId,
    undefined,
    metrics,
  );
  return { matchmaker, matching, skips, presence, sessions, users, auth, events, metrics };
}

async function queue(h: ReturnType<typeof harness>, userId: string, interests: string[] = []) {
  await h.presence.refresh(userId, 'socket-' + userId);
  return h.matchmaker.joinQueue(userId, { mode: 'text', interests, lang: 'en' });
}

function entriesFor(session: { userA: string; userB: string }): string[] {
  return [session.userA, session.userB].sort();
}

describe('Connect matching (P2-03)', () => {
  it('prefers interest overlap and emits partner aliases without user IDs', async () => {
    const h = harness();
    await queue(h, 'a', ['music']);
    await queue(h, 'b', ['music']);
    await queue(h, 'c', ['art']);
    expect(await h.matchmaker.tick()).toBe(1);
    const session = [...h.sessions.sessions.values()][0]!;
    expect(entriesFor(session)).toEqual(['a', 'b']);
    expect(h.events.matches).toHaveLength(2);
    expect(JSON.stringify(h.events.matches.map(({ payload }) => payload))).not.toContain(
      '"userId":"a"',
    );
    expect(h.events.matches[0]?.payload).toMatchObject({
      partner: { alias: 'Aliasb' },
      mode: 'text',
    });
    expect(h.metrics.renderPrometheus()).toContain('posha_connect_queue_depth 1');
    expect(h.metrics.renderPrometheus()).toContain('posha_connect_sessions_started_total 1');
    expect(h.metrics.renderPrometheus()).toContain('posha_connect_match_wait_seconds_count 2');
  });

  it('never matches blocked or recently skipped pairs in either direction', async () => {
    const h = harness({ blocked: [['a', 'b']] });
    await queue(h, 'a');
    await queue(h, 'b');
    await queue(h, 'c');
    await h.skips.record('a', 'c');
    await h.skips.record('c', 'a');
    expect(await h.matchmaker.tick()).toBe(1);
    const session = [...h.sessions.sessions.values()][0]!;
    expect(entriesFor(session)).toEqual(['b', 'c']);
  });

  it('expires a recent-skip pair after 24 hours', async () => {
    let timestamp = NOW.getTime();
    const skips = new MemoryRecentSkipStore(() => timestamp);
    await skips.record('first', 'second');
    expect(await skips.hasRecentSkip('second', 'first')).toBe(true);
    timestamp += 24 * 60 * 60_000 + 1;
    expect(await skips.hasRecentSkip('first', 'second')).toBe(false);
  });

  it('releases both queue entries if session persistence fails', async () => {
    const h = harness();
    await queue(h, 'first');
    await queue(h, 'second');
    vi.spyOn(h.sessions, 'create').mockRejectedValueOnce(new Error('database unavailable'));
    await expect(h.matchmaker.tick()).rejects.toThrow('database unavailable');
    expect(await h.matching.queuePosition('first')).toBe(1);
    expect(await h.matching.queuePosition('second')).toBe(2);
    expect(await h.matching.isBusy('first')).toBe(false);
    expect(await h.matching.isBusy('second')).toBe(false);
  });

  it('runs concurrent ticks without double-matching users', async () => {
    const h = harness();
    await Promise.all(Array.from({ length: 40 }, (_, index) => queue(h, 'user-' + index)));
    const results = await Promise.all([h.matchmaker.tick(), h.matchmaker.tick()]);
    expect(results.reduce((sum, count) => sum + count, 0)).toBe(20);
    const matched = [...h.sessions.sessions.values()].flatMap((session) => [
      session.userA,
      session.userB,
    ]);
    expect(new Set(matched).size).toBe(40);
  });

  it('uses PostgreSQL session state to prevent a re-match after Redis state loss', async () => {
    const h = harness();
    await h.sessions.create({
      id: 'existing-session',
      userA: 'first',
      userB: 'partner',
      mode: 'text',
      startedAt: NOW,
      endedAt: null,
      endReason: null,
      endedBy: null,
    });
    await h.presence.refresh('partner', 'socket-partner');
    await h.presence.refresh('first', 'socket-first');
    await h.presence.refresh('available', 'socket-available');
    await Promise.all([
      h.matching.enqueue({
        userId: 'first',
        mode: 'text',
        interests: [],
        lang: 'en',
        enqueuedAt: 1,
      }),
      h.matching.enqueue({
        userId: 'available',
        mode: 'text',
        interests: [],
        lang: 'en',
        enqueuedAt: 2,
      }),
    ]);
    expect(await h.matchmaker.tick()).toBe(0);
    expect(await h.matching.queuePosition('first')).toBeNull();
    expect(await h.matching.queuePosition('available')).toBe(1);
    await expect(
      h.matchmaker.joinQueue('first', { mode: 'text', interests: [], lang: 'en' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('matches 500 simulated users exactly once across bounded ticks', async () => {
    const h = harness();
    await Promise.all(
      Array.from({ length: 500 }, (_, index) => queue(h, 'user-' + index, ['general'])),
    );
    let matchCount = 0;
    for (let i = 0; i < 5; i += 1) matchCount += await h.matchmaker.tick();
    expect(matchCount).toBe(250);
    const matched = [...h.sessions.sessions.values()].flatMap((session) => [
      session.userA,
      session.userB,
    ]);
    expect(new Set(matched).size).toBe(500);
    expect(h.sessions.sessions.size).toBe(250);
  });

  it('requeues the initiator after Next and excludes the prior partner for 24 hours', async () => {
    const h = harness();
    await queue(h, 'first');
    await queue(h, 'second');
    await h.matchmaker.tick();
    const session = [...h.sessions.sessions.values()][0]!;
    await h.matchmaker.endSession(session.userA, session.id, 'next');
    expect(await h.skips.hasRecentSkip('first', 'second')).toBe(true);
    expect(await h.matching.queuePosition(session.userA)).toBe(1);
    await queue(h, 'third');
    expect(await h.matchmaker.tick()).toBe(1);
    const nextSession = [...h.sessions.sessions.values()].find((value) => !value.endedAt)!;
    expect(entriesFor(nextSession)).toEqual(['first', 'third']);
  });

  it('ends orphaned sessions after a participant loses presence', async () => {
    const h = harness();
    await queue(h, 'first');
    await queue(h, 'second');
    await h.matchmaker.tick();
    const session = [...h.sessions.sessions.values()][0]!;
    await h.presence.remove(session.userA, 'socket-' + session.userA);
    await h.matchmaker.tick();
    expect(h.sessions.sessions.get(session.id)?.endReason).toBe('timeout');
    expect(h.events.ended).toHaveLength(2);
  });

  it('returns gate-disabled for video queue requests', async () => {
    const h = harness();
    await expect(
      h.matchmaker.joinQueue('user-1', { mode: 'video', lang: 'en', interests: [] }),
    ).rejects.toMatchObject({ code: 'GATE_DISABLED' } satisfies Partial<ConnectRealtimeError>);
  });
});
