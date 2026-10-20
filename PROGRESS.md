# POSHA PROGRESS (single source of truth for "where are we")
Last updated: 2026-10-20 by Codex
Current phase: Phase 1
Current task: P1-02
Next task: P1-03

## Phase status
| Phase | Status | Milestone sign-off |
|---|---|---|
| 0 Foundation | Done | – |
| 1 Accounts/Age/RBAC | In progress | – |
| 2 Connect (text) | Not started | R1: pending |
| 3 Random video | Not started | – |
| 4 Creators/Payments | Not started | – |
| 5 Live Rooms | Not started | – |
| 6 Hardening | Not started | – |

## Task log (append; one row per task)
| ID | Status | Date | Commit | Tests/Evidence | Notes |
|---|---|---|---|---|---|
| P0-01 | Done | 2026-10-20 | `053e49d` | `pnpm lint`, `pnpm typecheck`, `pnpm test` pass (zero tests exist yet); `pnpm format:check` passes | Initialized pnpm/Turborepo workspace, strict TS, lint/format/hooks, package shells. |
| P0-05 | Done | 2026-10-20 | `053e49d` | CI workflow; `scripts/check-spec-coverage.mjs` finds 82 acceptance IDs | CI quality pipeline and spec-coverage scaffold added with P0-01 per phase order; feature-to-test mapping is not enforced until feature suites exist. |
| P0-02 | Done | 2026-10-20 | `eae7d7e` | `pnpm lint`, `pnpm typecheck`, `pnpm test` (4 tests), `pnpm --filter @posha/ui check:contrast` (15 pairs), and `pnpm format:check` pass | Added canonical Ember tokens, Tailwind preset, token snapshot, and CI contrast validation. |
| P0-03 | Done | 2026-10-20 | `0fc1132` | `pnpm lint`, `pnpm typecheck`, `pnpm test` (8 shared tests), contrast, spec-coverage, and formatting pass | Added exact data-model enums, listed API error codes, RFC 7807 and Connect schemas, safe integer money DTOs, and KES formatting. Excess currency precision is rejected per `docs/DECISIONS.md`. |
| P0-04 | Done | 2026-10-20 | `5fbbc9f` | `pnpm seed:validate`, Compose YAML parse, `pnpm lint`, `pnpm typecheck`, `pnpm test` (12 tests), contrast, spec-coverage, and formatting pass | Added local Postgres, Redis, MinIO, Mailpit and opt-in LiveKit, private buckets, and neutral fixtures. Docker is not installed here, so container startup was not exercised. |
| P0-06 | Done | 2026-10-20 | `c3cebe4` | API tests (7), full `pnpm lint`, `pnpm typecheck`, `pnpm test` (19), `pnpm build`, OpenAPI export and drift check, contrast, seed validation, spec coverage, and formatting pass | Added Nest API shell, PII-safe Pino logging, OpenTelemetry, guarded health, RFC 7807 filter, and deterministic OpenAPI export. |
| P0-07 | Done | 2026-10-20 | `fa3ce5c` | API tests (3), full `pnpm lint`, `pnpm typecheck`, `pnpm test` (22), `pnpm build`, OpenAPI export and drift check, contrast, seed validation, spec coverage, and formatting pass; both SQL migrations applied and rolled back on a temporary PostgreSQL database | Added fail-closed feature/compliance gate module, all gates default OFF, and reversible `compliance_gates` SQL migration. |
| P1-01 | Done | 2026-10-20 | `cbd47e3` | API migration schema test; migrations applied and rolled back on temporary PostgreSQL; audit UPDATE/DELETE/TRUNCATE rejected and duplicate chain successors rejected; full lint, typecheck, test (23), build, OpenAPI drift, contrast, seed, spec coverage, and formatting checks pass | Added users, roles, auth sessions, age checks, profiles, blocks, append-only hash-chained audit log, default-off feature flags, and outbox schema. UUIDv7 IDs are supplied by the app. |

## Blocked-External
| ID | Waiting on | Since |
|---|---|---|

## FIX queue (do before new work)
(none)

## Open questions for owner
1. Launch jurisdictions (default: Kenya only)
2. Age-assurance and KYC vendors
3. Video infrastructure vendor (default: LiveKit)
4. Payout threshold/schedule (default: KES 2,000 weekly)
5. Default commission (default: 20% platform / 80% creator)

## Gates status (all must read OFF in prod until approved)
AGE_PROVIDER_LIVE: OFF · RANDOM_VIDEO: OFF · CREATOR_MONETISATION: OFF · LIVE: OFF · PAYMENTS_LIVE: OFF · PRIVATE_SESSIONS: OFF · TIPS: OFF · GEO_*: OFF
