-- Up Migration
CREATE TABLE connect_video_moderation_flags (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES connect_sessions(id),
  flagged_user_id uuid NOT NULL REFERENCES users(id),
  category text NOT NULL CHECK (category IN ('minor_safety', 'explicit', 'violence', 'other')),
  confidence double precision NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  classifier_version text NOT NULL CHECK (length(classifier_version) BETWEEN 1 AND 80),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, flagged_user_id)
);
CREATE INDEX connect_video_moderation_flags_status_created_idx
  ON connect_video_moderation_flags (status, created_at);
CREATE INDEX connect_video_moderation_flags_user_created_idx
  ON connect_video_moderation_flags (flagged_user_id, created_at DESC);

-- Down Migration
DROP TABLE connect_video_moderation_flags;
