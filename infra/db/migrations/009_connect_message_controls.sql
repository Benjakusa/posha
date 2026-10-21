-- Up Migration
ALTER TABLE connect_messages ADD COLUMN client_msg_id text;
UPDATE connect_messages SET client_msg_id = id::text WHERE client_msg_id IS NULL;
ALTER TABLE connect_messages ALTER COLUMN client_msg_id SET NOT NULL;
ALTER TABLE connect_messages ADD CONSTRAINT connect_messages_client_msg_id_check
  CHECK (client_msg_id ~ '^[A-Za-z0-9_-]{1,128}$');
CREATE UNIQUE INDEX connect_messages_sender_client_msg_idx
  ON connect_messages (sender_id, client_msg_id);

CREATE TABLE connect_moderation_flags (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES connect_messages(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES connect_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  categories text[] NOT NULL CHECK (cardinality(categories) BETWEEN 1 AND 4
    AND categories <@ ARRAY['minor_safety', 'solicitation', 'threat', 'explicit']::text[]),
  severity text NOT NULL CHECK (severity IN ('review', 'urgent')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX connect_moderation_flags_message_uidx ON connect_moderation_flags (message_id);
CREATE INDEX connect_moderation_flags_created_idx ON connect_moderation_flags (created_at);
CREATE INDEX connect_moderation_flags_user_created_idx ON connect_moderation_flags (user_id, created_at DESC);

-- Down Migration
DROP TABLE connect_moderation_flags;
DROP INDEX connect_messages_sender_client_msg_idx;
ALTER TABLE connect_messages DROP CONSTRAINT connect_messages_client_msg_id_check;
ALTER TABLE connect_messages DROP COLUMN client_msg_id;
