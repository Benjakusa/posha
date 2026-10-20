import { timingSafeEqual } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { Role } from '@posha/shared';
import { createTotp, decodeBase32, generateUuidV7, hashOtp } from '../src/auth/auth-crypto.js';
import { validateAuthConfig } from '../src/auth/auth-config.js';
import type {
  AuthSession,
  AuthStore,
  BeginOtpResult,
  NewVerifiedUser,
  OtpChallenge,
  RotateSessionResult,
  UserAuthState,
  VerifyOtpResult,
  VerifiedUserIdentity,
} from '../src/auth/auth-store.js';
import { AuthService, requiresTwoFactor } from '../src/auth/auth.service.js';

class MemoryAuthStore implements AuthStore {
  readonly challenges: Array<
    OtpChallenge & {
      attempts: number;
      lockedUntil: Date | null;
      consumed: boolean;
      requestedAt: Date;
    }
  > = [];
  readonly sessions = new Map<string, AuthSession>();
  readonly users = new Map<string, UserAuthState & { lastCounter: bigint | null }>();
  readonly identities = new Map<string, VerifiedUserIdentity>();

  async beginOtpChallenge(challenge: OtpChallenge, now: Date): Promise<BeginOtpResult> {
    const latest = [...this.challenges]
      .reverse()
      .find((item) => item.identityHash.equals(challenge.identityHash) && !item.consumed);
    if (latest?.lockedUntil && latest.lockedUntil > now) return 'locked';
    const recent = this.challenges.filter(
      (item) =>
        item.identityHash.equals(challenge.identityHash) &&
        now.getTime() - item.requestedAt.getTime() < 10 * 60_000,
    );
    if (recent.length >= 3) return 'rate_limited';
    for (const item of this.challenges) {
      if (item.identityHash.equals(challenge.identityHash) && !item.consumed) item.consumed = true;
    }
    this.challenges.push({
      ...challenge,
      attempts: 0,
      lockedUntil: null,
      consumed: false,
      requestedAt: now,
    });
    return 'created';
  }

  async verifyOtpChallenge(
    identityHash: Buffer,
    presentedHash: Buffer,
    now: Date,
    maxAttempts: number,
    lockoutMs: number,
  ): Promise<VerifyOtpResult> {
    const challenge = [...this.challenges]
      .reverse()
      .find((item) => item.identityHash.equals(identityHash) && !item.consumed);
    if (!challenge) return 'invalid';
    if (challenge.lockedUntil && challenge.lockedUntil > now) return 'locked';
    if (challenge.expiresAt <= now) {
      challenge.consumed = true;
      return 'expired';
    }
    if (
      challenge.otpHash.length === presentedHash.length &&
      timingSafeEqual(challenge.otpHash, presentedHash)
    ) {
      challenge.consumed = true;
      return 'verified';
    }
    challenge.attempts += 1;
    if (challenge.attempts >= maxAttempts) {
      challenge.lockedUntil = new Date(now.getTime() + lockoutMs);
      return 'locked';
    }
    return 'invalid';
  }

  async createSession(session: AuthSession): Promise<void> {
    this.sessions.set(session.refreshHash, structuredClone(session));
  }

  async findSessionByRefreshHash(refreshHash: string): Promise<AuthSession | null> {
    const session = this.sessions.get(refreshHash);
    return session ? structuredClone(session) : null;
  }

  async rotateSession(
    currentRefreshHash: string,
    replacement: AuthSession,
    now: Date,
  ): Promise<RotateSessionResult> {
    const current = this.sessions.get(currentRefreshHash);
    if (!current) return 'invalid';
    if (current.revokedAt) {
      await this.revokeSessionFamily(current.familyId, now);
      return 'reused';
    }
    current.revokedAt = now;
    this.sessions.set(replacement.refreshHash, structuredClone(replacement));
    return 'rotated';
  }

  async revokeSessionFamily(familyId: string, now: Date): Promise<void> {
    for (const session of this.sessions.values()) {
      if (session.familyId === familyId && !session.revokedAt) session.revokedAt = now;
    }
  }

  async findUserByIdentity(identity: string): Promise<VerifiedUserIdentity | null> {
    const user = this.identities.get(identity);
    return user ? structuredClone(user) : null;
  }

  async createVerifiedUser(user: NewVerifiedUser): Promise<VerifiedUserIdentity> {
    const verifiedUser = {
      id: user.id,
      roles: ['member'] as Role[],
      accountStatus: 'active' as const,
      totpEnabled: false,
    };
    const identity = user.email ?? user.phone;
    if (!identity) throw new Error('identity missing');
    this.identities.set(identity, verifiedUser);
    this.users.set(user.id, {
      roles: verifiedUser.roles,
      accountStatus: 'active',
      encryptedTotpSecret: null,
      totpEnabled: false,
      lastCounter: null,
    });
    return structuredClone(verifiedUser);
  }

  async getUserAuthState(userId: string): Promise<UserAuthState | null> {
    const user = this.users.get(userId);
    return user ? structuredClone(user) : null;
  }

  async storeTotpSecret(userId: string, encryptedSecret: Buffer): Promise<void> {
    const user = this.users.get(userId);
    if (!user) throw new Error('user missing');
    user.encryptedTotpSecret = Buffer.from(encryptedSecret);
    user.totpEnabled = false;
    user.lastCounter = null;
  }

  async enableTotp(userId: string, counter: bigint): Promise<void> {
    const user = this.users.get(userId);
    if (!user?.encryptedTotpSecret) throw new Error('secret missing');
    user.totpEnabled = true;
    user.lastCounter = counter;
  }

  async consumeTotpCounter(userId: string, counter: bigint): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user?.totpEnabled || (user.lastCounter !== null && user.lastCounter >= counter))
      return false;
    user.lastCounter = counter;
    return true;
  }
}

class MemoryOtpDelivery {
  readonly sent: Array<{ identity: string; code: string }> = [];
  async send(identity: string, code: string): Promise<void> {
    this.sent.push({ identity, code });
  }
}

function createHarness(start = new Date('2026-10-20T12:00:00.000Z')) {
  let now = start;
  const store = new MemoryAuthStore();
  const delivery = new MemoryOtpDelivery();
  const config = validateAuthConfig({
    AUTH_ACCESS_TOKEN_SECRET: 'test-only-auth-access-secret-32-bytes',
    AUTH_OTP_PEPPER: 'test-only-otp-pepper-secret-32-bytes',
    AUTH_TOTP_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
  });
  let refreshCounter = 0;
  const service = new AuthService(
    store,
    delivery,
    config,
    () => now,
    () => '123456',
    (date) => generateUuidV7(date),
    () => String(++refreshCounter).padStart(43, '0'),
  );
  return {
    service,
    store,
    delivery,
    config,
    setNow(value: Date) {
      now = value;
    },
  };
}

describe('authentication', () => {
  it('[AUTH-01] verifies emailed OTP and applies expiry, attempt, and lockout limits', async () => {
    const { service, delivery, setNow } = createHarness();
    await service.requestOtp('User@example.com');
    expect(delivery.sent[0]).toEqual({ identity: 'user@example.com', code: '123456' });
    await service.verifyOtp('user@example.com', '123456');
    await expect(service.verifyOtp('user@example.com', '123456')).rejects.toMatchObject({
      code: 'OTP_INVALID',
    });

    await service.requestOtp('user@example.com');
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await expect(service.verifyOtp('user@example.com', '000000')).rejects.toMatchObject({
        code: 'OTP_INVALID',
      });
    }
    await expect(service.verifyOtp('user@example.com', '000000')).rejects.toMatchObject({
      code: 'OTP_LOCKED',
    });
    await expect(service.requestOtp('user@example.com')).rejects.toMatchObject({
      code: 'OTP_LOCKED',
    });

    setNow(new Date('2026-10-20T12:15:01.000Z'));
    await service.requestOtp('user@example.com');
    setNow(new Date('2026-10-20T12:25:02.000Z'));
    await expect(service.verifyOtp('user@example.com', '123456')).rejects.toMatchObject({
      code: 'OTP_EXPIRED',
    });
  });

  it('[AUTH-01] limits OTP requests to three per identity in ten minutes', async () => {
    const { service } = createHarness();
    await service.requestOtp('user@example.com');
    await service.requestOtp('user@example.com');
    await service.requestOtp('user@example.com');
    await expect(service.requestOtp('user@example.com')).rejects.toMatchObject({
      code: 'OTP_RATE_LIMITED',
    });
  });

  it('[AUTH-01] normalizes and delivers OTPs to international phone identities', async () => {
    const { service, delivery } = createHarness();
    await service.requestOtp('+254712345678');
    expect(delivery.sent[0]).toEqual({ identity: '+254712345678', code: '123456' });
    await service.verifyOtp('+254712345678', '123456');
  });

  it('[AUTH-01] registers a verified L0 member and then signs in by OTP', async () => {
    const { service, delivery, store } = createHarness();
    await service.requestOtp('new-user@example.com');
    const registered = await service.registerWithOtp(
      'new-user@example.com',
      '123456',
      'new_member',
    );
    const user = await store.findUserByIdentity('new-user@example.com');
    expect(user).toMatchObject({ roles: ['member'], accountStatus: 'active', totpEnabled: false });
    expect(registered.accessToken).toBeTruthy();

    await service.requestOtp('new-user@example.com');
    const loggedIn = await service.loginWithOtp('new-user@example.com', delivery.sent[1]!.code);
    expect(await service.verifyAccessToken(loggedIn.accessToken)).toMatchObject({
      sub: user?.id,
      mfa: false,
    });
  });

  it('[AUTH-02] issues 15-minute JWTs, rotates refresh tokens, and revokes a reused family', async () => {
    const { service, store } = createHarness();
    const first = await service.createSession('019a4c00-0000-7000-8000-000000000001', ['member']);
    const claims = await service.verifyAccessToken(first.accessToken);
    expect(claims.exp - claims.iat).toBe(15 * 60);
    expect(claims.roles).toEqual(['member']);

    const rotated = await service.rotateRefreshToken(first.refreshToken);
    expect(rotated.refreshToken).not.toBe(first.refreshToken);
    await expect(service.rotateRefreshToken(first.refreshToken)).rejects.toMatchObject({
      code: 'SESSION_REUSE',
    });
    await expect(service.rotateRefreshToken(rotated.refreshToken)).rejects.toMatchObject({
      code: 'SESSION_REUSE',
    });
    expect([...store.sessions.values()].every((session) => session.revokedAt !== null)).toBe(true);
  });

  it('[AUTH-02] rejects expired and tampered access tokens', async () => {
    const { service, setNow } = createHarness();
    const result = await service.createSession('019a4c00-0000-7000-8000-000000000002', ['member']);
    setNow(new Date('2026-10-20T12:16:00.000Z'));
    await expect(service.verifyAccessToken(result.accessToken)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
    await expect(service.verifyAccessToken(`${result.accessToken}x`)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('[AUTH-03] requires encrypted TOTP enrollment for creator and staff roles', async () => {
    const { service, store, config } = createHarness();
    const userId = '019a4c00-0000-7000-8000-000000000003';
    const roles: Role[] = ['creator'];
    store.users.set(userId, {
      roles,
      accountStatus: 'active',
      encryptedTotpSecret: null,
      totpEnabled: false,
      lastCounter: null,
    });
    await expect(service.createSession(userId, roles)).rejects.toMatchObject({
      code: 'TWO_FACTOR_REQUIRED',
    });

    const enrollment = await service.enrollTwoFactor(userId);
    expect(store.users.get(userId)?.encryptedTotpSecret?.toString()).not.toContain(
      enrollment.secret,
    );
    const counter = BigInt(Math.floor(Date.parse('2026-10-20T12:00:00.000Z') / 30_000));
    const code = createTotp(decodeBase32(enrollment.secret), counter);
    await service.confirmTwoFactorEnrollment(userId, code);
    expect(await service.verifySecondFactor(userId, code)).toBe(false);
    const laterCode = createTotp(decodeBase32(enrollment.secret), counter + 1n);
    expect(await service.verifySecondFactor(userId, laterCode)).toBe(true);
    expect(await service.verifySecondFactor(userId, laterCode)).toBe(false);
    await service.createSession(userId, roles, new Date('2026-10-20T12:00:30.000Z'));
    await service.assertTwoFactorEnabledForPrivilegedUser(userId);

    expect(
      requiresTwoFactor([
        'moderator',
        'finance_admin',
        'support_agent',
        'compliance_officer',
        'super_admin',
      ]),
    ).toBe(true);
    expect(config.totpEncryptionKey.length).toBe(32);
  });

  it('[AUTH-03] matches the RFC 6238 SHA-1 test vector with six-digit codes', () => {
    expect(createTotp(Buffer.from('12345678901234567890'), 1n)).toBe('287082');
  });

  it('[AUTH-02] hashes OTPs with a pepper and keeps token secrets out of configuration errors', () => {
    expect(
      hashOtp('user@example.com', '123456', Buffer.from('pepper-secret-32-bytes-minimum!!!')),
    ).not.toEqual(Buffer.from('123456'));
    expect(() =>
      validateAuthConfig({ AUTH_ACCESS_TOKEN_SECRET: 'secret-in-error-value-more-than-32' }),
    ).toThrow(
      'Invalid authentication configuration keys: AUTH_OTP_PEPPER, AUTH_TOTP_ENCRYPTION_KEY',
    );
    try {
      validateAuthConfig({ AUTH_ACCESS_TOKEN_SECRET: 'secret-in-error-value-more-than-32' });
    } catch (error) {
      expect((error as Error).message).not.toContain('secret-in-error-value-more-than-32');
    }
  });
});
