import { randomUUID } from 'node:crypto';

export const PII_REDACTION_PATHS = [
  'email',
  'phone',
  'password',
  'otp',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'details',
  'freeText',
  'mediaUrl',
  'idDocumentRef',
  'evidenceRef',
  'profile.email',
  'profile.phone',
  'user.email',
  'user.phone',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.email',
  'req.body.phone',
  'req.body.password',
  'req.body.otp',
  'req.body.details',
  'req.body.freeText',
  'req.body.mediaUrl',
];

export const PII_REDACTION = { paths: PII_REDACTION_PATHS, censor: '[REDACTED]' } as const;

export interface RequestLogShape {
  id?: string;
  method?: string;
  route?: { path?: string };
}

export function serializeRequest(request: RequestLogShape) {
  return {
    id: request.id,
    method: request.method,
    path: request.route?.path ?? 'unmatched',
  };
}

export function createPinoHttpOptions() {
  return {
    level: process.env.LOG_LEVEL ?? 'info',
    redact: PII_REDACTION,
    genReqId: () => randomUUID(),
    serializers: {
      req: serializeRequest,
      res: (response: { statusCode?: number }) => ({ statusCode: response.statusCode }),
    },
  };
}
