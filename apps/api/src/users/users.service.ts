import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  BlockUserSchema,
  ErrorCodes,
  PreferencesUpdateSchema,
  ProfileUpdateSchema,
} from '@posha/shared';
import { generateUuidV7 } from '../auth/auth-crypto.js';
import type { UsersStore } from './users-store.js';

const DELETION_RETENTION_MS = 30 * 24 * 60 * 60_000;

export class UsersService {
  constructor(
    private readonly store: UsersStore,
    private readonly now: () => Date = () => new Date(),
    private readonly makeId: (date: Date) => string = generateUuidV7,
  ) {}

  async me(userId: string) {
    const profile = await this.store.getProfile(userId);
    if (!profile) throw new NotFoundException({ code: ErrorCodes.NOT_FOUND });
    return profile;
  }

  async updateProfile(userId: string, input: unknown) {
    const parsed = ProfileUpdateSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({ code: ErrorCodes.VALIDATION_ERROR });
    return this.store.updateProfile(userId, parsed.data, this.now());
  }

  async updatePreferences(userId: string, input: unknown) {
    const parsed = PreferencesUpdateSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({ code: ErrorCodes.VALIDATION_ERROR });
    return this.store.updatePreferences(userId, parsed.data);
  }

  async block(userId: string, input: unknown) {
    const parsed = BlockUserSchema.safeParse(input);
    if (!parsed.success) throw new BadRequestException({ code: ErrorCodes.VALIDATION_ERROR });
    if (parsed.data.userId === userId)
      throw new BadRequestException({ code: ErrorCodes.VALIDATION_ERROR });
    await this.store.blockUser(userId, parsed.data.userId, this.makeId(this.now()), this.now());
    return { blocked: true };
  }

  async unblock(userId: string, targetUserId: string) {
    const parsed = BlockUserSchema.safeParse({ userId: targetUserId });
    if (!parsed.success || parsed.data.userId === userId) {
      throw new BadRequestException({ code: ErrorCodes.VALIDATION_ERROR });
    }
    await this.store.unblockUser(userId, parsed.data.userId);
    return { blocked: false };
  }

  listBlocks(userId: string) {
    return this.store.listBlocks(userId);
  }

  async canViewProfile(viewerId: string, targetUserId: string): Promise<boolean> {
    if (viewerId === targetUserId) return true;
    return !(await this.store.areBlockedEitherWay(viewerId, targetUserId));
  }

  async requestExport(userId: string) {
    const now = this.now();
    const request = await this.store.createDataRequest(userId, 'export', this.makeId(now), now);
    const [profile, blocks] = await Promise.all([
      this.store.getProfile(userId),
      this.store.listBlocks(userId),
    ]);
    if (!profile) throw new NotFoundException({ code: ErrorCodes.NOT_FOUND });
    await this.store.completeExportRequest(userId, request.id, this.now());
    return {
      schemaVersion: '1',
      requestId: request.id,
      generatedAt: this.now().toISOString(),
      data: { profile, blocks },
    };
  }

  requestDeletion(userId: string) {
    return this.store.createDataRequest(userId, 'deletion', this.makeId(this.now()), this.now());
  }

  purgeDueDeletionRequests() {
    return this.store.purgeDueDeletionRequests(this.now(), DELETION_RETENTION_MS);
  }
}
