export const ErrorCodes = {
  AGE_LEVEL_REQUIRED: 'AGE_LEVEL_REQUIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  GATE_DISABLED: 'GATE_DISABLED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
