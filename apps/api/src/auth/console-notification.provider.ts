import { randomUUID } from 'node:crypto';
import type { OtpDeliveryProvider } from './auth.service.js';

export class ConsoleNotificationProvider implements OtpDeliveryProvider {
  async send(identity: string, code: string): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ConsoleNotificationProvider is dev-only and fails closed in production');
    }
    console.log(`[POSHA DEV OTP] code for ${identity}: ${code}`);
    console.log(`[POSHA DEV OTP] deliveryId: ${randomUUID()}`);
  }
}
