import type {
  NotificationPreferences,
  NotificationStore,
  NotificationAttempt,
} from './notification-store.js';

export class MemoryNotificationStore implements NotificationStore {
  private preferences = new Map<string, NotificationPreferences>();
  private attempts: NotificationAttempt[] = [];

  async getPreferences(userId: string): Promise<NotificationPreferences | null> {
    return this.preferences.get(userId) ?? null;
  }

  async savePreferences(userId: string, preferences: NotificationPreferences): Promise<void> {
    this.preferences.set(userId, { ...preferences });
  }

  async recordAttempt(attempt: NotificationAttempt): Promise<void> {
    this.attempts.push({ ...attempt });
  }
}
