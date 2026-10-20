# 03 — Design System: "Ember" (warm maroon · pink · peach · red)

Required theme: **a warm, vibrant mix of maroon, pink, peach, and red.** This supersedes the colours in the original concept.

## 1. Colour tokens

| Token | Hex | Use |
|---|---|---|
| `maroon-950` | `#2A0712` | Deepest backgrounds (dark mode base) |
| `maroon-900` | `#3F0B1B` | App bar, nav, dark surfaces |
| `maroon-700` | `#6B1230` | Primary dark brand, headings on light |
| `maroon-600` | `#8A1A3F` | Hover/pressed for dark elements |
| `red-600` | `#C8102E` | **Primary action** (buttons, active tab, live indicator) |
| `red-500` | `#E4344A` | Primary hover, badges |
| `pink-500` | `#F0537F` | Secondary accent, gradients, highlights |
| `pink-300` | `#F9A1B8` | Soft accents, selected chips |
| `pink-100` | `#FDE1E9` | Tinted backgrounds |
| `peach-400` | `#FF9E7A` | Warm accent, creator highlights, price chips |
| `peach-200` | `#FFD0B8` | Cards on dark, dividers |
| `peach-100` | `#FFEBDD` | Light surfaces |
| `cream-50` | `#FFF8F3` | App background (light mode) |
| `ink-900` | `#1E0A10` | Primary text on light |
| `ink-600` | `#6A4A52` | Secondary text on light |
| `success` | `#2E9E6B` | Verified, paid, success |
| `warning` | `#E8A020` | Warnings |
| `danger` | `#B3001B` | Destructive (distinct from primary via icon + label) |

**Brand gradient** `--gradient-ember`: `linear-gradient(135deg, #8A1A3F 0%, #C8102E 45%, #F0537F 80%, #FF9E7A 100%)`. Use for hero surfaces, the Live badge, and the logo mark; not for body text backgrounds.

### Contrast rules (must be tested)
- Body text ≥ 4.5:1; large text/icons ≥ 3:1 (WCAG 2.2 AA).
- White on `red-600` and on `maroon-*` passes; **use `maroon-900` text on `pink-300`/`peach-*`**, never white.
- Never rely on colour alone for state (verified, live, error): pair with icon + label.
- Add automated contrast check script in `packages/ui` that fails CI if any token pair in `contrast-pairs.json` drops below threshold.

## 2. Tailwind preset (packages/config/tailwind-preset.ts)
Define the palette above under `theme.extend.colors`, plus:
- `fontFamily.sans`: `Inter, system-ui, sans-serif`; display: `"Plus Jakarta Sans", Inter, sans-serif`.
- `borderRadius`: `card: 20px`, `pill: 999px`, `sheet: 28px`.
- `boxShadow.card`: `0 8px 24px -8px rgba(63,11,27,.25)`; `glow`: `0 0 0 4px rgba(240,83,127,.25)`.
- Spacing on a 4 px grid; min touch target 44×44 px.
- Dark mode via `class`; **default to dark** (maroon-950 base) for Connect/Live, light for Discover/Profile optional; user setting persists.

## 3. Typography scale (mobile)
`display 32/38 700`, `h1 26/32 700`, `h2 20/26 650`, `h3 17/24 600`, `body 16/24 400`, `small 14/20`, `caption 12/16`. Never below 12 px. Respect user font scaling.

## 4. Motion
Restrained. 150–250 ms ease-out; match-found uses a soft scale+glow (≤ 400 ms). Respect `prefers-reduced-motion` (replace with fades). No flashing > 3 Hz.

## 5. Component inventory (packages/ui) — each needs: props types, states, a11y, Storybook story, unit + a11y test

**Primitives:** Button (primary red, secondary pink-outline, ghost, danger, icon, loading, disabled), IconButton, Input, TextArea, OTPInput, Select, Checkbox, Switch, RadioGroup, Slider, Chip (interest/tag), Badge (Verified mint→`success`, Live, 18+), Avatar (with status ring), Tooltip, Toast, Dialog, BottomSheet, Tabs, Skeleton, Spinner, EmptyState, ErrorState, Divider.

**Composite:** BottomTabBar (5 tabs), TopBar, SafeAreaShell, PriceTag (KES formatting), CreatorCard, RoomCard (countdown, capacity meter, price), ChatBubble, ChatComposer, MessageList (virtualised), ReportSheet, BlockConfirm, ConsentPrompt, AgeGateStepper, PaymentSheet, ReceiptRow, LedgerRow, RequestCard (states), RequestMenuEditor, CountdownTimer, CapacityMeter, VideoTile, VideoControls (mute/cam/leave/report), WatermarkOverlay, UploadProgress, StatCard, DataTable (admin), Charts wrappers.

## 6. Screen inventory & layouts (apps/web)

Global: bottom tab bar (Home · Discover · **Live** · Chats · Profile); Live tab shows a pulsing red dot when rooms are live; persistent 18+ badge in settings only (not intrusive).

**Onboarding/Auth**: Welcome (gradient hero) → Phone/email → OTP → Age assurance (explain why, privacy note, provider handoff, result states) → Choose chat identity (pseudonym) → Safety rules acknowledgement (short, 3 rules) → Home.

**Home**: large "Start chatting" card (text), "Video chat" card (locked state shows why/flag), interests chips, language/country prefs, queue state ("Finding someone…" with cancel).
**Chat session**: header (anonymous handle, Report, Block, Leave), message list, composer, **Next** primary action pinned bottom-right; report bottom sheet reachable in 1 tap.
**Video session**: full-screen remote tile (blurred until consent), self-view PiP, controls: mute, camera, Next, Leave, Report. Safe-area aware.
**Discover**: search, filters (language, category, price), CreatorCard grid/list, creator profile (previews, price, subscribe CTA, rules).
**Live**: tabs Now / Upcoming / My tickets; RoomCard list; Room detail (description, rules, permitted activity list, price, capacity, cancellation terms, Buy ticket); Room view (video, chat, request panel, report/leave always visible).
**Chats**: conversations list, eligible private messages, blocked/hidden section.
**Profile**: identity, privacy settings, subscriptions & receipts, wallet/ledger view (for creators: earnings), become-a-creator flow, security (2FA), data export/delete.
**Creator Studio** (within web, `/studio`): Dashboard, Content manager, Upload, Pricing, **Room scheduler**, **Request menu & queue**, Audience moderation (mute/ban), Earnings, Payouts, Settings.

## 7. Admin app screens (apps/admin)
Overview KPIs · Users & Age verification · Creators & KYC review · Reports & Moderation cases · Appeals · Content review/takedowns · Live room monitor · Payments & reconciliation · Refunds/disputes · Commission settings · Payout approvals · Fraud alerts · Audit logs · Flags & config · Staff & roles. Table-heavy, keyboard-friendly, dense but readable; same tokens, light-mode default.

## 8. Accessibility requirements
WCAG 2.2 AA; focus rings in `pink-300` + 2 px offset; all interactive elements labelled; captions-ready video UI; screen-reader announcements for match found/ended; form errors linked via `aria-describedby`; touch targets ≥ 44 px; support 200% zoom and OS text scaling.

## 9. Content & tone
Warm, direct, respectful. Safety copy is short and specific. Never shame users. Empty/error states always offer a next action.
