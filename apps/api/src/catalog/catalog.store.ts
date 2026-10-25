import type { Pool } from 'pg';

export interface CatalogCreatorRecord {
  id: string;
  displayName: string;
}

export interface CatalogVideoRecord {
  id: string;
  title: string;
  durationSec: number;
  priceMinor: number;
  creator: CatalogCreatorRecord;
  mediaUrl: string;
}

export interface CatalogLiveRecord {
  id: string;
  title: string;
  startsAt: Date;
  creator: CatalogCreatorRecord;
}

export interface CatalogStore {
  listVideos(): Promise<readonly CatalogVideoRecord[]>;
  listLives(now: Date): Promise<readonly CatalogLiveRecord[]>;
}

export const CATALOG_STORE = Symbol('CATALOG_STORE');

const creators: CatalogCreatorRecord[] = [
  ['creator-01', 'Amara Njeri'],
  ['creator-02', 'David Mwangi'],
  ['creator-03', 'Wanjiku K'],
  ['creator-04', 'Musa Ali'],
  ['creator-05', 'Nia Achieng'],
  ['creator-06', 'Leo Kamau'],
  ['creator-07', 'Zuri Otieno'],
  ['creator-08', 'Sam Kiptoo'],
].map(([id, displayName]) => ({ id: id!, displayName: displayName! }));

const titles = [
  'A little Sunday reset',
  'Stories from the coast',
  'Finding a slower rhythm',
  'Coffee and conversation',
  'My Nairobi walking list',
  'A home cooked favourite',
  'Notes on making things',
  'An evening playlist',
  'A day in the garden',
  'Small joys this week',
  'A book I keep returning to',
  'Getting to know me',
];

export class MemoryCatalogStore implements CatalogStore {
  private readonly videos: CatalogVideoRecord[] = titles.map((title, index) => ({
    id: `video-${String(index + 1).padStart(2, '0')}`,
    title,
    durationSec: 180 + index * 17,
    priceMinor: (300 + (index % 4) * 100) * 100,
    creator: creators[index % creators.length]!,
    mediaUrl: `/api/v1/catalog/media/${String(index + 1).padStart(2, '0')}.webp`,
  }));

  async listVideos(): Promise<readonly CatalogVideoRecord[]> {
    return this.videos.map((video) => ({ ...video, creator: { ...video.creator } }));
  }

  async listLives(now: Date): Promise<readonly CatalogLiveRecord[]> {
    return Array.from({ length: 5 }, (_, index) => ({
      id: `live-${String(index + 1).padStart(2, '0')}`,
      title: [
        'Sunday tea & stories',
        'Ask me anything',
        'Creative hour',
        'Coast to city',
        'Soft evening sounds',
      ][index]!,
      startsAt: new Date(now.getTime() + (index + 1) * 3_600_000),
      creator: { ...creators[index]! },
    }));
  }
}

export class PostgresCatalogStore implements CatalogStore {
  constructor(private readonly pool: Pool) {}

  async listVideos(): Promise<readonly CatalogVideoRecord[]> {
    const result = await this.pool.query<{
      id: string;
      title: string;
      duration_sec: number;
      price_minor: string | number;
      creator_id: string;
      display_name: string;
      media_url: string;
    }>(`SELECT v.id, v.title, v.duration_sec, v.price_minor, c.id AS creator_id,
               c.display_name, v.media_url
        FROM catalog_videos v JOIN catalog_creators c ON c.id = v.creator_id
        WHERE v.status = 'published' ORDER BY v.published_at DESC, v.id LIMIT 24`);
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      durationSec: row.duration_sec,
      priceMinor: Number(row.price_minor),
      mediaUrl: row.media_url,
      creator: { id: row.creator_id, displayName: row.display_name },
    }));
  }

  async listLives(now: Date): Promise<readonly CatalogLiveRecord[]> {
    const result = await this.pool.query<{
      id: string;
      title: string;
      starts_at: Date;
      creator_id: string;
      display_name: string;
    }>(
      `SELECT l.id, l.title, l.starts_at, c.id AS creator_id, c.display_name
        FROM catalog_lives l JOIN catalog_creators c ON c.id = l.creator_id
        WHERE l.status = 'scheduled' AND l.starts_at > $1
        ORDER BY l.starts_at LIMIT 12`,
      [now],
    );
    return result.rows.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.starts_at,
      creator: { id: row.creator_id, displayName: row.display_name },
    }));
  }
}
