import { timingSafeEqual } from 'node:crypto';
import type {
  AuthSession,
  AuthStore,
  BeginOtpResult,
  NewVerifiedUser,
  OtpChallenge,
  RotateSessionResult,
  UserAuthState,
  VerifiedUserIdentity,
  VerifyOtpResult,
} from './auth/auth-store.js';

interface MemoryOtpChallenge extends OtpChallenge {
  attempts: number;
  lockedUntil: Date | null;
}

export class MemoryAuthStore implements AuthStore {
  private readonly users = new Map<string, UserAuthState>();
  private readonly identities = new Map<string, string>();
  private readonly sessions = new Map<string, AuthSession>();
  private readonly otpChallenges = new Map<string, MemoryOtpChallenge>();
  private readonly refreshTokens = new Map<string, AuthSession>();
  private readonly totpCounters = new Map<string, bigint>();

  async createVerifiedUser(user: NewVerifiedUser): Promise<VerifiedUserIdentity> {
    const record: UserAuthState = {
      roles: ['member'],
      accountStatus: 'active',
      ageLevel: 'L0',
      encryptedTotpSecret: null,
      totpEnabled: false,
    };
    this.users.set(user.id, record);
    for (const identity of [user.email, user.phone]) {
      if (identity) this.identities.set(identity, user.id);
    }
    return {
      id: user.id,
      roles: record.roles,
      accountStatus: record.accountStatus,
      ageLevel: record.ageLevel,
      totpEnabled: record.totpEnabled,
    };
  }

  async findUserByIdentity(identity: string): Promise<VerifiedUserIdentity | null> {
    const id = this.identities.get(identity);
    const user = id ? this.users.get(id) : null;
    if (!id || !user) return null;
    return {
      id,
      roles: user.roles,
      accountStatus: user.accountStatus,
      ageLevel: user.ageLevel,
      totpEnabled: user.totpEnabled,
    };
  }

  async beginOtpChallenge(challenge: OtpChallenge, now: Date): Promise<BeginOtpResult> {
    const key = challenge.identityHash.toString('hex');
    const current = this.otpChallenges.get(key);
    if (current?.lockedUntil && current.lockedUntil > now) return 'locked';
    const recent = [...this.otpChallenges.values()].filter(
      (item) => item.expiresAt.getTime() > now.getTime() - 10 * 60_000,
    );
    if (recent.length >= 3 && !current) return 'rate_limited';
    this.otpChallenges.set(key, { ...challenge, attempts: 0, lockedUntil: null });
    return 'created';
  }

  async verifyOtpChallenge(
    identityHash: Buffer,
    presentedHash: Buffer,
    now: Date,
    maxAttempts: number,
    lockoutMs: number,
  ): Promise<VerifyOtpResult> {
    const key = identityHash.toString('hex');
    const challenge = this.otpChallenges.get(key);
    if (!challenge) return 'invalid';
    if (challenge.lockedUntil && challenge.lockedUntil > now) return 'locked';
    if (now > challenge.expiresAt) {
      this.otpChallenges.delete(key);
      return 'expired';
    }
    const valid =
      challenge.otpHash.length === presentedHash.length &&
      timingSafeEqual(challenge.otpHash, presentedHash);
    if (!valid) {
      challenge.attempts += 1;
      if (challenge.attempts >= maxAttempts) {
        challenge.lockedUntil = new Date(now.getTime() + lockoutMs);
        return 'locked';
      }
      return 'invalid';
    }
    this.otpChallenges.delete(key);
    return 'verified';
  }

  async createSession(session: AuthSession): Promise<void> {
    this.sessions.set(session.id, { ...session });
    this.refreshTokens.set(session.refreshHash, { ...session });
  }

  async findSessionByRefreshHash(refreshHash: string): Promise<AuthSession | null> {
    const session = this.refreshTokens.get(refreshHash);
    if (!session || session.expiresAt <= new Date() || session.revokedAt) return null;
    return { ...session };
  }

  async rotateSession(
    currentRefreshHash: string,
    replacement: AuthSession,
    now: Date,
  ): Promise<RotateSessionResult> {
    const existing = this.refreshTokens.get(currentRefreshHash);
    if (!existing) return 'invalid';
    this.refreshTokens.delete(currentRefreshHash);
    this.sessions.set(existing.id, { ...existing, revokedAt: now });
    const next = { ...replacement, createdAt: now };
    this.sessions.set(next.id, next);
    this.refreshTokens.set(next.refreshHash, next);
    return 'rotated';
  }

  async revokeSessionFamily(familyId: string, now: Date): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (session.familyId === familyId) this.sessions.set(id, { ...session, revokedAt: now });
    }
    for (const [hash, session] of this.refreshTokens) {
      if (session.familyId === familyId) this.refreshTokens.delete(hash);
    }
  }

  async getUserAuthState(userId: string): Promise<UserAuthState | null> {
    const user = this.users.get(userId);
    return user ? { ...user } : null;
  }

  async storeTotpSecret(userId: string, encryptedSecret: Buffer): Promise<void> {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    user.encryptedTotpSecret = encryptedSecret;
    user.totpEnabled = false;
    this.totpCounters.delete(userId);
  }

  async enableTotp(userId: string, counter: bigint): Promise<void> {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    user.totpEnabled = true;
    this.totpCounters.set(userId, counter);
  }

  async consumeTotpCounter(userId: string, counter: bigint): Promise<boolean> {
    const user = this.users.get(userId);
    const last = this.totpCounters.get(userId);
    if (!user?.totpEnabled || last === undefined || counter <= last) return false;
    this.totpCounters.set(userId, counter);
    return true;
  }
}
