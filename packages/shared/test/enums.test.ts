import { describe, expect, it } from 'vitest';
import {
  AccountStatuses,
  AgeCheckStatuses,
  AgeLevels,
  ContentAccessLevels,
  KycStatuses,
  MediaStatuses,
  PaymentStatuses,
  PayoutStatuses,
  ReportStatuses,
  RequestStatuses,
  Roles,
  RoomStatuses,
  RoomTypes,
  SessionEndReasons,
  SessionModes,
  TicketStatuses,
} from '../src/enums.js';
import {
  ConnectChatSendSchema,
  ConnectQueueJoinSchema,
  ConnectVideoFrameSchema,
  ErrorCodeSchema,
  ProblemDetailsSchema,
} from '../src/schemas.js';

describe('shared API and data contracts', () => {
  it('[P0-03] exposes all enums from the data model', () => {
    expect(AgeLevels).toEqual(['L0', 'L1', 'L2', 'L3']);
    expect(AccountStatuses).toEqual(['active', 'suspended', 'banned', 'deleted']);
    expect(Roles).toEqual([
      'member',
      'subscriber',
      'creator',
      'moderator',
      'finance_admin',
      'support_agent',
      'compliance_officer',
      'super_admin',
    ]);
    expect(AgeCheckStatuses).toEqual(['pending', 'passed', 'failed', 'expired', 'manual_review']);
    expect(KycStatuses).toEqual(['not_started', 'pending', 'approved', 'rejected', 'needs_info']);
    expect(SessionModes).toEqual(['text', 'video']);
    expect(SessionEndReasons).toEqual(['next', 'leave', 'report', 'block', 'timeout', 'error']);
    expect(ContentAccessLevels).toEqual(['public', 'subscriber', 'ppv']);
    expect(MediaStatuses).toEqual([
      'uploaded',
      'scanning',
      'processing',
      'in_review',
      'published',
      'rejected',
      'removed',
    ]);
    expect(RoomTypes).toEqual(['ticketed', 'small_group', 'private']);
    expect(RoomStatuses).toEqual(['draft', 'scheduled', 'live', 'ended', 'cancelled']);
    expect(TicketStatuses).toEqual(['pending', 'active', 'refunded', 'revoked', 'expired']);
    expect(RequestStatuses).toEqual([
      'submitted',
      'accepted',
      'declined',
      'countered',
      'client_confirmed',
      'fulfilled',
      'cancelled',
      'refunded',
      'blocked',
    ]);
    expect(PaymentStatuses).toEqual([
      'created',
      'pending',
      'succeeded',
      'failed',
      'cancelled',
      'refunded',
      'partially_refunded',
      'disputed',
    ]);
    expect(PayoutStatuses).toEqual([
      'eligible',
      'requested',
      'approved',
      'processing',
      'paid',
      'failed',
      'reversed',
    ]);
    expect(ReportStatuses).toEqual([
      'open',
      'triaged',
      'actioned',
      'dismissed',
      'escalated',
      'appealed',
    ]);
    expect(ErrorCodeSchema.options).toEqual([
      'VALIDATION_ERROR',
      'UNAUTHORIZED',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'ACCOUNT_INACTIVE',
      'TWO_FACTOR_REQUIRED',
      'AGE_LEVEL_REQUIRED',
      'OWNERSHIP_DENIED',
      'RATE_LIMITED',
      'RATE_LIMIT_UNAVAILABLE',
      'GATE_DISABLED',
      'SESSION_NOT_FOUND',
      'SERVICE_UNAVAILABLE',
      'CONTENT_BLOCKED',
      'SAFETY_ESCALATED',
      'TEMPORARILY_MUTED',
      'HTTP_ERROR',
      'INTERNAL_SERVER_ERROR',
    ]);
  });

  it('[P0-03] validates the RFC 7807 problem shape', () => {
    expect(
      ProblemDetailsSchema.safeParse({
        type: 'https://posha.example/problems/age-level-required',
        title: 'Age level required',
        status: 403,
        code: 'AGE_LEVEL_REQUIRED',
        detail: 'Complete age assurance to continue.',
        traceId: 'trace-01',
      }).success,
    ).toBe(true);
  });

  it('[P0-03] validates Connect queue and message payload constraints', () => {
    expect(
      ConnectQueueJoinSchema.safeParse({ mode: 'text', interests: ['music'], lang: 'en' }).success,
    ).toBe(true);
    expect(
      ConnectChatSendSchema.safeParse({
        sessionId: '0190f75a-7c2a-7b9a-8dc8-e9d3228f1150',
        body: 'Hello there',
        clientMsgId: 'client-message-01',
      }).success,
    ).toBe(true);
    expect(
      ConnectChatSendSchema.safeParse({
        sessionId: '0190f75a-7c2a-7b9a-8dc8-e9d3228f1150',
        body: 'x'.repeat(1001),
        clientMsgId: 'client-message-01',
      }).success,
    ).toBe(false);
  });

  it('[P3-03] bounds sampled video frame payloads to small base64 images', () => {
    const sessionId = '0190f75a-7c2a-7b9a-8dc8-e9d3228f1150';
    expect(ConnectVideoFrameSchema.safeParse({ sessionId, frameBase64: 'aGVsbG8=' }).success).toBe(
      true,
    );
    expect(
      ConnectVideoFrameSchema.safeParse({ sessionId, frameBase64: 'not an image' }).success,
    ).toBe(false);
    expect(
      ConnectVideoFrameSchema.safeParse({ sessionId, frameBase64: 'A'.repeat(6401) }).success,
    ).toBe(false);
  });
});
