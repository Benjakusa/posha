# 04 — Data Model, State Machines & Ledger

PostgreSQL 15+, migrations via a versioned tool (Prisma Migrate, Drizzle or Knex — pick one, record ADR). All tables: `id uuid pk (v7)`, `created_at`, `updated_at`; soft-delete only where stated. Money = `bigint` minor units + `currency char(3)`.

## 1. Enums
`age_level`: L0, L1, L2, L3 · `account_status`: active, suspended, banned, deleted · `role`: member, subscriber, creator, moderator, finance_admin, support_agent, compliance_officer, super_admin · `age_check_status`: pending, passed, failed, expired, manual_review · `kyc_status`: not_started, pending, approved, rejected, needs_info · `session_mode`: text, video · `session_end_reason`: next, leave, report, block, timeout, error · `content_access`: public, subscriber, ppv · `media_status`: uploaded, scanning, processing, in_review, published, rejected, removed · `room_type`: ticketed, small_group, private · `room_status`: draft, scheduled, live, ended, cancelled · `ticket_status`: pending, active, refunded, revoked, expired · `request_status`: submitted, accepted, declined, countered, client_confirmed, fulfilled, cancelled, refunded, blocked · `payment_status`: created, pending, succeeded, failed, cancelled, refunded, partially_refunded, disputed · `payout_status`: eligible, requested, approved, processing, paid, failed, reversed · `report_status`: open, triaged, actioned, dismissed, escalated, appealed.

## 2. Core tables (columns abbreviated to what matters)

**users**: email?, phone?, password_hash?/passkey refs, status, age_level, handle (unique, public), chat_alias, locale, country, last_seen_at, deleted_at.
**user_roles**: user_id, role, granted_by, granted_at (unique user+role).
**sessions_auth**: user_id, refresh_hash, device, ip_hash, expires_at, revoked_at.
**age_checks**: user_id, provider, provider_ref, level_result, status, evidence_ref (provider-held), expires_at. *No raw ID images stored by POSHA unless counsel approves; if stored, encrypted + retention-limited.*
**profiles**: user_id, display_name, bio, avatar_media_id, interests text[], languages text[].
**blocks**: blocker_id, blocked_id, created_at (unique pair; permanent until removed).
**connect_sessions**: id, mode, user_a, user_b, started_at, ended_at, end_reason, ended_by, flags jsonb. Index on (user_a, started_at), (user_b, started_at).
**connect_messages**: session_id, sender_id, body_ciphertext (application-encrypted), created_at, moderation_flag, expires_at. Retention per `07` (7 days unless separately preserved as consented report evidence).
**creators**: user_id (unique), kyc_status, kyc_provider_ref, payout_account_ref, tier, commission_rule_id, monetised_at, suspended_reason.
**subscription_plans**: creator_id, price_minor, currency, interval, benefits jsonb, active.
**subscriptions**: subscriber_id, creator_id, plan_id, status (active, past_due, cancelled, expired), current_period_end, cancel_at_period_end.
**media**: owner_id, status, kind (image, video), storage_key, hash_sha256, perceptual_hash, duration, classifier_scores jsonb, reviewed_by.
**posts**: creator_id, caption, access, price_minor?, scheduled_at, published_at, status.
**post_media**: post_id, media_id, position.
**purchases**: buyer_id, kind (ppv, tip, ticket, request_addon), target_id, amount_minor, currency, payment_id.
**rooms**: creator_id, type, title, description, rules_text, price_minor, currency, capacity, starts_at, duration_min, status, started_at, ended_at, allow_free_text_requests bool, sfu_room_name.
**room_permitted_categories**: room_id, category_code, price_minor? (the creator's request menu).
**tickets**: room_id, buyer_id, status, payment_id, joined_at, left_at, banned bool. Unique (room_id, buyer_id) where status in (pending, active).
**room_requests**: room_id, ticket_id, category_code?, free_text?, status, proposed_price_minor?, final_price_minor?, creator_decision_at, client_confirmed_at, fulfilled_at, block_reason?, priority_rank.
**payments**: user_id, provider, provider_ref, idempotency_key (unique), amount_minor, currency, status, purpose, raw_webhook_ref.
**webhook_events**: provider, provider_event_id (unique with provider), payload, signature_ok, processed_at.
**commission_rules**: scope (global, tier, creator), rate_bps, effective_from, effective_to.
**ledger_accounts**: owner_type (platform, creator, user_escrow, provider_clearing, tax, refunds), owner_id?, currency, kind.
**ledger_entries**: txn_id, account_id, direction (debit|credit), amount_minor, currency, ref_type, ref_id, memo, created_at. **Append-only (DB trigger blocks UPDATE/DELETE).**
**ledger_txns**: id, kind, idempotency_key (unique), posted_at; invariant: sum(debits)=sum(credits) per txn.
**payouts**: creator_id, amount_minor, currency, status, provider_ref, requested_at, approved_by, paid_at, failure_reason.
**reports**: reporter_id, target_type, target_id, reason_code, details_ciphertext, consented snapshot_ciphertext (maximum 50 messages), snapshot_consent, idempotency_key (unique per reporter), evidence_ref, status, assigned_to.
**moderation_actions**: report_id?, target_user_id, action (warn, mute, suspend, ban, remove_content), reason_ciphertext, by_staff_id, expires_at.
**appeals**: action_id, user_id, text, status, decided_by.
**audit_log**: actor_id, actor_role, action, entity_type, entity_id, reason (required for sensitive), ip_hash, prev_hash, hash, created_at (append-only, hash-chained).
**feature_flags**: key, enabled, rollout jsonb, gate_note, changed_by. **compliance_gates**: key, status (blocked, approved), approved_by, evidence_ref, approved_at.
**outbox_events**: aggregate, type, payload, published_at (transactional outbox).
**notification_prefs**: user_id, category, channel, enabled, updated_at (unique user/category/channel). **notifications**: id, user_id, category, template_key, channel, status, provider_ref, error_code, created_at, sent_at. Store no message body or destination. **data_requests** (export/delete workflow).

## 3. State machines (implement as pure functions + exhaustive tests)

**Room**: draft→scheduled (creator, KYC approved, gate on) · scheduled→live (creator start / scheduler) · live→ended · scheduled→cancelled (triggers refund of all active tickets) · live→cancelled (admin only; refunds policy).
**Ticket**: pending→active (webhook success) · active→refunded | revoked (banned/rule breach policy) · pending→expired (15 min).
**Request**: submitted→blocked (filter) · submitted→accepted | declined | countered · countered→client_confirmed | cancelled · accepted→client_confirmed (if price>0) or →fulfilled (if free) · client_confirmed→fulfilled | refunded · any pre-fulfilment→cancelled (room ends). **Charge captured only at client_confirmed; refund automatic if not fulfilled by room end.**
**Payment**: created→pending→succeeded|failed|cancelled; succeeded→refunded|partially_refunded|disputed.
**Payout**: eligible→requested→approved→processing→paid|failed; paid→reversed (rare, finance_admin).
**Age**: L0→(check)→L2; L2→L3 via KYC; expiry/re-verify rules per `07`.

## 4. Ledger rules (binding)
1. Every money event is a balanced transaction; post inside the same DB transaction as the state change.
2. Idempotency key per business event; duplicate → no-op returning original txn.
3. Ticket purchase success: Dr provider_clearing / Cr user_escrow(room). On room completion: Dr escrow / Cr creator_earnings (net) + Cr platform_revenue (commission) + Cr tax if applicable. Provider fees booked when reported.
4. Creator balance = derived sum, never stored as mutable field (materialised view allowed, rebuilt from ledger).
5. Refund = reversing txn referencing original; never edit past entries.
6. Daily reconciliation job: provider settlement report vs ledger; mismatches raise finance alerts.
7. Payout eligibility: KYC approved, balance ≥ threshold, no open dispute hold, hold period elapsed (configurable, default 7 days).

## 5. Permissions matrix (summary; full policy in code with tests)

| Capability | member | subscriber | creator | moderator | finance | support | compliance | super |
|---|---|---|---|---|---|---|---|---|
| Random chat | L2 | L2 | L2 | – | – | – | – | – |
| Buy subs/tickets | L2 | ✔ | ✔ | – | – | – | – | – |
| Publish content / host rooms | – | – | L3 + gate | – | – | – | – | – |
| Review reports / act | – | – | – | ✔ | – | read | read | ✔ |
| Refunds / payouts | – | – | – | – | ✔ | request | read | ✔ |
| View ID docs/evidence | – | – | – | reason+audit | – | – | read+audit | reason+audit |
| Flags/roles/config | – | – | – | – | – | – | read | ✔ |

## 6. Indexing & retention notes
Partial indexes for active tickets/sessions; GIN on interests; BRIN on ledger_entries.created_at; retention jobs per `07` §7 (messages, frames, evidence, ID results).
