-- Up Migration
ALTER TABLE users ADD COLUMN handle_changed_at timestamptz;

CREATE UNIQUE INDEX data_requests_active_user_type_uidx
  ON data_requests (user_id, request_type)
  WHERE user_id IS NOT NULL AND status IN ('pending', 'processing');

-- Down Migration
DROP INDEX data_requests_active_user_type_uidx;
ALTER TABLE users DROP COLUMN handle_changed_at;
