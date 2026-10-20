import { afterEach, describe, expect, it } from 'vitest';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type {
  DataRequestRecord,
  PreferencesUpdate,
  ProfileUpdate,
  UserBlockRecord,
  UserProfileRecord,
  UsersStore,
} from '../src/users/users-store.js';
import { UsersService } from '../src/users/users.service.js';
import { UsersController } from '../src/users/users.controller.js';
import { AccountStatusGuard, AuthGuard } from '../src/policies/policy.guards.js';

class MemoryUsersStore implements UsersStore {
  profile: UserProfileRecord = {
    id: 'user-1',
    email: 'user@example.test',
    phone: null,
    handle: 'member_1',
    status: 'active',
    ageLevel: 'L0',
    locale: 'en',
    country: null,
    displayName: null,
    bio: null,
    avatarMediaId: null,
    interests: [],
    languages: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  blocks: UserBlockRecord[] = [];
  requests: DataRequestRecord[] = [];
  invisiblePairs = new Set<string>();

  async getProfile(userId: string) {
    return userId === this.profile.id ? this.profile : null;
  }

  async updateProfile(_userId: string, update: ProfileUpdate) {
    this.profile = { ...this.profile, ...update };
    return this.profile;
  }

  async updatePreferences(_userId: string, update: PreferencesUpdate) {
    this.profile = { ...this.profile, ...update };
    return this.profile;
  }

  async blockUser(userId: string, targetUserId: string) {
    if (!this.blocks.some((block) => block.userId === targetUserId)) {
      this.blocks.push({ userId: targetUserId, chatAlias: 'Blocked-Alias', createdAt: new Date() });
    }
    this.invisiblePairs.add([userId, targetUserId].sort().join(':'));
  }

  async unblockUser(userId: string, targetUserId: string) {
    this.blocks = this.blocks.filter((block) => block.userId !== targetUserId);
    this.invisiblePairs.delete([userId, targetUserId].sort().join(':'));
  }

  async listBlocks() {
    return this.blocks;
  }

  async areBlockedEitherWay(first: string, second: string) {
    return this.invisiblePairs.has([first, second].sort().join(':'));
  }

  async createDataRequest(
    userId: string,
    type: 'export' | 'deletion',
    requestId: string,
    now: Date,
  ) {
    const request: DataRequestRecord = {
      id: requestId,
      requestType: type,
      status: 'pending',
      requestedAt: now,
    };
    this.requests.push(request);
    if (type === 'deletion') this.profile = { ...this.profile, status: 'deleted', ageLevel: 'L0' };
    return request;
  }

  async completeExportRequest(_userId: string, requestId: string) {
    const request = this.requests.find((item) => item.id === requestId);
    if (request) request.status = 'completed';
  }

  async purgeDueDeletionRequests() {
    const due = this.requests.filter(
      (item) => item.requestType === 'deletion' && item.status === 'pending',
    );
    for (const request of due) request.status = 'completed';
    return due.length;
  }
}

const store = new MemoryUsersStore();
let nextId = 0;
const service = new UsersService(
  store,
  () => new Date('2026-10-20T12:00:00.000Z'),
  () => `request-${++nextId}`,
);

afterEach(() => {
  store.profile = {
    id: 'user-1',
    email: 'user@example.test',
    phone: null,
    handle: 'member_1',
    status: 'active',
    ageLevel: 'L0',
    locale: 'en',
    country: null,
    displayName: null,
    bio: null,
    avatarMediaId: null,
    interests: [],
    languages: [],
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  store.blocks = [];
  store.requests = [];
  store.invisiblePairs.clear();
  nextId = 0;
});

describe('user profile and privacy workflows', () => {
  it('[PRO-01] requires authentication and an active account on every self-service route', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, UsersController)).toEqual([
      AuthGuard,
      AccountStatusGuard,
    ]);
  });

  it('[PRO-01] updates the current user profile and rejects mass-assigned fields', async () => {
    await expect(
      service.updateProfile('user-1', { handle: 'New_Handle', interests: ['music'] }),
    ).resolves.toMatchObject({
      handle: 'new_handle',
      interests: ['music'],
    });
    await expect(service.updateProfile('user-1', { ageLevel: 'L3' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('[PRO-02] blocks are idempotent and invisible in both directions', async () => {
    const targetId = '019a4c00-0000-7000-8000-000000000002';
    await service.block('user-1', { userId: targetId });
    await service.block('user-1', { userId: targetId });
    expect(await service.canViewProfile('user-1', targetId)).toBe(false);
    expect(await service.canViewProfile(targetId, 'user-1')).toBe(false);
    expect(await service.unblock('user-1', targetId)).toEqual({ blocked: false });
    expect(await service.canViewProfile('user-1', targetId)).toBe(true);
  });

  it('[PRO-03] deletion queues PII purge work and disables the account level', async () => {
    const request = await service.requestDeletion('user-1');
    expect(request).toMatchObject({ requestType: 'deletion', status: 'pending' });
    expect(store.profile).toMatchObject({ status: 'deleted', ageLevel: 'L0' });
    const purgeWorker = new UsersService(
      store,
      () => new Date('2026-11-20T12:00:00.000Z'),
      () => 'purge-id',
    );
    expect(await purgeWorker.purgeDueDeletionRequests()).toBe(1);
    expect(store.requests[0]?.status).toBe('completed');
  });

  it('[PRO-04] returns a machine-readable export and completes its data request', async () => {
    const archive = await service.requestExport('user-1');
    expect(archive).toMatchObject({
      schemaVersion: '1',
      requestId: 'request-1',
      data: { profile: { id: 'user-1', email: 'user@example.test' }, blocks: [] },
    });
    expect(store.requests[0]?.status).toBe('completed');
  });
});
