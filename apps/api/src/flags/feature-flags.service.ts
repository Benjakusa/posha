import { Module } from '@nestjs/common';

export const COMPLIANCE_GATE_KEYS = [
  'GATE:GUEST_ACCESS',
  'GATE:AGE_PROVIDER_LIVE',
  'GATE:RANDOM_VIDEO',
  'GATE:CREATOR_MONETISATION',
  'GATE:LIVE',
  'GATE:PAYMENTS_LIVE',
  'GATE:PRIVATE_SESSIONS',
  'GATE:TIPS',
] as const;

export type ComplianceGateKey = (typeof COMPLIANCE_GATE_KEYS)[number] | `GATE:GEO_${string}`;

export interface FeatureFlagRecord {
  key: ComplianceGateKey;
  enabled: boolean;
}

export interface ComplianceGateRecord {
  key: ComplianceGateKey;
  status: 'blocked' | 'approved';
  approvedBy: string | null;
  evidenceRef: string | null;
  approvedAt: Date | null;
}

export function createDefaultFeatureFlags(): FeatureFlagRecord[] {
  return COMPLIANCE_GATE_KEYS.map((key) => ({
    key,
    enabled: false,
  }));
}

export function createDefaultComplianceGates(): ComplianceGateRecord[] {
  return COMPLIANCE_GATE_KEYS.map((key) => ({
    key,
    status: 'blocked',
    approvedBy: null,
    evidenceRef: null,
    approvedAt: null,
  }));
}

export class FeatureFlagsService {
  private readonly featureFlags: ReadonlyMap<string, FeatureFlagRecord>;
  private readonly complianceGates: ReadonlyMap<string, ComplianceGateRecord>;

  constructor(
    featureFlags: readonly FeatureFlagRecord[] = createDefaultFeatureFlags(),
    complianceGates: readonly ComplianceGateRecord[] = createDefaultComplianceGates(),
  ) {
    this.featureFlags = new Map(featureFlags.map((record) => [record.key, record]));
    this.complianceGates = new Map(complianceGates.map((record) => [record.key, record]));
  }

  isEnabled(key: ComplianceGateKey): boolean {
    const flag = this.featureFlags.get(key);
    const gate = this.complianceGates.get(key);
    if (!flag?.enabled || !gate || gate.status !== 'approved') return false;
    if (!gate.approvedBy?.trim() || !gate.evidenceRef?.trim() || !gate.approvedAt) return false;
    if (key.startsWith('GATE:GEO_') && !/^GATE:GEO_[A-Z]{2}$/.test(key)) return false;
    return true;
  }
}

@Module({
  providers: [{ provide: FeatureFlagsService, useFactory: () => new FeatureFlagsService() }],
  exports: [FeatureFlagsService],
})
export class FeatureFlagsModule {}
