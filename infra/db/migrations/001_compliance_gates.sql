-- Up Migration
CREATE TABLE compliance_gates (
  key text PRIMARY KEY CHECK (
    key IN (
      'GATE:AGE_PROVIDER_LIVE',
      'GATE:RANDOM_VIDEO',
      'GATE:CREATOR_MONETISATION',
      'GATE:LIVE',
      'GATE:PAYMENTS_LIVE',
      'GATE:PRIVATE_SESSIONS',
      'GATE:TIPS'
    ) OR key ~ '^GATE:GEO_[A-Z]{2}$'
  ),
  status text NOT NULL DEFAULT 'blocked' CHECK (status IN ('blocked', 'approved')),
  approved_by text,
  evidence_ref text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    status = 'blocked'
    OR (approved_by IS NOT NULL AND evidence_ref IS NOT NULL AND approved_at IS NOT NULL)
  )
);

INSERT INTO compliance_gates (key)
VALUES
  ('GATE:AGE_PROVIDER_LIVE'),
  ('GATE:RANDOM_VIDEO'),
  ('GATE:CREATOR_MONETISATION'),
  ('GATE:LIVE'),
  ('GATE:PAYMENTS_LIVE'),
  ('GATE:PRIVATE_SESSIONS'),
  ('GATE:TIPS');

-- Down Migration
DROP TABLE compliance_gates;
