import { randomUUID } from 'node:crypto';
import type {
  DataRequestRecord,
  PreferencesUpdate,
  ProfileUpdate,
  UserBlockRecord,
  UserProfileRecord,
  UsersStore,
} from './users-store.js';

export class MemoryUsersStore implements UsersStore {
  private profile = {
    id: randomUUID(),
    email: 'user@example.test',
    phone: null,
    handle: 'member_1',
    status: 'active' as const,
    ageLevel: 'L0' as const,
    locale: 'en' as const,
    country: null,
    displayName: null as string | null,
    bio: null as string | null,
    avatarMediaId: null as string | null,
    interests: [] as string[],
    languages: [] as string[],
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
  private blocks: UserBlockRecord[] = [];
  private requests: DataRequestRecord[] = [];
  private invisiblePairs = new Set<string>();

  async getProfile(userId: string): Promise<UserProfileRecord | null> {
    return userId === this.profile.id ? { ...this.profile } : null;
  }

  async updateProfile(userId: string, update: ProfileUpdate): Promise<UserProfileRecord> {
    if (userId !== this.profile.id) throw new Error('User not found');
    Object.assign(this.profile, update);
    return { ...this.profile };
  }

  async updatePreferences(userId: string, update: PreferencesUpdate): Promise<UserProfileRecord> {
    if (userId !== this.profile.id) throw new Error('User not found');
    Object.assign(this.profile, update);
    return { ...this.profile };
  }

  async blockUser(userId: string, targetUserId: string): Promise<void> {
    if (!this.blocks.some((b) => b.userId === targetUserId)) {
      this.blocks.push({ userId: targetUserId, chatAlias: 'Blocked-Alias', createdAt: new Date() });
    }
    this.invisiblePairs.add([userId, targetUserId].sort().join(':'));
  }

  async unblockUser(userId: string, targetUserId: string): Promise<void> {
    this.blocks = this.blocks.filter((b) => b.userId !== targetUserId);
    this.invisiblePairs.delete([userId, targetUserId].sort().join(':'));
  }

  async listBlocks(): Promise<UserBlockRecord[]> {
    return this.blocks.map((b) => ({ ...b }));
  }

  async areBlockedEitherWay(first: string, second: string): Promise<boolean> {
    return this.invisiblePairs.has([first, second].sort().join(':'));
  }

  async createDataRequest(
    userId: string,
    type: 'export' | 'deletion',
    requestId: string,
    now: Date,
  ): Promise<DataRequestRecord> {
    const request: DataRequestRecord = {
      id: requestId,
      requestType: type,
      status: 'pending',
      requestedAt: now,
    };
    this.requests.push(request);
    if (type === 'deletion') {
      Object.assign(this.profile, { status: 'deleted' as const, ageLevel: 'L0' as const });
    }
    return { ...request };
  }

  async completeExportRequest(_userId: string, requestId: string): Promise<void> {
    const request = this.requests.find((r) => r.id === requestId);
    if (request) request.status = 'completed';
  }

  async purgeDueDeletionRequests(now: Date, retentionMs: number): Promise<number> {
    const due = this.requests.filter(
      (r) =>
        r.requestType === 'deletion' &&
        r.status === 'pending' &&
        r.requestedAt.getTime() + retentionMs <= now.getTime(),
    );
    for (const request of due) request.status = 'completed';
    return due.length;
  }
}
