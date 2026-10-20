# 07 — Safety, Compliance & Policy Gates

This file is binding. **This pack is engineering guidance, not legal advice; the owner must obtain qualified counsel for Kenya and any other served jurisdiction before enabling any GATE.** Where applicable law is unclear, default to the more protective behaviour.

## 1. Compliance gates (feature flags that cannot be enabled without recorded approval)

| Gate key | Unlocks | Prerequisites (evidence stored in `compliance_gates`) |
|---|---|---|
| `GATE:AGE_PROVIDER_LIVE` | Real age assurance | Vendor contract, DPIA, privacy notice |
| `GATE:RANDOM_VIDEO` | Random video | Classifier + moderation staffing + legal sign-off + abuse runbook tested |
| `GATE:CREATOR_MONETISATION` | Paid content, subscriptions | KYC vendor live, payment-provider approval in writing, ToS/Content policy approved |
| `GATE:LIVE` | Live Rooms | All of above + live moderation coverage + request-filter tuned |
| `GATE:PAYMENTS_LIVE` | Real money | Provider approval for the business model, reconciliation tested in staging |
| `GATE:PRIVATE_SESSIONS` | Private bookings | Legal review of consent/terms |
| `GATE:TIPS` | Tipping | Provider + tax review |
| `GATE:GEO_<CC>` | Each country | Local legal review |

All gates default **blocked**. CI test asserts production config ships with all gates off.

## 2. Required age/KYC level per capability

| Capability | Level |
|---|---|
| Browse landing/legal pages | L0 |
| Random text chat | L2 |
| Random video | L2 (+gate) |
| View creator previews | L2 |
| Subscribe, buy tickets, tips | L2 |
| Publish, host rooms, receive payouts | L3 |
| Appear as co-performer in any content | L3 (identity + age verified, recorded consent) |

Re-verification: on provider expiry, risk signals (e.g. suspected minor), or payout-detail change.

## 3. Content & conduct policy (summary — full text authored with counsel)
**Prohibited everywhere:** anything involving minors or appearing to; non-consensual content/acts; coercion/exploitation/trafficking; revenge/intimate-image abuse; illegal acts; violence/hate; impersonation; doxxing; content the uploader lacks rights to distribute; solicitation outside platform rules.
**Connect:** non-explicit only.
**Exclusive/Live:** adult content permitted only for verified creators, behind access controls, within the published content policy and applicable law.
**Requests:** only creator-accepted, policy-permitted requests proceed; payment ≠ consent.

## 4. Technical safety controls (implement all)
1. **Age gate middleware** (server-side) — see `05` guards.
2. **Consent model** — explicit opt-ins for video, report clips, private sessions; revocation takes effect immediately.
3. **Reporting everywhere** — chat, video, profile, post, room, request, message; one-tap sheet with reason codes + optional details.
4. **Blocking** — permanent, cross-feature (matching, discovery, rooms, messaging).
5. **Rate limits & anti-abuse** — per account/device-hash/IP-hash; progressive penalties.
6. **Moderation tooling** — queue, severity, SLAs: child-safety immediate; threats/NCII < 1 h target; others < 24 h target.
7. **Automated detection hooks** — text classifier, image/video classifier, perceptual-hash matching for known-abusive and takedown-listed content; all via `ModerationProvider` interface with fake for tests.
8. **Content protection** — private storage, signed short-TTL URLs, HLS token paths, dynamic watermark, leak report + takedown, no promise of piracy-proof.
9. **Evidence vault** — restricted-access store for escalated cases; access = reason + audit + dual control for child-safety evidence.
10. **Payment fraud controls** — velocity checks, device/IP signals, chargeback monitoring, payout holds.
11. **Creator protections** — decline without penalty, instant room end, attendee mute/ban, harassment reporting, doxxing protection (no real-name exposure).

## 5. Privacy by design
- Pseudonymous aliases in Connect; real identity never shown.
- Data minimisation; purpose limitation; separate stores for identity vs behavioural data.
- Encryption in transit (TLS 1.2+), at rest (KMS), field-level for sensitive columns.
- DPIA before launch; privacy notice + in-product just-in-time notices (camera, frame sampling, report clips).
- Data-subject rights: access, export, correction, deletion — workflow in `data_requests`.
- Breach runbook with notification timelines confirmed by counsel.

## 6. Child-safety escalation runbook (build as `docs/runbooks/child-safety.md` + tooling)
1. Detection (classifier, hash-match, user report, moderator) → auto-hold content/session, suspend account pending review.
2. Preserve evidence in restricted vault (hashes, metadata, minimal required material); do **not** circulate material internally.
3. Escalate to designated trained safety lead within SLA.
4. Legal reporting to the appropriate authorities/hotlines as determined by counsel for the jurisdiction (document the contact points in the runbook once confirmed).
5. Permanent ban, device/identity signals blocklisted, record in audit.
6. Post-incident review and control tuning.
Engineers must never be asked to view such material; tooling must keep it blurred/hashed by default.

## 7. Retention schedule (defaults — counsel to confirm)
| Data | Default retention |
|---|---|
| Connect messages (non-reported) | 7 days, then deleted (configurable) |
| Reported-session snapshots | Until case closed + 90 days |
| Sampled video frames (classification) | ≤ 24 h unless flagged |
| Flagged evidence | Per legal hold |
| Age-check result metadata | Life of account + 12 months |
| ID documents | Held by provider; POSHA stores reference only |
| Ledger/payment records | Statutory period (≥ 7 yrs default, confirm) |
| Audit logs | ≥ 3 yrs |
Automated retention jobs with tests (clock-faked) enforce these.

## 8. Refund & cancellation policy (engineered defaults; product copy by owner)
Creator cancels/no-shows → full refund. Attendee cancels ≥ 24 h before → full refund; < 24 h → per published policy (default no refund). Technical failure on platform side → pro-rata or full. Rule-breach ban of attendee → no refund. Unfulfilled paid requests → refund. Subscriptions → no pro-rata refund on cancel; refund for provable fraud/error.

## 9. Moderation staffing readiness checklist (gate evidence)
Trained moderators with wellbeing support; escalation tree; 24/7 or defined coverage hours aligned with live-room hours (rooms can only be scheduled within covered hours); appeals reviewers distinct from original decision makers.

## 10. Distribution
PWA/mobile web is the initial channel. App-store listings are assessed separately; do not build native wrappers until policies are reviewed.
