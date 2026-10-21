-- Up Migration
ALTER TABLE moderation_actions ADD COLUMN revoked_at timestamptz;
ALTER TABLE moderation_actions ADD COLUMN idempotency_key text;
UPDATE moderation_actions SET idempotency_key = id::text WHERE idempotency_key IS NULL;
ALTER TABLE moderation_actions ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE moderation_actions ADD CONSTRAINT moderation_actions_idempotency_key_check
  CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{8,128}$');
CREATE UNIQUE INDEX moderation_actions_staff_idempotency_uidx
  ON moderation_actions (by_staff_id, idempotency_key);
CREATE INDEX moderation_actions_active_mute_idx ON moderation_actions (target_user_id, expires_at)
  WHERE action = 'mute' AND revoked_at IS NULL;

CREATE TABLE appeals (
  id uuid PRIMARY KEY,
  action_id uuid NOT NULL REFERENCES moderation_actions(id),
  user_id uuid NOT NULL REFERENCES users(id),
  appeal_ciphertext bytea NOT NULL CHECK (octet_length(appeal_ciphertext) BETWEEN 1 AND 8192),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected')),
  decided_by uuid REFERENCES users(id),
  decision_reason_ciphertext bytea CHECK (decision_reason_ciphertext IS NULL OR octet_length(decision_reason_ciphertext) BETWEEN 1 AND 4096),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{8,128}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK ((status = 'open') = (decided_at IS NULL)),
  CHECK ((status = 'open') = (decided_by IS NULL)),
  CHECK ((status = 'open') = (decision_reason_ciphertext IS NULL)),
  UNIQUE (user_id, action_id, idempotency_key)
);
CREATE UNIQUE INDEX appeals_one_open_per_action_uidx ON appeals (action_id) WHERE status = 'open';
CREATE INDEX appeals_status_created_idx ON appeals (status, created_at);

-- Down Migration
DROP TABLE appeals;
DROP INDEX moderation_actions_active_mute_idx;
DROP INDEX moderation_actions_staff_idempotency_uidx;
ALTER TABLE moderation_actions DROP CONSTRAINT moderation_actions_idempotency_key_check;
ALTER TABLE moderation_actions DROP COLUMN idempotency_key;
ALTER TABLE moderation_actions DROP COLUMN revoked_at;
