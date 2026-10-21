-- Up Migration
ALTER TABLE reports ADD COLUMN idempotency_key text;
UPDATE reports SET idempotency_key = id::text WHERE idempotency_key IS NULL;
ALTER TABLE reports ALTER COLUMN idempotency_key SET NOT NULL;
ALTER TABLE reports ADD CONSTRAINT reports_idempotency_key_check
  CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{8,128}$');
CREATE UNIQUE INDEX reports_reporter_idempotency_uidx ON reports (reporter_id, idempotency_key);

-- Down Migration
DROP INDEX reports_reporter_idempotency_uidx;
ALTER TABLE reports DROP CONSTRAINT reports_idempotency_key_check;
ALTER TABLE reports DROP COLUMN idempotency_key;
