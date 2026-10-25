export interface RateLimitPolicyOptions {
  name: string;
  limit: number;
  windowMs: number;
  keyBy: string;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface RateLimitStore {
  consume(policy: RateLimitPolicyOptions, identity: string): Promise<RateLimitResult>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly entries = new Map<string, { count: number; expiresAt: number }>();

  constructor(private readonly now: () => number = Date.now) {}

  async consume(policy: RateLimitPolicyOptions, identity: string): Promise<RateLimitResult> {
    const key = policy.name + '\0' + identity;
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

// Video rate limit store that enforces guest/subscriber distinctions
export class VideoRateLimitStore implements RateLimitStore {
  private readonly store: MemoryRateLimitStore;

  constructor() {
    this.store = new MemoryRateLimitStore();
  }

  async consume(
    policy: RateLimitPolicyOptions,
    identity: string,
  ): Promise<{ allowed: boolean; retryAfterMs: number }> {
    // Determine user type based on identity
    const userType =
      identity.includes('sub-') || identity.includes('follower')
        ? ('subscriber' as const)
        : ('guest' as const);

    // Select policy based on user type
    let effectivePolicy: RateLimitPolicyOptions;
    if (userType === 'guest') {
      effectivePolicy = {
        name: policy.name + '.guest',
        limit: 1, // 1 session start per 2-minute guest window
        windowMs: 2 * 60 * 1000, // 2 minutes
        keyBy: policy.keyBy,
      };
    } else {
      effectivePolicy = {
        name: policy.name + '.subscriber',
        limit: 100, // High limit for subscribers
        windowMs: 60 * 60 * 1000, // 1 hour window
        keyBy: policy.keyBy,
      };
    }

    const result = await this.store.consume(effectivePolicy, identity);
    return { allowed: result.allowed, retryAfterMs: result.retryAfterMs };
  }
}

// Pre-configured store instance for ConnectModule
export const VIDEO_RATE_LIMIT_STORE = new VideoRateLimitStore();
