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
  ErrorCodes.AGE_LEVEL_REQUIRED,
  ErrorCodes.RATE_LIMITED,
  ErrorCodes.GATE_DISABLED,
  ErrorCodes.SESSION_NOT_FOUND,
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

export const ConnectQueueJoinSchema = z
  .object({
    mode: SessionModeSchema,
    interests: z.array(z.string().min(1)),
    lang: z.string().min(1),
    countryPref: z.string().length(2).optional(),
  })
  .strict();

export const ConnectChatSendSchema = z
  .object({
    sessionId: z.string().uuid(),
    body: z.string().min(1).max(1000),
    clientMsgId: z.string().min(1),
  })
  .strict();
