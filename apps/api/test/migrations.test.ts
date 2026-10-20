import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationPath = new URL(
  '../../../infra/db/migrations/002_identity_and_core.sql',
  import.meta.url,
);
const authMigrationPath = new URL(
  '../../../infra/db/migrations/003_auth_security.sql',
  import.meta.url,
);
const ageMigrationPath = new URL(
  '../../../infra/db/migrations/004_age_assurance.sql',
  import.meta.url,
);

describe('identity and core database migration', () => {
  it('[P1-01] contains reversible identity, safety, flag, and outbox schema', async () => {
    const migration = await readFile(migrationPath, 'utf8');
    const [up, down] = migration.split('-- Down Migration');

    expect(up).toContain('-- Up Migration');
    expect(down).toBeTruthy();
    for (const table of [
      'users',
      'user_roles',
      'sessions_auth',
      'age_checks',
      'profiles',
      'blocks',
      'audit_log',
      'feature_flags',
      'outbox_events',
    ]) {
      expect(up).toContain(`CREATE TABLE ${table}`);
      expect(down).toContain(`DROP TABLE ${table}`);
    }
    expect(up).toContain('CREATE TRIGGER audit_log_no_update_or_delete');
    expect(up).toContain('CREATE TRIGGER audit_log_no_truncate');
    expect(up).toContain('REFERENCES audit_log(hash)');
    expect(up).toContain('audit_log_single_successor_idx');
    expect(up).toContain("'GATE:RANDOM_VIDEO', false");
    expect(up).toContain("DEFAULT 'L0'");
    expect(up).not.toMatch(/(raw_id|id_image|document_image)/i);
  });

  it('[P1-02] persists OTP limits, refresh families, and encrypted TOTP state', async () => {
    const migration = await readFile(authMigrationPath, 'utf8');
    const [up, down] = migration.split('-- Down Migration');

    expect(up).toContain('CREATE TABLE auth_challenges');
    expect(up).toContain('identity_hash bytea');
    expect(up).toContain('otp_hash bytea');
    expect(up).toContain('attempt_count BETWEEN 0 AND 5');
    expect(up).toContain('ALTER TABLE sessions_auth ADD COLUMN family_id uuid');
    expect(up).toContain('ALTER TABLE users ADD COLUMN totp_secret_encrypted bytea');
    expect(up).not.toMatch(/(identity text|otp_code text|totp_secret text)/i);
    expect(down).toContain('DROP TABLE auth_challenges');
    expect(down).toContain('DROP COLUMN family_id');
    expect(down).toContain('DROP COLUMN totp_secret_encrypted');
  });

  it('[P1-04] stores idempotent age provider events and rolls the migration back cleanly', async () => {
    const migration = await readFile(ageMigrationPath, 'utf8');
    const [up, down] = migration.split('-- Down Migration');
    expect(up).toContain('age_checks_provider_ref_uidx');
    expect(up).toContain('PRIMARY KEY (provider, provider_event_id)');
    expect(up).not.toMatch(/(image|document|photo|selfie)_?(url|data|bytes|blob)/i);
    expect(down).toContain('DROP TABLE age_webhook_events');
    expect(down).toContain('DROP INDEX age_checks_provider_ref_uidx');
  });
});
