import { createHmac } from 'node:crypto';
import type { RedisClientType } from 'redis';
import type { RateLimitPolicyOptions } from './policy-metadata.js';

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface RateLimitStore {
  consume(policy: RateLimitPolicyOptions, identity: string): Promise<RateLimitResult>;
}

export const RATE_LIMIT_STORE = Symbol('RATE_LIMIT_STORE');

const FIXED_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return { count, redis.call('PTTL', KEYS[1]) }
`;

export class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly client: RedisClientType,
    private readonly keySecret: Buffer,
    private readonly prefix = 'posha:ratelimit',
  ) {
    if (keySecret.length < 32)
      throw new Error('Rate limit key secret must contain at least 32 bytes');
  }

  async consume(policy: RateLimitPolicyOptions, identity: string): Promise<RateLimitResult> {
    const digest = createHmac('sha256', this.keySecret)
      .update(`${policy.name}\0${identity}`)
      .digest('hex');
    const result = await this.client.eval(FIXED_WINDOW_SCRIPT, {
      keys: [`${this.prefix}:${digest}`],
      arguments: [String(policy.windowMs)],
    });
    if (!Array.isArray(result) || result.length !== 2)
      throw new Error('Invalid Redis rate-limit response');
    const count = Number(result[0]);
    const ttl = Number(result[1]);
    return { allowed: count <= policy.limit, retryAfterMs: Math.max(0, ttl) };
  }
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, { count: number; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(policy: RateLimitPolicyOptions, identity: string): Promise<RateLimitResult> {
    const key = `${policy.name}\0${identity}`;
    const now = this.now();
    const previous = this.entries.get(key);
    const entry =
      !previous || previous.expiresAt <= now
        ? { count: 0, expiresAt: now + policy.windowMs }
        : previous;
    entry.count += 1;
    this.entries.set(key, entry);
    return {
      allowed: entry.count <= policy.limit,
      retryAfterMs: Math.max(0, entry.expiresAt - now),
    };
  }
}
