# 06 — Feature Specifications & Acceptance Criteria

Format: **ID — Behaviour.** Each criterion must map to at least one automated test (tagged in test name with the ID, e.g. `[CON-03]`).

## F1. Auth, onboarding & age assurance (AUTH, AGE)
- AUTH-01 Register/login via email or phone + OTP; OTP expires in 10 min, max 5 attempts, then lockout 15 min.
- AUTH-02 Access token 15 min; refresh rotation with reuse detection (reuse revokes the session family).
- AUTH-03 Creators and all staff must enable 2FA before accessing studio/admin.
- AGE-01 New accounts are `L0`; every Connect/Discover/Live endpoint returns 403 `AGE_LEVEL_REQUIRED` below its required level (matrix in `07` §2).
- AGE-02 Age flow handles provider results: passed → L2; failed → blocked with appeal path; manual_review → pending state with status polling.
- AGE-03 Provider webhook is signature-verified and idempotent; a forged webhook never changes level.
- AGE-04 Age status expiry/re-verification triggers re-gating without data loss.
- AGE-05 No raw identity documents stored by POSHA when provider-held mode is on (test asserts schema has no image fields).

## F2. POSHA Connect — text chat (CON)
- CON-01 User with L2 can join the text queue; L0/L1 cannot.
- CON-02 Two queued users are matched ≤ 5 s in test harness; interest overlap preferred, not required.
- CON-03 Users who skipped/blocked each other are never re-matched within 24 h; blocked pairs never.
- CON-04 `Next` ends the session for both, notifies partner (`session.ended`), and re-queues the initiator.
- CON-05 Message length ≤ 1000; rate-limit 5/s; flood → warning then temporary mute.
- CON-06 Report is available in ≤ 1 tap from chat; creates report with last 50 messages snapshot (user-consented text only).
- CON-07 Partner identity is alias-only; no handle/email/phone leakage in any payload (contract test scans payloads).
- CON-08 Heartbeat timeout (15 s) ends orphaned sessions and frees the partner.
- CON-09 Prohibited-content filter flags messages (links to minors-related abuse terms, solicitation patterns, threats) → warn/escalate per `07`.
- CON-10 Connect is non-explicit: UI rules text visible at queue start; repeated sexual-content flags in Connect escalate to moderation.

## F3. Random video (VID) — `GATE:RANDOM_VIDEO`
- VID-01 Feature hidden/locked when gate off; API returns `GATE_DISABLED`.
- VID-02 Camera/mic permissions requested only after user taps "Start video"; denial handled gracefully.
- VID-03 Both users must `video.consent` accept; until then remote video is blurred/absent.
- VID-04 Leave/Next/Report always visible, ≥ 44 px, reachable one-handed.
- VID-05 Frame-sampling classifier hook receives sampled frames (never stored beyond TTL); high-confidence violation auto-ends call and flags account.
- VID-06 Reconnect on network change ≤ 10 s; otherwise end cleanly.
- VID-07 No server-side recording unless user explicitly consented to a report clip (test asserts no recording egress otherwise).

## F4. Profiles, blocking, privacy (PRO)
- PRO-01 Edit profile, interests, language; handle unique, change cooldown 30 days.
- PRO-02 Block from chat, profile, content, room; block is immediate, symmetric in visibility.
- PRO-03 Account deletion: soft-delete → PII purge job within retention window; financial records kept per legal retention, de-identified where permitted.
- PRO-04 Data export delivers a machine-readable archive within SLA.

## F5. Creator onboarding & studio (CRE)
- CRE-01 Apply → KYC (L3) → admin review → approved/rejected with reason; rejected can reapply.
- CRE-02 Monetisation actions blocked until `kyc_status=approved` AND `GATE:CREATOR_MONETISATION` on.
- CRE-03 Upload flow: pre-signed upload → scan → process → moderation (new creators: manual review; trusted tier: post-publish review).
- CRE-04 Creator declares consent/rights attestation per upload; uploads of content depicting other people require recorded consent attestation fields (co-performer IDs verified as L3 or blocked).
- CRE-05 Posts have access level (public/subscriber/ppv); scheduling publishes at the right time (±1 min).
- CRE-06 Analytics show subscribers, earnings, views; no subscriber PII beyond handle/alias.
- CRE-07 Creator can mute/ban/block any subscriber or attendee.

## F6. Subscriptions & content access (SUB)
- SUB-01 Subscribe → checkout → verified webhook → membership active; UI success page alone grants nothing.
- SUB-02 Renewals attempted at period end; failure → `past_due` grace 3 days → expire.
- SUB-03 Cancel = access until period end; no refunds unless policy dictates (refund rules in `07`).
- SUB-04 Signed URL access checks entitlement on **every** call; expired/cancelled subscribers receive 403; URLs expire ≤ 5 min.
- SUB-05 PPV purchase unlocks single item permanently (until takedown).
- SUB-06 Receipts and transaction history are accurate and exportable.

## F7. POSHA Live Rooms (LIV) — `GATE:LIVE`
**Room creation**
- LIV-01 Only approved creators can create rooms; required: title, description, price ≥ configured min, capacity, duration, rules text, request mode (menu-only / menu+free-text / none).
- LIV-02 Room types: ticketed (cap ≤ 500 default), small_group (cap ≤ 20), private (cap = 1, bookable slots).
- LIV-03 Published terms (start time, duration, price, cancellation/refund policy, rules) are shown **before** payment and snapshotted on the ticket at purchase.
**Booking**
- LIV-04 Ticket purchase uses payment flow; capacity enforced atomically (no oversell under concurrent purchase test).
- LIV-05 Only `active` ticket holders can obtain SFU tokens; token TTL = room duration + grace; revoked on kick/ban.
- LIV-06 Creator-cancelled room → all active tickets auto-refunded; ledger entries reversed correctly.
- LIV-07 Missed-session rule: if creator no-shows (not live within grace of start), tickets auto-refund; attendee no-show gets no refund.
**In-room**
- LIV-08 Prominent Report and Leave buttons always visible; report attaches room/time context.
- LIV-09 Room chat rate-limited; creator can mute/kick/ban; banned user cannot re-enter (ticket revoked, refund per policy if creator-ban is for rule breach by attendee → no refund).
- LIV-10 Dynamic watermark overlay (attendee handle + time) rendered on stream for attendees; test asserts overlay present in DOM and not removable via standard controls.
- LIV-11 No recording by platform by default; ToS notice displayed at join; recording-detected reports supported.
**Requests**
- REQ-01 Attendee sees the creator's request menu and rules; free-text only if enabled.
- REQ-02 Submitted requests pass prohibited-content filter; blocked requests move to `blocked`, user sees neutral message, event logged for safety review; requests involving minors, coercion, non-consent, illegal acts always blocked and escalated.
- REQ-03 Creator can accept, decline (no penalty, no ranking impact) or counter with price; no charge before client confirmation.
- REQ-04 Client must explicitly confirm final price; confirmation captures payment via add-on checkout.
- REQ-05 Priority purchase affects queue order only; UI copy states "priority does not guarantee acceptance".
- REQ-06 Unfulfilled paid add-ons at room end are auto-refunded.
- REQ-07 Copy and API never state or imply that payment obligates the creator.
- REQ-08 Creator can pause requests or end the room instantly (one tap, confirm optional).
**Settlement**
- LIV-12 On `ended`, settlement posts ticket revenue + fulfilled add-ons with correct commission; creator earnings visible within 1 min; payout availability after hold.

## F8. Payments, ledger & payouts (PAY)
- PAY-01 Provider adapters: `FakeProvider` (dev/test) + first sandbox adapter; interface in `packages/shared`.
- PAY-02 Idempotent checkout creation; duplicate key returns same payment.
- PAY-03 Webhook dedupe by provider_event_id; replay does nothing.
- PAY-04 Ledger invariants: balanced txns, no update/delete (DB-level test), derived balances match.
- PAY-05 Commission engine: configurable rate by effective date; rounding rule = bankers rounding to minor unit, remainder to creator; property-based tests prove `creator + platform (+tax) == gross`.
- PAY-06 Refund flows reverse ledger and recompute creator balance; negative balance handled via recovery policy.
- PAY-07 Payout request validates KYC, threshold, hold, disputes; finance approval required; reconciliation compares provider payout file.
- PAY-08 Daily reconciliation job produces report; mismatches alert.
- PAY-09 Dispute/chargeback marks payment `disputed`, places hold, notifies finance.

## F9. Moderation & safety operations (MOD)
- MOD-01 Reports from chat, profile, content, room, request appear in moderator queue prioritised by severity.
- MOD-02 Moderator actions: warn, mute, suspend (time-boxed), ban, remove content; each requires reason; audit logged.
- MOD-03 Repeat-offender scoring auto-escalates; device/IP-hash signals considered (privacy-respecting).
- MOD-04 Appeals workflow with second-reviewer rule for permanent bans.
- MOD-05 Severe categories (child safety) trigger immediate hold, evidence preservation, restricted-access escalation queue.
- MOD-06 Takedown requests (leaked content, rights holders) processed via a form with SLA tracking.

## F10. Admin dashboard (ADM)
- ADM-01 RBAC enforced per `04` matrix; every sensitive reveal requires reason; logged.
- ADM-02 Dashboards: users, creators, KYC queue, reports, content review, live monitor, payments, reconciliation, payouts, fraud, audit, flags, analytics (retention, ARPU, reports/1,000 sessions, payout accuracy).
- ADM-03 Staff cannot view private chats or ID docs by default; "break-glass" access is time-boxed, reasoned, audited, and notifies compliance.
- ADM-04 Flags and compliance gates can only be enabled by super_admin with recorded approval evidence reference.

## F11. Notifications & support (NOT, SUP)
- NOT-01 Push/email/SMS templates for ticket confirmation, room starting, request updates, payout status, safety notices; user preferences respected (safety/legal notices exempt).
- SUP-01 Support agent tools: lookup (redacted), refund request, appeal handoff, no access to private content.

## F12. Non-functional (NFR)
- NFR-01 Performance targets in `02` §8 verified in CI/perf runs.
- NFR-02 Accessibility AA verified by automated + manual checklist.
- NFR-03 Security: ASVS L2 checklist completed; dependency audit has no high/critical.
- NFR-04 Resilience: matcher/gateway restart loses ≤ queue state, never corrupts sessions or ledger.
- NFR-05 i18n: all copy externalised; en + sw bundles present.
