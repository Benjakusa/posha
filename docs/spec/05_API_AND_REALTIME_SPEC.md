# 05 — API & Realtime Contracts

Base: `/api/v1`. JSON. Auth: `Authorization: Bearer <access JWT>` (15 min) + refresh via httpOnly cookie. All write endpoints accept `Idempotency-Key`. Errors: RFC 7807 `{type,title,status,code,detail,traceId}`. Pagination: cursor (`?cursor=&limit=`). OpenAPI generated from Nest decorators + Zod; published to `docs/openapi.json`; contract tests fail on drift.

**Guards (applied in order):** `AuthGuard` → `AccountStatusGuard` → `AgeLevelGuard(level)` → `RoleGuard` → `OwnershipPolicy` → `FeatureGate(key)` → `RateLimit(class)`.

## 1. Auth & account
`POST /auth/register` `POST /auth/otp/request` `POST /auth/otp/verify` `POST /auth/refresh` `POST /auth/logout` `POST /auth/2fa/enroll|verify`
`GET /me` `PATCH /me` `PATCH /me/preferences` `POST /me/data-export` `DELETE /me` (starts deletion workflow)
`GET /me/notification-preferences` `PATCH /me/notification-preferences` (owner only; safety/legal notices cannot be opted out of)

## 2. Age & KYC
`POST /age/start` → provider session URL · `POST /age/webhook` (provider) · `GET /age/status`
`POST /creators/apply` · `POST /creators/kyc/start` · `POST /creators/kyc/webhook` · `GET /creators/me`

## 3. Connect
REST: `GET /connect/prefs` `PUT /connect/prefs` `GET /connect/interests` `POST /blocks` `DELETE /blocks/:userId` `GET /blocks` `POST /connect/sessions/:sessionId/block` (partner resolved server-side)
Reports: `POST /reports {sessionId,reasonCode,details?,snapshotConsent}` with required `Idempotency-Key`; snapshot messages are captured only when the reporter explicitly consents.
**WS namespace `/connect`** uses Socket.IO with the access token in handshake auth. The gateway rejects inactive or below-L2 accounts before messages are handled and caps packets at 8 KB.
- Client→server: `heartbeat {}` `queue.join {mode:'text'|'video', interests[], lang, countryPref?}` `queue.leave {}`
- `chat.send {sessionId, body ≤ 1000, clientMsgId}` `chat.typing {sessionId}` `session.next {sessionId}` `session.leave {sessionId}`
- Server→client: `heartbeat.ack {at}` `queue.state {position?,estWaitSec?}` `queue.left {}` `chat.ack {clientMsgId}`
- Planned matchmaking/relay responses:
- `queue.join {mode,interests[],lang,countryPref?}` / `queue.state {position?,estWaitSec?}`
- `queue.leave`
- `match.found {sessionId, partner:{alias}, mode}`
- `chat.send {sessionId, body ≤ 1000, clientMsgId}` / `chat.message {id, from, body, ts}` / `chat.ack {clientMsgId}`
- `chat.typing {sessionId}`
- `session.next {sessionId}` `session.leave {sessionId}` / `session.ended {reason}`
- `video.consent {sessionId, accept}` / `video.ready {token, url}` (gated)
- `safety.warning {code}` (e.g. rate limit, filter hit)
All inbound event payloads are Zod-validated. Errors use `error {code, retryAfterMs?}` without exception details; codes include `AGE_LEVEL_REQUIRED`, `RATE_LIMITED`, `RATE_LIMIT_UNAVAILABLE`, `GATE_DISABLED`, `SESSION_NOT_FOUND`.

## 4. Discover & profiles
`GET /discover/creators?q=&lang=&cat=&price_max=` · `GET /creators/:handle` · `GET /creators/:handle/posts` (previews for non-entitled)

## 5. Creator studio (role creator, L3)
`POST /studio/media/upload-url` → pre-signed · `POST /studio/media/:id/complete`
`POST /studio/posts` `PATCH /studio/posts/:id` `DELETE /studio/posts/:id` `POST /studio/posts/:id/publish`
`GET|PUT /studio/plan` (subscription price) · `GET /studio/analytics?range=`
`GET /studio/earnings` `GET /studio/ledger` `POST /studio/payouts` `GET /studio/payouts`

## 6. Subscriptions, purchases, payments
`POST /subscriptions {creatorId, planId}` → checkout · `DELETE /subscriptions/:id` (cancel at period end) · `GET /subscriptions`
`POST /purchases/ppv {postId}` `POST /purchases/tip {creatorId, amountMinor}` (tip gated)
`POST /payments/:provider/webhook` (signature verified; no auth; IP allowlist where available)
`GET /payments/:id` · `GET /receipts` · `POST /refunds/request`
`GET /content/:mediaId/access` → short-lived signed URL (entitlement checked each call)

## 7. Live rooms
Public: `GET /live/rooms?status=now|upcoming&cat=` · `GET /live/rooms/:id`
Creator: `POST /studio/rooms` `PATCH /studio/rooms/:id` `POST /studio/rooms/:id/schedule` `POST /studio/rooms/:id/start` `POST /studio/rooms/:id/end` `POST /studio/rooms/:id/cancel` `PUT /studio/rooms/:id/request-menu`
Attendee: `POST /live/rooms/:id/tickets` → checkout · `GET /live/tickets` · `POST /live/rooms/:id/token` (ticket+state check) · `POST /live/tickets/:id/refund-request`
Moderation in room (creator): `POST /studio/rooms/:id/attendees/:ticketId/mute|kick|ban`
**WS namespace `/live`:**
- `room.join {roomId}` / `room.state {status, attendees, endsAt}`
- `room.chat.send {body}` / `room.chat.message`
- `request.submit {categoryCode?|freeText?}` / `request.updated {id,status,proposedPrice?}`
- (creator) `request.accept|decline|counter {id, price?}`
- (client) `request.confirm {id}` `request.cancel {id}`
- `room.ended {reason}` `room.kicked {reason}`
- `safety.report {…}` (also REST)

## 8. Moderation & admin (staff roles)
`GET /admin/reports?status=` `POST /admin/reports/:id/action` `POST /admin/reports/:id/escalate` `GET /admin/appeals` `POST /admin/appeals/:id/decide`
`GET /admin/users/:id` (redacted by default) `POST /admin/users/:id/reveal` (reason required → audit) `POST /admin/users/:id/suspend|ban|restore`
`GET /admin/creators/kyc` `POST /admin/creators/:id/kyc-decision`
`GET /admin/content/review` `POST /admin/content/:id/decision`
`GET /admin/payments` `POST /admin/payments/:id/refund` `GET /admin/reconciliation` `GET /admin/payouts` `POST /admin/payouts/:id/approve`
`GET|PUT /admin/commission-rules` · `GET|PUT /admin/flags` · `GET /admin/audit?filters` · `GET /admin/analytics/*`

## 9. Rate-limit classes (defaults)
auth 5/min/IP · otp 3/10min/identity · chat.send 5/sec/socket · queue.join 10/min · report 10/hr · checkout 10/min · webhook unlimited but signature-gated · admin 120/min.

## 10. Idempotency & webhooks
Store `(key, endpoint, user)` → response for 24 h. Webhook handler: verify HMAC → insert `webhook_events` (unique provider_event_id) → if new, enqueue processing → return 200 quickly. Processing is idempotent and posts ledger txns.
