import { describe, expect, it, vi } from 'vitest';
import { CatalogHomeSchema } from '@posha/shared';
import { CatalogService } from '../src/catalog/catalog.service.js';
import { MemoryCatalogStore } from '../src/catalog/catalog.store.js';

describe('catalogue media access (B-S4-01)', () => {
  it('returns only the black placeholder for guests and non-entitled viewers', async () => {
    const service = new CatalogService(new MemoryCatalogStore(), {
      canViewCreator: vi.fn().mockResolvedValue(false),
    });
    const home = await service.home('guest-1');
    expect(CatalogHomeSchema.safeParse(home).success).toBe(true);
    expect(home.videos).toHaveLength(12);
    expect(home.videos.every((video) => video.locked && !video.thumbnailUrl)).toBe(true);
    expect(home.videos.every((video) => video.placeholderUrl.endsWith('/black-placeholder'))).toBe(
      true,
    );
  });

  it('returns a media thumbnail only when the viewer has creator entitlement', async () => {
    const service = new CatalogService(new MemoryCatalogStore(), {
      canViewCreator: vi.fn().mockResolvedValue(true),
    });
    const home = await service.home('member-1');
    expect(
      home.videos.every(
        (video) => !video.locked && video.thumbnailUrl?.startsWith('/api/v1/catalog/media/'),
      ),
    ).toBe(true);
  });
});
