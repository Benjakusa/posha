import type { AgeLevel, Role } from '@posha/shared';

export interface OtpChallenge {
  id: string;
  identityHash: Buffer;
  otpHash: Buffer;
  expiresAt: Date;
}

export type BeginOtpResult = 'created' | 'locked' | 'rate_limited';
export type VerifyOtpResult = 'verified' | 'invalid' | 'expired' | 'locked';
export type RotateSessionResult = 'rotated' | 'reused' | 'invalid';

export interface AuthSession {
  id: string;
  userId: string;
  familyId: string;
  refreshHash: string;
  roles: readonly Role[];
  expiresAt: Date;
  familyExpiresAt: Date;
  revokedAt: Date | null;
  mfaVerifiedAt: Date | null;
}

export interface UserAuthState {
  roles: readonly Role[];
  accountStatus: 'active' | 'suspended' | 'banned' | 'deleted';
  ageLevel: AgeLevel;
  encryptedTotpSecret: Buffer | null;
  totpEnabled: boolean;
}

export interface VerifiedUserIdentity {
  id: string;
  roles: readonly Role[];
  accountStatus: UserAuthState['accountStatus'];
  ageLevel: AgeLevel;
  totpEnabled: boolean;
}

export interface NewVerifiedUser {
  id: string;
  roleId: string;
  email: string | null;
  phone: string | null;
  handle: string;
  chatAlias: string;
}

export interface AuthStore {
  beginOtpChallenge(challenge: OtpChallenge, now: Date): Promise<BeginOtpResult>;
  verifyOtpChallenge(
    identityHash: Buffer,
    presentedHash: Buffer,
    now: Date,
    maxAttempts: number,
    lockoutMs: number,
  ): Promise<VerifyOtpResult>;
  createSession(session: AuthSession): Promise<void>;
  findSessionByRefreshHash(refreshHash: string): Promise<AuthSession | null>;
  rotateSession(
    currentRefreshHash: string,
    replacement: AuthSession,
    now: Date,
  ): Promise<RotateSessionResult>;
  revokeSessionFamily(familyId: string, now: Date): Promise<void>;
  findUserByIdentity(identity: string): Promise<VerifiedUserIdentity | null>;
  createVerifiedUser(user: NewVerifiedUser): Promise<VerifiedUserIdentity>;
  getUserAuthState(userId: string): Promise<UserAuthState | null>;
  storeTotpSecret(userId: string, encryptedSecret: Buffer): Promise<void>;
  enableTotp(userId: string, counter: bigint): Promise<void>;
  consumeTotpCounter(userId: string, counter: bigint): Promise<boolean>;
}

export const AUTH_STORE = Symbol('AUTH_STORE');
