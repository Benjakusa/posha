import type { RedisClientType } from 'redis';

export interface QueueEntry {
  userId: string;
  mode: 'text';
  interests: readonly string[];
  lang: string;
  countryPref?: string;
  enqueuedAt: number;
}

export interface ClaimedPair {
  claimId: string;
  first: QueueEntry;
  second: QueueEntry;
}

export interface MatchingStore {
  enqueue(entry: QueueEntry): Promise<void>;
  removeFromQueue(userId: string): Promise<void>;
  listLanes(): Promise<readonly string[]>;
  listLane(lane: string, limit: number): Promise<readonly QueueEntry[]>;
  queuePosition(userId: string): Promise<number | null>;
  claimPair(first: QueueEntry, second: QueueEntry, claimId: string): Promise<ClaimedPair | null>;
  finalizePair(pair: ClaimedPair, sessionId: string): Promise<void>;
  releasePair(pair: ClaimedPair): Promise<void>;
  clearActive(userId: string, sessionId: string): Promise<void>;
  getActiveContext(userId: string, sessionId: string): Promise<QueueEntry | null>;
  isBusy(userId: string): Promise<boolean>;
  tryAcquireWorkerLock(owner: string, ttlMs: number): Promise<boolean>;
  releaseWorkerLock(owner: string): Promise<void>;
}

export interface RecentSkipStore {
  record(firstUserId: string, secondUserId: string): Promise<void>;
  hasRecentSkip(firstUserId: string, secondUserId: string): Promise<boolean>;
}

export const MATCHING_STORE = Symbol('MATCHING_STORE');
export const RECENT_SKIP_STORE = Symbol('RECENT_SKIP_STORE');
const laneFor = (entry: QueueEntry) => entry.mode + ':' + entry.lang;
const pairKey = (a: string, b: string) => [a, b].sort().join(':');

export class MemoryMatchingStore implements MatchingStore {
  private readonly queues = new Map<string, Map<string, QueueEntry>>();
  private readonly busyUsers = new Map<string, string>();
  private readonly claims = new Map<string, ClaimedPair>();
  private readonly activeContexts = new Map<string, QueueEntry>();
  private workerLock: { owner: string; expiresAt: number } | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  async enqueue(entry: QueueEntry): Promise<void> {
    if (await this.isBusy(entry.userId)) throw new Error('USER_ALREADY_IN_SESSION');
    await this.removeFromQueue(entry.userId);
    const lane = laneFor(entry);
    const queue = this.queues.get(lane) ?? new Map<string, QueueEntry>();
    queue.set(entry.userId, { ...entry, interests: [...entry.interests] });
    this.queues.set(lane, queue);
  }

  async removeFromQueue(userId: string): Promise<void> {
    for (const [lane, queue] of this.queues) {
      queue.delete(userId);
      if (queue.size === 0) this.queues.delete(lane);
    }
  }

  async listLanes(): Promise<readonly string[]> {
    return [...this.queues.keys()];
  }

  async listLane(lane: string, limit: number): Promise<readonly QueueEntry[]> {
    return [...(this.queues.get(lane)?.values() ?? [])]
      .sort((a, b) => a.enqueuedAt - b.enqueuedAt)
      .slice(0, limit)
      .map((entry) => ({ ...entry, interests: [...entry.interests] }));
  }

  async queuePosition(userId: string): Promise<number | null> {
    for (const queue of this.queues.values()) {
      const entries = [...queue.values()].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
      const rank = entries.findIndex((entry) => entry.userId === userId);
      if (rank >= 0) return rank + 1;
    }
    return null;
  }

  async claimPair(
    first: QueueEntry,
    second: QueueEntry,
    claimId: string,
  ): Promise<ClaimedPair | null> {
    if (first.userId === second.userId || laneFor(first) !== laneFor(second)) return null;
    if ((await this.isBusy(first.userId)) || (await this.isBusy(second.userId))) return null;
    const queue = this.queues.get(laneFor(first));
    if (!queue?.has(first.userId) || !queue.has(second.userId)) return null;
    const pair = { claimId, first: queue.get(first.userId)!, second: queue.get(second.userId)! };
    queue.delete(first.userId);
    queue.delete(second.userId);
    if (queue.size === 0) this.queues.delete(laneFor(first));
    this.busyUsers.set(first.userId, claimId);
    this.busyUsers.set(second.userId, claimId);
    this.claims.set(claimId, pair);
    return pair;
  }

  async finalizePair(pair: ClaimedPair, sessionId: string): Promise<void> {
    if (this.claims.get(pair.claimId) !== pair) throw new Error('MATCH_CLAIM_LOST');
    this.claims.delete(pair.claimId);
    this.busyUsers.set(pair.first.userId, sessionId);
    this.busyUsers.set(pair.second.userId, sessionId);
    this.activeContexts.set(pair.first.userId, pair.first);
    this.activeContexts.set(pair.second.userId, pair.second);
  }

  async releasePair(pair: ClaimedPair): Promise<void> {
    if (this.claims.get(pair.claimId) !== pair) return;
    this.claims.delete(pair.claimId);
    this.busyUsers.delete(pair.first.userId);
    this.busyUsers.delete(pair.second.userId);
    await this.enqueue(pair.first);
    await this.enqueue(pair.second);
  }

  async clearActive(userId: string, sessionId: string): Promise<void> {
    if (this.busyUsers.get(userId) === sessionId) {
      this.busyUsers.delete(userId);
      this.activeContexts.delete(userId);
    }
  }

  async getActiveContext(userId: string, sessionId: string): Promise<QueueEntry | null> {
    if (this.busyUsers.get(userId) !== sessionId) return null;
    return this.activeContexts.get(userId) ?? null;
  }

  async isBusy(userId: string): Promise<boolean> {
    return this.busyUsers.has(userId);
  }

  async tryAcquireWorkerLock(owner: string, ttlMs: number): Promise<boolean> {
    if (this.workerLock && this.workerLock.expiresAt > this.now()) return false;
    this.workerLock = { owner, expiresAt: this.now() + ttlMs };
    return true;
  }

  async releaseWorkerLock(owner: string): Promise<void> {
    if (this.workerLock?.owner === owner) this.workerLock = null;
  }
}

export class MemoryRecentSkipStore implements RecentSkipStore {
  private readonly skips = new Map<string, number>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly ttlMs = 24 * 60 * 60_000,
  ) {}

  async record(firstUserId: string, secondUserId: string): Promise<void> {
    this.skips.set(pairKey(firstUserId, secondUserId), this.now() + this.ttlMs);
  }

  async hasRecentSkip(firstUserId: string, secondUserId: string): Promise<boolean> {
    const key = pairKey(firstUserId, secondUserId);
    const expiresAt = this.skips.get(key);
    if (!expiresAt) return false;
    if (expiresAt <= this.now()) {
      this.skips.delete(key);
      return false;
    }
    return true;
  }
}

const ENQUEUE_SCRIPT = [
  "local oldLane = redis.call('HGET', KEYS[1], ARGV[1])",
  "if redis.call('EXISTS', KEYS[2] .. ARGV[1]) == 1 or redis.call('EXISTS', KEYS[3] .. ARGV[1]) == 1 then return 0 end",
  "if oldLane then redis.call('ZREM', KEYS[4] .. oldLane, ARGV[1]); redis.call('HDEL', KEYS[5] .. oldLane, ARGV[1]) end",
  "redis.call('ZADD', KEYS[4] .. ARGV[2], ARGV[3], ARGV[1])",
  "redis.call('HSET', KEYS[5] .. ARGV[2], ARGV[1], ARGV[4])",
  "redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])",
  'return 1',
].join('\n');

const REMOVE_SCRIPT = [
  "local lane = redis.call('HGET', KEYS[1], ARGV[1])",
  'if not lane then return 0 end',
  "redis.call('ZREM', KEYS[2] .. lane, ARGV[1])",
  "redis.call('HDEL', KEYS[3] .. lane, ARGV[1])",
  "redis.call('HDEL', KEYS[1], ARGV[1])",
  'return 1',
].join('\n');

const CLAIM_SCRIPT = [
  'if ARGV[1] == ARGV[2] then return 0 end',
  "local laneA = redis.call('HGET', KEYS[1], ARGV[1])",
  "local laneB = redis.call('HGET', KEYS[1], ARGV[2])",
  'if not laneA or laneA ~= laneB then return 0 end',
  "if redis.call('EXISTS', KEYS[2] .. ARGV[1]) == 1 or redis.call('EXISTS', KEYS[2] .. ARGV[2]) == 1 then return 0 end",
  "if redis.call('EXISTS', KEYS[3] .. ARGV[1]) == 1 or redis.call('EXISTS', KEYS[3] .. ARGV[2]) == 1 then return 0 end",
  "if not redis.call('ZSCORE', KEYS[4] .. laneA, ARGV[1]) or not redis.call('ZSCORE', KEYS[4] .. laneA, ARGV[2]) then return 0 end",
  "redis.call('SET', KEYS[2] .. ARGV[1], ARGV[3], 'PX', ARGV[4])",
  "redis.call('SET', KEYS[2] .. ARGV[2], ARGV[3], 'PX', ARGV[4])",
  "redis.call('ZREM', KEYS[4] .. laneA, ARGV[1], ARGV[2])",
  "redis.call('HDEL', KEYS[5] .. laneA, ARGV[1], ARGV[2])",
  "redis.call('HDEL', KEYS[1], ARGV[1], ARGV[2])",
  'return 1',
].join('\n');

const FINALIZE_SCRIPT = [
  "for i = 1, 2 do if redis.call('GET', KEYS[i]) ~= ARGV[1] then return 0 end end",
  "redis.call('DEL', KEYS[1], KEYS[2])",
  "redis.call('SET', KEYS[3], ARGV[2])",
  "redis.call('SET', KEYS[4], ARGV[2])",
  "redis.call('SET', KEYS[5], ARGV[3])",
  "redis.call('SET', KEYS[6], ARGV[4])",
  'return 1',
].join('\n');

const RELEASE_CLAIM_SCRIPT = [
  "for i = 1, 2 do if redis.call('GET', KEYS[i]) == ARGV[1] then redis.call('DEL', KEYS[i]) end end",
  'return 1',
].join('\n');

const RELEASE_LOCK_SCRIPT =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0";

export class RedisMatchingStore implements MatchingStore {
  constructor(
    private readonly client: RedisClientType,
    private readonly prefix = 'posha:{connect}:match',
  ) {}
  private key(part: string) {
    return this.prefix + ':' + part;
  }

  async enqueue(entry: QueueEntry): Promise<void> {
    const result = await this.client.eval(ENQUEUE_SCRIPT, {
      keys: [
        this.key('user-lane'),
        this.key('claim:'),
        this.key('active:'),
        this.key('queue:'),
        this.key('meta:'),
      ],
      arguments: [entry.userId, laneFor(entry), String(entry.enqueuedAt), JSON.stringify(entry)],
    });
    if (Number(result) !== 1) throw new Error('USER_ALREADY_IN_SESSION');
  }

  async removeFromQueue(userId: string): Promise<void> {
    await this.client.eval(REMOVE_SCRIPT, {
      keys: [this.key('user-lane'), this.key('queue:'), this.key('meta:')],
      arguments: [userId],
    });
  }

  async listLanes(): Promise<readonly string[]> {
    const lanes = new Set<string>();
    for await (const key of this.client.scanIterator({ MATCH: this.key('queue:*'), COUNT: 100 })) {
      lanes.add(String(key).slice(this.key('queue:').length));
    }
    return [...lanes];
  }

  async listLane(lane: string, limit: number): Promise<readonly QueueEntry[]> {
    const ids = await this.client.zRange(this.key('queue:' + lane), 0, limit - 1);
    if (ids.length === 0) return [];
    const values = await this.client.hmGet(this.key('meta:' + lane), ids);
    return values.flatMap((value) => {
      if (!value) return [];
      try {
        const entry = JSON.parse(value) as QueueEntry;
        return typeof entry?.userId === 'string' ? [entry] : [];
      } catch {
        return [];
      }
    });
  }

  async queuePosition(userId: string): Promise<number | null> {
    const lane = await this.client.hGet(this.key('user-lane'), userId);
    if (!lane) return null;
    const rank = await this.client.zRank(this.key('queue:' + lane), userId);
    return rank === null ? null : rank + 1;
  }

  async claimPair(
    first: QueueEntry,
    second: QueueEntry,
    claimId: string,
  ): Promise<ClaimedPair | null> {
    const result = await this.client.eval(CLAIM_SCRIPT, {
      keys: [
        this.key('user-lane'),
        this.key('claim:'),
        this.key('active:'),
        this.key('queue:'),
        this.key('meta:'),
      ],
      arguments: [first.userId, second.userId, claimId, '30000'],
    });
    return Number(result) === 1 ? { claimId, first, second } : null;
  }

  async finalizePair(pair: ClaimedPair, sessionId: string): Promise<void> {
    const result = await this.client.eval(FINALIZE_SCRIPT, {
      keys: [
        this.key('claim:' + pair.first.userId),
        this.key('claim:' + pair.second.userId),
        this.key('active:' + pair.first.userId),
        this.key('active:' + pair.second.userId),
        this.key('active-context:' + pair.first.userId),
        this.key('active-context:' + pair.second.userId),
      ],
      arguments: [pair.claimId, sessionId, JSON.stringify(pair.first), JSON.stringify(pair.second)],
    });
    if (Number(result) !== 1) throw new Error('MATCH_CLAIM_LOST');
  }

  async releasePair(pair: ClaimedPair): Promise<void> {
    await this.client.eval(RELEASE_CLAIM_SCRIPT, {
      keys: [this.key('claim:' + pair.first.userId), this.key('claim:' + pair.second.userId)],
      arguments: [pair.claimId],
    });
    await this.enqueue(pair.first);
    await this.enqueue(pair.second);
  }

  async clearActive(userId: string, sessionId: string): Promise<void> {
    await this.client.eval(
      "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1], KEYS[2]); return 1 end return 0",
      {
        keys: [this.key('active:' + userId), this.key('active-context:' + userId)],
        arguments: [sessionId],
      },
    );
  }

  async getActiveContext(userId: string, sessionId: string): Promise<QueueEntry | null> {
    const [active, context] = await Promise.all([
      this.client.get(this.key('active:' + userId)),
      this.client.get(this.key('active-context:' + userId)),
    ]);
    if (active !== sessionId || !context) return null;
    try {
      const entry = JSON.parse(context) as QueueEntry;
      return typeof entry?.userId === 'string' ? entry : null;
    } catch {
      return null;
    }
  }

  async isBusy(userId: string): Promise<boolean> {
    const [active, claim] = await Promise.all([
      this.client.exists(this.key('active:' + userId)),
      this.client.exists(this.key('claim:' + userId)),
    ]);
    return active > 0 || claim > 0;
  }

  async tryAcquireWorkerLock(owner: string, ttlMs: number): Promise<boolean> {
    return (
      (await this.client.set(this.key('worker-lock'), owner, { NX: true, PX: ttlMs })) === 'OK'
    );
  }

  async releaseWorkerLock(owner: string): Promise<void> {
    await this.client.eval(RELEASE_LOCK_SCRIPT, {
      keys: [this.key('worker-lock')],
      arguments: [owner],
    });
  }
}

export class RedisRecentSkipStore implements RecentSkipStore {
  constructor(
    private readonly client: RedisClientType,
    private readonly prefix = 'posha:{connect}:skip',
  ) {}

  async record(firstUserId: string, secondUserId: string): Promise<void> {
    await this.client.set(this.key(firstUserId, secondUserId), '1', { EX: 24 * 60 * 60 });
  }

  async hasRecentSkip(firstUserId: string, secondUserId: string): Promise<boolean> {
    return (await this.client.exists(this.key(firstUserId, secondUserId))) > 0;
  }

  private key(firstUserId: string, secondUserId: string): string {
    return this.prefix + ':' + pairKey(firstUserId, secondUserId);
  }
}
