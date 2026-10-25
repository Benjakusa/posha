import { jwtVerify, SignJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import { Roles } from '@posha/shared';
import type { Role } from '@posha/shared';
import {
  createOtpCode,
  decodeBase32,
  decryptTotpSecret,
  encodeBase32,
  encryptTotpSecret,
  generateRefreshToken,
  generateUuidV7,
  hashIdentity,
  hashOtp,
  hashRefreshToken,
  normalizeIdentity,
  verifyTotp,
} from './auth-crypto.js';
import type { AuthConfig } from './auth-config.js';
import type { AuthSession, AuthStore, NewVerifiedUser } from './auth-store.js';

export const OTP_DELIVERY = Symbol('OTP_DELIVERY');

export interface OtpDeliveryProvider {
  send(identity: string, code: string): Promise<void>;
}

export class AuthError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'AuthError';
  }
}

export interface AuthAccessClaims {
  sub: string;
  roles: Role[];
  mfa: boolean;
  iat: number;
  exp: number;
  chatAlias?: string;
}

export interface AuthSessionTokens {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

const OTP_TTL_MS = 10 * 60_000;
const OTP_LOCKOUT_MS = 15 * 60_000;
const OTP_MAX_ATTEMPTS = 5;
const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_FAMILY_TTL_MS = 30 * 24 * 60 * 60_000;

const TWO_FACTOR_ROLES = new Set<Role>([
  'creator',
  'moderator',
  'finance_admin',
  'support_agent',
  'compliance_officer',
  'super_admin',
]);

export function requiresTwoFactor(roles: readonly Role[]): boolean {
  return roles.some((role) => TWO_FACTOR_ROLES.has(role));
}

export class AuthService {
  constructor(
    private readonly store: AuthStore,
    private readonly delivery: OtpDeliveryProvider,
    private readonly config: AuthConfig,
    private readonly now: () => Date = () => new Date(),
    private readonly makeOtp: () => string = createOtpCode,
    private readonly makeId: (date: Date) => string = generateUuidV7,
    private readonly makeRefreshToken: () => string = generateRefreshToken,
  ) {}

  async requestOtp(identityInput: string): Promise<void> {
    const identity = normalizeIdentity(identityInput);
    const now = this.now();
    const code = this.makeOtp();
    const result = await this.store.beginOtpChallenge(
      {
        id: this.makeId(now),
        identityHash: hashIdentity(identity, this.config.otpPepper),
        otpHash: hashOtp(identity, code, this.config.otpPepper),
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      },
      now,
    );
    if (result === 'locked') throw new AuthError('OTP_LOCKED');
    if (result === 'rate_limited') throw new AuthError('OTP_RATE_LIMITED');
    await this.delivery.send(identity, code);
  }

  async verifyOtp(identityInput: string, code: string): Promise<void> {
    const identity = normalizeIdentity(identityInput);
    const now = this.now();
    const result = await this.store.verifyOtpChallenge(
      hashIdentity(identity, this.config.otpPepper),
      hashOtp(identity, code, this.config.otpPepper),
      now,
      OTP_MAX_ATTEMPTS,
      OTP_LOCKOUT_MS,
    );
    if (result === 'verified') return;
    if (result === 'locked') throw new AuthError('OTP_LOCKED');
    if (result === 'expired') throw new AuthError('OTP_EXPIRED');
    throw new AuthError('OTP_INVALID');
  }

  async registerWithOtp(
    identityInput: string,
    code: string,
    handleInput: string,
  ): Promise<AuthSessionTokens> {
    const identity = normalizeIdentity(identityInput);
    const handle = handleInput.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,24}$/.test(handle)) throw new AuthError('HANDLE_INVALID');
    await this.verifyOtp(identity, code);
    if (await this.store.findUserByIdentity(identity)) throw new AuthError('IDENTITY_IN_USE');

    const now = this.now();
    const id = this.makeId(now);
    const user: NewVerifiedUser = {
      id,
      roleId: this.makeId(now),
      email: identity.includes('@') ? identity : null,
      phone: identity.includes('@') ? null : identity,
      handle,
      chatAlias: `Member-${id.slice(-6)}`,
    };
    const created = await this.store.createVerifiedUser(user);
    return this.createSession(created.id, created.roles);
  }

  async loginWithOtp(
    identityInput: string,
    code: string,
    secondFactorCode?: string,
  ): Promise<AuthSessionTokens> {
    const identity = normalizeIdentity(identityInput);
    await this.verifyOtp(identity, code);
    const user = await this.store.findUserByIdentity(identity);
    if (!user || user.accountStatus !== 'active') throw new AuthError('AUTH_INVALID');

    let mfaVerifiedAt: Date | null = null;
    if (requiresTwoFactor(user.roles)) {
      if (!user.totpEnabled) throw new AuthError('TWO_FACTOR_REQUIRED');
      if (!secondFactorCode || !(await this.verifySecondFactor(user.id, secondFactorCode))) {
        throw new AuthError('TWO_FACTOR_INVALID');
      }
      mfaVerifiedAt = this.now();
    }
    return this.createSession(user.id, user.roles, mfaVerifiedAt);
  }

  async createSession(
    userId: string,
    roles: readonly Role[],
    mfaVerifiedAt: Date | null = null,
  ): Promise<AuthSessionTokens> {
    const now = this.now();
    if (requiresTwoFactor(roles)) {
      const state = await this.store.getUserAuthState(userId);
      if (!state?.totpEnabled || !mfaVerifiedAt) throw new AuthError('TWO_FACTOR_REQUIRED');
    }
    const familyExpiresAt = new Date(now.getTime() + REFRESH_FAMILY_TTL_MS);
    const refreshToken = this.makeRefreshToken();
    const session: AuthSession = {
      id: this.makeId(now),
      userId,
      familyId: this.makeId(now),
      refreshHash: hashRefreshToken(refreshToken),
      roles,
      expiresAt: familyExpiresAt,
      familyExpiresAt,
      revokedAt: null,
      mfaVerifiedAt,
      createdAt: now,
    };
    await this.store.createSession(session);
    return this.issueTokens(session, refreshToken, now);
  }

  async rotateRefreshToken(refreshToken: string): Promise<AuthSessionTokens> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(refreshToken)) throw new AuthError('SESSION_INVALID');
    const now = this.now();
    const currentHash = hashRefreshToken(refreshToken);
    const current = await this.store.findSessionByRefreshHash(currentHash);
    if (!current) throw new AuthError('SESSION_INVALID');
    if (requiresTwoFactor(current.roles) && !current.mfaVerifiedAt) {
      await this.store.revokeSessionFamily(current.familyId, now);
      throw new AuthError('TWO_FACTOR_REQUIRED');
    }

    const replacementToken = this.makeRefreshToken();
    const replacement: AuthSession = {
      ...current,
      id: this.makeId(now),
      refreshHash: hashRefreshToken(replacementToken),
      expiresAt: current.familyExpiresAt,
      revokedAt: null,
    };
    const result = await this.store.rotateSession(currentHash, replacement, now);
    if (result === 'reused') throw new AuthError('SESSION_REUSE');
    if (result !== 'rotated') throw new AuthError('SESSION_INVALID');
    return this.issueTokens(replacement, replacementToken, now);
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(refreshToken)) return;
    const session = await this.store.findSessionByRefreshHash(hashRefreshToken(refreshToken));
    if (session) await this.store.revokeSessionFamily(session.familyId, this.now());
  }

  async verifyAccessToken(token: string, now = this.now()): Promise<AuthAccessClaims> {
    try {
      const { payload } = await jwtVerify(token, this.config.accessTokenSecret, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['HS256'],
        currentDate: now,
      });
      if (
        typeof payload.sub !== 'string' ||
        !Array.isArray(payload.roles) ||
        !payload.roles.every((role) => Roles.includes(role as Role)) ||
        typeof payload.mfa !== 'boolean' ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number'
      ) {
        throw new Error('Invalid token claims');
      }
      const chatAlias = payload.chatAlias;
      if (payload.roles.includes('guest') && (typeof chatAlias !== 'string' || !chatAlias.trim())) {
        throw new Error('Invalid guest token claims');
      }
      return {
        sub: payload.sub,
        roles: payload.roles as Role[],
        mfa: payload.mfa,
        iat: payload.iat,
        exp: payload.exp,
        ...(typeof chatAlias === 'string' ? { chatAlias } : {}),
      };
    } catch {
      throw new AuthError('TOKEN_INVALID');
    }
  }

  async createGuestAccessToken(
    guestId: string,
    chatAlias: string,
    now = this.now(),
  ): Promise<{ accessToken: string; expiresAt: Date }> {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const expiresAt = new Date((issuedAt + 4 * 60 * 60) * 1000);
    const accessToken = await new SignJWT({ roles: ['guest'], mfa: false, chatAlias })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setSubject(guestId)
      .setJti(this.makeId(now))
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + 4 * 60 * 60)
      .sign(this.config.accessTokenSecret);
    return { accessToken, expiresAt };
  }

  async enrollTwoFactor(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.store.getUserAuthState(userId);
    if (!user || !requiresTwoFactor(user.roles)) throw new AuthError('TWO_FACTOR_NOT_REQUIRED');
    if (user.totpEnabled) throw new AuthError('TWO_FACTOR_ALREADY_ENABLED');
    const secret = encodeBase32(randomBytes(20));
    await this.store.storeTotpSecret(
      userId,
      encryptTotpSecret(decodeBase32(secret), this.config.totpEncryptionKey),
    );
    const label = encodeURIComponent(`POSHA:${userId}`);
    const query = new URLSearchParams({
      secret,
      issuer: 'POSHA',
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    });
    return { secret, otpauthUrl: `otpauth://totp/${label}?${query.toString()}` };
  }

  async confirmTwoFactorEnrollment(userId: string, code: string): Promise<void> {
    const user = await this.store.getUserAuthState(userId);
    if (!user?.encryptedTotpSecret) throw new AuthError('TWO_FACTOR_ENROLLMENT_REQUIRED');
    const secret = decryptTotpSecret(user.encryptedTotpSecret, this.config.totpEncryptionKey);
    const counter = verifyTotp(secret, code, this.now());
    if (counter === null) throw new AuthError('TWO_FACTOR_INVALID');
    await this.store.enableTotp(userId, counter);
  }

  async verifySecondFactor(userId: string, code: string): Promise<boolean> {
    const user = await this.store.getUserAuthState(userId);
    if (!user?.totpEnabled || !user.encryptedTotpSecret) return false;
    const secret = decryptTotpSecret(user.encryptedTotpSecret, this.config.totpEncryptionKey);
    const counter = verifyTotp(secret, code, this.now());
    if (counter === null) return false;
    return this.store.consumeTotpCounter(userId, counter);
  }

  async assertTwoFactorEnabledForPrivilegedUser(userId: string): Promise<void> {
    const user = await this.store.getUserAuthState(userId);
    if (!user || (requiresTwoFactor(user.roles) && !user.totpEnabled)) {
      throw new AuthError('TWO_FACTOR_REQUIRED');
    }
  }

  private async issueTokens(
    session: AuthSession,
    refreshToken: string,
    now: Date,
  ): Promise<AuthSessionTokens> {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const accessExpiresAt = new Date((issuedAt + ACCESS_TTL_SECONDS) * 1000);
    const accessToken = await new SignJWT({
      roles: session.roles,
      mfa: session.mfaVerifiedAt !== null,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setSubject(session.userId)
      .setJti(this.makeId(now))
      .setIssuedAt(issuedAt)
      .setExpirationTime(issuedAt + ACCESS_TTL_SECONDS)
      .sign(this.config.accessTokenSecret);
    return { accessToken, refreshToken, accessExpiresAt, refreshExpiresAt: session.expiresAt };
  }
}
