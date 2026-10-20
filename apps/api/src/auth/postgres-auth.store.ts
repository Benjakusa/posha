import { timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import type { Role } from '@posha/shared';
import type { AgeLevel } from '@posha/shared';
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
} from './auth-store.js';

interface SessionRow {
  id: string;
  user_id: string;
  family_id: string;
  refresh_hash: string;
  expires_at: Date;
  family_expires_at: Date;
  revoked_at: Date | null;
  mfa_verified_at: Date | null;
  roles: string[];
}

function toAuthSession(row: SessionRow): AuthSession {
  return {
    id: row.id,
    userId: row.user_id,
    familyId: row.family_id,
    refreshHash: row.refresh_hash,
    roles: row.roles as Role[],
    expiresAt: row.expires_at,
    familyExpiresAt: row.family_expires_at,
    revokedAt: row.revoked_at,
    mfaVerifiedAt: row.mfa_verified_at,
  };
}

export class PostgresAuthStore implements AuthStore {
  constructor(private readonly pool: Pool) {}

  async beginOtpChallenge(challenge: OtpChallenge, now: Date): Promise<BeginOtpResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended(encode($1, 'hex'), 0))", [
        challenge.identityHash,
      ]);
      await client.query(
        "DELETE FROM auth_challenges WHERE created_at < $1::timestamptz - interval '1 day'",
        [now],
      );
      const lock = await client.query<{ locked_until: Date | null }>(
        `SELECT locked_until FROM auth_challenges
         WHERE identity_hash = $1 AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [challenge.identityHash],
      );
      if (lock.rows[0]?.locked_until && lock.rows[0].locked_until > now) {
        await client.query('ROLLBACK');
        return 'locked';
      }

      const rate = await client.query<{ count: string }>(
        `SELECT count(*) FROM auth_challenges
         WHERE identity_hash = $1 AND created_at >= $2::timestamptz - interval '10 minutes'`,
        [challenge.identityHash, now],
      );
      if (Number(rate.rows[0]?.count ?? 0) >= 3) {
        await client.query('ROLLBACK');
        return 'rate_limited';
      }

      await client.query(
        `UPDATE auth_challenges SET consumed_at = $2, updated_at = $2
         WHERE identity_hash = $1 AND consumed_at IS NULL`,
        [challenge.identityHash, now],
      );
      await client.query(
        `INSERT INTO auth_challenges (id, identity_hash, otp_hash, expires_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $5)`,
        [challenge.id, challenge.identityHash, challenge.otpHash, challenge.expiresAt, now],
      );
      await client.query('COMMIT');
      return 'created';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async verifyOtpChallenge(
    identityHash: Buffer,
    presentedHash: Buffer,
    now: Date,
    maxAttempts: number,
    lockoutMs: number,
  ): Promise<VerifyOtpResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        id: string;
        otp_hash: Buffer;
        attempt_count: number;
        expires_at: Date;
        locked_until: Date | null;
      }>(
        `SELECT id, otp_hash, attempt_count, expires_at, locked_until FROM auth_challenges
         WHERE identity_hash = $1 AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [identityHash],
      );
      const challenge = result.rows[0];
      if (!challenge) {
        await client.query('ROLLBACK');
        return 'invalid';
      }
      if (challenge.locked_until && challenge.locked_until > now) {
        await client.query('ROLLBACK');
        return 'locked';
      }
      if (challenge.expires_at <= now) {
        await client.query(
          'UPDATE auth_challenges SET consumed_at = $2, updated_at = $2 WHERE id = $1',
          [challenge.id, now],
        );
        await client.query('COMMIT');
        return 'expired';
      }

      const matches =
        challenge.otp_hash.length === presentedHash.length &&
        timingSafeEqual(challenge.otp_hash, presentedHash);
      if (matches) {
        await client.query(
          'UPDATE auth_challenges SET consumed_at = $2, updated_at = $2 WHERE id = $1',
          [challenge.id, now],
        );
        await client.query('COMMIT');
        return 'verified';
      }

      const attempts = challenge.attempt_count + 1;
      const lockedUntil = attempts >= maxAttempts ? new Date(now.getTime() + lockoutMs) : null;
      await client.query(
        `UPDATE auth_challenges SET attempt_count = $2, locked_until = $3, updated_at = $4
         WHERE id = $1`,
        [challenge.id, attempts, lockedUntil, now],
      );
      await client.query('COMMIT');
      return lockedUntil ? 'locked' : 'invalid';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async createSession(session: AuthSession): Promise<void> {
    await this.pool.query(
      `INSERT INTO sessions_auth
       (id, user_id, family_id, refresh_hash, expires_at, family_expires_at, mfa_verified_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
      [
        session.id,
        session.userId,
        session.familyId,
        session.refreshHash,
        session.expiresAt,
        session.familyExpiresAt,
        session.mfaVerifiedAt,
      ],
    );
  }

  async findSessionByRefreshHash(refreshHash: string): Promise<AuthSession | null> {
    const result = await this.pool.query<SessionRow>(
      `SELECT s.id, s.user_id, s.family_id, s.refresh_hash, s.expires_at,
              s.family_expires_at, s.revoked_at, s.mfa_verified_at,
              coalesce(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM sessions_auth s LEFT JOIN user_roles ur ON ur.user_id = s.user_id
       WHERE s.refresh_hash = $1
       GROUP BY s.id`,
      [refreshHash],
    );
    return result.rows[0] ? toAuthSession(result.rows[0]) : null;
  }

  async rotateSession(
    currentRefreshHash: string,
    replacement: AuthSession,
    now: Date,
  ): Promise<RotateSessionResult> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        id: string;
        family_id: string;
        expires_at: Date;
        family_expires_at: Date;
        revoked_at: Date | null;
      }>(
        `SELECT id, family_id, expires_at, family_expires_at, revoked_at
         FROM sessions_auth WHERE refresh_hash = $1 FOR UPDATE`,
        [currentRefreshHash],
      );
      const current = result.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return 'invalid';
      }
      if (current.revoked_at) {
        await client.query(
          'UPDATE sessions_auth SET revoked_at = coalesce(revoked_at, $2), updated_at = $2 WHERE family_id = $1',
          [current.family_id, now],
        );
        await client.query('COMMIT');
        return 'reused';
      }
      if (current.expires_at <= now || current.family_expires_at <= now) {
        await client.query(
          'UPDATE sessions_auth SET revoked_at = coalesce(revoked_at, $2), updated_at = $2 WHERE family_id = $1',
          [current.family_id, now],
        );
        await client.query('COMMIT');
        return 'invalid';
      }

      await client.query(
        `INSERT INTO sessions_auth
         (id, user_id, family_id, refresh_hash, expires_at, family_expires_at, mfa_verified_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
        [
          replacement.id,
          replacement.userId,
          replacement.familyId,
          replacement.refreshHash,
          replacement.expiresAt,
          replacement.familyExpiresAt,
          replacement.mfaVerifiedAt,
          now,
        ],
      );
      await client.query(
        `UPDATE sessions_auth SET revoked_at = $2, replaced_by = $3, updated_at = $2 WHERE id = $1`,
        [current.id, now, replacement.id],
      );
      await client.query('COMMIT');
      return 'rotated';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeSessionFamily(familyId: string, now: Date): Promise<void> {
    await this.pool.query(
      'UPDATE sessions_auth SET revoked_at = coalesce(revoked_at, $2), updated_at = $2 WHERE family_id = $1',
      [familyId, now],
    );
  }

  async findUserByIdentity(identity: string): Promise<VerifiedUserIdentity | null> {
    const isEmail = identity.includes('@');
    const result = await this.pool.query<{
      id: string;
      status: UserAuthState['accountStatus'];
      age_level: AgeLevel;
      roles: string[];
      totp_enabled: boolean;
    }>(
      `SELECT u.id, u.status, u.age_level, u.totp_enabled,
              coalesce(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE ($1::boolean AND lower(u.email) = $2) OR (NOT $1::boolean AND u.phone = $2)
       GROUP BY u.id`,
      [isEmail, identity],
    );
    const row = result.rows[0];
    return row
      ? {
          id: row.id,
          roles: row.roles as Role[],
          accountStatus: row.status,
          ageLevel: row.age_level,
          totpEnabled: row.totp_enabled,
        }
      : null;
  }

  async createVerifiedUser(user: NewVerifiedUser): Promise<VerifiedUserIdentity> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (id, email, phone, handle, chat_alias)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, user.email, user.phone, user.handle, user.chatAlias],
      );
      await client.query(`INSERT INTO user_roles (id, user_id, role) VALUES ($1, $2, 'member')`, [
        user.roleId,
        user.id,
      ]);
      await client.query('COMMIT');
      return {
        id: user.id,
        roles: ['member'] as Role[],
        accountStatus: 'active' as const,
        ageLevel: 'L0' as AgeLevel,
        totpEnabled: false,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getUserAuthState(userId: string): Promise<UserAuthState | null> {
    const result = await this.pool.query<{
      roles: string[];
      status: UserAuthState['accountStatus'];
      age_level: AgeLevel;
      totp_secret_encrypted: Buffer | null;
      totp_enabled: boolean;
    }>(
      `SELECT u.status, u.age_level, u.totp_secret_encrypted, u.totp_enabled,
              coalesce(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.id = $1 GROUP BY u.id`,
      [userId],
    );
    const row = result.rows[0];
    return row
      ? {
          roles: row.roles as Role[],
          accountStatus: row.status,
          ageLevel: row.age_level,
          encryptedTotpSecret: row.totp_secret_encrypted,
          totpEnabled: row.totp_enabled,
        }
      : null;
  }

  async storeTotpSecret(userId: string, encryptedSecret: Buffer): Promise<void> {
    const result = await this.pool.query(
      'UPDATE users SET totp_secret_encrypted = $2, totp_enabled = false, totp_last_counter = NULL, updated_at = now() WHERE id = $1',
      [userId, encryptedSecret],
    );
    if (result.rowCount !== 1) throw new Error('Authentication user not found');
  }

  async enableTotp(userId: string, counter: bigint): Promise<void> {
    const result = await this.pool.query(
      `UPDATE users SET totp_enabled = true, totp_last_counter = $2, updated_at = now()
       WHERE id = $1 AND totp_secret_encrypted IS NOT NULL`,
      [userId, counter.toString()],
    );
    if (result.rowCount !== 1) throw new Error('Two-factor enrollment is unavailable');
  }

  async consumeTotpCounter(userId: string, counter: bigint): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE users SET totp_last_counter = $2, updated_at = now()
       WHERE id = $1 AND totp_enabled = true
         AND (totp_last_counter IS NULL OR totp_last_counter < $2)`,
      [userId, counter.toString()],
    );
    return result.rowCount === 1;
  }
}
