# Service pricing (Admin draft fixture) + completion/earnings audit — 25 Nov 2026

Live pricing stays OFF (`SERVICE_PRICING_ENABLED = false`). Nothing deployed, published or version-changed.
No file under `supabase/functions/` was edited.

## 1. Pricing UI against Admin's draft contract (SOURCE + TESTED)
- Parser `src/lib/servicePricingDraft.ts` now matches Admin's shape: top-level `version`, community slug in
  `community` (case-insensitive unique), tier `id`, bathroom `source`. Unknown version / missing price / duplicate
  community / duplicate task row / overlapping loyalty tiers are refused (no prices shown).
- Fixture `src/lib/__tests__/servicePricingDraftFixture.ts` is Admin's JSON verbatim (test-only, never a fallback).
- Screen: per-flat-size cards (any sizes, server order, 4BHK_PREMIUM included), Standard/Community price label,
  price example (flat size → task → dish workload → slot, positive or negative) with fee % and estimate,
  bathroom unit and glass estimates, loyalty tiers, multi-community selector.
- Estimates = today's catalogue percent, hosted floor-fee rule on the whole booking price. Labelled "for new bookings".

## 2. Active completion endpoint (SOURCE + DB read, 25 Nov 2026)
- Backend project: `paywwbuqycovjopryele` (supabase/config.toml).
- OTP V2 client default is OFF (`OTP_V2_CLIENT_ENABLED_DEFAULT = false`), so the active path for workers is the
  edge function **`complete-booking-with-otp`** (`verify_jwt = false`, own session check), called from
  `src/pages/CompleteBooking.tsx`. `otp-v2-gateway` is used only when V2 is switched on.
- The deployed copy of the edge function was NOT VERIFIED against the repository copy.

## 3. How earnings are created today (DB read)
1. Edge function updates booking → `completed` with `completion_source='otp'`, `completed_by='worker'`, `otp_verified_at`
   (enforced by `guard_booking_completion_source`).
2. AFTER UPDATE triggers `trg_create_worker_payout_on_completion` and `bookings_after_complete_create_payout`
   → `create_worker_payout_on_completion` → `_create_worker_payout_core` (idempotent, advisory lock).
3. Core: requires payment paid/captured/settled/wallet or `worker_collected_payment`; fee =
   `FLOOR(price_inr × communities.platform_fee_percent / 100)` read **at completion time**; tip added unrounded.
4. `worker_payouts` INSERT → `zz_hybrid_record_earning` writes `worker_earnings` (hybrid_mode = on).
- Last 60 days: 232 payouts via the DB core, 0 via the edge-function fallback, 0 with any fee (all communities 0%).

## 4. Gaps vs Admin's rule "actual earnings use the commission saved at booking time"
- G1 (CONFIRMED): no booking-time commission is stored. `bookings` has no fee/percent column; the core reads the
  community's CURRENT percent when the job completes. A percent change between booking and completion changes pay.
- G2 (SOURCE, repo copy): edge-function fallback `createOrFetchPayout` uses `Math.round` (core uses floor) and
  inserts a `pending` payout even when the core skipped for unpaid bookings, without tip handling. Never fired in
  60 days, but it bypasses the payment gate if reached.
- PROPOSED (Admin): add `bookings.platform_fee_percent_at_booking` set by a BEFORE INSERT trigger; core uses it
  (fallback to current only for old rows); remove or align the edge fallback with the core. Needs approval.
