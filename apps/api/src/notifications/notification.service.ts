import { BadRequestException } from '@nestjs/common';
import { ErrorCodes, NotificationPreferencesSchema } from '@posha/shared';
import type { NotificationTarget } from './notification-provider.js';
import type {
  NotificationAttempt,
  NotificationChannel,
  NotificationPreferences,
  NotificationStore,
} from './notification-store.js';
import { NOTIFICATION_TEMPLATES, isEssentialCategory } from './notification-templates.js';
import type { NotificationTemplateKey } from './notification-templates.js';
import type { NotificationProvider } from './notification-provider.js';
import { generateUuidV7 } from '../auth/auth-crypto.js';

const CHANNELS: readonly NotificationChannel[] = ['email', 'sms', 'push'];
const ENABLED = { email: true, sms: true, push: true } as const;

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  ticket_confirmation: { ...ENABLED },
  room_starting: { ...ENABLED },
  request_update: { ...ENABLED },
  payout_status: { ...ENABLED },
  safety_notice: { ...ENABLED },
  legal_notice: { ...ENABLED },
};

const TARGET_FOR_CHANNEL: Record<NotificationChannel, keyof NotificationTarget> = {
  email: 'email',
  sms: 'phone',
  push: 'pushToken',
};

export class NotificationsService {
  private readonly providers: ReadonlyMap<NotificationChannel, NotificationProvider>;

  constructor(
    private readonly store: NotificationStore,
    providers: readonly NotificationProvider[],
    private readonly now: () => Date = () => new Date(),
    private readonly makeId: (date: Date) => string = generateUuidV7,
  ) {
    this.providers = new Map(providers.map((provider) => [provider.channel, provider]));
  }

  async getPreferences(userId: string): Promise<NotificationPreferences> {
    return structuredClone(
      (await this.store.getPreferences(userId)) ?? DEFAULT_NOTIFICATION_PREFERENCES,
    );
  }

  async updatePreferences(userId: string, input: unknown): Promise<NotificationPreferences> {
    const parsed = NotificationPreferencesSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({ code: ErrorCodes.VALIDATION_ERROR });
    await this.store.savePreferences(userId, parsed.data);
    return parsed.data;
  }

  async deliver(userId: string, key: NotificationTemplateKey, target: NotificationTarget) {
    const template = NOTIFICATION_TEMPLATES[key];
    const preferences = await this.getPreferences(userId);
    const essential = isEssentialCategory(template.category);
    const outcomes: NotificationAttempt[] = [];

    for (const channel of CHANNELS) {
      if (!essential && !preferences[template.category][channel]) continue;
      const destination = target[TARGET_FOR_CHANNEL[channel]];
      if (!destination) {
        outcomes.push(
          this.attempt(
            userId,
            template.category,
            key,
            channel,
            'suppressed',
            null,
            'destination_unavailable',
          ),
        );
        continue;
      }
      const provider = this.providers.get(channel);
      if (!provider) {
        outcomes.push(
          this.attempt(
            userId,
            template.category,
            key,
            channel,
            'failed',
            null,
            'provider_not_configured',
          ),
        );
        continue;
      }
      try {
        const result = await provider.deliver(destination, template);
        outcomes.push(
          this.attempt(
            userId,
            template.category,
            key,
            channel,
            'sent',
            result.providerReference,
            null,
          ),
        );
      } catch {
        outcomes.push(
          this.attempt(userId, template.category, key, channel, 'failed', null, 'provider_error'),
        );
      }
    }

    await Promise.all(outcomes.map((outcome) => this.store.recordAttempt(outcome)));
    return outcomes.map(({ id, channel, status, errorCode }) => ({
      id,
      channel,
      status,
      errorCode,
    }));
  }

  private attempt(
    userId: string,
    category: NotificationAttempt['category'],
    key: string,
    channel: NotificationChannel,
    status: NotificationAttempt['status'],
    providerReference: string | null,
    errorCode: string | null,
  ): NotificationAttempt {
    const createdAt = this.now();
    return {
      id: this.makeId(createdAt),
      userId,
      category,
      templateKey: key,
      channel,
      status,
      providerReference,
      errorCode,
      createdAt,
      sentAt: status === 'sent' ? createdAt : null,
    };
  }
}
