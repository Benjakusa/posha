import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Pool } from 'pg';
import { ErrorCodes } from '@posha/shared';
import { generateUuidV7 } from '../auth/auth-crypto.js';
import type {
  DataRequestRecord,
  PreferencesUpdate,
  ProfileUpdate,
  UserProfileRecord,
  UsersStore,
} from './users-store.js';

interface ProfileRow {
  id: string;
  email: string | null;
  phone: string | null;
  handle: string;
  status: UserProfileRecord['status'];
  age_level: UserProfileRecord['ageLevel'];
  locale: string;
  country: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_media_id: string | null;
  interests: string[];
  languages: string[];
  created_at: Date;
}

function mapProfile(row: ProfileRow): UserProfileRecord {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    handle: row.handle,
    status: row.status,
    ageLevel: row.age_level,
    locale: row.locale,
    country: row.country,
    displayName: row.display_name,
    bio: row.bio,
    avatarMediaId: row.avatar_media_id,
    interests: row.interests,
    languages: row.languages,
    createdAt: row.created_at,
  };
}

const PROFILE_FIELDS = {
  displayName: 'display_name',
  bio: 'bio',
  interests: 'interests',
  languages: 'languages',
} as const;

export class PostgresUsersStore implements UsersStore {
  constructor(private readonly pool: Pool) {}

  async getProfile(userId: string): Promise<UserProfileRecord | null> {
    const result = await this.pool.query<ProfileRow>(
      `SELECT u.id, u.email, u.phone, u.handle, u.status, u.age_level, u.locale, u.country,
              p.display_name, p.bio, p.avatar_media_id,
              coalesce(p.interests, '{}') AS interests, coalesce(p.languages, '{}') AS languages,
              u.created_at
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = $1`,
      [userId],
    );
    return result.rows[0] ? mapProfile(result.rows[0]) : null;
  }

  async updateProfile(
    userId: string,
    update: ProfileUpdate,
    now: Date,
  ): Promise<UserProfileRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (update.handle !== undefined) {
        const current = await client.query<{
          handle: string;
          created_at: Date;
          handle_changed_at: Date | null;
        }>('SELECT handle, created_at, handle_changed_at FROM users WHERE id = $1 FOR UPDATE', [
          userId,
        ]);
        const row = current.rows[0];
        if (!row) throw new NotFoundException({ code: ErrorCodes.NOT_FOUND });
        if (row.handle !== update.handle) {
          const lastChange = row.handle_changed_at ?? row.created_at;
          if (lastChange.getTime() > now.getTime() - 30 * 24 * 60 * 60_000) {
            throw new ConflictException({ code: ErrorCodes.CONFLICT });
          }
          await client.query(
            'UPDATE users SET handle = $2, handle_changed_at = $3, updated_at = $3 WHERE id = $1',
            [userId, update.handle, now],
          );
        }
      }
      const profileId = generateUuidV7(now);
      await client.query(
        'INSERT INTO profiles (id, user_id) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
        [profileId, userId],
      );
      const entries = Object.entries(PROFILE_FIELDS).filter(([field]) => field in update);
      if (entries.length > 0) {
        const assignments = entries.map(([, column], index) => `${column} = $${index + 2}`);
        const values = entries.map(([field]) => update[field as keyof ProfileUpdate]);
        await client.query(
          `UPDATE profiles SET ${assignments.join(', ')}, updated_at = $${entries.length + 2} WHERE user_id = $1`,
          [userId, ...values, now],
        );
      }
      await client.query('COMMIT');
      const profile = await this.getProfile(userId);
      if (!profile) throw new NotFoundException({ code: ErrorCodes.NOT_FOUND });
      return profile;
    } catch (error) {
      await client.query('ROLLBACK');
      if (isUniqueViolation(error)) throw new ConflictException({ code: ErrorCodes.CONFLICT });
      throw error;
    } finally {
      client.release();
    }
  }

  async updatePreferences(userId: string, update: PreferencesUpdate): Promise<UserProfileRecord> {
    const columns: string[] = [];
    const values: unknown[] = [userId];
    if (update.locale !== undefined) {
      values.push(update.locale);
      columns.push(`locale = $${values.length}`);
    }
    if (update.country !== undefined) {
      values.push(update.country);
      columns.push(`country = $${values.length}`);
    }
    values.push(new Date());
    columns.push(`updated_at = $${values.length}`);
    const result = await this.pool.query(
      `UPDATE users SET ${columns.join(', ')} WHERE id = $1`,
      values,
    );
    if (result.rowCount === 0) throw new NotFoundException({ code: ErrorCodes.NOT_FOUND });
    const profile = await this.getProfile(userId);
    if (!profile) throw new NotFoundException({ code: ErrorCodes.NOT_FOUND });
    return profile;
  }

  async blockUser(userId: string, targetUserId: string, blockId: string, now: Date): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO blocks (id, blocker_id, blocked_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4) ON CONFLICT (blocker_id, blocked_id) DO NOTHING`,
        [blockId, userId, targetUserId, now],
      );
    } catch (error) {
      if (isForeignKeyViolation(error)) throw new NotFoundException({ code: ErrorCodes.NOT_FOUND });
      throw error;
    }
  }

  async unblockUser(userId: string, targetUserId: string): Promise<void> {
    await this.pool.query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [
      userId,
      targetUserId,
    ]);
  }

  async listBlocks(userId: string) {
    const result = await this.pool.query<{ user_id: string; chat_alias: string; created_at: Date }>(
      `SELECT u.id AS user_id, u.chat_alias, b.created_at
       FROM blocks b JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = $1 ORDER BY b.created_at DESC`,
      [userId],
    );
    return result.rows.map((row) => ({
      userId: row.user_id,
      chatAlias: row.chat_alias,
      createdAt: row.created_at,
    }));
  }

  async areBlockedEitherWay(firstUserId: string, secondUserId: string): Promise<boolean> {
    const result = await this.pool.query<{ blocked: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM blocks
         WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
       ) AS blocked`,
      [firstUserId, secondUserId],
    );
    return result.rows[0]?.blocked ?? true;
  }

  async createDataRequest(
    userId: string,
    type: 'export' | 'deletion',
    requestId: string,
    now: Date,
  ): Promise<DataRequestRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (type === 'deletion') {
        await client.query(
          `UPDATE users SET status = 'deleted', age_level = 'L0', deleted_at = $2, updated_at = $2 WHERE id = $1`,
          [userId, now],
        );
        await client.query(
          'UPDATE sessions_auth SET revoked_at = $2, updated_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
          [userId, now],
        );
      }
      const result = await client.query<DataRequestRecord>(
        `INSERT INTO data_requests (id, user_id, request_type, status, requested_at, created_at, updated_at)
         VALUES ($1, $2, $3, 'pending', $4, $4, $4)
         ON CONFLICT (user_id, request_type) WHERE user_id IS NOT NULL AND status IN ('pending', 'processing')
         DO UPDATE SET id = data_requests.id
         RETURNING id, request_type AS "requestType", status, requested_at AS "requestedAt"`,
        [requestId, userId, type, now],
      );
      await client.query('COMMIT');
      return result.rows[0]!;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async completeExportRequest(userId: string, requestId: string, now: Date): Promise<void> {
    await this.pool.query(
      `UPDATE data_requests SET status = 'completed', completed_at = $3, updated_at = $3
       WHERE id = $1 AND user_id = $2 AND request_type = 'export' AND status IN ('pending', 'processing')`,
      [requestId, userId, now],
    );
  }

  async purgeDueDeletionRequests(now: Date, retentionMs: number): Promise<number> {
    const cutoff = new Date(now.getTime() - retentionMs);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const due = await client.query<{ id: string; user_id: string }>(
        `SELECT d.id, d.user_id FROM data_requests d
         JOIN users u ON u.id = d.user_id AND u.status = 'deleted'
         WHERE d.request_type = 'deletion' AND d.status = 'pending'
           AND d.user_id IS NOT NULL AND d.requested_at <= $1
         ORDER BY d.requested_at FOR UPDATE OF d SKIP LOCKED`,
        [cutoff],
      );
      for (const request of due.rows) {
        await client.query(
          `UPDATE users SET email = NULL, phone = NULL, password_hash = NULL, country = NULL,
               handle = 'deleted_' || substr(replace(id::text, '-', ''), 1, 16),
               chat_alias = 'Deleted member', updated_at = $2 WHERE id = $1 AND status = 'deleted'`,
          [request.user_id, now],
        );
        await client.query(
          `UPDATE profiles SET display_name = NULL, bio = NULL, avatar_media_id = NULL,
               interests = '{}', languages = '{}', updated_at = $2 WHERE user_id = $1`,
          [request.user_id, now],
        );
        await client.query(
          `UPDATE data_requests SET status = 'completed', completed_at = $2, updated_at = $2
           WHERE id = $1`,
          [request.id, now],
        );
      }
      await client.query('COMMIT');
      return due.rowCount ?? 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23503';
}
