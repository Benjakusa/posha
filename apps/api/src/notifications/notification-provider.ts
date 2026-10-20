import type { NotificationChannel } from './notification-store.js';
import type { NotificationTemplate } from './notification-templates.js';

export interface NotificationTarget {
  email: string | null;
  phone: string | null;
  pushToken: string | null;
}

export interface NotificationProvider {
  readonly channel: NotificationChannel;
  deliver(
    target: string,
    template: NotificationTemplate,
  ): Promise<{ providerReference: string | null }>;
}

export class FakeNotificationProvider implements NotificationProvider {
  readonly deliveries: { target: string; template: NotificationTemplate }[] = [];

  constructor(
    readonly channel: NotificationChannel,
    private readonly fail = false,
  ) {}

  async deliver(
    target: string,
    template: NotificationTemplate,
  ): Promise<{ providerReference: string }> {
    if (this.fail) throw new Error('fake_provider_failure');
    this.deliveries.push({ target, template });
    return { providerReference: `fake-${this.deliveries.length}` };
  }
}

export class DisabledNotificationProvider implements NotificationProvider {
  constructor(readonly channel: NotificationChannel) {}

  async deliver(target: string, template: NotificationTemplate): Promise<never> {
    void target;
    void template;
    throw new Error(`${this.channel}_provider_not_configured`);
  }
}
