import { describe, expect, it } from 'vitest';
import { BlockUserSchema, PreferencesUpdateSchema, ProfileUpdateSchema } from '../src/schemas.js';

describe('profile and privacy contracts', () => {
  it('[PRO-01] normalizes handles and accepts bounded profile fields', () => {
    expect(ProfileUpdateSchema.parse({ handle: 'New_Handle', bio: '  Hello  ' })).toEqual({
      handle: 'new_handle',
      bio: 'Hello',
    });
    expect(ProfileUpdateSchema.safeParse({ handle: 'not valid' }).success).toBe(false);
    expect(ProfileUpdateSchema.safeParse({ isAdmin: true }).success).toBe(false);
    expect(
      ProfileUpdateSchema.safeParse({ avatarMediaId: '019a4c00-0000-7000-8000-000000000002' })
        .success,
    ).toBe(false);
  });

  it('[PRO-01] accepts only explicit locale and country preference fields', () => {
    expect(PreferencesUpdateSchema.parse({ locale: 'sw-KE', country: 'KE' })).toEqual({
      locale: 'sw-KE',
      country: 'KE',
    });
    expect(PreferencesUpdateSchema.safeParse({ ageLevel: 'L3' }).success).toBe(false);
  });

  it('[PRO-02] requires a valid target user ID when creating a block', () => {
    expect(
      BlockUserSchema.safeParse({ userId: '019a4c00-0000-7000-8000-000000000001' }).success,
    ).toBe(true);
    expect(BlockUserSchema.safeParse({ userId: 'self' }).success).toBe(false);
  });
});
