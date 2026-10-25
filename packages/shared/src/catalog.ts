// packages/shared/src/catalog.ts
import { z } from 'zod';

export const CatalogCreatorSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(80),
  avatarUrl: z.string().startsWith('/').optional(),
  bannerUrl: z.string().startsWith('/').optional(),
});

export const CatalogLiveSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  startsAt: z.string().datetime(),
  creator: CatalogCreatorSchema,
  coverUrl: z.string().startsWith('/').optional(),
});

export const CatalogVideoSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120),
  durationSec: z.number().int().positive(),
  locked: z.boolean(),
  priceMinor: z.number().int().nonnegative(),
  creator: CatalogCreatorSchema,
  thumbnailUrl: z.string().startsWith('/').optional(),
  placeholderUrl: z.string().startsWith('/'),
});

export const CatalogHomeSchema = z.object({
  heroUrl: z.string().startsWith('/').optional(),
  lives: z.array(CatalogLiveSchema),
  videos: z.array(CatalogVideoSchema),
});

export type CatalogHome = z.infer<typeof CatalogHomeSchema>;
