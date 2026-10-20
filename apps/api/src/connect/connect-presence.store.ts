import type { RedisClientType } from 'redis';

const PRESENCE_TTL_SECONDS = 45;

export interface ConnectPresenceStore {
  refresh(userId: string, socketId: string): Promise<void>;
  remove(userId: string, socketId: string): Promise<void>;
}

const REFRESH_SCRIPT = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[1])
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return 1
`;

const REMOVE_SCRIPT = `
redis.call('ZREM', KEYS[1], ARGV[1])
if redis.call('ZCARD', KEYS[1]) == 0 then return redis.call('DEL', KEYS[1]) end
return 1
`;

export class RedisConnectPresenceStore implements ConnectPresenceStore {
  constructor(
    private readonly client: RedisClientType,
    private readonly prefix = 'posha:connect:presence',
    private readonly now: () => number = Date.now,
  ) {}

  async refresh(userId: string, socketId: string): Promise<void> {
    const now = this.now();
    await this.client.eval(REFRESH_SCRIPT, {
      keys: [`${this.prefix}:${userId}`],
      arguments: [
        String(now),
        String(now + PRESENCE_TTL_SECONDS * 1000),
        socketId,
        String(PRESENCE_TTL_SECONDS),
      ],
    });
  }

  async remove(userId: string, socketId: string): Promise<void> {
    await this.client.eval(REMOVE_SCRIPT, {
      keys: [`${this.prefix}:${userId}`],
      arguments: [socketId],
    });
  }
}

export class MemoryConnectPresenceStore implements ConnectPresenceStore {
  private readonly sockets = new Map<string, Map<string, number>>();

  constructor(private readonly now: () => number = Date.now) {}

  async refresh(userId: string, socketId: string): Promise<void> {
    const entries = this.sockets.get(userId) ?? new Map<string, number>();
    const now = this.now();
    for (const [id, expiresAt] of entries) if (expiresAt <= now) entries.delete(id);
    entries.set(socketId, now + PRESENCE_TTL_SECONDS * 1000);
    this.sockets.set(userId, entries);
  }

  async remove(userId: string, socketId: string): Promise<void> {
    const entries = this.sockets.get(userId);
    entries?.delete(socketId);
    if (entries?.size === 0) this.sockets.delete(userId);
  }

  isOnline(userId: string): boolean {
    const entries = this.sockets.get(userId);
    if (!entries) return false;
    const now = this.now();
    for (const [id, expiresAt] of entries) if (expiresAt <= now) entries.delete(id);
    if (entries.size === 0) this.sockets.delete(userId);
    return entries.size > 0;
  }
}

export const CONNECT_PRESENCE_STORE = Symbol('CONNECT_PRESENCE_STORE');
