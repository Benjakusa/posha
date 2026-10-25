import { Inject, Injectable } from '@nestjs/common';
import { CatalogHomeSchema } from '@posha/shared';
import type { CatalogHome } from '@posha/shared';
import { CATALOG_STORE } from './catalog.store.js';
import type { CatalogStore } from './catalog.store.js';

export interface CatalogEntitlements {
  canViewCreator(userId: string, creatorId: string): Promise<boolean>;
}

export const CATALOG_ENTITLEMENTS = Symbol('CATALOG_ENTITLEMENTS');

@Injectable()
export class CatalogService {
  constructor(
    @Inject(CATALOG_STORE) private readonly store: CatalogStore,
    @Inject(CATALOG_ENTITLEMENTS) private readonly entitlements: CatalogEntitlements,
  ) {}

  async home(userId?: string): Promise<CatalogHome> {
    const now = new Date();
    const [lives, videos] = await Promise.all([this.store.listLives(now), this.store.listVideos()]);
    const visibleVideos = await Promise.all(
      videos.map(async (video) => {
        const entitled =
          Boolean(userId) && (await this.entitlements.canViewCreator(userId!, video.creator.id));
        return {
          id: video.id,
          title: video.title,
          durationSec: video.durationSec,
          priceMinor: video.priceMinor,
          creator: video.creator,
          locked: !entitled,
          placeholderUrl: `/api/v1/catalog/media/${encodeURIComponent(video.id)}/black-placeholder`,
          ...(entitled ? { thumbnailUrl: video.mediaUrl } : {}),
        };
      }),
    );
    return CatalogHomeSchema.parse({
      lives: lives.map((live) => ({
        id: live.id,
        title: live.title,
        startsAt: live.startsAt.toISOString(),
        creator: live.creator,
      })),
      videos: visibleVideos,
    });
  }
}
