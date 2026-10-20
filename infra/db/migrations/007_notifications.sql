-- Up Migration
CREATE TABLE notification_prefs (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'ticket_confirmation', 'room_starting', 'request_update',
    'payout_status', 'safety_notice', 'legal_notice'
  )),
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, category, channel)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'ticket_confirmation', 'room_starting', 'request_update',
    'payout_status', 'safety_notice', 'legal_notice'
  )),
  template_key text NOT NULL CHECK (template_key IN (
    'ticket.confirmed', 'room.starting', 'request.updated',
    'payout.status_changed', 'safety.notice', 'legal.notice'
  )),
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
  status text NOT NULL CHECK (status IN ('sent', 'failed', 'suppressed')),
  provider_ref text,
  error_code text CHECK (error_code IS NULL OR error_code IN (
    'destination_unavailable', 'provider_not_configured', 'provider_error'
  )),
  created_at timestamptz NOT NULL,
  sent_at timestamptz,
  CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);

CREATE INDEX notifications_user_created_idx ON notifications (user_id, created_at DESC);

-- Down Migration
DROP INDEX notifications_user_created_idx;
DROP TABLE notifications;
DROP TABLE notification_prefs;
