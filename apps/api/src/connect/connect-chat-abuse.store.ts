import { createHmac } from 'node:crypto';
import type { RedisClientType } from 'redis';

export type ChatFloodResult = 'warn' | 'muted';
export interface ConnectChatAbuseStore {
  isMuted(userId: string): Promise<boolean>;
  recordFlood(userId: string): Promise<ChatFloodResult>;
}
export const CONNECT_CHAT_ABUSE_STORE = Symbol('CONNECT_CHAT_ABUSE_STORE');

const FLOOD_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], 60000) end
if count >= 2 then redis.call('SET', KEYS[2], '1', 'PX', 30000) end
return count
`;

export class RedisConnectChatAbuseStore implements ConnectChatAbuseStore {
  constructor(
    private readonly redis: RedisClientType,
    private readonly secret: Buffer,
    private readonly prefix = 'posha:connect:chat-abuse',
  ) {
    if (secret.length < 32)
      throw new Error('Connect abuse key secret must contain at least 32 bytes');
  }
  private key(userId: string, kind: 'flood' | 'mute'): string {
    const digest = createHmac('sha256', this.secret).update(userId).digest('hex');
    return `${this.prefix}:${kind}:${digest}`;
  }
  async isMuted(userId: string): Promise<boolean> {
    return (await this.redis.exists(this.key(userId, 'mute'))) > 0;
  }
  async recordFlood(userId: string): Promise<ChatFloodResult> {
    const result = await this.redis.eval(FLOOD_SCRIPT, {
      keys: [this.key(userId, 'flood'), this.key(userId, 'mute')],
      arguments: [],
    });
    return Number(result) >= 2 ? 'muted' : 'warn';
  }
}

export class MemoryConnectChatAbuseStore implements ConnectChatAbuseStore {
  private readonly state = new Map<
    string,
    { count: number; windowEnd: number; mutedUntil: number }
  >();
  constructor(private readonly now: () => number = Date.now) {}
  async isMuted(userId: string): Promise<boolean> {
    const current = this.state.get(userId);
    return Boolean(current && current.mutedUntil > this.now());
  }
  async recordFlood(userId: string): Promise<ChatFloodResult> {
    const now = this.now();
    let current = this.state.get(userId);
    if (!current || current.windowEnd <= now) {
      current = { count: 0, windowEnd: now + 60_000, mutedUntil: 0 };
      this.state.set(userId, current);
    }
    current.count += 1;
    if (current.count >= 2) current.mutedUntil = now + 30_000;
    return current.count >= 2 ? 'muted' : 'warn';
  }
}
