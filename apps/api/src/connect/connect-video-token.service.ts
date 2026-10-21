import { createHash } from 'node:crypto';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConnectSessionSchema, ErrorCodes } from '@posha/shared';
import { FeatureFlagsService } from '../flags/feature-flags.service.js';
import type { ConnectSessionStore, ConnectVideoConsentRecord } from './connect-session.store.js';
import { ConnectRealtimeError } from './connect-realtime.port.js';
import type { SfuProvider } from './connect-sfu.provider.js';

export interface VideoConsentVerifier {
  hasMutualConsent(sessionId: string): Promise<boolean>;
}

export const VIDEO_CONSENT_VERIFIER = Symbol('VIDEO_CONSENT_VERIFIER');
export const CONNECT_VIDEO_CONSENT_SERVICE = Symbol('CONNECT_VIDEO_CONSENT_SERVICE');

/** Explicit deny adapter for deployments and tests that have no consent store. */
export class DenyVideoConsentVerifier implements VideoConsentVerifier {
  async hasMutualConsent(_sessionId: string): Promise<boolean> {
    void _sessionId;
    return false;
  }
}

export class SessionVideoConsentVerifier implements VideoConsentVerifier {
  constructor(private readonly sessions: ConnectSessionStore) {}

  hasMutualConsent(sessionId: string): Promise<boolean> {
    return this.sessions.hasMutualVideoConsent(sessionId);
  }
}

export class ConnectVideoConsentService {
  constructor(
    private readonly sessions: ConnectSessionStore,
    private readonly featureFlags: FeatureFlagsService,
  ) {}

  async record(
    userId: string,
    sessionId: string,
    accepted: boolean,
  ): Promise<ConnectVideoConsentRecord> {
    if (!this.featureFlags.isEnabled('GATE:RANDOM_VIDEO'))
      throw new ConnectRealtimeError(ErrorCodes.GATE_DISABLED);
    const record = await this.sessions.recordVideoConsent(sessionId, userId, accepted);
    if (!record) throw new ConnectRealtimeError(ErrorCodes.SESSION_NOT_FOUND);
    return record;
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
