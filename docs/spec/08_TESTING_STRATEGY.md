# 08 — Testing Strategy & Required Test Cases

Every acceptance ID in `06` must have ≥ 1 automated test whose name contains the ID (e.g. `it('[LIV-04] never oversells capacity under concurrency')`). A CI script (`scripts/check-spec-coverage.ts`) parses `06_FEATURE_SPECS.md` IDs and fails if any ID has no test.

## 1. Pyramid & tooling

| Layer | Tooling | Scope | Share |
|---|---|---|---|
| Unit | Vitest (web/ui/shared), Jest or Vitest (api) | Pure logic, state machines, commission math, guards | ~60% |
| Component | Testing Library + Storybook interaction tests | UI components, states, a11y | ~15% |
| Integration | Testcontainers (Postgres, Redis, MinIO), Supertest, ws client | Modules + DB + queues, webhooks, ledger | ~15% |
| Contract | OpenAPI diff, Zod schema tests, Pact-style for provider adapters | API/WS shapes | – |
| E2E | Playwright (mobile viewports 360×640, 390×844; Chromium + WebKit) | Critical journeys | ~7% |
| Non-functional | k6 (load), axe-core (a11y), Lighthouse CI, OWASP ZAP baseline, Semgrep, `pnpm audit` | Perf, a11y, security | – |

**Coverage gates:** api domain/ledger/guards ≥ 90% lines & branches; other api ≥ 80%; web/ui ≥ 80%; mutation testing (Stryker) on `ledger`, `commission`, `state machines`, `guards` with score ≥ 75%.

## 2. Test doubles (packages/test-utils)
`FakePaymentProvider` (configurable: succeed, fail, delay, duplicate webhook, forged signature, out-of-order), `FakeAgeProvider`, `FakeKycProvider`, `FakeModerationProvider` (deterministic classifier verdicts by marker strings — **neutral markers only**, e.g. `__FLAG_HIGH__`), `FakeSfu` (token issuance/revocation), `FakeClock`. Factories for users at each age level and role. **No explicit media in any fixture.**

## 3. Must-have test suites

### 3.1 Security & authorization (every endpoint, table-driven)
For each route: anonymous → 401; wrong role → 403; wrong owner → 403/404; age level below requirement → 403 `AGE_LEVEL_REQUIRED`; gate off → `GATE_DISABLED`; banned/suspended → 403. Plus: IDOR checks on media, tickets, requests, payouts; JWT tamper/expiry; refresh reuse detection; CSRF on cookie flows; mass-assignment on DTOs; SQLi/XSS payload fuzz on text fields; SSRF on any URL fields; webhook forgery/replay; rate-limit enforcement per class; secrets-not-in-logs test; CSP/headers test.

### 3.2 Ledger & payments (property-based with fast-check)
- Balanced transactions for any generated sequence of purchases/refunds/settlements.
- `creator + platform + tax == gross` for random amounts/rates (rounding rule).
- Idempotency: same key N times → one txn. Duplicate/out-of-order webhooks → single effect.
- DB-level: UPDATE/DELETE on `ledger_entries` fails.
- Concurrency: parallel webhooks + refunds don't double-credit.
- Reconciliation: injected provider mismatch is detected and alerted.
- Payout eligibility matrix (KYC, threshold, hold, dispute).

### 3.3 State machines
Exhaustive transition tables for Room, Ticket, Request, Payment, Payout, Age: every legal transition passes; every illegal transition throws a typed error (generated tests iterate the full state × event matrix).

### 3.4 Matching & realtime
- Pairs never match if blocked/recently skipped; interest preference ordering; no self-match; no double-match under concurrent joins (race test with 500 simulated users).
- Heartbeat timeout cleanup; reconnect behaviour; Redis failover simulation (degrade gracefully, no ledger/session corruption).
- WS payload schema validation (reject invalid/oversize); flood protection.
- Partner payloads contain no PII (scan test).

### 3.5 Live rooms & requests
- Capacity under concurrent purchase (e.g. 100 parallel buyers for 20 seats → exactly 20 active tickets).
- Token issuance only for active tickets; revocation on kick/ban closes media access.
- Creator cancel/no-show → refunds computed correctly; settlement correctness with mixed fulfilled/unfulfilled add-ons.
- Request filter: blocked categories never reach creator view; escalation event emitted; neutral user message.
- Payment-not-consent: assert no code path auto-accepts or auto-fulfils a request on payment; assert creator decline leaves no charge.
- Terms snapshot immutability after purchase.

### 3.6 Content protection
- Signed URL expires; reuse after entitlement loss → 403; HLS segment tokens bound to session; watermark overlay present; private bucket not publicly listable (infra test).

### 3.7 Safety & moderation
- Report creation from every surface; snapshot contents correct and bounded.
- Severity routing; child-safety path creates hold + restricted evidence + notification, and moderator UI shows content blurred by default.
- Appeals two-reviewer rule for permanent bans.
- Repeat-offender escalation thresholds.
- Audit log hash-chain verification detects tampering.
- Retention jobs delete/keep exactly per schedule (fake clock).

### 3.8 Frontend & UX
- Component tests for each `packages/ui` component: states, keyboard, ARIA, reduced motion.
- axe-core on every route in light and dark; contrast token script (`contrast-pairs.json`).
- Visual regression (Playwright screenshots / Chromatic) for key screens at 360 and 390 widths.
- Offline/PWA: installability, offline shell, push permission flows.
- i18n: no hard-coded strings (lint rule), sw/en bundle completeness.
- Touch-target size ≥ 44 px assertion for primary controls.

### 3.9 End-to-end journeys (Playwright, run on PR for smoke set, nightly for full)
1. Register → OTP → age pass → text chat → Next → report → block.
2. Age fail → blocked → appeal path visible.
3. Two browser contexts: match, exchange messages, partner leaves, re-queue.
4. Creator apply → KYC approve (admin) → upload → moderation approve → publish → subscriber subscribes (fake provider) → access granted → cancel → access until period end.
5. Live: creator schedules → attendee buys ticket → room starts → join → submit request → creator counters → client confirms → fulfil → room ends → settlement visible → payout request → finance approves.
6. Live negative: creator declines request (no charge); blocked request; kicked attendee loses stream.
7. Admin: moderator action with reason; sensitive reveal requires reason and writes audit; flag enabling requires approval evidence.
8. Gate defaults: fresh production config → all GATE features unavailable.

### 3.10 Performance & resilience (k6 + chaos-lite)
Match latency under 200/1,000 queued users; WS 5k concurrent connections smoke; API p95 targets; webhook burst (1k/min); DB failover drill in staging; worker crash mid-payout idempotency.

## 4. CI pipeline (.github/workflows)
1. `install → lint → typecheck` (parallel via Turborepo cache)
2. `unit` + `component` (+ coverage gate)
3. `integration` (Testcontainers)
4. `contract` (OpenAPI diff, schema tests)
5. `spec-coverage` (every `06` ID has a test)
6. `security` (Semgrep, audit, secret scan, ZAP baseline on staging)
7. `e2e-smoke` (Playwright) → `build` → deploy to staging → `e2e-full` nightly
8. `a11y + lighthouse` budget checks
Merges blocked on any red gate. Flaky tests quarantined with a ticket, never silently retried more than once.

## 5. Test data rules
Deterministic seeds; neutral names/bios (“Test Creator 01”); placeholder media = generated solid-colour images/short colour-bar videos; never real people's data; separate staging dataset generator in `infra/seed`.
