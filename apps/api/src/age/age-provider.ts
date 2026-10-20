import { createHmac, timingSafeEqual } from 'node:crypto';

export type AgeProviderResult = 'passed' | 'failed' | 'manual_review';

export interface AgeProviderWebhook {
  eventId: string;
  providerRef: string;
  result: AgeProviderResult;
  expiresAt: Date | null;
  evidenceRef: string | null;
}

export interface AgeAssuranceProvider {
  readonly name: string;
  readonly mode: 'fake' | 'live';
  createSession(userId: string): Promise<{ providerRef: string; sessionUrl: string }>;
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
  parseWebhook(rawBody: Buffer): AgeProviderWebhook;
}

export const AGE_ASSURANCE_PROVIDER = Symbol('AGE_ASSURANCE_PROVIDER');

/** Deterministic local/test provider. It stores no identity documents or media. */
export class FakeAgeAssuranceProvider implements AgeAssuranceProvider {
  readonly name = 'fake';
  readonly mode = 'fake' as const;
  private sequence = 0;

  constructor(
    private readonly signingSecret: Buffer,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (signingSecret.length < 32)
      throw new Error('Age webhook secret must contain at least 32 bytes');
  }

  async createSession(userId: string): Promise<{ providerRef: string; sessionUrl: string }> {
    const providerRef = `fake-${userId}-${this.now().getTime()}-${++this.sequence}`;
    return {
      providerRef,
      sessionUrl: `https://age-check.invalid/session/${encodeURIComponent(providerRef)}`,
    };
  }

  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
    const expected = createHmac('sha256', this.signingSecret).update(rawBody).digest();
    const actual = Buffer.from(signature, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  parseWebhook(rawBody: Buffer): AgeProviderWebhook {
    const value: unknown = JSON.parse(rawBody.toString('utf8'));
    if (!value || typeof value !== 'object') throw new Error('Invalid age provider event');
    const event = value as Record<string, unknown>;
    if (
      typeof event.eventId !== 'string' ||
      event.eventId.length === 0 ||
      event.eventId.length > 256 ||
      typeof event.providerRef !== 'string' ||
      event.providerRef.length === 0 ||
      event.providerRef.length > 256 ||
      !['passed', 'failed', 'manual_review'].includes(String(event.result))
    ) {
      throw new Error('Invalid age provider event');
    }
    const expiresAt =
      event.expiresAt === null || event.expiresAt === undefined
        ? null
        : new Date(String(event.expiresAt));
    if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new Error('Invalid age expiry');
    return {
      eventId: event.eventId,
      providerRef: event.providerRef,
      result: event.result as AgeProviderResult,
      expiresAt,
      evidenceRef: typeof event.evidenceRef === 'string' ? event.evidenceRef : null,
    };
  }

  sign(rawBody: Buffer): string {
    return createHmac('sha256', this.signingSecret).update(rawBody).digest('hex');
  }
}
