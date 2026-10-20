import { describe, expect, it } from 'vitest';
import { COMPLIANCE_GATE_KEYS, FeatureFlagsService } from '../src/flags/feature-flags.service.js';
import { validateApiConfig } from '../src/api-config.js';

describe('feature and compliance gates', () => {
  it('[P0-07] keeps every production gate off by default', () => {
    expect(validateApiConfig({ NODE_ENV: 'production' }).NODE_ENV).toBe('production');
    const flags = new FeatureFlagsService();

    expect(
      Object.fromEntries(COMPLIANCE_GATE_KEYS.map((key) => [key, flags.isEnabled(key)])),
    ).toEqual(Object.fromEntries(COMPLIANCE_GATE_KEYS.map((key) => [key, false])));
    expect(flags.isEnabled('GATE:GEO_KE')).toBe(false);
  });

  it('[P0-07] requires an enabled flag and complete approval evidence', () => {
    const flags = new FeatureFlagsService(
      [{ key: 'GATE:RANDOM_VIDEO', enabled: true }],
      [
        {
          key: 'GATE:RANDOM_VIDEO',
          status: 'approved',
          approvedBy: 'compliance-officer-1',
          evidenceRef: 'approval/evidence-123',
          approvedAt: new Date('2026-10-20T12:00:00.000Z'),
        },
      ],
    );

    expect(flags.isEnabled('GATE:RANDOM_VIDEO')).toBe(true);
    expect(flags.isEnabled('GATE:LIVE')).toBe(false);
  });

  it('[P0-07] fails closed when approval evidence is incomplete', () => {
    const flags = new FeatureFlagsService(
      [{ key: 'GATE:LIVE', enabled: true }],
      [
        {
          key: 'GATE:LIVE',
          status: 'approved',
          approvedBy: 'compliance-officer-1',
          evidenceRef: null,
          approvedAt: new Date('2026-10-20T12:00:00.000Z'),
        },
      ],
    );

    expect(flags.isEnabled('GATE:LIVE')).toBe(false);
  });
});
