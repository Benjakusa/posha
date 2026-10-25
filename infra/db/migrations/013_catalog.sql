-- Up Migration
CREATE TABLE catalog_creators (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 80),
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalog_videos (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 80),
  creator_id text NOT NULL REFERENCES catalog_creators(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  duration_sec integer NOT NULL CHECK (duration_sec BETWEEN 1 AND 86400),
  price_minor integer NOT NULL CHECK (price_minor >= 0),
  media_url text NOT NULL CHECK (media_url LIKE '/api/v1/catalog/media/%'),
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('pending', 'published', 'removed')),
  published_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_videos_published_idx ON catalog_videos (published_at DESC) WHERE status = 'published';

CREATE TABLE catalog_lives (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 80),
  creator_id text NOT NULL REFERENCES catalog_creators(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  starts_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'ended'))
);
CREATE INDEX catalog_lives_scheduled_idx ON catalog_lives (starts_at) WHERE status = 'scheduled';

INSERT INTO catalog_creators (id, display_name) VALUES
  ('creator-01', 'Amara Njeri'), ('creator-02', 'David Mwangi'),
  ('creator-03', 'Wanjiku K'), ('creator-04', 'Musa Ali'),
  ('creator-05', 'Nia Achieng'), ('creator-06', 'Leo Kamau'),
  ('creator-07', 'Zuri Otieno'), ('creator-08', 'Sam Kiptoo');

INSERT INTO catalog_videos (id, creator_id, title, duration_sec, price_minor, media_url, published_at) VALUES
  ('video-01', 'creator-01', 'A little Sunday reset', 180, 30000, '/api/v1/catalog/media/video-01.webp', now() - interval '1 day'),
  ('video-02', 'creator-02', 'Stories from the coast', 197, 40000, '/api/v1/catalog/media/video-02.webp', now() - interval '2 days'),
  ('video-03', 'creator-03', 'Finding a slower rhythm', 214, 50000, '/api/v1/catalog/media/video-03.webp', now() - interval '3 days'),
  ('video-04', 'creator-04', 'Coffee and conversation', 231, 60000, '/api/v1/catalog/media/video-04.webp', now() - interval '4 days'),
  ('video-05', 'creator-05', 'My Nairobi walking list', 248, 30000, '/api/v1/catalog/media/video-05.webp', now() - interval '5 days'),
  ('video-06', 'creator-06', 'A home cooked favourite', 265, 40000, '/api/v1/catalog/media/video-06.webp', now() - interval '6 days'),
  ('video-07', 'creator-07', 'Notes on making things', 282, 50000, '/api/v1/catalog/media/video-07.webp', now() - interval '7 days'),
  ('video-08', 'creator-08', 'An evening playlist', 299, 60000, '/api/v1/catalog/media/video-08.webp', now() - interval '8 days'),
  ('video-09', 'creator-01', 'A day in the garden', 316, 30000, '/api/v1/catalog/media/video-09.webp', now() - interval '9 days'),
  ('video-10', 'creator-02', 'Small joys this week', 333, 40000, '/api/v1/catalog/media/video-10.webp', now() - interval '10 days'),
  ('video-11', 'creator-03', 'A book I keep returning to', 350, 50000, '/api/v1/catalog/media/video-11.webp', now() - interval '11 days'),
  ('video-12', 'creator-04', 'Getting to know me', 367, 60000, '/api/v1/catalog/media/video-12.webp', now() - interval '12 days');

INSERT INTO catalog_lives (id, creator_id, title, starts_at) VALUES
  ('live-01', 'creator-01', 'Sunday tea & stories', now() + interval '1 hour'),
  ('live-02', 'creator-02', 'Ask me anything', now() + interval '2 hours'),
  ('live-03', 'creator-03', 'Creative hour', now() + interval '3 hours'),
  ('live-04', 'creator-04', 'Coast to city', now() + interval '4 hours'),
  ('live-05', 'creator-05', 'Soft evening sounds', now() + interval '5 hours');

-- Down Migration
DROP TABLE catalog_lives;
DROP TABLE catalog_videos;
DROP TABLE catalog_creators;
