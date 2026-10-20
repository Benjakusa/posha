-- Up Migration
CREATE TABLE data_requests (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  request_type text NOT NULL CHECK (request_type IN ('export', 'deletion')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  result_storage_key text,
  result_expires_at timestamptz,
  failure_code text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL),
  CHECK (request_type = 'export' OR result_storage_key IS NULL)
);
CREATE INDEX data_requests_user_created_idx ON data_requests (user_id, created_at DESC);
CREATE INDEX data_requests_pending_idx ON data_requests (created_at) WHERE status = 'pending';

-- Down Migration
DROP INDEX data_requests_pending_idx;
DROP INDEX data_requests_user_created_idx;
DROP TABLE data_requests;
