import { z } from 'zod';
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
} from './enums.js';
import { ErrorCodes } from './errors.js';

export const AgeLevelSchema = z.enum(AgeLevels);
export const AccountStatusSchema = z.enum(AccountStatuses);
export const RoleSchema = z.enum(Roles);
export const AgeCheckStatusSchema = z.enum(AgeCheckStatuses);
export const KycStatusSchema = z.enum(KycStatuses);
export const SessionModeSchema = z.enum(SessionModes);
export const SessionEndReasonSchema = z.enum(SessionEndReasons);
export const ContentAccessSchema = z.enum(ContentAccessLevels);
export const MediaStatusSchema = z.enum(MediaStatuses);
export const RoomTypeSchema = z.enum(RoomTypes);
export const RoomStatusSchema = z.enum(RoomStatuses);
export const TicketStatusSchema = z.enum(TicketStatuses);
export const RequestStatusSchema = z.enum(RequestStatuses);
export const PaymentStatusSchema = z.enum(PaymentStatuses);
export const PayoutStatusSchema = z.enum(PayoutStatuses);
export const ReportStatusSchema = z.enum(ReportStatuses);

export const ErrorCodeSchema = z.enum([
  ErrorCodes.VALIDATION_ERROR,
  ErrorCodes.UNAUTHORIZED,
  ErrorCodes.FORBIDDEN,
  ErrorCodes.NOT_FOUND,
  ErrorCodes.CONFLICT,
  ErrorCodes.ACCOUNT_INACTIVE,
  ErrorCodes.TWO_FACTOR_REQUIRED,
  ErrorCodes.AGE_LEVEL_REQUIRED,
  ErrorCodes.OWNERSHIP_DENIED,
  ErrorCodes.RATE_LIMITED,
  ErrorCodes.RATE_LIMIT_UNAVAILABLE,
  ErrorCodes.GATE_DISABLED,
  ErrorCodes.SESSION_NOT_FOUND,
  ErrorCodes.SERVICE_UNAVAILABLE,
  ErrorCodes.HTTP_ERROR,
  ErrorCodes.INTERNAL_SERVER_ERROR,
]);

export const ProblemDetailsSchema = z
  .object({
    type: z.string().url(),
    title: z.string().min(1),
    status: z.number().int().min(100).max(599),
    code: z.string().min(1),
    detail: z.string().optional(),
    traceId: z.string().min(1),
  })
  .strict();

export const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
export const MoneyMinorSchema = z.bigint();
export const MoneyMinorDtoSchema = z.number().int().safe().nonnegative();

export const HandleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/);
export const ProfileUpdateSchema = z
  .object({
    handle: HandleSchema.optional(),
    displayName: z.string().trim().max(80).nullable().optional(),
    bio: z.string().trim().max(500).nullable().optional(),
    interests: z.array(z.string().trim().min(1).max(32)).max(30).optional(),
    languages: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
      )
      .max(12)
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one profile field is required');

export const PreferencesUpdateSchema = z
  .object({
    locale: z
      .string()
      .regex(/^[a-z]{2}(?:-[A-Z]{2})?$/)
      .optional(),
    country: z
      .string()
      .length(2)
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one preference is required');

export const NotificationCategorySchema = z.enum([
  'ticket_confirmation',
  'room_starting',
  'request_update',
  'payout_status',
  'safety_notice',
  'legal_notice',
]);
export const NotificationChannelSchema = z.enum(['email', 'sms', 'push']);
export const NotificationPreferencesSchema = z
  .object({
    ticket_confirmation: z
      .object({ email: z.boolean(), sms: z.boolean(), push: z.boolean() })
      .strict(),
    room_starting: z.object({ email: z.boolean(), sms: z.boolean(), push: z.boolean() }).strict(),
    request_update: z.object({ email: z.boolean(), sms: z.boolean(), push: z.boolean() }).strict(),
    payout_status: z.object({ email: z.boolean(), sms: z.boolean(), push: z.boolean() }).strict(),
    safety_notice: z.object({ email: z.boolean(), sms: z.boolean(), push: z.boolean() }).strict(),
    legal_notice: z.object({ email: z.boolean(), sms: z.boolean(), push: z.boolean() }).strict(),
  })
  .strict();

export const ConnectQueueJoinSchema = z
  .object({
    mode: z.enum(['text', 'video']),
    interests: z.array(z.string().trim().min(1).max(32)).max(20),
    lang: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
    countryPref: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
  })
  .strict();
export const ConnectQueueLeaveSchema = z.object({}).strict();
export const ConnectHeartbeatSchema = z.object({}).strict();
export const ConnectChatSendSchema = z
  .object({
    sessionId: z.string().uuid(),
    body: z.string().trim().min(1).max(1000),
    clientMsgId: z.string().min(1).max(80),
  })
  .strict();
export const ConnectChatTypingSchema = z.object({ sessionId: z.string().uuid() }).strict();
export const ConnectSessionSchema = z.object({ sessionId: z.string().uuid() }).strict();

export const BlockUserSchema = z.object({ userId: z.string().uuid() }).strict();
