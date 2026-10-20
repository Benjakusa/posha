import type { ProfileUpdateSchema, PreferencesUpdateSchema } from '@posha/shared';

export type ProfileUpdate = typeof ProfileUpdateSchema._output;
export type PreferencesUpdate = typeof PreferencesUpdateSchema._output;

export interface UserProfileRecord {
  id: string;
  email: string | null;
  phone: string | null;
  handle: string;
  status: 'active' | 'suspended' | 'banned' | 'deleted';
  ageLevel: 'L0' | 'L1' | 'L2' | 'L3';
  locale: string;
  country: string | null;
  displayName: string | null;
  bio: string | null;
  avatarMediaId: string | null;
  interests: string[];
  languages: string[];
  createdAt: Date;
}

export interface UserBlockRecord {
  userId: string;
  chatAlias: string;
  createdAt: Date;
}

export interface DataRequestRecord {
  id: string;
  requestType: 'export' | 'deletion';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  requestedAt: Date;
}

export interface UsersStore {
  getProfile(userId: string): Promise<UserProfileRecord | null>;
  updateProfile(userId: string, update: ProfileUpdate, now: Date): Promise<UserProfileRecord>;
  updatePreferences(userId: string, update: PreferencesUpdate): Promise<UserProfileRecord>;
  blockUser(userId: string, targetUserId: string, blockId: string, now: Date): Promise<void>;
  unblockUser(userId: string, targetUserId: string): Promise<void>;
  listBlocks(userId: string): Promise<UserBlockRecord[]>;
  areBlockedEitherWay(firstUserId: string, secondUserId: string): Promise<boolean>;
  createDataRequest(
    userId: string,
    type: 'export' | 'deletion',
    requestId: string,
    now: Date,
  ): Promise<DataRequestRecord>;
  completeExportRequest(userId: string, requestId: string, now: Date): Promise<void>;
  purgeDueDeletionRequests(now: Date, retentionMs: number): Promise<number>;
}

export const USERS_STORE = Symbol('USERS_STORE');
