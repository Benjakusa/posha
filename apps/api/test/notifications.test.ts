import { describe, expect, it } from 'vitest';
import type {
  NotificationAttempt,
  NotificationPreferences,
  NotificationStore,
} from '../src/notifications/notification-store.js';
import {
  NotificationsService,
  DEFAULT_NOTIFICATION_PREFERENCES,
} from '../src/notifications/notification.service.js';
import { FakeNotificationProvider } from '../src/notifications/notification-provider.js';

class FakeNotificationStore implements NotificationStore {
  preferences: NotificationPreferences | null = null;
  readonly attempts: NotificationAttempt[] = [];

  async getPreferences() {
    return this.preferences;
  }

  async savePreferences(_userId: string, preferences: NotificationPreferences) {
    this.preferences = preferences;
  }

  async recordAttempt(attempt: NotificationAttempt) {
    this.attempts.push(attempt);
  }
}

describe('notifications (NOT-01)', () => {
  it('returns default preferences and validates saved preference structure', async () => {
    const store = new FakeNotificationStore();
    const notifications = new NotificationsService(store, []);
    expect(await notifications.getPreferences('user-1')).toEqual(DEFAULT_NOTIFICATION_PREFERENCES);
    await expect(notifications.updatePreferences('user-1', { email: false })).rejects.toMatchObject(
      {
        response: { code: 'VALIDATION_ERROR' },
      },
    );
    const preferences = structuredClone(DEFAULT_NOTIFICATION_PREFERENCES);
    preferences.ticket_confirmation.email = false;
    await notifications.updatePreferences('user-1', preferences);
    expect(store.preferences?.ticket_confirmation.email).toBe(false);
  });

  it('dispatches an allowed template only through channels selected by the user', async () => {
    const store = new FakeNotificationStore();
    store.preferences = structuredClone(DEFAULT_NOTIFICATION_PREFERENCES);
    store.preferences.ticket_confirmation.email = false;
    store.preferences.ticket_confirmation.push = false;
    const email = new FakeNotificationProvider('email');
    const sms = new FakeNotificationProvider('sms');
    const push = new FakeNotificationProvider('push');
    const notifications = new NotificationsService(store, [email, sms, push]);
    const result = await notifications.deliver('user-1', 'ticket.confirmed', {
      email: 'adult@example.test',
      phone: '+254700000000',
      pushToken: 'push-token',
    });
    expect(result.map(({ channel, status }) => [channel, status])).toEqual([['sms', 'sent']]);
    expect(email.deliveries).toHaveLength(0);
    expect(push.deliveries).toHaveLength(0);
    expect(sms.deliveries[0]?.template.body).not.toContain('adult@example.test');
    expect(store.attempts[0]?.providerReference).toBe('fake-1');
  });

  it('delivers safety and legal notices even when the user disabled those categories', async () => {
    const store = new FakeNotificationStore();
    store.preferences = structuredClone(DEFAULT_NOTIFICATION_PREFERENCES);
    store.preferences.safety_notice.email = false;
    store.preferences.safety_notice.sms = false;
    store.preferences.safety_notice.push = false;
    const email = new FakeNotificationProvider('email');
    const notifications = new NotificationsService(store, [email]);
    const result = await notifications.deliver('user-1', 'safety.notice', {
      email: 'adult@example.test',
      phone: null,
      pushToken: null,
    });
    expect(result.map(({ channel, status }) => [channel, status])).toEqual([
      ['email', 'sent'],
      ['sms', 'suppressed'],
      ['push', 'suppressed'],
    ]);
    expect(email.deliveries).toHaveLength(1);
  });

  it('records provider errors with a stable code and no provider error detail', async () => {
    const store = new FakeNotificationStore();
    const broken = new FakeNotificationProvider('email', true);
    const notifications = new NotificationsService(store, [broken]);
    const result = await notifications.deliver('user-1', 'payout.status_changed', {
      email: 'adult@example.test',
      phone: null,
      pushToken: null,
    });
    expect(result[0]).toMatchObject({
      channel: 'email',
      status: 'failed',
      errorCode: 'provider_error',
    });
    expect(store.attempts[0]?.errorCode).toBe('provider_error');
    expect(JSON.stringify(store.attempts)).not.toContain('fake_provider_failure');
  });
});
