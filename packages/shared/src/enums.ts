export const AgeLevels = ['L0', 'L1', 'L2', 'L3'] as const;
export type AgeLevel = (typeof AgeLevels)[number];

export const AccountStatuses = ['active', 'suspended', 'banned', 'deleted'] as const;
export type AccountStatus = (typeof AccountStatuses)[number];

export const Roles = [
  'guest',
  'member',
  'subscriber',
  'creator',
  'moderator',
  'finance_admin',
  'support_agent',
  'compliance_officer',
  'super_admin',
] as const;
export type Role = (typeof Roles)[number];

export const AgeCheckStatuses = [
  'pending',
  'passed',
  'failed',
  'expired',
  'manual_review',
] as const;
export type AgeCheckStatus = (typeof AgeCheckStatuses)[number];

export const KycStatuses = [
  'not_started',
  'pending',
  'approved',
  'rejected',
  'needs_info',
] as const;
export type KycStatus = (typeof KycStatuses)[number];

export const SessionModes = ['text', 'video'] as const;
export type SessionMode = (typeof SessionModes)[number];

export const SessionEndReasons = ['next', 'leave', 'report', 'block', 'timeout', 'error'] as const;
export type SessionEndReason = (typeof SessionEndReasons)[number];

export const ContentAccessLevels = ['public', 'subscriber', 'ppv'] as const;
export type ContentAccess = (typeof ContentAccessLevels)[number];

export const MediaStatuses = [
  'uploaded',
  'scanning',
  'processing',
  'in_review',
  'published',
  'rejected',
  'removed',
] as const;
export type MediaStatus = (typeof MediaStatuses)[number];

export const RoomTypes = ['ticketed', 'small_group', 'private'] as const;
export type RoomType = (typeof RoomTypes)[number];

export const RoomStatuses = ['draft', 'scheduled', 'live', 'ended', 'cancelled'] as const;
export type RoomStatus = (typeof RoomStatuses)[number];

export const TicketStatuses = ['pending', 'active', 'refunded', 'revoked', 'expired'] as const;
export type TicketStatus = (typeof TicketStatuses)[number];

export const RequestStatuses = [
  'submitted',
  'accepted',
  'declined',
  'countered',
  'client_confirmed',
  'fulfilled',
  'cancelled',
  'refunded',
  'blocked',
] as const;
export type RequestStatus = (typeof RequestStatuses)[number];

export const PaymentStatuses = [
  'created',
  'pending',
  'succeeded',
  'failed',
  'cancelled',
  'refunded',
  'partially_refunded',
  'disputed',
] as const;
export type PaymentStatus = (typeof PaymentStatuses)[number];

export const PayoutStatuses = [
  'eligible',
  'requested',
  'approved',
  'processing',
  'paid',
  'failed',
  'reversed',
] as const;
export type PayoutStatus = (typeof PayoutStatuses)[number];

export const ReportStatuses = [
  'open',
  'triaged',
  'actioned',
  'dismissed',
  'escalated',
  'appealed',
] as const;
export type ReportStatus = (typeof ReportStatuses)[number];
