import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConnectSessionSchema, ErrorCodes } from '@posha/shared';
import { FeatureFlagsService } from '../flags/feature-flags.service.js';
import type { ConnectSessionStore } from './connect-session.store.js';
import type { SfuProvider } from './connect-sfu.provider.js';

export interface VideoConsentVerifier {
  hasMutualConsent(sessionId: string): Promise<boolean>;
}

export const VIDEO_CONSENT_VERIFIER = Symbol('VIDEO_CONSENT_VERIFIER');

/** Until P3-02 persists both consent choices, production wiring denies token issuance. */
export class DenyVideoConsentVerifier implements VideoConsentVerifier {
  async hasMutualConsent(_sessionId: string): Promise<boolean> {
    void _sessionId;
    return false;
  }
}

export class ConnectVideoTokenService {
  private readonly tokenTtlSeconds = 60;

  constructor(
    private readonly sessions: ConnectSessionStore,
    private readonly sfu: SfuProvider,
    private readonly consent: VideoConsentVerifier,
    private readonly featureFlags: FeatureFlagsService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async issueForParticipant(userId: string, rawSessionId: unknown) {
    const parsed = ConnectSessionSchema.safeParse({ sessionId: rawSessionId });
    if (!parsed.success) throw new BadRequestException({ code: ErrorCodes.VALIDATION_ERROR });
    if (!this.featureFlags.isEnabled('GATE:RANDOM_VIDEO'))
      throw new ForbiddenException({ code: ErrorCodes.GATE_DISABLED });
    const session = await this.sessions.findById(parsed.data.sessionId);
    if (
      !session ||
      session.mode !== 'video' ||
      session.endedAt !== null ||
      (session.userA !== userId && session.userB !== userId)
    ) {
      throw new NotFoundException({ code: ErrorCodes.NOT_FOUND });
    }
    if (!(await this.consent.hasMutualConsent(session.id)))
      throw new ForbiddenException({ code: ErrorCodes.GATE_DISABLED });

    const now = this.now();
    const roomName = `connect-${session.id}`;
    const participantIdentity = createHash('sha256')
      .update(`${session.id}:${userId}`)
      .digest('hex')
      .slice(0, 32);
    const issued = await this.sfu.issueParticipantToken({
      roomName,
      participantIdentity,
      ttlSeconds: this.tokenTtlSeconds,
      now,
    });
    return {
      url: issued.serverUrl,
      token: issued.token,
      expiresAt: issued.expiresAt.toISOString(),
    };
  }
}
