import type { AgeProviderResult } from './age-provider.js';
import type { AgeAssuranceStore, AgeCheckRecord, AgeCheckStart } from './age-store.js';

interface MemoryAgeCheck extends AgeCheckRecord {
  userId: string;
  providerRef: string;
  eventIds: Set<string>;
}

export class MemoryAgeStore implements AgeAssuranceStore {
  private readonly checks: MemoryAgeCheck[] = [];

  async startCheck(check: AgeCheckStart): Promise<void> {
    this.checks.push({
      id: check.id,
      userId: check.userId,
      provider: check.provider,
      providerRef: check.providerRef,
      status: 'pending',
      levelResult: null,
      expiresAt: null,
      createdAt: check.createdAt,
      eventIds: new Set(),
    });
  }

  async applyWebhook(event: {
    provider: string;
    eventId: string;
    providerRef: string;
    result: AgeProviderResult;
    expiresAt: Date | null;
    evidenceRef: string | null;
  }): Promise<'applied' | 'duplicate' | 'unknown'> {
    const check = this.checks.find(
      (row) => row.provider === event.provider && row.providerRef === event.providerRef,
    );
    if (!check) return 'unknown';
    if (check.eventIds.has(event.eventId)) return 'duplicate';
    check.eventIds.add(event.eventId);
    check.status = event.result === 'passed' ? 'passed' : event.result;
    check.levelResult = event.result === 'passed' ? 'L2' : null;
    check.expiresAt = event.expiresAt;
    return 'applied';
  }

  async getLatestCheck(userId: string, now: Date): Promise<AgeCheckRecord | null> {
    const latest = this.checks
      .filter((check) => check.userId === userId)
      .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime())[0];
    if (!latest) return null;
    const status =
      latest.status === 'passed' && latest.expiresAt && latest.expiresAt <= now
        ? 'expired'
        : latest.status;
    return {
      id: latest.id,
      provider: latest.provider,
      status,
      levelResult: status === 'passed' ? latest.levelResult : null,
      expiresAt: latest.expiresAt,
      createdAt: latest.createdAt,
    };
  }
}
