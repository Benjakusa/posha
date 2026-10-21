import { Logger } from '@nestjs/common';
import { ConnectMatchmaker } from './connect-matchmaker.js';

export class ConnectMatcherWorker {
  private readonly logger = new Logger(ConnectMatcherWorker.name);

  constructor(
    private readonly matchmaker: ConnectMatchmaker,
    private readonly onError?: (error: unknown) => void,
    private readonly intervalMs = 250,
  ) {}

  async run(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        await this.matchmaker.tick();
      } catch (error) {
        if (this.onError) this.onError(error);
        else this.logger.error('Connect matcher tick failed');
      }
      await this.wait(signal);
    }
  }

  private async wait(signal: AbortSignal): Promise<void> {
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
