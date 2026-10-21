import type { Pool } from 'pg';
import { ErrorCodes } from '@posha/shared';
import { generateUuidV7 } from '../auth/auth-crypto.js';
import { FeatureFlagsService } from '../flags/feature-flags.service.js';
import { ConnectRealtimeError } from './connect-realtime.port.js';
import type { ConnectRealtimePort } from './connect-realtime.port.js';
import type { ConnectSessionStore } from './connect-session.store.js';

export type ConnectVideoModerationCategory = 'minor_safety' | 'explicit' | 'violence' | 'other';

export interface ConnectVideoFrameVerdict {
  category: ConnectVideoModerationCategory | null;
  confidence: number;
  classifierVersion: string;
}

export interface ConnectVideoFrameClassifier {
  classifyFrame(frame: Buffer): Promise<ConnectVideoFrameVerdict>;
}

export interface ConnectVideoModerationStore {
  flagAccount(input: {
    sessionId: string;
    userId: string;
    category: ConnectVideoModerationCategory;
    confidence: number;
    classifierVersion: string;
    createdAt: Date;
  }): Promise<void>;
}

export const CONNECT_VIDEO_FRAME_CLASSIFIER = Symbol('CONNECT_VIDEO_FRAME_CLASSIFIER');
export const CONNECT_VIDEO_MODERATION_STORE = Symbol('CONNECT_VIDEO_MODERATION_STORE');
export const CONNECT_VIDEO_MODERATION_SERVICE = Symbol('CONNECT_VIDEO_MODERATION_SERVICE');

export class UnavailableConnectVideoFrameClassifier implements ConnectVideoFrameClassifier {
  async classifyFrame(_frame: Buffer): Promise<ConnectVideoFrameVerdict> {
    void _frame;
    throw new Error('VIDEO_FRAME_CLASSIFIER_UNAVAILABLE');
  }
}

/** Deterministic classifier for tests; the marker is neutral and contains no media. */
export class FakeConnectVideoFrameClassifier implements ConnectVideoFrameClassifier {
  async classifyFrame(frame: Buffer): Promise<ConnectVideoFrameVerdict> {
    if (frame.includes(Buffer.from('__FLAG_HIGH__')))
      return { category: 'explicit', confidence: 0.99, classifierVersion: 'fake-v1' };
    if (frame.includes(Buffer.from('__FLAG_LOW__')))
      return { category: 'explicit', confidence: 0.6, classifierVersion: 'fake-v1' };
    return { category: null, confidence: 0, classifierVersion: 'fake-v1' };
  }
}

export class PostgresConnectVideoModerationStore implements ConnectVideoModerationStore {
  constructor(private readonly pool: Pool) {}

  async flagAccount(
    input: Parameters<ConnectVideoModerationStore['flagAccount']>[0],
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO connect_video_moderation_flags
         (id, session_id, flagged_user_id, category, confidence, classifier_version, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT (session_id, flagged_user_id) DO UPDATE
         SET confidence = GREATEST(connect_video_moderation_flags.confidence, EXCLUDED.confidence),
             updated_at = EXCLUDED.updated_at
         WHERE connect_video_moderation_flags.status = 'open'`,
      [
        generateUuidV7(input.createdAt),
        input.sessionId,
        input.userId,
        input.category,
        input.confidence,
        input.classifierVersion,
        input.createdAt,
      ],
    );
  }
}

export class MemoryConnectVideoModerationStore implements ConnectVideoModerationStore {
  readonly flags: Parameters<ConnectVideoModerationStore['flagAccount']>[0][] = [];

  async flagAccount(
    input: Parameters<ConnectVideoModerationStore['flagAccount']>[0],
  ): Promise<void> {
    const existing = this.flags.find(
      (flag) => flag.sessionId === input.sessionId && flag.userId === input.userId,
    );
    if (existing) {
      if (input.confidence > existing.confidence) existing.confidence = input.confidence;
      return;
    }
    this.flags.push({ ...input });
  }
}

export class ConnectVideoModerationService {
  private readonly highConfidenceThreshold = 0.9;
  private readonly maxFrameBytes = 4_800;

  constructor(
    private readonly sessions: ConnectSessionStore,
    private readonly classifier: ConnectVideoFrameClassifier,
    private readonly moderation: ConnectVideoModerationStore,
    private readonly connect: ConnectRealtimePort,
    private readonly featureFlags: FeatureFlagsService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async inspectFrame(userId: string, sessionId: string, encodedFrame: string) {
    if (!this.featureFlags.isEnabled('GATE:RANDOM_VIDEO'))
      throw new ConnectRealtimeError(ErrorCodes.GATE_DISABLED);
    const session = await this.sessions.findById(sessionId);
    if (
      !session ||
      session.mode !== 'video' ||
      session.endedAt !== null ||
      (session.userA !== userId && session.userB !== userId)
    )
      throw new ConnectRealtimeError(ErrorCodes.SESSION_NOT_FOUND);
    if (!(await this.sessions.hasMutualVideoConsent(sessionId)))
      throw new ConnectRealtimeError(ErrorCodes.GATE_DISABLED);

    const frame = Buffer.from(encodedFrame, 'base64');
    if (frame.length === 0 || frame.length > this.maxFrameBytes)
      throw new ConnectRealtimeError(ErrorCodes.VALIDATION_ERROR);

    let verdict: ConnectVideoFrameVerdict;
    try {
      verdict = await this.classifier.classifyFrame(frame);
      if (
        !Number.isFinite(verdict.confidence) ||
        verdict.confidence < 0 ||
        verdict.confidence > 1 ||
        !verdict.classifierVersion.trim()
      )
        throw new Error('VIDEO_FRAME_VERDICT_INVALID');
    } catch {
      await this.connect.endSession(userId, sessionId, 'leave').catch(() => null);
      throw new ConnectRealtimeError(ErrorCodes.SERVICE_UNAVAILABLE);
    }

    if (!verdict.category || verdict.confidence < this.highConfidenceThreshold)
      return { flagged: false, ended: false };

    try {
      await this.moderation.flagAccount({
        sessionId,
        userId,
        category: verdict.category,
        confidence: verdict.confidence,
        classifierVersion: verdict.classifierVersion,
        createdAt: this.now(),
      });
    } catch {
      await this.connect.endSession(userId, sessionId, 'leave').catch(() => null);
      throw new ConnectRealtimeError(ErrorCodes.SERVICE_UNAVAILABLE);
    }

    const partnerUserId = await this.connect.endSession(userId, sessionId, 'leave');
    return { flagged: true, ended: true, partnerUserId };
  }
}
