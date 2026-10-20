import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationPath = new URL(
  '../../../infra/db/migrations/002_identity_and_core.sql',
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
});
