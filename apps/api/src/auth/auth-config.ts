import { z } from 'zod';

const AuthEnvironmentSchema = z.object({
  AUTH_ACCESS_TOKEN_SECRET: z.string().min(32),
  AUTH_OTP_PEPPER: z.string().min(32),
  AUTH_TOTP_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
});

export interface AuthConfig {
  accessTokenSecret: Buffer;
  otpPepper: Buffer;
  totpEncryptionKey: Buffer;
  issuer: string;
  audience: string;
}

export const AUTH_CONFIG = Symbol('AUTH_CONFIG');

export function validateAuthConfig(environment: NodeJS.ProcessEnv = process.env): AuthConfig {
  const parsed = AuthEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    const keys = [...new Set(parsed.error.issues.map((issue) => issue.path.join('.')))].join(', ');
    throw new Error(`Invalid authentication configuration keys: ${keys}`);
  }
  const totpEncryptionKey = Buffer.from(parsed.data.AUTH_TOTP_ENCRYPTION_KEY, 'base64');
  if (totpEncryptionKey.length !== 32) {
    throw new Error('Invalid authentication configuration keys: AUTH_TOTP_ENCRYPTION_KEY');
  }
  return {
    accessTokenSecret: Buffer.from(parsed.data.AUTH_ACCESS_TOKEN_SECRET),
    otpPepper: Buffer.from(parsed.data.AUTH_OTP_PEPPER),
    totpEncryptionKey,
    issuer: 'posha-api',
    audience: 'posha-client',
  };
}
