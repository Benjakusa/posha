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
const dataRequestsMigrationPath = new URL(
  '../../../infra/db/migrations/005_data_requests_repair.sql',
  import.meta.url,
);
const userPrivacyMigrationPath = new URL(
  '../../../infra/db/migrations/006_user_privacy.sql',
  import.meta.url,
);
const notificationsMigrationPath = new URL(
  '../../../infra/db/migrations/007_notifications.sql',
  import.meta.url,
);
const connectSafetyMigrationPath = new URL(
  '../../../infra/db/migrations/008_connect_safety.sql',
  import.meta.url,
);
const connectReportMigrationPath = new URL(
  '../../../infra/db/migrations/010_connect_reports_idempotency.sql',
  import.meta.url,
);
const moderationWorkflowMigrationPath = new URL(
  '../../../infra/db/migrations/011_moderation_workflow.sql',
  import.meta.url,
);
const connectVideoModerationMigrationPath = new URL(
  '../../../infra/db/migrations/012_connect_video_moderation.sql',
  import.meta.url,
);
const connectMessageControlsMigrationPath = new URL(
  '../../../infra/db/migrations/009_connect_message_controls.sql',
  import.meta.url,
);
const catalogMigrationPath = new URL(
  '../../../infra/db/migrations/013_catalog.sql',
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

  it('[FIX-001] restores the data request table needed by export and deletion workflows', async () => {
    const migration = await readFile(dataRequestsMigrationPath, 'utf8');
    const [up, down] = migration.split('-- Down Migration');
    expect(up).toContain('CREATE TABLE data_requests');
    expect(up).toContain("request_type IN ('export', 'deletion')");
    expect(up).toContain("status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')");
    expect(down).toContain('DROP TABLE data_requests');
  });

  it('[PRO-01] adds reversible handle cooldown metadata and active data request dedupe', async () => {
    const migration = await readFile(userPrivacyMigrationPath, 'utf8');
    const [up, down] = migration.split('-- Down Migration');
    expect(up).toContain('ADD COLUMN handle_changed_at');
    expect(up).toContain("status IN ('pending', 'processing')");
    expect(down).toContain('DROP INDEX data_requests_active_user_type_uidx');
    expect(down).toContain('DROP COLUMN handle_changed_at');
  });

  it('[P1-09] stores notification preferences and delivery status without message content', async () => {
    const migration = await readFile(notificationsMigrationPath, 'utf8');
    const [up, down] = migration.split('-- Down Migration');
    expect(up).toContain('CREATE TABLE notification_prefs');
    expect(up).toContain('PRIMARY KEY (user_id, category, channel)');
    expect(up).toContain('CREATE TABLE notifications');
    expect(up).toContain("status IN ('sent', 'failed', 'suppressed')");
    expect(up).not.toMatch(/(body|message|email_address|phone_number)\s+(text|varchar)/i);
    expect(down).toContain('DROP TABLE notifications');
    expect(down).toContain('DROP TABLE notification_prefs');
  });

  it('[P2-01] adds reversible Connect and moderation tables with encrypted text columns', async () => {
    const migration = await readFile(connectSafetyMigrationPath, 'utf8');
    const [up, down] = migration.split('-- Down Migration');
    for (const table of ['connect_sessions', 'connect_messages', 'reports', 'moderation_actions']) {
      expect(up).toContain(`CREATE TABLE ${table}`);
      expect(down).toContain(`DROP TABLE ${table}`);
    }
    expect(up).toContain('body_ciphertext bytea NOT NULL');
    expect(up).toContain("interval '7 days'");
    expect(up).toContain('snapshot_ciphertext bytea');
    expect(up).toContain('CHECK ((snapshot_ciphertext IS NULL) OR snapshot_consent)');
    expect(up).toContain('reason_ciphertext bytea NOT NULL');
    expect(up).not.toMatch(/\b(body|details|snapshot|reason)\s+text\b/i);
    expect(up).toContain('connect_sessions_active_started_idx');
    expect(up).toContain('reports_status_created_idx');
  });
});

describe('Connect message controls migration', () => {
  it('[P2-04] adds retry idempotency and privacy-minimal moderation flags with rollback', async () => {
    const migration = await readFile(connectMessageControlsMigrationPath, 'utf8');
    const [up, down] = migration.split('-- Down Migration');
    expect(up).toContain('connect_messages_sender_client_msg_idx');
    expect(up).toContain('connect_moderation_flags');
    expect(up).toContain("severity IN ('review', 'urgent')");
    expect(up).not.toMatch(/(body|message_text|content)\s+text\b/i);
    expect(down).toContain('DROP TABLE connect_moderation_flags');
    expect(down).toContain('DROP COLUMN client_msg_id');
  });
});

describe('Connect report migration', () => {
  it('[P2-05] adds reporter-scoped idempotency and clean rollback', async () => {
    const migration = await readFile(connectReportMigrationPath, 'utf8');
    const [up, down] = migration.split('-- Down Migration');
    expect(up).toContain('reports_reporter_idempotency_uidx');
    expect(up).toContain('ALTER COLUMN idempotency_key SET NOT NULL');
    expect(down).toContain('DROP COLUMN idempotency_key');
  });
});

describe('moderation workflow migration', () => {
  it('[P2-07] supports idempotent actions, revocation, private appeals, and independent decisions', async () => {
    const migration = await readFile(moderationWorkflowMigrationPath, 'utf8');
    const [up, down] = migration.split('-- Down Migration');
    expect(up).toContain('moderation_actions_staff_idempotency_uidx');
    expect(up).toContain('moderation_actions_active_mute_idx');
    expect(up).toContain('appeal_ciphertext bytea NOT NULL');
    expect(up).toContain('decision_reason_ciphertext bytea');
    expect(up).toContain('appeals_one_open_per_action_uidx');
    expect(up).not.toMatch(/\b(appeal|decision_reason)\s+text\b/i);
    expect(down).toContain('DROP TABLE appeals');
    expect(down).toContain('DROP COLUMN revoked_at');
  });
});

describe('Connect video moderation migration', () => {
  it('[P3-03] stores only high-confidence moderation flags and rolls back cleanly', async () => {
    const migration = await readFile(connectVideoModerationMigrationPath, 'utf8');
    const [up, down] = migration.split('-- Down Migration');
    expect(up).toContain('connect_video_moderation_flags');
    expect(up).toContain("status IN ('open', 'actioned', 'dismissed')");
    expect(up).toContain('confidence >= 0 AND confidence <= 1');
    expect(up).not.toMatch(/\b(frame|image|video)\s+bytea\b/i);
    expect(down).toContain('DROP TABLE connect_video_moderation_flags');
  });
});

describe('catalogue migration', () => {
  it('[B-S4-01] seeds neutral catalogue content and rolls the schema back cleanly', async () => {
    const migration = await readFile(catalogMigrationPath, 'utf8');
    const [up, down] = migration.split('-- Down Migration');
    expect(up).toContain('CREATE TABLE catalog_creators');
    expect(up).toContain('CREATE TABLE catalog_videos');
    expect(up).toContain('CREATE TABLE catalog_lives');
    expect(up).toContain("WHERE status = 'published'");
    expect(up).toContain("('creator-08', 'Sam Kiptoo')");
    expect(up).toContain("('video-12', 'creator-04', 'Getting to know me'");
    expect(up).toContain("('live-05', 'creator-05', 'Soft evening sounds'");
    expect(down).toContain('DROP TABLE catalog_lives');
    expect(down).toContain('DROP TABLE catalog_videos');
    expect(down).toContain('DROP TABLE catalog_creators');
  });
});
