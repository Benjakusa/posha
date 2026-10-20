import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateUuidV7 } from '../src/auth/auth-crypto.js';
import { PostgresAuthStore } from '../src/auth/postgres-auth.store.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseSuite = describe.skipIf(!databaseUrl);

databaseSuite('PostgreSQL authentication store', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const store = new PostgresAuthStore(pool);
  let userId = '';
  let identityHash = Buffer.alloc(32);

  beforeAll(async () => {
    const now = new Date();
    userId = generateUuidV7(now);
    identityHash = Buffer.from(userId.replaceAll('-', '').padEnd(64, '0').slice(0, 64), 'hex');
    await store.createVerifiedUser({
      id: userId,
      roleId: generateUuidV7(now),
      email: `${userId}@example.test`,
      phone: null,
      handle: `test_${userId.slice(-8)}`,
      chatAlias: `Test-${userId.slice(-6)}`,
    });
    const createdUser = await pool.query<{ age_level: string }>(
      'SELECT age_level FROM users WHERE id = $1',
      [userId],
    );
    expect(createdUser.rows[0]?.age_level).toBe('L0');
  });

  afterAll(async () => {
    if (userId) await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.query('DELETE FROM auth_challenges WHERE identity_hash = $1', [identityHash]);
    await pool.end();
  });

  it('[AUTH-01] atomically verifies and consumes an OTP challenge', async () => {
    const now = new Date();
    const otpHash = Buffer.alloc(32, 4);
    expect(
      await store.beginOtpChallenge(
        {
          id: generateUuidV7(now),
          identityHash,
          otpHash,
          expiresAt: new Date(now.getTime() + 600_000),
        },
        now,
      ),
    ).toBe('created');
    expect(await store.verifyOtpChallenge(identityHash, otpHash, now, 5, 900_000)).toBe('verified');
    expect(await store.verifyOtpChallenge(identityHash, otpHash, now, 5, 900_000)).toBe('invalid');
  });

  it('[AUTH-02] rotates refresh rows and revokes their family when the old token is reused', async () => {
    const now = new Date();
    const familyId = generateUuidV7(now);
    const current = {
      id: generateUuidV7(now),
      userId,
      familyId,
      refreshHash: `old-${userId}`,
      roles: ['member'] as const,
      expiresAt: new Date(now.getTime() + 86_400_000),
      familyExpiresAt: new Date(now.getTime() + 86_400_000),
      revokedAt: null,
      mfaVerifiedAt: null,
    };
    await store.createSession(current);
    const replacement = {
      ...current,
      id: generateUuidV7(new Date(now.getTime() + 1)),
      refreshHash: `new-${userId}`,
    };

    expect(await store.rotateSession(current.refreshHash, replacement, now)).toBe('rotated');
    expect(await store.rotateSession(current.refreshHash, replacement, now)).toBe('reused');
    expect(
      (await store.findSessionByRefreshHash(replacement.refreshHash))?.revokedAt,
    ).not.toBeNull();
  });

  it('[AUTH-03] stores encrypted TOTP state and atomically rejects a replayed counter', async () => {
    await store.storeTotpSecret(userId, Buffer.from('encrypted-secret-envelope'));
    await store.enableTotp(userId, 10n);
    expect(await store.consumeTotpCounter(userId, 11n)).toBe(true);
    expect(await store.consumeTotpCounter(userId, 11n)).toBe(false);
    expect((await store.getUserAuthState(userId))?.totpEnabled).toBe(true);
  });
});
