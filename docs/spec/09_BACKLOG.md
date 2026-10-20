# 09 — Ordered Backlog (agent work plan)

Legend: **[T]** = tests required per `08`; **Spec** = sections to read; **Gate** = flag that must stay OFF in production until approved. Complete tasks in order within a phase; phases map to the roadmap (Foundation → Connect → Live video → Creators → Live Rooms → Growth). Check `00` §5 Definition of Done on every task.

## Phase 0 — Repo & platform foundation
- P0-01 Init pnpm+Turborepo monorepo per `00` §4; TS strict, ESLint, Prettier, Husky, commitlint. [T: lint/typecheck CI]
- P0-02 `packages/config` (tsconfig bases, eslint, tailwind preset with Ember tokens from `03`). [T: token snapshot, contrast script]
- P0-03 `packages/shared`: enums, error codes, Zod schemas, money utils (integer minor units, KES formatting). [T: unit]
- P0-04 docker-compose (Postgres, Redis, MinIO, Mailpit, LiveKit dev) + `infra/seed` neutral seeds.
- P0-05 CI pipeline skeleton incl. spec-coverage script stub. [T]
- P0-06 Nest app skeleton: config, logging (pino, redaction), OpenTelemetry, health, problem+json filter, OpenAPI export. [T]
- P0-07 `flags` module + `compliance_gates` table + prod-config test asserting all gates off. [T] Spec: 07 §1

## Phase 1 — Foundation: accounts, age, RBAC, shell
- P1-01 DB migrations: users, roles, sessions, age_checks, profiles, blocks, audit_log (hash-chained), feature_flags, outbox. Spec: 04
- P1-02 Auth module (OTP, tokens, refresh rotation + reuse detection, 2FA for staff/creators). [T: AUTH-01..03]
- P1-03 Policy layer + guards (Auth, AccountStatus, AgeLevel, Role, Ownership, FeatureGate, RateLimit) + table-driven authz test harness. [T: 3.1]
- P1-04 Age module with `AgeAssuranceProvider` interface, fake + webhook handling, level state machine. Gate: AGE_PROVIDER_LIVE [T: AGE-01..05]
- P1-05 Users/profile/blocks/deletion/export APIs. [T: PRO-01..04]
- P1-06 `packages/ui` core primitives + Storybook + a11y tests, light/dark Ember themes. Spec: 03 §5 [T: component, axe]
- P1-07 `apps/web` shell: routing, PWA setup, BottomTabBar (5 tabs), SafeAreaShell, auth + onboarding + age-gate screens, settings/privacy. [T: e2e journey 1–2 partial]
- P1-08 `apps/admin` shell: SSO/2FA login, RBAC nav, audit log viewer, flags/gates screen (approval evidence required). [T: ADM-01, ADM-04]
- P1-09 Notification module (email/SMS/push abstractions, templates, prefs). [T: NOT-01]

## Phase 2 — POSHA Connect (text)
- P2-01 Migrations: connect_sessions, connect_messages, reports, moderation_actions. 
- P2-02 Realtime gateway (`/connect`), Zod-validated events, presence, rate limits. [T: 3.4]
- P2-03 Matching service (Redis queues, tick matcher, skip/block memory, interest scoring). [T: CON-01..04, CON-08, race tests]
- P2-04 Chat relay + persistence + retention job + text moderation hook (`ModerationProvider`). [T: CON-05, CON-09, retention]
- P2-05 Report/block flows (REST + UI sheets), snapshot capture. [T: CON-06, CON-07]
- P2-06 Web UI: Home, queue state, chat session, Next, Report, Block; empty/error states; reduced-motion. [T: component, e2e journey 3, a11y]
- P2-07 Moderator queue in admin (reports, actions with reason, appeals basic, audit). [T: MOD-01..04]
- P2-08 Observability dashboards for match latency, queue depth, reports/1,000 sessions. 
- P2-09 Load test k6 for matching; tune. [T: 3.10]
- **Milestone R1:** controlled pilot of verified adults (text only).

## Phase 3 — Random video (dark launch)
- P3-01 SFU integration (LiveKit adapter, TURN), token service, `FakeSfu`. Gate: RANDOM_VIDEO
- P3-02 Consent handshake + blurred-until-accept + permission UX. [T: VID-02..04]
- P3-03 Frame-sampling pipeline + classifier hook + auto-end on high confidence. [T: VID-05]
- P3-04 Reconnect/network adaptation, leave/report overlays. [T: VID-06..07]
- P3-05 Live-ops runbooks for video abuse; moderation staffing checklist evidence template. Spec: 07 §9
- P3-06 Playwright video E2E with fake media devices. [T]

## Phase 4 — Creators, content, subscriptions, payments
- P4-01 Migrations: creators, plans, subscriptions, media, posts, purchases, payments, webhook_events, ledger_*, commission_rules, payouts.
- P4-02 Ledger service + commission engine + DB append-only triggers + property tests. [T: PAY-04, PAY-05, 3.2]
- P4-03 Payment module: provider interface, FakeProvider, first sandbox adapter, checkout, idempotency, webhook pipeline. Gate: PAYMENTS_LIVE [T: PAY-01..03]
- P4-04 Creator onboarding + KYC adapter (fake + interface) + admin KYC review. Gate: CREATOR_MONETISATION [T: CRE-01..02]
- P4-05 Media pipeline (quarantine upload, scan, transcode, hash/classifier hooks, signed delivery, watermark profile). [T: CRE-03..04, 3.6]
- P4-06 Studio UI: dashboard, content manager, uploader, pricing, analytics. [T: CRE-05..06, component, e2e journey 4]
- P4-07 Discover UI + creator profile + subscribe flow + receipts. [T: SUB-01..06]
- P4-08 Renewal/billing workers, grace handling, cancellations. [T: SUB-02..03]
- P4-09 Refunds/disputes, reconciliation job, finance dashboard, payout request/approval. [T: PAY-06..09]
- P4-10 Content moderation + takedown workflow in admin. [T: MOD-06, ADM-02]

## Phase 5 — POSHA Live Rooms
- P5-01 Migrations: rooms, room_permitted_categories, tickets, room_requests.
- P5-02 Room lifecycle service + state machines + scheduler worker. Gate: LIVE [T: 3.3, LIV-01..03]
- P5-03 Ticketing with atomic capacity, terms snapshot, token issuance/revocation. [T: LIV-04..05, concurrency]
- P5-04 Live gateway (`/live`): chat, presence, request events, creator controls. [T: LIV-08..09]
- P5-05 Request workflow engine: menu, filter, accept/decline/counter, confirm → add-on checkout, priority queue, auto-refunds. [T: REQ-01..08]
- P5-06 Settlement + commission + creator earnings reflect; no-show/cancel refund logic. [T: LIV-06, LIV-07, LIV-12]
- P5-07 Watermark overlay + room safety UX (Report/Leave always visible, panic end). [T: LIV-10..11]
- P5-08 Web UI: Live tab (Now/Upcoming/My tickets), room detail, room view; Studio room scheduler, request menu editor, request queue, audience moderation. [T: component, e2e journeys 5–6, a11y]
- P5-09 Admin live monitor + room-level moderation tools. [T]
- P5-10 Private booked sessions (slots, boundaries, cancellation). Gate: PRIVATE_SESSIONS [T]
- P5-11 Tips and priority-request purchases. Gate: TIPS [T]

## Phase 6 — Hardening & growth
- P6-01 Full security pass (ZAP, Semgrep, pen-test prep, ASVS checklist) [T: 3.1 expanded]
- P6-02 Perf/resilience drills; chaos-lite. [T: 3.10]
- P6-03 Interest matching improvements, discovery ranking, referrals, analytics.
- P6-04 i18n (sw), a11y audit with assistive-tech manual pass.
- P6-05 Launch readiness: gate evidence pack, DPIA, runbooks, support playbooks, status page.
- P6-06 Geo-expansion framework (`GATE:GEO_<CC>`).

## Backlog hygiene
Each task PR links its task ID, tests, spec IDs satisfied, flags touched, and any new entry in `docs/DECISIONS.md`. Re-run `spec-coverage` before closing a phase. A phase is complete only when its milestone checklist (all tasks Done, e2e journeys green, dashboards live, runbooks written) is signed off by the owner.
