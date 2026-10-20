import type { Pool } from 'pg';
import type { AgeAssuranceStore, AgeCheckRecord, AgeCheckStart } from './age-store.js';
import type { AgeProviderResult } from './age-provider.js';

export class PostgresAgeAssuranceStore implements AgeAssuranceStore {
  constructor(private readonly pool: Pool) {}

  async startCheck(check: AgeCheckStart): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("UPDATE users SET age_level = 'L0', updated_at = now() WHERE id = $1", [
        check.userId,
      ]);
      await client.query(
        `INSERT INTO age_checks (id, user_id, provider, provider_ref, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'pending', clock_timestamp(), clock_timestamp())`,
        [check.id, check.userId, check.provider, check.providerRef],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async applyWebhook(event: {
    provider: string;
    eventId: string;
    providerRef: string;
    result: AgeProviderResult;
    expiresAt: Date | null;
    evidenceRef: string | null;
  }): Promise<'applied' | 'duplicate' | 'unknown'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const check = await client.query<{ id: string; user_id: string; status: string }>(
        `SELECT id, user_id, status FROM age_checks
         WHERE provider = $1 AND provider_ref = $2
         ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [event.provider, event.providerRef],
      );
      if (!check.rows[0]) {
        await client.query('ROLLBACK');
        return 'unknown';
      }
      const inserted = await client.query(
        `INSERT INTO age_webhook_events (provider, provider_event_id)
         VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING provider_event_id`,
        [event.provider, event.eventId],
      );
      if (inserted.rowCount === 0) {
        await client.query('COMMIT');
        return 'duplicate';
      }
      if (!['pending', 'manual_review'].includes(check.rows[0].status)) {
        await client.query('COMMIT');
        return 'applied';
      }
      const userId = check.rows[0].user_id;
      const status = event.result;
      const level = status === 'passed' ? 'L2' : 'L0';
      await client.query(
        `UPDATE age_checks SET status = $2, level_result = $3, evidence_ref = $4,
             expires_at = $5, updated_at = now() WHERE id = $1`,
        [
          check.rows[0].id,
          status,
          status === 'passed' ? level : null,
          event.evidenceRef,
          event.expiresAt,
        ],
      );
      const latest = await client.query<{ id: string }>(
        'SELECT id FROM age_checks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [userId],
      );
      if (latest.rows[0]?.id === check.rows[0].id) {
        await client.query('UPDATE users SET age_level = $2, updated_at = now() WHERE id = $1', [
          userId,
          level,
        ]);
      }
      await client.query('COMMIT');
      return 'applied';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getLatestCheck(userId: string, now: Date): Promise<AgeCheckRecord | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{
        id: string;
        provider: string;
        status: AgeCheckRecord['status'];
        level_result: 'L2' | null;
        expires_at: Date | null;
        created_at: Date;
      }>(
        `SELECT id, provider, status, level_result, expires_at, created_at
         FROM age_checks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [userId],
      );
      const row = result.rows[0];
      if (!row) {
        await client.query('COMMIT');
        return null;
      }
      let status = row.status;
      let levelResult = row.level_result;
      if (row.expires_at && row.expires_at <= now && status !== 'expired') {
        status = 'expired';
        levelResult = null;
        await client.query(
          `UPDATE age_checks SET status = 'expired', level_result = NULL, updated_at = $2 WHERE id = $1`,
          [row.id, now],
        );
        await client.query("UPDATE users SET age_level = 'L0', updated_at = $2 WHERE id = $1", [
          userId,
          now,
        ]);
      }
      await client.query('COMMIT');
      return {
        id: row.id,
        provider: row.provider,
        status,
        levelResult,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
