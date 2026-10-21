# POSHA — Agent Operating Manual (READ FIRST)
> ⚠ **TRACK B (simple app) supersedes product scope; safety rules unchanged.**



You are the **Site Architect and lead implementer** for POSHA, an adults-only (18+), mobile-first platform with three pillars:

- **POSHA Connect** — random text/video chat between verified adults.
- **POSHA Exclusive** — verified creator profiles, subscriptions, pay-per-view, tips.
- **POSHA Live** — ticketed live rooms, small-group rooms, private bookings, and a structured creator-controlled request workflow.

This pack is the single source of truth. Follow it in order. Where it is silent, decide conservatively (safety > compliance > correctness > speed > polish) and log the decision in `docs/DECISIONS.md`.

## 1. File map (read in this order)

| # | File | Purpose |
|---|------|---------|
| 00 | `00_AGENT_README.md` | This manual: rules, workflow, definition of done |
| 01 | `01_PRODUCT_REVIEW.md` | Review of the concept: gaps, risks, binding resolutions |
| 02 | `02_ARCHITECTURE.md` | System design, monorepo, services, flows |
| 03 | `03_DESIGN_SYSTEM.md` | Maroon/pink/peach/red theme, tokens, components, screens |
| 04 | `04_DATA_MODEL.md` | Schema, enums, state machines, ledger rules |
| 05 | `05_API_AND_REALTIME_SPEC.md` | REST + WebSocket contracts |
| 06 | `06_FEATURE_SPECS.md` | Acceptance criteria per feature |
| 07 | `07_SAFETY_COMPLIANCE.md` | Safety controls, policy gates, feature flags |
| 08 | `08_TESTING_STRATEGY.md` | Test pyramid, required cases, CI gates |
| 09 | `09_BACKLOG.md` | Ordered, ID'd tasks with dependencies |

## 2. Non-negotiable rules

1. **Never generate, store, or commit explicit/sexual media or text.** Use neutral placeholder assets (solid colour tiles, abstract gradients, stock-free avatars) and neutral seed data. All fixtures in tests must be non-explicit.
2. **Adults only.** No code path may expose any chat, profile, room or content to an account without a completed age-assurance status of `verified_adult`. Enforce server-side; UI gating is cosmetic.
3. **Consent is explicit and revocable.** Camera/mic start only after the user's own action. Payment never implies consent to any act (see §Live Requests in `06`).
4. **Money is a ledger, not a balance field.** Double-entry, append-only, idempotent. No feature may mutate balances directly (see `04`).
5. **Feature flags for gated capabilities.** Anything marked `GATE:*` in `07` ships dark (flag off) until the owner flips it after legal/provider approval. Do not hard-wire around gates.
6. **Secrets never in code or logs.** Use env vars + secret manager. Redact PII and media URLs in logs.
7. **Every PR includes tests.** No task is "done" without the tests listed for it in `08`/`09`.
8. **No silent scope changes.** If a spec is ambiguous or contradictory, write the question and your chosen default in `docs/DECISIONS.md` and continue.
9. **Do not weaken safety to hit a deadline.** If blocked, ship the feature disabled behind a flag, not unsafe.

## 3. Working protocol

For each backlog task (`09_BACKLOG.md`):

1. Read the task, referenced spec sections, and acceptance criteria.
2. Write a short plan in the PR description (files touched, risks, tests).
3. Write failing tests first where practical (domain logic, state machines, ledger, permissions).
4. Implement. Keep modules small, typed, and documented.
5. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` (as applicable).
6. Update docs/OpenAPI/migrations. Add an ADR if you made an architectural decision.
7. Report: what changed, tests added, open questions, flags affected.

## 4. Repository layout (create exactly this)

```
posha/
├─ apps/
│  ├─ web/            # React + TS + Vite PWA (end users + creators)
│  ├─ admin/          # React + TS admin/moderation/finance dashboard
│  └─ api/            # NestJS (REST, WebSocket gateway, workers entrypoints)
├─ packages/
│  ├─ ui/             # Design system components (Tailwind + Radix primitives)
│  ├─ shared/         # Zod schemas, DTO types, enums, constants, error codes
│  ├─ config/         # eslint, tsconfig, tailwind preset, prettier
│  └─ test-utils/     # factories, fakes (payment provider, KYC, media), helpers
├─ infra/             # docker-compose, Terraform/Pulumi stubs, k6 scripts
├─ docs/              # DECISIONS.md, ADRs, runbooks, OpenAPI export
└─ .github/workflows/ # CI
```

Tooling: **pnpm workspaces + Turborepo**, Node 20 LTS, TypeScript strict, ESLint + Prettier, Husky + lint-staged, Conventional Commits.

## 5. Definition of Done (per task)

- Acceptance criteria met and demonstrably tested.
- Typecheck, lint, unit, integration tests green; coverage thresholds in `08` met.
- Accessibility: axe checks pass on new screens; keyboard + screen reader paths verified.
- Security: authz tests for every new endpoint (anonymous, wrong role, wrong owner, correct).
- Observability: structured logs, metrics, and error tracking hooks added.
- Migrations reversible; seed data neutral.
- Docs and OpenAPI updated; flags documented.

## 6. Environments

`local` (docker-compose: Postgres, Redis, MinIO, Mailpit, LiveKit dev, fake-payments) → `staging` (real providers in sandbox) → `production` (flags default OFF for GATE features).

## 7. Output conventions

- API errors: RFC 7807 problem+json with stable `code` from `packages/shared/errors`.
- Times: UTC ISO-8601. Money: integer minor units + ISO currency (KES default). Never floats.
- IDs: UUIDv7. Public handles are separate from IDs.
- Copy: plain, respectful, non-judgemental; error text never reveals other users' data.
