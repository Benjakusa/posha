-- Up Migration
ALTER TABLE sessions_auth ADD COLUMN family_id uuid;
UPDATE sessions_auth SET family_id = id;
ALTER TABLE sessions_auth ALTER COLUMN family_id SET NOT NULL;
ALTER TABLE sessions_auth ADD COLUMN family_expires_at timestamptz;
UPDATE sessions_auth SET family_expires_at = expires_at;
ALTER TABLE sessions_auth ALTER COLUMN family_expires_at SET NOT NULL;
ALTER TABLE sessions_auth ADD COLUMN mfa_verified_at timestamptz;
ALTER TABLE sessions_auth ADD COLUMN replaced_by uuid REFERENCES sessions_auth(id);
CREATE INDEX sessions_auth_family_idx ON sessions_auth (family_id);

ALTER TABLE users ADD COLUMN totp_secret_encrypted bytea;
ALTER TABLE users ADD COLUMN totp_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN totp_last_counter bigint;
ALTER TABLE users ADD CONSTRAINT users_totp_state_check CHECK (
  (totp_enabled = false) OR (totp_secret_encrypted IS NOT NULL AND totp_last_counter IS NOT NULL)
);

CREATE TABLE auth_challenges (
  id uuid PRIMARY KEY,
  identity_hash bytea NOT NULL CHECK (octet_length(identity_hash) = 32),
  otp_hash bytea NOT NULL CHECK (octet_length(otp_hash) = 32),
  attempt_count smallint NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  expires_at timestamptz NOT NULL,
  locked_until timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_challenges_identity_created_idx ON auth_challenges (identity_hash, created_at DESC);
CREATE INDEX auth_challenges_expiry_idx ON auth_challenges (expires_at)
  WHERE consumed_at IS NULL;

-- Down Migration
DROP INDEX auth_challenges_expiry_idx;
DROP INDEX auth_challenges_identity_created_idx;
DROP TABLE auth_challenges;
ALTER TABLE users DROP CONSTRAINT users_totp_state_check;
ALTER TABLE users DROP COLUMN totp_last_counter;
ALTER TABLE users DROP COLUMN totp_enabled;
ALTER TABLE users DROP COLUMN totp_secret_encrypted;
DROP INDEX sessions_auth_family_idx;
ALTER TABLE sessions_auth DROP COLUMN replaced_by;
ALTER TABLE sessions_auth DROP COLUMN mfa_verified_at;
ALTER TABLE sessions_auth DROP COLUMN family_expires_at;
ALTER TABLE sessions_auth DROP COLUMN family_id;
