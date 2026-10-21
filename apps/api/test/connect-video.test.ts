import { randomUUID } from 'node:crypto';
import { ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { jwtVerify } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultComplianceGates,
  createDefaultFeatureFlags,
  FeatureFlagsService,
} from '../src/flags/feature-flags.service.js';
import { MemoryConnectSessionStore } from '../src/connect/connect-session.store.js';
import type { ConnectSessionRecord } from '../src/connect/connect-session.store.js';
import {
  ConnectVideoConsentService,
  ConnectVideoTokenService,
  DenyVideoConsentVerifier,
  SessionVideoConsentVerifier,
} from '../src/connect/connect-video-token.service.js';
import { FakeSfuProvider, LiveKitSfuProvider } from '../src/connect/connect-sfu.provider.js';

const now = new Date('2026-10-21T12:00:00.000Z');

function enabledFlags() {
  const key = 'GATE:RANDOM_VIDEO';
  const flags = createDefaultFeatureFlags().map((flag) =>
    flag.key === key ? { ...flag, enabled: true } : flag,
  );
  const gates = createDefaultComplianceGates().map((gate) =>
    gate.key === key
      ? {
          ...gate,
          status: 'approved' as const,
          approvedBy: 'test-approver',
          evidenceRef: 'approval-01',
          approvedAt: now,
        }
      : gate,
  );
  return new FeatureFlagsService(flags, gates);
}

function sessionRecord(): ConnectSessionRecord {
  return {
    id: randomUUID(),
    userA: randomUUID(),
    userB: randomUUID(),
    mode: 'video',
    startedAt: now,
    endedAt: null,
    endReason: null,
    endedBy: null,
  };
}

describe('Connect video token service (P3-01)', () => {
  it('requires each participant to accept before video consent becomes mutual', async () => {
    const sessions = new MemoryConnectSessionStore();
    const session = sessionRecord();
    sessions.sessions.set(session.id, session);
    const consent = new ConnectVideoConsentService(sessions, enabledFlags());
    const verifier = new SessionVideoConsentVerifier(sessions);

    await expect(consent.record(session.userA, session.id, true)).resolves.toMatchObject({
      accepted: true,
      mutualAccepted: false,
      partnerUserId: session.userB,
    });
    await expect(verifier.hasMutualConsent(session.id)).resolves.toBe(false);
    await expect(consent.record(session.userB, session.id, true)).resolves.toMatchObject({
      accepted: true,
      mutualAccepted: true,
    });
    await expect(verifier.hasMutualConsent(session.id)).resolves.toBe(true);
    await consent.record(session.userA, session.id, false);
    await expect(verifier.hasMutualConsent(session.id)).resolves.toBe(false);
  });

  it('keeps video locked when RANDOM_VIDEO is OFF', async () => {
    const sessions = new MemoryConnectSessionStore();
    const session = sessionRecord();
    sessions.sessions.set(session.id, session);
    const sfu = new FakeSfuProvider();
    const service = new ConnectVideoTokenService(
      sessions,
      sfu,
      { hasMutualConsent: vi.fn().mockResolvedValue(true) },
      new FeatureFlagsService(),
      () => now,
    );

    await expect(service.issueForParticipant(session.userA, session.id)).rejects.toMatchObject({
      response: { code: 'GATE_DISABLED' },
    } satisfies Partial<ForbiddenException>);
    expect(sfu.issued).toHaveLength(0);
  });

  it('requires an active video session, membership, and mutual consent before minting', async () => {
    const sessions = new MemoryConnectSessionStore();
    const session = sessionRecord();
    sessions.sessions.set(session.id, session);
    const sfu = new FakeSfuProvider();
    const consent = new DenyVideoConsentVerifier();
    const service = new ConnectVideoTokenService(sessions, sfu, consent, enabledFlags(), () => now);

    await expect(service.issueForParticipant(randomUUID(), session.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.issueForParticipant(session.userA, session.id)).rejects.toMatchObject({
      response: { code: 'GATE_DISABLED' },
    });
    expect(sfu.issued).toHaveLength(0);
  });

  it('issues a short-lived fake token only after consent, using an opaque participant identity', async () => {
    const sessions = new MemoryConnectSessionStore();
    const session = sessionRecord();
    sessions.sessions.set(session.id, session);
    const sfu = new FakeSfuProvider();
    const service = new ConnectVideoTokenService(
      sessions,
      sfu,
      { hasMutualConsent: vi.fn().mockResolvedValue(true) },
      enabledFlags(),
      () => now,
    );

    const result = await service.issueForParticipant(session.userA, session.id);
    expect(result).toMatchObject({
      url: 'ws://fake-sfu.invalid',
      expiresAt: '2026-10-21T12:01:00.000Z',
    });
    expect(sfu.issued[0]).toMatchObject({
      roomName: `connect-${session.id}`,
      ttlSeconds: 60,
      now,
    });
    expect(sfu.issued[0]?.participantIdentity).not.toContain(session.userA);
    expect(result.token).not.toContain(session.userA);
  });

  it('signs a LiveKit participant token with room-scoped publish/subscribe grants', async () => {
    const provider = new LiveKitSfuProvider('test-api-key', 's'.repeat(40), 'wss://sfu.test');
    const issued = await provider.issueParticipantToken({
      roomName: 'connect-room-01',
      participantIdentity: 'opaque-participant-01',
      ttlSeconds: 120,
      now,
    });
    const { payload, protectedHeader } = await jwtVerify(
      issued.token,
      new TextEncoder().encode('s'.repeat(40)),
      { currentDate: now },
    );
    expect(protectedHeader.alg).toBe('HS256');
    expect(payload).toMatchObject({
      iss: 'test-api-key',
      sub: 'opaque-participant-01',
      video: {
        room: 'connect-room-01',
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
      },
    });
    expect(payload.exp! - payload.iat!).toBe(120);
    expect(issued.serverUrl).toBe('wss://sfu.test');
  });

  it('fails closed when LiveKit is absent or configured with a weak secret', async () => {
    const request = {
      roomName: 'room',
      participantIdentity: 'opaque-id',
      ttlSeconds: 120,
      now,
    };
    await expect(new LiveKitSfuProvider().issueParticipantToken(request)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(
      new LiveKitSfuProvider('devkey', 'secret', 'ws://localhost:7880').issueParticipantToken(
        request,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
