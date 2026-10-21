# POSHA — Simple App Build Prompt (Track B)

> This is the new product scope for the **simple, beautiful, fully animated dating-style web app** (mobile-first PWA). It supersedes the product scope in `docs/spec/` wherever they conflict. It does **not** supersede the safety rules in §3. Work in numbered stages; finish and verify each before moving on.

---

## 1. What the owner wants (product, plain terms)

1. **Age gate (guests).** A visitor ticks/slides to confirm "I am 18 or older" and enters as a **guest**. No sign-up, no OTP, no ID.
2. **Home page**: **Top bar** — logo (left); right side: **settings** icon, **profile** icon (creator area), **light/dark mode toggle** icon. **Hero banner** — tagline + pitch + animated hearts/glow. **Two big action cards** — **Chat with strangers** (text) and **Video chat with strangers**. **Creator content below** — (a) **Planned live videos** (cards with countdown), (b) **Uploaded videos** (grid) that are **blacked out** (solid black tile + lock) until the viewer **subscribes to that creator by paying**; subscribed viewers can play them.
3. **Video chat limit.** Guests get **max 2 minutes** per video chat. Anyone with an **active paid subscription to any creator** ("follower") can video chat **longer than 2 minutes** (default cap 30 min, configurable).
4. **Profile section = creator section.** Opens with a **banner + a "Become a creator" button**; after sign-up it becomes the creator studio (upload videos, schedule live sessions, see subscribers/earnings).
5. **UI feel:** a **dating-site / love-app** look with **light and dark modes**. **Every page animated** (floating hearts, soft gradients, springy cards, pulsing Live badge, animated transitions, micro-interactions), while respecting `prefers-reduced-motion`.
6. Keep the warm theme: **maroon, pink, peach, red** (`packages/config/src/tokens.json`).

---

## 2. Repo review (facts you must know before touching code)

**Stack:** pnpm 10 + Turborepo, Node 20.19–22, TS strict. `apps/web` (React 19, Vite 7, socket.io-client, plain CSS, Vitest + axe), `apps/api` (NestJS + Socket.IO + Pino/OTel), `apps/admin` (React), `packages/{ui,shared,config,test-utils}`, `infra/`. Gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format:check`, `node scripts/check-spec-coverage.mjs`.

**Good to reuse:** ember tokens; `packages/ui` primitives (Button, IconButton, Input, Chip, Badge, Avatar, Switch, Select, Checkbox, EmptyState, ErrorState) with axe/contrast tests; auth core (OTP + JWT + refresh rotation); age-assurance module; users/profile/blocks/export/deletion; guards/policy layer; feature-gate module (all OFF); notifications module; **Connect**; web `ConnectPage.tsx`; **video groundwork**. Memory stores for Connect run without Docker.

**Gaps to fix:**
1. **`AppModule` only mounts `HealthController` + flags.** Auth, Age, Users, Connect, Notifications modules exist but are **not mounted**.
2. **Sign-in is OTP-first, age-provider-first.** No guest entry and no "I am 18" gate. OTP delivery has **no provider**.
3. **Home is a placeholder** ("Welcome to POSHA" + one card). No logo image, no hero, no creator feed. `Discover`, `Live`, `Chats` are `SimpleTabPage` stubs.
4. **No theme toggle.** `.ember-theme[data-theme='light']` exists but nothing sets it; dark only. CSS hard-codes dark-leaning values (e.g. `.welcome-card` gradient to `maroon-950`).
5. **No animation** beyond a few CSS transitions. No motion library, no hearts, no page transitions.
6. **No creators, videos, lives, subscriptions, payments, ledger, uploads** (spec Phase 4/5 not started).
7. **Video:** gated OFF; consent handshake required; **no real media transport** (`livekit-client` never installed); **no 2-minute timer**, no follower logic.
8. Connect requires `ageLevel L2/L3`, which guests will not have.
9. Spec ordering/phase model is heavy (6 phases, many gates). Work in the **stages below**, tracked as **"Track B"** in `PROGRESS.md`.

---

## 3. Non-negotiable rules (keep these every stage)

1. **No explicit/sexual media or text anywhere in code, seeds, tests, or fixtures.** Seed videos/thumbnails are generated colour-bar/gradient placeholders.
2. **Black-out is enforced on the server, not with CSS.** A locked video's bytes, poster frame, and real thumbnail must **never** be sent to a non-entitled client. Locked tiles use a server-generated plain black placeholder.
3. **The 2-minute limit is enforced on the server** (session timer + ending the session + rejecting new signalling), not only by a client countdown. The client countdown is cosmetic.
4. **Money:** integer minor units (KES cents), append-only ledger, idempotency keys, webhook signature verification, no mutable balance fields.
5. **Connect is non-explicit by policy.** Show a short rules notice before chatting. Keep **Report, Block, Leave/Next** always reachable (≤ 1 tap). Keep moderation hooks, rate limits, and frame-sampling hook on video.
6. **Guest tier = self-declared 18+ only**, so guests can access **Connect and locked previews only**. Anything creator-related that earns money requires an **account + identity/age verification through the existing `age` module (fake provider until the owner picks a vendor)**. Creator uploads go through a **review state** (`pending → approved`) before appearing in the feed.
7. Deny-by-default authorization on every new endpoint; tests for anonymous / guest / follower / wrong-owner / creator / admin.
8. No secrets in code or logs; PII redacted (existing Pino config).
9. **All `GATE:*` flags stay OFF in production config.** May enable them in `local`/`test` env files only. If a stage needs a new gate (e.g. `GATE:GUEST_ACCESS`, `GATE:CREATOR_MONETISATION`), add it OFF-by-default with a documented env override.
10. Accessibility: WCAG 2.2 AA, 44 px touch targets, visible focus, `prefers-reduced-motion` respected, no flashing > 3 Hz. Contrast check must pass in **both** themes.
11. Never delete or skip a test to go green. Fix root cause.


### STAGE 1 — Make the backend actually run

**Goal:** the API serves real routes without Docker; web can call them.

- B-S1-01: Mount AuthModule, AgeModule, UsersModule, ConnectModule, NotificationsModule, PolicyModule in AppModule. Add CORS for web origin (env WEB_ORIGIN) and /api/v1 prefix parity; add a Vite dev proxy (/api and /socket.io → API) so VITE_API_BASE_URL is optional in dev.
- B-S1-02: Add STORAGE_DRIVER=memory|postgres and in-memory implementations for stores that only have a Postgres version (auth, age, users, notifications) so everything boots with no DB. Keep Postgres stores and migrations working.
- B-S1-03: Dev OTP delivery: a ConsoleNotificationProvider (dev only, fails closed in production) + optional SMTP-to-Mailpit provider. Production still requires an owner-chosen provider (document).
- B-S1-04: Update .env.example with every new variable (STORAGE_DRIVER, WEB_ORIGIN, ICE_SERVERS_JSON, GUEST_VIDEO_MAX_SECONDS, FOLLOWER_VIDEO_MAX_SECONDS, payment vars, upload dir). No real secrets.
- B-S1-05: OpenAPI export updated; drift check passes.

**Tests:** Supertest boot test hitting health + one route per mounted module; existing suites stay green.

**Acceptance:** start:dev works with only Node; POST /api/v1/auth/otp/request and GET /api/v1/age/status respond correctly; Socket.IO /connect accepts an authenticated socket.



### STAGE 2 — Design foundation: love-app theme, light/dark, motion system

**Goal:** every later page uses one animated, themeable design system.

- B-S2-01: **Theme system:** ThemeProvider sets `data-theme="light|dark"` on `<html>`, persisted in localStorage (`posha:theme`), default from `prefers-color-scheme`, no flash on load (inline script in index.html). Move all hard-coded colours in apps/web/src/styles.css to CSS variables so both themes look intentional. Light = cream/peach/pink with maroon text; dark = maroon-950 base with pink/peach glow.
- B-S2-02: **Dating look:** soft gradients, 20–28 px radii, glassmorphism cards, pill buttons, subtle glow, rounded avatars with gradient ring, heart icon set (inline SVG components in packages/ui: Heart, HeartBeat, Chat, Video, Lock, Sun, Moon, Gear, User, Crown, Sparkle, Play, Calendar, Bell).
- B-S2-03: **Motion kit** (packages/ui/src/motion/): FloatingHearts, PageTransition, Reveal, SpringCard, PulseBadge, Countdown, Shimmer, HeartBurst, GradientBackdrop. All honour prefers-reduced-motion via a single useMotionPreference() hook.
- B-S2-04: Add GradientButton, GlassCard, IconToggle, SectionHeader, ToastHost to packages/ui with Storybook stories (light + dark) and axe tests.
- B-S2-05: Contrast checker extended to light + dark pairs; CI fails on regressions.

**Tests:** component + axe tests for each new component in both themes; motion hook test; theme persistence test.

**Acceptance:** Storybook builds; demo route shows hearts, toggle, cards in both themes; contrast passes.



### STAGE 3 — Guest age gate and entry flow

**Goal:** "I am 18+" → guest → home. No OTP for guests.

- B-S3-01: **API:** POST /api/v1/guest/session → issues a **guest JWT** (role guest, level G1 self-declared 18+, 4 h TTL, random alias, no PII), stores declaration timestamp + IP-hash + UA-hash; rate-limited; rejects ageDeclaration !== true. Add guest to policy layer; add GATE:GUEST_ACCESS (OFF in prod; ON in local/test).
- B-S3-02: Relax guards so guests may use **Connect** (text and video) and read the public catalogue; guests **cannot** access creator/studio/payout/admin routes. Update connect.gateway.ts age check to accept G1+ for guests.
- B-S3-03: **Web age gate page (/):** full-screen animated entry (floating hearts, gradient backdrop, big logo). "Adults only · 18+", slide-to-confirm (or checkbox + button) "I am 18 or older", links to Terms/Safety rules, "Leave" button. On confirm: create guest session, heart-burst transition, route to /home.
- B-S3-04: Remove OTP-first welcome from default path. Keep /auth/* for members/creators.
- B-S3-05: Route guard rewrite: RequireGuestOrMember for /home, /connect; RequireMember for subscribe/profile settings; RequireCreator for /studio.

**Tests:** guest session API (valid, missing declaration, rate limit, expired token); guard matrix; web: gate blocks home until confirmed, returning guest skips, axe both themes; reduced-motion.

**Acceptance:** fresh browser → gate → confirm → home loads as guest; direct /home without declaration redirects to gate.

### STAGE 4 — Home page, fully animated (with real seeded catalogue)

**Goal:** home page exactly as in §1.2.

- B-S4-01: **Catalogue API** (new catalog module; memory+Postgres stores; reversible migration; neutral seed data: 8 creators, 12 videos, 5 planned lives): GET /api/v1/catalog/home → { lives, videos } where each video carries locked, priceMinor, creator, durationSec, and **a thumbnail URL only if the viewer is entitled** (else a server-generated black placeholder URL). Guests are never entitled.
- B-S4-02: **Header:** logo wordmark (left); right side: **settings** (gear → /settings), **profile** (user icon → /profile), **theme toggle**. Sticky, glass blur, safe-area aware, tooltips + aria-labels.
- B-S4-03: **Hero banner:** animated gradient with floating hearts; headline; two CTAs (Chat now / Video chat). Staggered text reveal, parallax hearts, breathing CTA glow.
- B-S4-04: **Action cards:** "Chat with strangers" (always available) and "Video chat with strangers" (badge "Guests: 2 min · Followers: longer"). Spring hover/tap, icon animation, live "people online" pulse.
- B-S4-05: **Creator content:** "Live soon" horizontal snap carousel of planned live cards (countdown, pulsing LIVE badge when started, "Subscribe to join"); "Latest videos" responsive grid of video tiles. Locked tile = solid black with animated lock, creator name, price chip, "Subscribe KSh X to watch" button. Skeleton shimmer while loading; empty/error states.
- B-S4-06: Bottom nav (Home, Discover, Live, Chats, Profile) restyled to love-app look with animated active indicator; hide on chat/video screens.
- B-S4-07: Page transitions on all routes; every page gets background + reveal animations.

**Tests:** catalogue API authz + locked-asset test; home render tests (guest) incl. axe light/dark; snapshot of locked tile; reduced-motion; Lighthouse CI budget.

**STOP for owner visual review after this stage** (post screenshots).



### STAGE 5 — Chat with strangers (text), guest-ready and polished

- B-S5-01: Rework ConnectPage visuals: animated "finding someone" screen (pulsing hearts radar), match-found burst, chat bubbles with spring entry, typing indicator, soft gradient chat background per theme, sticky composer, big Next.
- B-S5-02: Pre-chat rules sheet (non-explicit rules, report/block mention) shown once per session; interest chips (optional).
- B-S5-03: Ensure guests can match with guests and members; alias-only, no PII leakage (existing contract test extended to guest tokens).
- B-S5-04: Rate limits and moderation hooks verified for guest tokens; flood → mute.

**Tests:** extend gateway/matchmaker tests for guest principal; web journey (two sockets) for match, message, next, report, block; axe light/dark; reduced-motion.

**Acceptance:** two browsers as guests chat in real time through the mounted API.

### STAGE 6 — Video chat with strangers + 2-minute guest limit

- B-S6-01: **Entitlement policy:** VideoPolicyService.maxSeconds(principal) → guest 120, follower (EntitlementService.isFollower(userId)) FOLLOWER_VIDEO_MAX_SECONDS.
- B-S6-02: **Signalling:** extend /connect with rtc.offer, rtc.answer, rtc.ice events (Zod-validated, size-limited, only between the two matched participants, only after mutual consent). Keep consent handshake; short, animated prompt ("Both of you must say yes to start video").
- B-S6-03: **Client WebRTC:** getUserMedia after user tap; RTCPeerConnection with ICE_SERVERS_JSON; remote video blurred until both consented; mute/camera/Next/Leave/Report always visible; reconnect attempt ≤ 10 s then end cleanly; self-view PiP.
- B-S6-04: **Server-enforced timer:** on mutual consent the server records videoStartedAt and schedules an end at maxSeconds; at expiry it emits video.limit_reached, closes signalling for that session, ends the call. Warn at T-15 s. Timer survives gateway restart (derived from stored videoStartedAt).
- B-S6-05: **Client UX:** circular countdown ring + "Guests get 2 min · Subscribe to a creator to chat longer", animated upgrade sheet at limit (CTA → subscribe discovery). Next match resets the timer.
- B-S6-06: Keep frame-sampling moderation active on video; auto-end on high-confidence violation; reporting works mid-call.

**Tests:** timer unit tests with fake clock (limit, warning, restart recovery, late signalling rejected, follower longer cap with stubbed entitlement), signalling authz, web tests with mocked RTCPeerConnection, Playwright with fake media devices.

**Acceptance:** two guests video chat; call ends at the configured limit with upgrade sheet; server rejects continued signalling.


### STAGE 7 — Subscriptions, payments, followers

- B-S7-01: **Migrations/modules:** payments, webhook_events (unique provider_event_id), subscriptions, ledger_txns/ledger_entries (append-only trigger, balanced txns), commission_rules (default 20%). Reversible. Memory + Postgres stores.
- B-S7-02: **PaymentProvider interface** + FakeProvider + MpesaDarajaProvider (STK push to sandbox; callback signature/IP checks; secrets via env; disabled unless configured). Idempotent checkout (Idempotency-Key).
- B-S7-03: **Subscribe flow API:** POST /api/v1/subscriptions {creatorId} → checkout; provider callback → verify → mark payment succeeded, activate subscription (30 days), post ledger (gross, creator net 80%, platform 20%) — **in one DB transaction**. Duplicate/forged/out-of-order callbacks are no-ops/rejected.
- B-S7-04: **Guest → member upgrade inside subscribe flow:** animated bottom sheet: phone/email → OTP (dev console provider) → continue to pay.
- B-S7-05: **Entitlements:** EntitlementService.isEntitled(userId, creatorId) and isFollower(userId). Hook into catalogue (unlock thumbnails/streams for subscribed creators) and VideoPolicyService (lifts 2-minute cap).
- B-S7-06: UI: SubscribeSheet (creator card, price, what you get, M-Pesa phone field or "Simulate payment" in dev), payment pending animation (polling), success celebration (hearts burst), failure/retry, receipts at /profile/subscriptions, cancel (access until period end). Follower badge on profile.
- B-S7-07: Renewal/expiry worker with 3-day grace; expired subscriptions re-lock content and re-apply the 2-minute cap.

**Tests:** property tests (creator+platform==gross, rounding), idempotency, forged webhook, replay, concurrency (parallel callbacks → one activation), entitlement matrix, web flow with FakeProvider, DB append-only trigger test.

**Acceptance:** guest taps locked video → signs up → pays (fake) → video unlocks and video chat cap rises; after cancellation/expiry both revert.

### STAGE 8 — Profile = creator section (banner + signup + studio shell)

- B-S8-01: **Profile page (non-creator):** top **banner** (animated gradient, "Share your world. Earn from your fans.") + **"Become a creator"** button; below member's own info (alias, subscriptions, follower badge, settings links). Guests see banner + "Create an account to continue" sheet.
- B-S8-02: **Creator signup wizard** (animated stepper): account (existing OTP) → **identity & 18+ verification via age module and FakeAgeProvider** → display name, handle, bio, avatar, subscription price (min configured) → creator rules & content policy acceptance → submit. Creator status pending → approved (admin action; for local, a dev approve endpoint behind env).
- B-S8-03: **Creator profile page** (public, /c/:handle): banner, avatar, bio, price, follow/subscribe button, their videos (locked/unlocked), upcoming lives.
- B-S8-04: **Studio shell** (/studio, creator only): dashboard (subscribers, earnings from ledger, pending review), nav to Uploads and Schedule.
- B-S8-05: RequireCreator guard + authorization tests; creators cannot access others' studio data.

**Tests:** wizard state machine tests, authz matrix (guest/member/creator/other creator/admin), web journey with fake age provider, axe both themes.

**Acceptance:** member → Become a creator → approved → sees studio and public profile.




### STAGE 9 — Creator content: uploads, locked playback, planned lives

- B-S9-01: **Upload pipeline:** POST /studio/videos/upload-url → local-disk driver in dev (./.data/uploads, gitignored) / S3-compatible (MinIO) in staging; client-side progress UI; size/type limits; virus-scan hook (interface + fake); server computes hash; status uploaded → processing → pending_review → approved|rejected; creator must tick consent/rights attestation per upload; only approved videos appear in the feed. Thumbnails: creator-chosen poster stored privately; **public feed uses the black placeholder for locked viewers**.
- B-S9-02: **Streaming endpoint** GET /api/v1/media/:id/stream (HTTP range support) → **403 unless viewer is entitled or is the creator/admin**; short-lived signed URL (≤ 5 min) for entitled viewers; signed URL bound to user. **Dynamic watermark overlay** (viewer alias + time) on the player.
- B-S9-03: **Player UI:** animated modal player for entitled viewers; locked tile → subscribe sheet; creator can preview own videos.
- B-S9-04: **Planned lives:** creator schedules a live (title, time, description); catalogue shows countdown; push/email "starts soon" notification to subscribers; at start time the card shows pulsing LIVE with **"Join"** for subscribers. Actual live broadcasting out of scope; Join screen shows clearly labelled "Live streaming arrives soon" state. Do not fake a stream.
- B-S9-05: Admin review queue for pending videos (approve/reject with reason, audit-logged) in apps/admin; moderation provider hook invoked on upload.
- B-S9-06: Replace seed-only catalogue data with real data paths; keep a seed script for demos (neutral placeholders only).

**Tests (mandatory locked-content tests):** non-subscriber, expired subscriber, wrong creator → 403 and no bytes; signed URL expiry/reuse; range requests; upload validation; review gating (pending never visible); IDOR on studio endpoints; watermark presence.

**Acceptance:** creator uploads → admin approves → appears **black/locked** for guests → subscriber can play; creator schedules a live → countdown shows on home.




### STAGE 10 — Polish, QA, hardening, handover

- B-S10-01: **Animation audit:** every page has entry + background animation; transitions consistent; hearts capped by device capability; prefers-reduced-motion and a manual "Reduce motion" switch in Settings; battery-friendly (pause when hidden).
- B-S10-02: **Settings page:** theme (light/dark/system), reduce motion, language (en/sw scaffold), notification prefs, privacy/export/delete, sign out, safety & help links.
- B-S10-03: **A11y & responsive:** axe on all routes both themes; keyboard paths; 360×640, 390×844, tablet, desktop layouts; safe-area insets.
- B-S10-04: **E2E (Playwright, mobile viewports):** (1) gate → home guest; (2) guest text chat between two contexts; (3) guest video limit ends at configured seconds; (4) tap locked video → upgrade → fake pay → play → video limit lifted; (5) become creator → approve → upload → approve → locked for guest → playable for subscriber; (6) light/dark toggle persists; (7) report + block.
- B-S10-05: **Security pass:** authz matrix across all new endpoints, webhook forgery/replay, signed-URL tamper, CSRF/CORS review, rate limits, dependency audit, secret scan; production config has gates OFF and fake providers disabled.
- B-S10-06: **Performance:** LCP < 2.5 s home (guest, 4G), initial JS budget, lazy-load studio/admin routes, image/video lazy loading.
- B-S10-07: **Docs:** update README.md with a 5-minute "run the simple app" guide (zero Docker), env reference, demo accounts/seed, payment sandbox setup, deployment notes; update PROGRESS.md; list owner decisions still needed (OTP provider, age/KYC vendor, payment provider approval, TURN server, moderation vendor, launch countries, commission/price defaults).

**Acceptance:** all gates + e2e green; Track B complete; handover notes written.
