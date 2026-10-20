import { readFile } from 'node:fs/promises';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgeController } from '../src/age/age.controller.js';
import { FeatureFlagsService } from '../src/flags/feature-flags.service.js';
import { FakeAgeAssuranceProvider } from '../src/age/age-provider.js';
import type { AgeAssuranceStore, AgeCheckRecord, AgeCheckStart } from '../src/age/age-store.js';
import type { AgeProviderResult } from '../src/age/age-provider.js';
import { AgeAssuranceService } from '../src/age/age.service.js';
import { AccountStatusGuard, AuthGuard, RateLimitGuard } from '../src/policies/policy.guards.js';

class MemoryAgeStore implements AgeAssuranceStore {
  checks: Array<AgeCheckRecord & { userId: string; providerRef: string }> = [];
  events = new Set<string>();
  level = new Map<string, 'L0' | 'L2'>();

  async startCheck(check: AgeCheckStart): Promise<void> {
    this.level.set(check.userId, 'L0');
    this.checks.unshift({
      id: check.id,
      userId: check.userId,
      provider: check.provider,
      providerRef: check.providerRef,
      status: 'pending',
      levelResult: null,
      expiresAt: null,
      createdAt: check.createdAt,
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
    const check = this.checks.find((row) => row.providerRef === event.providerRef);
    if (!check) return 'unknown';
    const key = `${event.provider}:${event.eventId}`;
    if (this.events.has(key)) return 'duplicate';
    this.events.add(key);
    if (check.status !== 'pending' && check.status !== 'manual_review') return 'applied';
    check.status = event.result;
    check.levelResult = event.result === 'passed' ? 'L2' : null;
    check.expiresAt = event.expiresAt;
    const latest = this.checks.find((row) => row.userId === check.userId);
    if (latest?.id === check.id) this.level.set(check.userId, check.levelResult ?? 'L0');
    return 'applied';
  }

  async getLatestCheck(userId: string, now: Date): Promise<AgeCheckRecord | null> {
    const check = this.checks.find((row) => row.userId === userId);
    if (!check) return null;
    if (check.expiresAt && check.expiresAt <= now && check.status !== 'expired') {
      check.status = 'expired';
      check.levelResult = null;
      this.level.set(userId, 'L0');
    }
    return check;
  }
}

const secret = Buffer.alloc(32, 7);
let currentTime = new Date('2026-10-20T12:00:00.000Z');
const provider = new FakeAgeAssuranceProvider(secret, () => currentTime);
const store = new MemoryAgeStore();
let idCounter = 0;
const service = new AgeAssuranceService(
  store,
  provider,
  new FeatureFlagsService(),
  'test',
  () => currentTime,
  () => `age-${++idCounter}`,
);

afterEach(() => {
  store.checks = [];
  store.events.clear();
  store.level.clear();
  currentTime = new Date('2026-10-20T12:00:00.000Z');
  idCounter = 0;
  vi.restoreAllMocks();
});

async function sendEvent(
  result: AgeProviderResult,
  overrides: { eventId?: string; providerRef?: string; expiresAt?: string | null } = {},
) {
  const userRef = store.checks[0]?.providerRef ?? 'unknown';
  const rawBody = Buffer.from(
    JSON.stringify({
      eventId: overrides.eventId ?? 'event-1',
      providerRef: overrides.providerRef ?? userRef,
      result,
      expiresAt:
        overrides.expiresAt === undefined ? '2027-10-20T12:00:00.000Z' : overrides.expiresAt,
      evidenceRef: 'provider-held://neutral-reference',
    }),
  );
  return service.handleWebhook(rawBody, provider.sign(rawBody));
}

describe('age assurance', () => {
  it('[AGE-01] protects age start and status routes with identity and account guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AgeController.prototype.start)).toEqual([
      AuthGuard,
      AccountStatusGuard,
      RateLimitGuard,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, AgeController.prototype.status)).toEqual([
      AuthGuard,
      AccountStatusGuard,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, AgeController.prototype.webhook)).toBeUndefined();
  });

  it('[AGE-01] starts new checks at L0 and does not persist identity documents', async () => {
    expect(await service.status('user-1')).toMatchObject({ status: 'not_started', level: 'L0' });
    expect(await service.start('user-1')).toMatchObject({ status: 'pending' });
    expect(store.level.get('user-1')).toBe('L0');
    expect((await service.status('user-1')).status).toBe('pending');
  });

  it('[AGE-02] maps passed to L2, failed to an appeal path, and manual review to pending status', async () => {
    await service.start('user-1');
    await sendEvent('passed');
    expect(await service.status('user-1')).toMatchObject({
      status: 'passed',
      level: 'L2',
      appealAvailable: false,
    });

    await service.start('user-2');
    await sendEvent('failed', { eventId: 'event-2' });
    expect(await service.status('user-2')).toMatchObject({
      status: 'failed',
      level: 'L0',
      appealAvailable: true,
    });

    await service.start('user-3');
    await sendEvent('manual_review', { eventId: 'event-3' });
    expect(await service.status('user-3')).toMatchObject({
      status: 'manual_review',
      level: 'L0',
      reviewPending: true,
    });
  });

  it('[AGE-03] verifies provider signatures and makes webhook replays idempotent', async () => {
    await service.start('user-1');
    const body = Buffer.from(
      JSON.stringify({
        eventId: 'event-1',
        providerRef: store.checks[0]?.providerRef,
        result: 'passed',
        expiresAt: '2027-10-20T12:00:00Z',
      }),
    );
    await expect(service.handleWebhook(body, '00'.repeat(32))).rejects.toMatchObject({
      status: 401,
    });
    expect(store.level.get('user-1')).toBe('L0');
    const noExpiry = Buffer.from(
      JSON.stringify({
        eventId: 'no-expiry',
        providerRef: store.checks[0]?.providerRef,
        result: 'passed',
        expiresAt: null,
      }),
    );
    await expect(service.handleWebhook(noExpiry, provider.sign(noExpiry))).rejects.toMatchObject({
      status: 401,
    });
    expect(store.level.get('user-1')).toBe('L0');
    expect(await service.handleWebhook(body, provider.sign(body))).toBe('applied');
    expect(await service.handleWebhook(body, provider.sign(body))).toBe('duplicate');
  });

  it('[AGE-04] expires age status and re-verification immediately re-gates the account', async () => {
    await service.start('user-1');
    await sendEvent('passed');
    expect(store.level.get('user-1')).toBe('L2');
    await service.start('user-1');
    expect(store.level.get('user-1')).toBe('L0');
    await sendEvent('passed', { eventId: 'event-2' });
    currentTime = new Date('2027-10-20T12:00:01.000Z');
    expect(await service.status('user-1')).toMatchObject({ status: 'expired', level: 'L0' });
    expect(store.level.get('user-1')).toBe('L0');
  });

  it('[AGE-04] ignores a late result from an older check after re-verification starts', async () => {
    await service.start('user-1');
    const olderRef = store.checks[0]!.providerRef;
    await service.start('user-1');
    await sendEvent('passed', { eventId: 'older-result', providerRef: olderRef });
    expect(store.level.get('user-1')).toBe('L0');
    expect((await service.status('user-1')).status).toBe('pending');
  });

  it('[AGE-05] stores provider references only and has no identity-document image columns', async () => {
    const [identityMigration, ageMigration] = await Promise.all([
      readFile(
        new URL('../../../infra/db/migrations/002_identity_and_core.sql', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../../../infra/db/migrations/004_age_assurance.sql', import.meta.url),
        'utf8',
      ),
    ]);
    const schema = `${identityMigration}\n${ageMigration}`;
    expect(schema).not.toMatch(/(image|document|photo|selfie)_?(url|data|bytes|blob)/i);
    expect(schema).toContain('evidence_ref');
  });

  it('[AGE-02] keeps live-provider verification unavailable without approval and rejects fake provider in production', async () => {
    const productionFake = new AgeAssuranceService(
      store,
      provider,
      new FeatureFlagsService(),
      'production',
    );
    await expect(productionFake.start('user-1')).rejects.toMatchObject({ status: 403 });
    const liveProvider = { ...provider, mode: 'live' as const };
    const live = new AgeAssuranceService(
      store,
      liveProvider,
      new FeatureFlagsService(),
      'production',
    );
    await expect(live.start('user-1')).rejects.toMatchObject({ status: 403 });
  });
});
