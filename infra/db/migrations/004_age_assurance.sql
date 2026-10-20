-- Up Migration
CREATE UNIQUE INDEX age_checks_provider_ref_uidx
  ON age_checks (provider, provider_ref)
  WHERE provider_ref IS NOT NULL;

CREATE TABLE age_webhook_events (
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_event_id)
);

-- Down Migration
DROP TABLE age_webhook_events;
DROP INDEX age_checks_provider_ref_uidx;
