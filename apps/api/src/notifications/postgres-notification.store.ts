import type { Pool } from 'pg';
import type {
  NotificationAttempt,
  NotificationCategory,
  NotificationChannel,
  NotificationPreferences,
  NotificationStore,
} from './notification-store.js';
import { DEFAULT_NOTIFICATION_PREFERENCES } from './notification.service.js';

interface PreferenceRow {
  category: NotificationCategory;
  channel: NotificationChannel;
  enabled: boolean;
}

export class PostgresNotificationStore implements NotificationStore {
  constructor(private readonly pool: Pool) {}

  async getPreferences(userId: string): Promise<NotificationPreferences | null> {
    const result = await this.pool.query<PreferenceRow>(
      'SELECT category, channel, enabled FROM notification_prefs WHERE user_id = $1',
      [userId],
    );
    if (result.rows.length === 0) return null;
    const preferences = structuredClone(DEFAULT_NOTIFICATION_PREFERENCES);
    for (const row of result.rows) preferences[row.category][row.channel] = row.enabled;
    return preferences;
  }

  async savePreferences(userId: string, preferences: NotificationPreferences): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const [category, channels] of Object.entries(preferences)) {
        for (const [channel, enabled] of Object.entries(channels)) {
          await client.query(
            `INSERT INTO notification_prefs (user_id, category, channel, enabled)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, category, channel)
             DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
            [userId, category, channel, enabled],
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordAttempt(attempt: NotificationAttempt): Promise<void> {
    await this.pool.query(
      `INSERT INTO notifications
       (id, user_id, category, template_key, channel, status, provider_ref, error_code, created_at, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        attempt.id,
        attempt.userId,
        attempt.category,
        attempt.templateKey,
        attempt.channel,
        attempt.status,
        attempt.providerReference,
        attempt.errorCode,
        attempt.createdAt,
        attempt.sentAt,
      ],
    );
  }
}
