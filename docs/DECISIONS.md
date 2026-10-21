# Decisions

## 2026-10-20 — Canonical spec location

The supplied spec pack was found in `files (2)/` rather than `docs/spec/`. It has been copied to `docs/spec/` to follow the operating manual's required location; the supplied originals are retained.

## 2026-10-20 — Empty monorepo workspace

P0-01 starts from a workspace containing only the spec pack and progress tracker, without an application repo or Git metadata. The workspace skeleton is initialized with empty strict TypeScript package entry points; feature implementation remains governed by `PROGRESS.md` and the backlog.

## 2026-10-20 — Money input precision

Human-entered money is parsed from plain decimal strings into integer minor units. Inputs with more fractional digits than the currency allows are rejected instead of rounded; commission rounding remains governed by the bankers-rounding rule in `06` PAY-05.

## 2026-10-20 — Infrastructure seed timing

P0-04 adds schema-versioned neutral profile fixtures and validates them, but does not create a parallel application table: the users/profiles schema belongs to P1-01. The Compose stack seeds only private local object-storage buckets until the database migrations define the corresponding seed adapter.

## 2026-10-20 — Local object storage image

The local Compose stack uses MinIO's Quay-hosted community image because its Docker Hub image repository is archived. It remains a development-only S3-compatible service; production storage selection is outside P0-04.

## 2026-10-20 — Generic HTTP problem codes

The API contract lists four domain error codes but also requires stable problem codes for generic HTTP failures. The shared package keeps all four listed codes unchanged and adds generic validation, authorization, not-found, conflict, HTTP, and server-error codes for the exception filter.

## 2026-10-20 — PostgreSQL migration runner

Use `node-pg-migrate` with reversible SQL migrations. The first migration creates and seeds the compliance gate registry as blocked; the identity and feature-flag schema remains in P1-01. Migration execution requires `DATABASE_URL` and is exposed through the API workspace scripts.

## 2026-10-20 — UUIDv7 generation

The application supplies UUIDv7 primary keys rather than relying on a database default. The local PostgreSQL target is version 16, so the schema does not assume a native UUIDv7 generator. Migration backfills use timestamp-based UUIDv7 values for existing compliance gate rows.

## 2026-10-20 — Authentication delivery and route ordering

OTP delivery uses an injected `OtpDeliveryProvider`; no SMS/email vendor is selected in the spec, so provider credentials and transport remain external. Auth routes are deferred until P1-03 provides the required policy guards. Refresh-token families have a 30-day absolute lifetime; access tokens keep the specified 15-minute lifetime.

## 2026-10-20 — Age re-verification and provider expiry

Starting age re-verification immediately returns the account to L0, and only the newest check may restore L2; late results from earlier checks cannot grant access. A passed provider result without a future expiry is rejected so age access cannot become indefinite. POSHA stores provider references and result metadata only, never raw identity documents.

## 2026-10-20 — Account deletion purge window

The deletion workflow soft-deletes and re-gates immediately, revokes active sessions, then queues PII erasure after a 30-day recovery window. The purge clears account and profile identifiers while retaining the deletion request and age-result metadata for their specified retention periods; future financial records are not modified by this purge.

## 2026-10-20 — Profile avatar ownership

Profile edits do not accept `avatarMediaId` until the media module can verify that the referenced media belongs to the current user. This avoids letting a profile mutation attach another account's media identifier.

## 2026-10-20 — Connect and moderation text at rest

Connect message bodies, report details/snapshots, and moderation reasons are stored as application-encrypted bytea. Report snapshots require explicit reporter consent; the API must cap them at the last 50 messages. Non-reported messages expire after seven days, while any separately preserved report evidence follows the legal-hold schedule.

## 2026-10-20 — Connect realtime transport

Use Socket.IO for the `/connect` namespace and install connection middleware for token, active-account, and L2 checks before event handlers run. Recheck account state and token on each event. Event contracts are strict Zod schemas; production rate limits and presence use Redis. Deployments with multiple API instances must install the Redis Socket.IO adapter with dedicated trusted Pub/Sub clients.

## 2026-10-20 — Connect matchmaking claims

Text queues are Redis sorted sets partitioned by mode and language. A Redis Lua claim removes both queue entries and reserves both users atomically before PostgreSQL session creation; failed session writes release and requeue the pair. PostgreSQL active-session checks prevent a re-match if Redis queue state is lost. A Next action stores a symmetric 24-hour skip and requeues only its initiator with their saved queue context.

## Connect chat message handling (P2-04)

Chat text is classified before relay and never written to logs. Allowed messages use AES-256-GCM field encryption with an injected 32-byte application key, and PostgreSQL stores only ciphertext with a seven-day expiry. Moderation records contain category/severity metadata and message references, not plaintext. Client message IDs are unique per sender for retry safety. An injected moderation provider keeps production classifiers replaceable; the deterministic keyword provider is for local development/tests. Three explicit-content flags within 24 hours escalate to urgent review.

## Connect reports and chat blocking (P2-05)

A chat report targets the session, resolves participant membership server-side, and stores details and any consented last-50-message snapshot with application encryption. Snapshot consent defaults to false and the UI checkbox starts unchecked. The idempotency key is scoped to the reporting user. Chat block actions address the session rather than exposing the partner's user ID; the server resolves the partner, persists the block, removes the initiator from queue, and ends a matching active session.

## Connect member UI behavior (P2-06)

The member flow uses the `/connect` Socket.IO namespace with the short-lived access token in handshake auth, and sends only text-mode queue requests. Video remains inaccessible while `GATE:RANDOM_VIDEO` is OFF. Queue state, match aliases, messages, safety warnings, and end events use the existing server contracts; session IDs stay private to the current client. The UI disconnects into a recoverable error state after transport loss instead of blindly reconnecting to a potentially ended session. Mobile actions remain visible in the chat header/footer, with no movement animation required.

## Random video consent and sampled-frame moderation (P3-02/P3-03)

Consent is persisted per session participant; video tokens are issued only when both participants have accepted and a video-frame classifier is configured. Browser camera/microphone access requires a separate user action after mutual consent. The client samples a low-resolution JPEG every three seconds only after permission, sends at most 4,800 decoded bytes per sample, and does not retain frame data. The server never writes frame bytes to storage; high-confidence classifier results create a durable account/session moderation flag containing category, confidence, and classifier version, then end the call. Missing or failed classifier/storage dependencies close the call and fail closed. The classifier integration defaults unavailable and `GATE:RANDOM_VIDEO` stays OFF.

## 2026-10-21 — Guest access and adult declaration

The owner confirmed that guest text-chat users must pass server-side L2 age assurance and that an 18+ acknowledgement should open the guest homepage without OTP. The acknowledgement does not authorize chat. Guest sessions need a server-issued identity so Connect can enforce age, account state, rate limits, reports, and blocks; no guest auth/API exists yet, so guest chat remains unavailable until that is implemented. Random video remains unavailable while `GATE:RANDOM_VIDEO` is OFF and its prerequisites are unmet. OTP entry is exposed as creator sign-in; creator-only registration still needs creator-onboarding work.

The owner has since described the 18+ click as the adult verification itself. This acknowledgement remains sufficient to open the guest homepage, but the binding safety spec still requires server-side L2 age assurance for random chat; this request does not alter that authorization rule. The guest homepage has been restyled to show chat and video availability clearly.

The owner requests that strangers be able to use chats and videos. Keep the current guest chat lock until guest sessions can complete server-side L2 assurance. Keep random video locked while `GATE:RANDOM_VIDEO` is OFF; an 18+ acknowledgement cannot satisfy the classifier, moderation staffing, legal sign-off, and abuse-runbook prerequisites. The safe implementation path is OTP-free guest sessions with L2-gated text chat; video stays unavailable pending gate approval.


## 2026-10-21 — Track B: Simple app decisions

**Video transport.** Use browser WebRTC (RTCPeerConnection) peer-to-peer with signalling over the existing Socket.IO `/connect` namespace, with STUN/TURN from env (`ICE_SERVERS_JSON`). This removes the LiveKit dependency blocker. Keep the SFU token code but do not require it; `livekit-client` stays absent.

**Follower.** A follower = a user with at least 1 active paid subscription to any creator. Guest video cap = `GUEST_VIDEO_MAX_SECONDS=120`; follower cap = `FOLLOWER_VIDEO_MAX_SECONDS=1800`.

**Payments.** Payments sit behind a `PaymentProvider` interface. Ship a `FakeProvider` (dev/test, "Simulate payment") and an M-Pesa (Daraja STK Push) sandbox adapter selected by env. Entitlements are granted ONLY from a verified, idempotent provider callback; the browser "success" screen never grants access.

**Animations.** Use `motion` (Framer Motion, import from `motion/react`) if it installs; if the registry is unreachable, fall back to CSS keyframes + IntersectionObserver. Do not block on this.

**Storage.** Add `STORAGE_DRIVER=memory|postgres`. Default `memory` so the app runs with zero Docker; Postgres migrations must still exist and stay reversible.`

