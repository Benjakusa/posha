import type { AgeProviderResult } from './age-provider.js';

export type AgeCheckStatus = 'pending' | 'passed' | 'failed' | 'expired' | 'manual_review';

export interface AgeCheckRecord {
  id: string;
  provider: string;
  status: AgeCheckStatus;
  levelResult: 'L2' | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface AgeCheckStart {
  id: string;
  userId: string;
  provider: string;
  providerRef: string;
  createdAt: Date;
}

export interface AgeAssuranceStore {
  startCheck(check: AgeCheckStart): Promise<void>;
  applyWebhook(event: {
    provider: string;
    eventId: string;
    providerRef: string;
    result: AgeProviderResult;
    expiresAt: Date | null;
    evidenceRef: string | null;
  }): Promise<'applied' | 'duplicate' | 'unknown'>;
  getLatestCheck(userId: string, now: Date): Promise<AgeCheckRecord | null>;
}

export const AGE_ASSURANCE_STORE = Symbol('AGE_ASSURANCE_STORE');
