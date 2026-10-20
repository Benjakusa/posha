# 02 — System Architecture

## 1. Principles
Modular monolith first (NestJS modules with strict boundaries), extractable services later. Realtime and media isolated from the request/response API. Everything permission-checked server-side. Provider abstractions for anything regulated or vendor-specific.

## 2. High-level diagram

```
 Mobile web PWA (apps/web)        Admin (apps/admin)
        │  HTTPS / WSS                  │ HTTPS
        ▼                               ▼
 ┌─────────────── Edge: CDN + WAF + rate limiting ───────────────┐
 │                                                                │
 │  API (NestJS)  ── modules: auth, age, users, profiles, creators│
 │   REST + OpenAPI   content, subscriptions, payments, ledger,   │
 │                    live, requests, moderation, admin, notify   │
 │  Realtime gateway (WebSocket, same codebase, separate process) │
 │   matching, chat, presence, live-room chat, request events     │
 │  Workers (BullMQ): billing, payouts, notifications, moderation │
 │   media-processing, retention/cleanup, reconciliation          │
 └──────┬───────────┬──────────────┬───────────────┬──────────────┘
        │           │              │               │
   PostgreSQL     Redis      Object storage     Media server (SFU)
   (system of    (presence,   (private bucket    LiveKit + TURN
    record)       queues,     + signed URLs)     (video, live rooms)
                  rate limit)
        │
   Provider adapters: AgeAssurance, KYC, Payment, Payout, Moderation(AI), Email/SMS/Push
```

## 3. Backend modules (apps/api/src/modules)

| Module | Responsibility |
|---|---|
| `auth` | Email/phone + OTP, passkeys optional, sessions (short JWT + rotating refresh), device mgmt, 2FA for creators/staff |
| `age` | Age-assurance state machine, provider adapter, level gating guard |
| `users` | Accounts, pseudonymous chat identity, preferences, deletion/export |
| `profiles` | Public profile, creator profile |
| `connect` | Matching queues, sessions, skip/block memory, chat messages, interests |
| `creators` | Creator onboarding, KYC state, studio |
| `content` | Posts, media upload, processing, access levels, signed delivery, watermark |
| `subscriptions` | Plans, memberships, renewals, cancellations |
| `payments` | Provider adapters, checkout, webhooks, idempotency |
| `ledger` | Double-entry ledger, balances (derived), commission engine |
| `payouts` | Eligibility, batches, reconciliation |
| `live` | Rooms, tickets, capacity, lifecycle, SFU tokens |
| `requests` | Request menu, request workflow state machine, add-on charges |
| `moderation` | Reports, cases, actions, appeals, classifier intake |
| `safety` | Blocklists, rate/abuse heuristics, hash-match adapter, evidence vault |
| `admin` | Staff RBAC APIs, audit log, config, analytics |
| `notify` | Email/SMS/push templates, preferences |
| `flags` | Feature flags + compliance gates |

Rules: modules talk via exported services/DTOs only; no cross-module repository access; emit domain events (`EventEmitter2` → outbox table) for side effects.

## 4. Key flows

### 4.1 Random text chat
1. Client opens WSS with access token → gateway validates, checks `age_level >= L2` (or L1 if flag allows text-only pilot).
2. `connect.join_queue {mode:'text', interests[], lang, country_pref}` → Redis sorted-set queue per `(mode, lang)`.
3. Matcher worker (tick 250 ms): pops candidates, rejects pairs where **either** user blocked/skipped the other in the last 24h (Redis set `skip:{u}` with TTL; Postgres `blocks` permanent), prefers interest overlap, creates `connect_sessions` row + room, emits `match.found` to both.
4. Messages relayed via gateway; rate-limited; text moderated (keyword/ML hook, async); persisted only to the extent policy allows (see `07` retention).
5. `next`/`leave`/`report`/`block` end session; stale sessions reaped by heartbeat timeout (15 s).

### 4.2 Random video (GATE:RANDOM_VIDEO)
Same matching; after `match.found` both must send `video.consent {accept:true}`; then API issues SFU/P2P tokens. Remote video starts **blurred** until both accepted. Frame-sampling classifier (see `07`). Instant "Leave" always visible.

### 4.3 Live room
1. Creator (L3 verified, `GATE:LIVE`) creates room (`draft → scheduled → live → ended`/`cancelled`).
2. Client buys ticket → `payments.checkout` → webhook confirms → ledger entry → `live_tickets` row `active` → attendee can request SFU token.
3. Token issuance checks: ticket active, room live, attendee not banned, age L2+.
4. Requests panel via WS (`06`). Creator controls: accept/decline/counter, mute/kick/ban, end room.
5. Room end → settle: ticket revenue earned, pending requests cancelled/refunded per rules, creator earnings ledger posted.

### 4.4 Payments (all providers)
`create checkout (idempotency key) → provider redirect/STK push → webhook (signature verified, deduped by provider_event_id) → payments.status=succeeded → ledger posting in one DB transaction → domain event → entitlement granted`. A client "success" redirect never grants entitlement; only the verified webhook (or server-side poll) does.

### 4.5 Content delivery
Upload (pre-signed to quarantine bucket) → worker: virus scan, transcode, thumbnail, hash-match, classifier, watermark profile → moderation queue (creators below trust tier) → published. Delivery uses signed URLs (TTL ≤ 5 min) generated only after entitlement check; video via HLS with tokenised segment paths.

## 5. Realtime design
- Socket.IO or native `ws` with Redis adapter; namespaces: `/connect`, `/live`, `/notify`.
- All events validated with Zod schemas from `packages/shared`.
- Backpressure: per-socket rate limit, max payload 8 KB, drop + warn on flood, auto-ban heuristics.
- Presence in Redis with TTL heartbeats.
- Socket.IO rooms use `RedisConnectIoAdapter` with dedicated, private Pub/Sub clients when the gateway is deployed across multiple API instances.
- Horizontal scale: sticky sessions not required (Redis adapter); matcher is a leader-elected worker.

## 6. Security architecture
- OWASP ASVS L2 target. CSP strict, HSTS, SameSite cookies, CSRF for cookie flows.
- AuthZ: policy layer (CASL or equivalent) with role + ownership + level + flag checks; deny by default.
- PII encryption at rest (field-level for ID docs refs), KMS-managed keys, ID documents held by provider where possible (store only provider reference + result).
- Admin: SSO/2FA mandatory, IP allowlist optional, just-in-time elevated access with reason + audit.
- Audit log: append-only, hash-chained rows, export to cold storage.
- Rate limits: per IP, per account, per endpoint class; stricter on auth, report, payment.
- Webhooks: HMAC verification, replay window, idempotent handlers.

## 7. Observability
OpenTelemetry traces, structured JSON logs (PII redacted), Prometheus metrics, Sentry. Dashboards: match latency, queue depth, WS connections, payment success/failure, webhook lag, payout accuracy, reports per 1,000 sessions, classifier flags.

## 8. Performance targets (initial)
- API p95 < 300 ms; WS message latency p95 < 150 ms.
- Time to first match p50 < 5 s with ≥ 200 concurrent queued users (synthetic).
- PWA: LCP < 2.5 s on mid-range Android over 4G; initial JS < 200 KB gz for Home.

## 9. Deployment
Docker images; Postgres managed with PITR; Redis managed; object storage with lifecycle rules; blue/green API; SFU deployed in region closest to launch market. Infra as code in `infra/`. Feature flags default OFF in production for all `GATE:*`.

## 10. Frontend architecture (apps/web)
- React 18, TypeScript, Vite, React Router, TanStack Query, Zustand for ephemeral realtime state, React Hook Form + Zod.
- PWA: service worker (Workbox), installable, offline shell, push notifications.
- Feature folders: `features/{connect,discover,live,chats,profile,creator,auth,age,payments}`; shared UI from `packages/ui`.
- i18n-ready (en, sw first); RTL-safe CSS logical properties.
- Mobile-first: 360×640 baseline, safe-area insets, bottom tab bar, thumb-zone primary actions.
