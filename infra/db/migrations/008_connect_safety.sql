-- Up Migration
CREATE TABLE connect_sessions (
  id uuid PRIMARY KEY,
  mode text NOT NULL CHECK (mode IN ('text', 'video')),
  user_a uuid NOT NULL REFERENCES users(id),
  user_b uuid NOT NULL REFERENCES users(id),
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  end_reason text CHECK (end_reason IN ('next', 'leave', 'report', 'block', 'timeout', 'error')),
  ended_by uuid REFERENCES users(id),
  flags jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_a <> user_b),
  CHECK (jsonb_typeof(flags) = 'object'),
  CHECK ((ended_at IS NULL) = (end_reason IS NULL)),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (ended_by IS NULL OR ended_at IS NOT NULL)
);
CREATE INDEX connect_sessions_user_a_started_idx ON connect_sessions (user_a, started_at DESC);
CREATE INDEX connect_sessions_user_b_started_idx ON connect_sessions (user_b, started_at DESC);
CREATE INDEX connect_sessions_active_started_idx ON connect_sessions (started_at)
  WHERE ended_at IS NULL;

CREATE TABLE connect_messages (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES connect_sessions(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  body_ciphertext bytea NOT NULL CHECK (octet_length(body_ciphertext) BETWEEN 1 AND 8192),
  created_at timestamptz NOT NULL DEFAULT now(),
  moderation_flag boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX connect_messages_session_created_idx ON connect_messages (session_id, created_at);
CREATE INDEX connect_messages_expiry_idx ON connect_messages (expires_at);

CREATE TABLE reports (
  id uuid PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES users(id),
  target_type text NOT NULL CHECK (target_type IN ('user', 'session', 'message', 'media', 'room')),
  target_id uuid NOT NULL,
  session_id uuid REFERENCES connect_sessions(id),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z][a-z0-9_]{1,63}$'),
  details_ciphertext bytea,
  snapshot_ciphertext bytea,
  snapshot_consent boolean NOT NULL DEFAULT false,
  evidence_ref text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'triaged', 'actioned', 'dismissed', 'escalated', 'appealed')),
  assigned_to uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CHECK ((snapshot_ciphertext IS NULL) OR snapshot_consent),
  CHECK ((target_type = 'session') = (session_id IS NOT NULL))
);
CREATE INDEX reports_status_created_idx ON reports (status, created_at);
CREATE INDEX reports_assignee_status_idx ON reports (assigned_to, status) WHERE assigned_to IS NOT NULL;
CREATE INDEX reports_target_idx ON reports (target_type, target_id, created_at DESC);

CREATE TABLE moderation_actions (
  id uuid PRIMARY KEY,
  report_id uuid REFERENCES reports(id),
  target_user_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK (action IN ('warn', 'mute', 'suspend', 'ban', 'remove_content')),
  reason_ciphertext bytea NOT NULL CHECK (octet_length(reason_ciphertext) BETWEEN 1 AND 4096),
  by_staff_id uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_actions_target_created_idx ON moderation_actions (target_user_id, created_at DESC);
CREATE INDEX moderation_actions_report_idx ON moderation_actions (report_id) WHERE report_id IS NOT NULL;

-- Down Migration
DROP TABLE moderation_actions;
DROP TABLE reports;
DROP TABLE connect_messages;
DROP TABLE connect_sessions;
