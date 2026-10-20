import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateUuidV7 } from '../src/auth/auth-crypto.js';
import { PostgresAuthStore } from '../src/auth/postgres-auth.store.js';
import { PostgresAgeAssuranceStore } from '../src/age/postgres-age.store.js';
import { PostgresUsersStore } from '../src/users/postgres-users.store.js';

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

  it('[AGE-04] re-gates expired age checks before policy guards read account state', async () => {
    const now = new Date();
    const checkId = generateUuidV7(now);
    await pool.query(
      `INSERT INTO age_checks (id, user_id, provider, status, level_result, expires_at)
       VALUES ($1, $2, 'test', 'passed', 'L2', $3)`,
      [checkId, userId, new Date(now.getTime() - 1_000)],
    );
    await pool.query("UPDATE users SET age_level = 'L2' WHERE id = $1", [userId]);

    expect((await store.getUserAuthState(userId))?.ageLevel).toBe('L0');
  });

  it('[AGE-03] applies provider events once and prevents stale checks from restoring L2', async () => {
    const ageStore = new PostgresAgeAssuranceStore(pool);
    const now = new Date();
    const firstId = generateUuidV7(now);
    const firstRef = `provider-${firstId}`;
    await ageStore.startCheck({
      id: firstId,
      userId,
      provider: 'test',
      providerRef: firstRef,
      createdAt: now,
    });
    const firstResult = {
      provider: 'test',
      eventId: `event-${firstId}`,
      providerRef: firstRef,
      result: 'passed' as const,
      expiresAt: new Date(now.getTime() + 60_000),
      evidenceRef: null,
    };
    expect(await ageStore.applyWebhook(firstResult)).toBe('applied');
    expect(await ageStore.applyWebhook(firstResult)).toBe('duplicate');
    expect((await store.getUserAuthState(userId))?.ageLevel).toBe('L2');

    const secondNow = new Date(now.getTime() + 10);
    const secondId = generateUuidV7(secondNow);
    await ageStore.startCheck({
      id: secondId,
      userId,
      provider: 'test',
      providerRef: `provider-${secondId}`,
      createdAt: secondNow,
    });
    expect((await store.getUserAuthState(userId))?.ageLevel).toBe('L0');
    expect(await ageStore.applyWebhook({ ...firstResult, eventId: `late-${firstId}` })).toBe(
      'applied',
    );
    expect((await store.getUserAuthState(userId))?.ageLevel).toBe('L0');
  });

  it('[PRO-01] updates profile fields and enforces the 30-day handle cooldown', async () => {
    const users = new PostgresUsersStore(pool);
    await pool.query("UPDATE users SET created_at = now() - interval '31 days' WHERE id = $1", [
      userId,
    ]);
    const handle = `changed_${userId.slice(-6)}`;
    const profile = await users.updateProfile(
      userId,
      { handle, displayName: 'Member', interests: ['music'], languages: ['en'] },
      new Date(),
    );
    expect(profile).toMatchObject({ handle, displayName: 'Member', interests: ['music'] });
    await expect(
      users.updateProfile(userId, { handle: `again_${userId.slice(-6)}` }, new Date()),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('[PRO-02] applies block visibility symmetrically and supports unblock', async () => {
    const users = new PostgresUsersStore(pool);
    const now = new Date();
    const targetId = generateUuidV7(now);
    await store.createVerifiedUser({
      id: targetId,
      roleId: generateUuidV7(now),
      email: `${targetId}@example.test`,
      phone: null,
      handle: `target_${targetId.slice(-8)}`,
      chatAlias: `Target-${targetId.slice(-6)}`,
    });
    try {
      await users.blockUser(userId, targetId, generateUuidV7(now), now);
      expect(await users.areBlockedEitherWay(userId, targetId)).toBe(true);
      expect(await users.listBlocks(userId)).toHaveLength(1);
      await users.unblockUser(userId, targetId);
      expect(await users.areBlockedEitherWay(userId, targetId)).toBe(false);
    } finally {
      await pool.query('DELETE FROM users WHERE id = $1', [targetId]);
    }
  });

  it('[PRO-04] completes an export request in the data request ledger', async () => {
    const users = new PostgresUsersStore(pool);
    const now = new Date();
    const request = await users.createDataRequest(userId, 'export', generateUuidV7(now), now);
    expect(request.status).toBe('pending');
    await users.completeExportRequest(userId, request.id, now);
    const row = await pool.query<{ status: string; completed_at: Date | null }>(
      'SELECT status, completed_at FROM data_requests WHERE id = $1',
      [request.id],
    );
    expect(row.rows[0]).toMatchObject({ status: 'completed' });
    expect(row.rows[0]?.completed_at).toBeInstanceOf(Date);
  });

  it('[PRO-03] soft-deletes the user, re-gates age, and revokes sessions', async () => {
    const now = new Date();
    await pool.query("UPDATE users SET age_level = 'L2' WHERE id = $1", [userId]);
    const session = {
      id: generateUuidV7(now),
      userId,
      familyId: generateUuidV7(now),
      refreshHash: `delete-${userId}`,
      roles: ['member'] as const,
      expiresAt: new Date(now.getTime() + 86_400_000),
      familyExpiresAt: new Date(now.getTime() + 86_400_000),
      revokedAt: null,
      mfaVerifiedAt: null,
    };
    await store.createSession(session);
    const users = new PostgresUsersStore(pool);
    const request = await users.createDataRequest(userId, 'deletion', generateUuidV7(now), now);
    const purged = await users.purgeDueDeletionRequests(
      new Date(now.getTime() + 31 * 24 * 60 * 60_000),
      30 * 24 * 60 * 60_000,
    );
    const result = await pool.query<{
      status: string;
      age_level: string;
      deleted_at: Date | null;
      email: string | null;
      handle: string;
    }>('SELECT status, age_level, deleted_at, email, handle FROM users WHERE id = $1', [userId]);
    const savedSession = await pool.query<{ revoked_at: Date | null }>(
      'SELECT revoked_at FROM sessions_auth WHERE id = $1',
      [session.id],
    );
    expect(request.requestType).toBe('deletion');
    expect(purged).toBe(1);
    expect(result.rows[0]).toMatchObject({ status: 'deleted', age_level: 'L0', email: null });
    expect(result.rows[0]?.handle).toMatch(/^deleted_/);
    expect(result.rows[0]?.deleted_at).toBeInstanceOf(Date);
    expect(savedSession.rows[0]?.revoked_at).toBeInstanceOf(Date);
    const requestStatus = await pool.query<{ status: string }>(
      'SELECT status FROM data_requests WHERE id = $1',
      [request.id],
    );
    expect(requestStatus.rows[0]?.status).toBe('completed');
  });
});
