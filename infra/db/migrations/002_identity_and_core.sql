-- Up Migration
ALTER TABLE compliance_gates ADD COLUMN id uuid;
UPDATE compliance_gates
SET id = (
  lpad(to_hex(floor(extract(epoch FROM created_at) * 1000)::bigint), 12, '0') || '-7' ||
  substr(md5(key), 1, 3) || '-8' || substr(md5(key), 5, 3) || '-' || substr(md5(key), 9, 12)
)::uuid;
ALTER TABLE compliance_gates ALTER COLUMN id SET NOT NULL;
ALTER TABLE compliance_gates DROP CONSTRAINT compliance_gates_pkey;
ALTER TABLE compliance_gates ADD CONSTRAINT compliance_gates_pkey PRIMARY KEY (id);
ALTER TABLE compliance_gates ADD CONSTRAINT compliance_gates_key_key UNIQUE (key);

CREATE TYPE age_level AS ENUM ('L0', 'L1', 'L2', 'L3');
CREATE TYPE account_status AS ENUM ('active', 'suspended', 'banned', 'deleted');
CREATE TYPE posha_role AS ENUM (
  'member', 'subscriber', 'creator', 'moderator', 'finance_admin',
  'support_agent', 'compliance_officer', 'super_admin'
);
CREATE TYPE age_check_status AS ENUM ('pending', 'passed', 'failed', 'expired', 'manual_review');

CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text,
  phone text,
  password_hash text,
  status account_status NOT NULL DEFAULT 'active',
  age_level age_level NOT NULL DEFAULT 'L0',
  handle text NOT NULL UNIQUE CHECK (handle = lower(handle)),
  chat_alias text NOT NULL,
  locale text NOT NULL DEFAULT 'en',
  country char(2),
  last_seen_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_phone_unique ON users (phone) WHERE phone IS NOT NULL;

CREATE TABLE user_roles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role posha_role NOT NULL,
  granted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE INDEX user_roles_role_user_idx ON user_roles (role, user_id);

CREATE TABLE sessions_auth (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_hash text NOT NULL UNIQUE,
  device text,
  ip_hash bytea,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX sessions_auth_user_active_idx ON sessions_auth (user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE age_checks (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_ref text,
  level_result age_level,
  status age_check_status NOT NULL DEFAULT 'pending',
  evidence_ref text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX age_checks_user_created_idx ON age_checks (user_id, created_at DESC);

CREATE TABLE profiles (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name text,
  bio text,
  avatar_media_id uuid,
  interests text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE blocks (
  id uuid PRIMARY KEY,
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);
CREATE INDEX blocks_blocked_id_idx ON blocks (blocked_id);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_role posha_role,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  reason text,
  ip_hash bytea,
  prev_hash bytea REFERENCES audit_log(hash),
  hash bytea NOT NULL UNIQUE CHECK (octet_length(hash) = 32),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reason IS NOT NULL OR action NOT LIKE 'sensitive.%')
);
CREATE INDEX audit_log_actor_created_idx ON audit_log (actor_id, created_at DESC);
CREATE INDEX audit_log_prev_hash_idx ON audit_log (prev_hash);
CREATE UNIQUE INDEX audit_log_single_successor_idx ON audit_log (prev_hash) WHERE prev_hash IS NOT NULL;
CREATE UNIQUE INDEX audit_log_single_genesis_idx ON audit_log ((prev_hash IS NULL))
  WHERE prev_hash IS NULL;

CREATE FUNCTION reject_audit_log_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;
CREATE TRIGGER audit_log_no_update_or_delete
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();
CREATE TRIGGER audit_log_no_truncate
  BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_log_mutation();

CREATE TABLE feature_flags (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  rollout jsonb NOT NULL DEFAULT '{}',
  gate_note text,
  changed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO feature_flags (id, key, enabled, gate_note)
VALUES
  ('019a4c00-0000-7000-8000-000000000011', 'GATE:AGE_PROVIDER_LIVE', false, 'Blocked pending recorded compliance approval'),
  ('019a4c00-0000-7000-8000-000000000012', 'GATE:RANDOM_VIDEO', false, 'Blocked pending recorded compliance approval'),
  ('019a4c00-0000-7000-8000-000000000013', 'GATE:CREATOR_MONETISATION', false, 'Blocked pending recorded compliance approval'),
  ('019a4c00-0000-7000-8000-000000000014', 'GATE:LIVE', false, 'Blocked pending recorded compliance approval'),
  ('019a4c00-0000-7000-8000-000000000015', 'GATE:PAYMENTS_LIVE', false, 'Blocked pending recorded compliance approval'),
  ('019a4c00-0000-7000-8000-000000000016', 'GATE:PRIVATE_SESSIONS', false, 'Blocked pending recorded compliance approval'),
  ('019a4c00-0000-7000-8000-000000000017', 'GATE:TIPS', false, 'Blocked pending recorded compliance approval');

CREATE TABLE outbox_events (
  id uuid PRIMARY KEY,
  aggregate text NOT NULL,
  aggregate_id uuid,
  type text NOT NULL,
  payload jsonb NOT NULL,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX outbox_events_unpublished_idx ON outbox_events (created_at)
  WHERE published_at IS NULL;

-- Down Migration
DROP INDEX outbox_events_unpublished_idx;
DROP TABLE outbox_events;
DROP TABLE feature_flags;
DROP TRIGGER audit_log_no_truncate ON audit_log;
DROP TRIGGER audit_log_no_update_or_delete ON audit_log;
DROP FUNCTION reject_audit_log_mutation();
DROP INDEX audit_log_single_genesis_idx;
DROP INDEX audit_log_single_successor_idx;
DROP TABLE audit_log;
DROP INDEX blocks_blocked_id_idx;
DROP TABLE blocks;
DROP TABLE profiles;
DROP INDEX age_checks_user_created_idx;
DROP TABLE age_checks;
DROP INDEX sessions_auth_user_active_idx;
DROP TABLE sessions_auth;
DROP INDEX user_roles_role_user_idx;
DROP TABLE user_roles;
DROP INDEX users_phone_unique;
DROP INDEX users_email_lower_unique;
DROP TABLE users;
DROP TYPE age_check_status;
DROP TYPE posha_role;
DROP TYPE account_status;
DROP TYPE age_level;

ALTER TABLE compliance_gates DROP CONSTRAINT compliance_gates_key_key;
ALTER TABLE compliance_gates DROP CONSTRAINT compliance_gates_pkey;
ALTER TABLE compliance_gates ADD CONSTRAINT compliance_gates_pkey PRIMARY KEY (key);
ALTER TABLE compliance_gates DROP COLUMN id;
