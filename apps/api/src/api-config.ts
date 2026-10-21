import { z } from 'zod';

export const ApiConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  OTEL_SERVICE_NAME: z.string().min(1).default('posha-api'),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().url().optional(),
  METRICS_BEARER_TOKEN: z.string().min(32).optional(),
  LIVEKIT_API_KEY: z.string().min(1).optional(),
  LIVEKIT_API_SECRET: z.string().min(1).optional(),
  LIVEKIT_URL: z
    .string()
    .regex(/^wss?:\/\//)
    .optional(),
});

export type ApiConfig = z.infer<typeof ApiConfigSchema>;
export const API_CONFIG = Symbol('API_CONFIG');

export function validateApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const result = ApiConfigSchema.safeParse(environment);
  if (!result.success) {
    const invalidKeys = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(
      ', ',
    );
    throw new Error(`Invalid API configuration keys: ${invalidKeys}`);
  }
  return result.data;
}
