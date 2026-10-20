# 01 — Product Review & Binding Resolutions

This review audits the POSHA concept (Connect + Exclusive + Live Rooms). Each finding has a **Resolution** that is **binding on implementation** unless the owner overrides it in `docs/DECISIONS.md`.

## A. What is strong

- Clear two-sided model: Connect drives acquisition; Exclusive/Live drive revenue.
- Safety, consent and ledger-based payments are already named as foundations.
- PWA-first distribution is realistic given app-store restrictions.
- The request workflow correctly separates payment from consent.
- Phased roadmap and metrics-before-targets approach are sound.

## B. Findings

### B1. [CRITICAL] Random video between strangers + adult platform = highest-harm combination
Random stranger video services have historically been overwhelmed by abuse, exposure to unsolicited explicit material, and attempts to reach minors. Putting them on the same account system as an adult-content creator platform raises that risk.
**Resolution**
- Connect has a **hard "no nudity/sexual content" rule** (separate policy from Exclusive/Live). Random video is *not* an adult-content surface.
- Random video requires `verified_adult` (document or provider-based age assurance), not self-declaration.
- Ship **text chat first**; video behind `GATE:RANDOM_VIDEO` until automated frame-sampling classification + moderation staffing exist (see `07`).
- Consider an in-chat "mutual intent" step before any camera-on (opt-in per call, blur-until-accept).

### B2. [CRITICAL] Age assurance depth
"Age assurance" is stated but not specified. Self-declaration is insufficient.
**Resolution:** tiered levels `L0 unverified`, `L1 age-estimated`, `L2 document-verified adult`, `L3 creator KYC + liveness + payout identity`. Required level per capability is fixed in `07` §2. All checks via a provider abstraction (`AgeAssuranceProvider`), never hand-rolled.

### B3. [CRITICAL] Child-safety obligations are missing from the spec
**Resolution:** implement a CSAM/abuse-escalation path: hash-matching on uploaded media where lawful/available, immediate hold-and-escalate workflow, evidence preservation, legal-reporting runbook (counsel to confirm obligations in Kenya and any other served jurisdiction), and zero-tolerance account actions. See `07` §6.

### B4. [HIGH] "No recording" vs. need for evidence
Reports cannot be adjudicated without data, yet the concept forbids secret recording.
**Resolution:** Do **not** record calls by default. Provide (a) *user-initiated report snapshots* (last N text messages; for video, user-consented short clip buffer explicitly disclosed in the pre-call notice) and (b) *automated frame sampling for classification only*, with disclosed purpose and short retention. Disclose both in Terms/Privacy and in-call notice. Counsel must approve wording.

### B5. [HIGH] Payment provider feasibility (M-Pesa and cards)
Mainstream mobile-money and card acquirers commonly restrict or prohibit adult content. The concept notes this but the architecture must not assume M-Pesa availability.
**Resolution:** payments sit behind a `PaymentProvider` interface with provider-specific adapters and capability flags. Build the ledger, webhooks, reconciliation and payouts provider-agnostic; implement a **fake provider** for dev/test and one real sandbox adapter. All real money flows `GATE:PAYMENTS_LIVE`.

### B6. [HIGH] Live "requests" create coercion and legal exposure
Paid requests can drift into pressure or prohibited activity.
**Resolution:**
- Creators publish a **request menu** (allowed categories + optional prices) per room. Free-text requests are allowed only if creator enables them, and pass through an automated prohibited-content filter plus creator accept/decline.
- A request moves `submitted → accepted|declined|countered → client_confirmed → fulfilled|cancelled|refunded`. **No charge is captured for an add-on until creator acceptance + client confirmation.**
- Creator can decline without penalty; decline never reduces creator ranking.
- Priority-request purchase buys queue position only; terms displayed before purchase.
- Creator-side "panic" controls: end room, mute/kick/ban attendee, one-tap report.

### B7. [HIGH] Stray reference in the source text
The concept contains the token "xpertz.io" appended to the "POSHA Live Rooms" heading. It is treated as an accidental paste and **ignored**. Do not reference or integrate any third-party brand/service from it.

### B8. [MEDIUM] Inconsistent scope between "first release" and roadmap
Section 14 lists video, creators, payments in release one; the roadmap stages them over five phases.
**Resolution:** follow the **phased backlog** (`09`). "Release 1" = Phase 1 + 2 (text chat). Creators/payments/live ship later, each behind flags.

### B9. [MEDIUM] Content protection claims
Downloads/recording cannot be fully prevented.
**Resolution:** signed short-TTL URLs, private buckets, per-viewer **dynamic watermark overlay** (username + timestamp) on video/live, leak-report + takedown workflow. UI copy must not promise piracy-proof content.

### B10. [MEDIUM] Revenue model and fees
80/20 illustrative split ignores payment fees, tax, refunds.
**Resolution:** commission rules are configurable per creator/tier/effective date; ledger records gross, platform fee, provider fee (when known), tax, creator net. Reports show gross vs net.

### B11. [MEDIUM] Roles
Concept has 7 roles. Missing: **support agent**, **compliance officer (read-only audit)**.
**Resolution:** add both; see `04` roles/permissions matrix.

### B12. [MEDIUM] Privacy and data protection
**Resolution:** DPIA required before launch; data-subject rights (access, deletion, export); retention schedule; breach runbook; counsel to confirm local registration/notification duties (Kenya Data Protection Act 2019 and any other served jurisdictions).

### B13. [LOW] Branding
Name conflicts unchecked; palette in concept (midnight/violet/mint) **superseded** by the required warm theme (maroon/pink/peach/red). See `03`.

### B14. [LOW] Navigation
Five tabs (Home, Discover, Live, Chats, Profile) is the maximum for thumb-reach; do not add a sixth.

## C. Open questions for the owner (defaults in brackets)

1. Launch jurisdictions? [Kenya only; geo-block others by flag]
2. Real age-assurance and KYC vendors? [abstraction + fake; vendor chosen later]
3. Video infrastructure: managed vs self-hosted SFU? [LiveKit, self-hostable; confirm vendor adult-content policy]
4. Minimum creator payout threshold and schedule? [KES 2,000, weekly]
5. Default commission? [20% platform / 80% creator, configurable]
6. Is Connect strictly non-explicit? [Yes — binding per B1]
