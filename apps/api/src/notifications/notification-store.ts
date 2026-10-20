import type {
  NotificationChannelSchema,
  NotificationCategorySchema,
  NotificationPreferencesSchema,
} from '@posha/shared';

export type NotificationCategory = typeof NotificationCategorySchema._type;
export type NotificationChannel = typeof NotificationChannelSchema._type;
export type NotificationPreferences = typeof NotificationPreferencesSchema._type;
export type NotificationDeliveryStatus = 'sent' | 'failed' | 'suppressed';

export interface NotificationAttempt {
  id: string;
  userId: string;
  category: NotificationCategory;
  templateKey: string;
  channel: NotificationChannel;
  status: NotificationDeliveryStatus;
  providerReference: string | null;
  errorCode: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

export interface NotificationStore {
  getPreferences(userId: string): Promise<NotificationPreferences | null>;
  savePreferences(userId: string, preferences: NotificationPreferences): Promise<void>;
  recordAttempt(attempt: NotificationAttempt): Promise<void>;
}

export const NOTIFICATION_STORE = Symbol('NOTIFICATION_STORE');
