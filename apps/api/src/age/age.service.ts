import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ErrorCodes } from '@posha/shared';
import { generateUuidV7 } from '../auth/auth-crypto.js';
import type { FeatureFlagsService } from '../flags/feature-flags.service.js';
import type { AgeAssuranceProvider, AgeProviderWebhook } from './age-provider.js';
import type { AgeAssuranceStore } from './age-store.js';

export interface AgeStatusResponse {
  status: 'not_started' | 'pending' | 'passed' | 'failed' | 'expired' | 'manual_review';
  level: 'L0' | 'L2';
  appealAvailable: boolean;
  reviewPending: boolean;
  expiresAt: string | null;
}

export class AgeAssuranceService {
  constructor(
    private readonly store: AgeAssuranceStore,
    private readonly provider: AgeAssuranceProvider,
    private readonly featureFlags: FeatureFlagsService,
    private readonly environment: string,
    private readonly now: () => Date = () => new Date(),
    private readonly makeId: (date: Date) => string = generateUuidV7,
  ) {}

  async start(userId: string): Promise<{ sessionUrl: string; status: 'pending' }> {
    if (
      (this.provider.mode === 'live' && !this.featureFlags.isEnabled('GATE:AGE_PROVIDER_LIVE')) ||
      (this.provider.mode === 'fake' && this.environment === 'production')
    ) {
      throw new ForbiddenException({ code: ErrorCodes.GATE_DISABLED });
    }
    const session = await this.provider.createSession(userId);
    await this.store.startCheck({
      id: this.makeId(this.now()),
      userId,
      provider: this.provider.name,
      providerRef: session.providerRef,
      createdAt: this.now(),
    });
    return { sessionUrl: session.sessionUrl, status: 'pending' };
  }

  async status(userId: string): Promise<AgeStatusResponse> {
    const check = await this.store.getLatestCheck(userId, this.now());
    if (!check) {
      return {
        status: 'not_started',
        level: 'L0',
        appealAvailable: false,
        reviewPending: false,
        expiresAt: null,
      };
    }
    return {
      status: check.status,
      level: check.levelResult ?? 'L0',
      appealAvailable: check.status === 'failed',
      reviewPending: check.status === 'manual_review' || check.status === 'pending',
      expiresAt: check.expiresAt?.toISOString() ?? null,
    };
  }

  async handleWebhook(
    rawBody: Buffer,
    signature: string | undefined,
  ): Promise<'applied' | 'duplicate'> {
    if (!this.provider.verifyWebhook(rawBody, signature))
      throw new UnauthorizedException({ code: ErrorCodes.UNAUTHORIZED });
    let event: AgeProviderWebhook;
    try {
      event = this.provider.parseWebhook(rawBody);
    } catch {
      throw new UnauthorizedException({ code: ErrorCodes.UNAUTHORIZED });
    }
    if (event.result === 'passed' && (!event.expiresAt || event.expiresAt <= this.now())) {
      throw new UnauthorizedException({ code: ErrorCodes.UNAUTHORIZED });
    }
    const result = await this.store.applyWebhook({
      provider: this.provider.name,
      eventId: event.eventId,
      providerRef: event.providerRef,
      result: event.result,
      expiresAt: event.expiresAt,
      evidenceRef: event.evidenceRef,
    });
    return result === 'unknown' ? 'applied' : result;
  }
}
