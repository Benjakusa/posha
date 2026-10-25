import { Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { ErrorCodes } from '@posha/shared';
import { generateUuidV7 } from '../auth/auth-crypto.js';
import type { AuthStore } from '../auth/auth-store.js';
import type { ConnectPresenceStore } from './connect-presence.store.js';
import type {
  ConnectChatSend,
  ConnectQueueJoin,
  ConnectRealtimePort,
  QueueState,
} from './connect-realtime.port.js';
import { ConnectRealtimeError } from './connect-realtime.port.js';
import type { ConnectSessionRecord, ConnectSessionStore } from './connect-session.store.js';
import type { MatchingStore, QueueEntry, RecentSkipStore } from './matching-store.js';
import type { UsersStore } from '../users/users-store.js';
import type { ConnectMessageService } from './connect-message.service.js';
import type { ConnectObservabilityService } from './connect-observability.service.js';
import type { GuestSessionVerifier } from '../guest/guest-session.service.js';

export interface ChatAliasResolver {
  getChatAlias(userId: string): Promise<string | null>;
}

export class PostgresChatAliasResolver implements ChatAliasResolver {
  constructor(private readonly pool: Pool) {}

  async getChatAlias(userId: string): Promise<string | null> {
    const result = await this.pool.query<{ chat_alias: string | null }>(
      "SELECT chat_alias FROM users WHERE id = $1 AND status = 'active'",
      [userId],
    );
    return result.rows[0]?.chat_alias ?? null;
  }
}

export interface ConnectMatchEvents {
  matchFound(
    userId: string,
    payload: { sessionId: string; partner: { alias: string }; mode: 'text' | 'video' },
  ): Promise<void>;
  sessionEnded(
    userId: string,
    payload: { sessionId: string; reason: 'timeout' | 'block' },
  ): Promise<void>;
}

export const CHAT_ALIAS_RESOLVER = Symbol('CHAT_ALIAS_RESOLVER');
export const CONNECT_MATCH_EVENTS = Symbol('CONNECT_MATCH_EVENTS');

const MAX_CANDIDATES_PER_LANE = 100;
const MATCH_LOCK_TTL_MS = 30_000;

@Injectable()
export class ConnectMatchmaker implements ConnectRealtimePort {
  constructor(
    private readonly matching: MatchingStore,
    private readonly skips: RecentSkipStore,
    private readonly users: UsersStore,
    private readonly auth: AuthStore,
    private readonly presence: ConnectPresenceStore,
    private readonly sessions: ConnectSessionStore,
    private readonly aliases: ChatAliasResolver,
    private readonly events: ConnectMatchEvents,
    private readonly now: () => Date = () => new Date(),
    private readonly makeId: (date: Date) => string = generateUuidV7,
    private readonly messages?: ConnectMessageService,
    private readonly metrics?: ConnectObservabilityService,
    private readonly videoEnabled: () => boolean = () => false,
    private readonly guestSessions?: GuestSessionVerifier,
  ) {}

  async joinQueue(userId: string, input: ConnectQueueJoin): Promise<QueueState> {
    if (input.mode === 'video' && !this.videoEnabled())
      throw new ConnectRealtimeError(ErrorCodes.GATE_DISABLED);
    if (await this.sessions.findActiveForUser(userId)) {
      throw new ConnectRealtimeError(ErrorCodes.CONFLICT);
    }
    const entry: QueueEntry = {
      userId,
      mode: input.mode,
      interests: [...input.interests],
      lang: input.lang,
      ...(input.countryPref ? { countryPref: input.countryPref } : {}),
      enqueuedAt: this.now().getTime(),
    };
    try {
      await this.matching.enqueue(entry);
    } catch (error) {
      if (error instanceof Error && error.message === 'USER_ALREADY_IN_SESSION') {
        throw new ConnectRealtimeError(ErrorCodes.CONFLICT);
      }
      throw error;
    }
    await this.refreshQueueDepth();
    const position = await this.matching.queuePosition(userId);
    return {
      position,
      estWaitSec: position === null ? null : Math.max(1, Math.ceil(position / 2) * 5),
    };
  }

  async leaveQueue(userId: string): Promise<void> {
    await this.matching.removeFromQueue(userId);
    await this.refreshQueueDepth();
  }

  async sendMessage(userId: string, input: ConnectChatSend) {
    if (!this.messages) throw new ConnectRealtimeError(ErrorCodes.SERVICE_UNAVAILABLE);
    const relayed = await this.messages.send(userId, input);
    const senderAlias = await this.aliases.getChatAlias(userId);
    if (!senderAlias) throw new ConnectRealtimeError(ErrorCodes.SERVICE_UNAVAILABLE);
    return { ...relayed, senderAlias };
  }

  async typing(_userId: string, _sessionId: string): Promise<never> {
    void _userId;
    void _sessionId;
    throw new ConnectRealtimeError(ErrorCodes.SERVICE_UNAVAILABLE);
  }

  async endSession(
    userId: string,
    sessionId: string,
    reason: 'next' | 'leave' | 'block',
  ): Promise<string | null> {
    const ownContext = await this.matching.getActiveContext(userId, sessionId);
    const partnerUserId = await this.sessions.end(sessionId, userId, reason, this.now());
    if (!partnerUserId) return null;
    await Promise.all([
      this.matching.clearActive(userId, sessionId),
      this.matching.clearActive(partnerUserId, sessionId),
    ]);
    if (reason === 'block') {
      await Promise.all([
        this.events.sessionEnded(userId, { sessionId, reason: 'block' }),
        this.events.sessionEnded(partnerUserId, { sessionId, reason: 'block' }),
      ]);
    }
    if (reason === 'next') {
      await this.skips.record(userId, partnerUserId);
      if (ownContext && (await this.presence.isOnline(userId))) {
        await this.matching.enqueue({ ...ownContext, enqueuedAt: this.now().getTime() });
      }
    }
    return partnerUserId;
  }

  async tick(): Promise<number> {
    const now = this.now();
    const owner = this.makeId(now);
    if (!(await this.matching.tryAcquireWorkerLock(owner, MATCH_LOCK_TTL_MS))) return 0;
    let matchCount = 0;
    try {
      for (const lane of await this.matching.listLanes()) {
        const entries = await this.matching.listLane(lane, MAX_CANDIDATES_PER_LANE);
        const eligible: QueueEntry[] = [];
        for (const entry of entries) {
          const [isOnline, state, activeSession, isGuest] = await Promise.all([
            this.presence.isOnline(entry.userId),
            this.auth.getUserAuthState(entry.userId),
            this.sessions.findActiveForUser(entry.userId),
            this.guestSessions?.isActive(entry.userId) ?? Promise.resolve(false),
          ]);
          const isVerifiedMember =
            state?.accountStatus === 'active' &&
            (state.ageLevel === 'L2' || state.ageLevel === 'L3');
          if (!isOnline || activeSession !== null || (!isGuest && !isVerifiedMember)) {
            await this.matching.removeFromQueue(entry.userId);
            continue;
          }
          eligible.push(entry);
        }
        const pairs = await this.rankPairs(eligible);
        for (const [first, second] of pairs) {
          if (
            (await this.matching.isBusy(first.userId)) ||
            (await this.matching.isBusy(second.userId))
          )
            continue;
          const [blocked, skipped] = await Promise.all([
            this.users.areBlockedEitherWay(first.userId, second.userId),
            this.skips.hasRecentSkip(first.userId, second.userId),
          ]);
          if (blocked || skipped) continue;
          const claimId = this.makeId(this.now());
          const claim = await this.matching.claimPair(first, second, claimId);
          if (!claim) continue;
          const [aliasForA, aliasForB] = await Promise.all([
            this.aliases.getChatAlias(first.userId),
            this.aliases.getChatAlias(second.userId),
          ]);
          if (!aliasForA || !aliasForB) {
            await this.matching.releasePair(claim);
            continue;
          }
          const sessionId = this.makeId(this.now());
          let sessionCreated = false;
          try {
            const record: ConnectSessionRecord = {
              id: sessionId,
              userA: first.userId,
              userB: second.userId,
              mode: first.mode,
              startedAt: this.now(),
              endedAt: null,
              endReason: null,
              endedBy: null,
            };
            await this.sessions.create(record);
            sessionCreated = true;
            await this.matching.finalizePair(claim, sessionId);
          } catch (error) {
            if (sessionCreated)
              await this.sessions.end(sessionId, null, 'error', this.now()).catch(() => null);
            await this.matching.releasePair(claim).catch(() => undefined);
            throw error;
          }
          matchCount += 1;
          this.metrics?.recordMatch([
            Math.max(0, this.now().getTime() - first.enqueuedAt),
            Math.max(0, this.now().getTime() - second.enqueuedAt),
          ]);
          await Promise.all([
            this.events.matchFound(first.userId, {
              sessionId,
              partner: { alias: aliasForB },
              mode: first.mode,
            }),
            this.events.matchFound(second.userId, {
              sessionId,
              partner: { alias: aliasForA },
              mode: second.mode,
            }),
          ]);
        }
      }
      await this.closeOrphanedSessions();
      return matchCount;
    } finally {
      await this.refreshQueueDepth();
      await this.matching.releaseWorkerLock(owner).catch(() => undefined);
    }
  }

  private async refreshQueueDepth(): Promise<void> {
    if (!this.metrics) return;
    try {
      this.metrics.setQueueDepth(await this.matching.queueDepth());
    } catch {
      // Metrics collection must not interfere with matchmaking availability.
    }
  }

  private async rankPairs(entries: readonly QueueEntry[]): Promise<[QueueEntry, QueueEntry][]> {
    const ranked: { first: QueueEntry; second: QueueEntry; score: number; age: number }[] = [];
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const first = entries[i]!;
        const second = entries[j]!;
        if (first.userId === second.userId) continue;
        let overlap = 0;
        const interests = new Set(first.interests);
        for (const interest of new Set(second.interests)) if (interests.has(interest)) overlap += 1;
        ranked.push({
          first,
          second,
          score: overlap,
          age: Math.min(first.enqueuedAt, second.enqueuedAt),
        });
      }
    }
    ranked.sort((a, b) => b.score - a.score || a.age - b.age);
    return ranked.map(({ first, second }) => [first, second]);
  }

  private async closeOrphanedSessions(): Promise<void> {
    for (const session of await this.sessions.listActive()) {
      const [aOnline, bOnline] = await Promise.all([
        this.presence.isOnline(session.userA),
        this.presence.isOnline(session.userB),
      ]);
      if (aOnline && bOnline) continue;
      const partnerA = await this.sessions.end(session.id, null, 'timeout', this.now());
      if (!partnerA) continue;
      await Promise.all([
        this.matching.clearActive(session.userA, session.id),
        this.matching.clearActive(session.userB, session.id),
      ]);
      await Promise.all([
        this.events.sessionEnded(session.userA, { sessionId: session.id, reason: 'timeout' }),
        this.events.sessionEnded(session.userB, { sessionId: session.id, reason: 'timeout' }),
      ]);
    }
  }
}
