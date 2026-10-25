import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { BadRequestException, ForbiddenException, HttpException, Injectable } from '@nestjs/common';
import { ErrorCodes } from '@posha/shared';
import { AuthService } from '../auth/auth.service.js';
import { FeatureFlagsService } from '../flags/feature-flags.service.js';

export interface GuestSessionRecord {
  id: string;
  alias: string;
  declaredAt: Date;
  ipHash: string;
  userAgentHash: string;
  expiresAt: Date;
}

export interface GuestSessionStore {
  create(record: GuestSessionRecord): Promise<void>;
  get(guestId: string): Promise<GuestSessionRecord | null>;
}

export const GUEST_SESSION_STORE = Symbol('GUEST_SESSION_STORE');
export const GUEST_SESSION_VERIFIER = Symbol('GUEST_SESSION_VERIFIER');
export interface GuestSessionVerifier {
  isActive(guestId: string, now?: Date): Promise<boolean>;
  aliasFor(guestId: string): Promise<string | null>;
}

const aliases = [
  ['Amber', 'Cedar', 'River', 'Silver', 'Sunny', 'Willow', 'Ocean', 'Clever'],
  ['Fox', 'Robin', 'Otter', 'Sparrow', 'Wolf', 'Dove', 'Panda', 'Finch'],
] as const;

export function createGuestAlias(): string {
  return `${aliases[0][randomInt(aliases[0].length)]} ${aliases[1][randomInt(aliases[1].length)]}`;
}

export class MemoryGuestSessionStore implements GuestSessionStore {
  private readonly records = new Map<string, GuestSessionRecord>();
  async create(record: GuestSessionRecord): Promise<void> {
    this.records.set(record.id, { ...record });
  }
  async get(guestId: string): Promise<GuestSessionRecord | null> {
    const record = this.records.get(guestId);
    return record ? { ...record } : null;
  }
}

@Injectable()
export class GuestSessionService {
  private readonly requests = new Map<string, { count: number; expiresAt: number }>();

  constructor(
    private readonly auth: AuthService,
    private readonly flags: FeatureFlagsService,
    private readonly store: GuestSessionStore,
    private readonly auditKey: Buffer,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(input: {
    ageDeclaration: unknown;
    ipAddress: string;
    userAgent: string;
  }): Promise<{ accessToken: string; tokenType: 'Bearer'; expiresAt: string; alias: string }> {
    if (input.ageDeclaration !== true)
      throw new BadRequestException({ code: ErrorCodes.VALIDATION_ERROR });
    if (!this.flags.isEnabled('GATE:GUEST_ACCESS')) {
      throw new ForbiddenException({ code: ErrorCodes.GATE_DISABLED });
    }
    const now = this.now();
    if (this.requests.size > 5000) {
      for (const [key, value] of this.requests) {
        if (value.expiresAt <= now.getTime()) this.requests.delete(key);
      }
    }
    const rateKey = this.hash(input.ipAddress);
    const rate = this.requests.get(rateKey) ?? { count: 0, expiresAt: now.getTime() + 60_000 };
    if (rate.expiresAt <= now.getTime()) {
      rate.count = 0;
      rate.expiresAt = now.getTime() + 60_000;
    }
    rate.count += 1;
    this.requests.set(rateKey, rate);
    if (rate.count > 5) throw new HttpException({ code: ErrorCodes.RATE_LIMITED }, 429);

    const guestId = `guest-${randomUUID()}`;
    const alias = createGuestAlias();
    const token = await this.auth.createGuestAccessToken(guestId, alias, now);
    await this.store.create({
      id: guestId,
      alias,
      declaredAt: now,
      ipHash: this.hash(input.ipAddress),
      userAgentHash: this.hash(input.userAgent),
      expiresAt: token.expiresAt,
    });
    return {
      ...token,
      tokenType: 'Bearer',
      expiresAt: token.expiresAt.toISOString(),
      alias,
    };
  }

  async isActive(guestId: string, now = this.now()): Promise<boolean> {
    const record = await this.store.get(guestId);
    return Boolean(record && record.expiresAt > now);
  }

  async aliasFor(guestId: string): Promise<string | null> {
    return (await this.store.get(guestId))?.alias ?? null;
  }

  private hash(value: string): string {
    return createHmac('sha256', this.auditKey).update(value).digest('hex');
  }
}
