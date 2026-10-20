import { describe, expect, it } from 'vitest';
import { validateApiConfig } from '../src/api-config.js';

describe('API configuration', () => {
  it('[P0-06] applies safe defaults and parses the listen port', () => {
    expect(validateApiConfig({ PORT: '3100' })).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3100,
      LOG_LEVEL: 'info',
      OTEL_SERVICE_NAME: 'posha-api',
    });
  });

  it('[P0-06] reports invalid environment keys without echoing values', () => {
    expect(() => validateApiConfig({ PORT: 'not-a-port', DATABASE_URL: 'private-value' })).toThrow(
      'Invalid API configuration keys: PORT',
    );
  });
});
