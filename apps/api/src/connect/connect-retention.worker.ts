import { Logger } from '@nestjs/common';
import type { ConnectMessageStore } from './connect-message.service.js';

export class ConnectRetentionWorker {
  private readonly logger = new Logger(ConnectRetentionWorker.name);
  constructor(
    private readonly messages: ConnectMessageStore,
    private readonly now: () => Date = () => new Date(),
    private readonly intervalMs = 60 * 60 * 1000,
  ) {}
  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.messages.deleteExpired(this.now(), 1_000);
      } catch {
        this.logger.error('Connect message retention pass failed');
      }
      if (signal.aborted) return;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(done, this.intervalMs);
        function done() {
          clearTimeout(timer);
          signal.removeEventListener('abort', done);
          resolve();
        }
        signal.addEventListener('abort', done, { once: true });
      });
    }
  }
}
