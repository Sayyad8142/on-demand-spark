# Service Pricing & Earnings — prepared, not activated

## Reported hook diagnostic

**SOURCE:** The rule is that phone-size detection must use imported React functions, never an assumed browser React global. `src/hooks/use-mobile.tsx` already imports `useEffect` and `useState`; line 4 is blank and the quoted phrase `Prepare verified-price screen` is not an identifier in this module. No speculative hook rewrite was made.

**SOURCE flow inventory:** `useIsMobile` has exactly one caller, `src/components/ui/sidebar.tsx`. Its provider and mobile/desktop sidebar branches were read; it explicitly imports `* as React`. Search found no consumer of this sidebar outside its own module. Worker pages use their independent layouts, including `BottomNav.tsx` (read: explicit React hook imports, no `useIsMobile`). No background job or database function uses this client React hook. No backend, permission, settled record, setting or example data was modified.

**VERIFIED:** Existing breakpoint at 768, updates at 767/768 and listener cleanup pass an actual hook test. Preview diagnostics show build OK; the real app and isolated pricing screen render without page errors. This does not establish that the reported harness diagnostic was a real source error or that a nonexistent source fault was fixed.

## Prepared screen

- Existing Profile entry beneath Performance Score now opens `/service-pricing` instead of a missing route.
- Real screen shows Pricing unavailable while `SERVICE_PRICING_ENABLED` is false. No pricing endpoint call is made, including guests and refresh taps.
- Prepared renderer supports returned community choices; Maid table with server Both/discount, workload label/description/extras, Bathroom unit/glass components, slot adjustments, customer-loyalty schedule and community commission. Every monetary amount is received, not recomputed. Zero charges and negative slot adjustments are preserved.
- Actual earnings links to the existing earnings screen. No additional own-earnings or payout reader is introduced and catalogue prices never substitute for persisted earnings.
- English/Hindi/Telugu display resources added. Server-returned labels/descriptions are shown unchanged: multilingual server text remains a contract/activation requirement, not invented item-count translations.
- Existing approved service and bathroom/glass photos reused. Workload-specific images are intentionally not fabricated from unknown Admin descriptions. Interrupted image generation was not resumed; the downloaded temporary image is not served by this app.
- Catalogue parser checks shape/version, valid amounts, duplicate communities/services/flat keys/workloads/slots and quantity ranges. Worker requests send only a community UUID, never worker/customer IDs. Admin-verified association provenance required; current-row associations refused.
- Memory scoped to login plus selected community; old community/account values hidden immediately. In-flight results invalidated. Failed login, permission/provenance/contract validation clears cached values. Network/server failure may retain same-community memory marked saved/not live. Snapshots over five minutes old or future-dated are labelled not live; this is a display rule, not pricing authorization.
- Opening, native resume, online reconnect, visible foreground, retry and pull refresh re-read through the one disabled adapter. 401 refresh retries once. No realtime subscription to unpublished tables and no new polling job were added.

## Evidence

**VERIFIED local tests:** Full app suite passes; parser tests preserve synthetic combined 197 rather than task sum 204, zero glass, −13 slot and server commission 7. These are synthetic test-only values, not production rates. Hook tests cover OFF/no-session gates, exact transport, account/community changes, 401 retry cap, association/permission failures, same-community offline memory and refreshed server revisions.

**VERIFIED browser, synthetic inputs:** Actual `ServicePricingView` rendered with unavailable/loading/empty/reference/error states; two returned community choices; server combined amount retained; refresh and synthetic pull gesture; four images fully loaded; no page errors. English/Hindi/Telugu at 320×568, 393×805 and 1280×1800 checked for horizontal overflow; screenshots inspected. Real signed-out route redirects to Auth. Using the app's existing Continue as Guest flow, Home → Profile → Service Pricing & Earnings opens Pricing unavailable without fabricated rates. Guest UI verification is not signed-in financial verification.

**PRIOR handoff evidence:** Uploaded Admin handoff says the worker endpoint is proposed/not created, pricing tables are not realtime-published, and User checkout/booking trigger disagree on workload, glass, loyalty and instant-slot rules. No fresh production authority or parity is claimed here.

## NOT VERIFIED / activation blockers

1. Approved deployed worker-service-pricing endpoint reusing verified User resolver and immutable Admin assignment provenance.
2. Authenticated component-by-component User quote vs committed booking vs Worker payout parity and Admin save/readback. External unmanaged worker/customer sessions unavailable.
3. Exact quantity examples/net-earnings examples: the proposed v1 contract does not supply these. They require approved server-returned examples/contract extension; never duplicate formulas in the app.
4. Accurate workload imagery and localized server descriptions matched to approved item-count definitions.
5. Automatic Admin-change delivery while continuously foreground: no supported publication/event exists; next supported refresh only, no false realtime claim.
6. Installed Android rendering/session/Store/web asset and physical device checks.

No app publication, Android build/version change, endpoint deployment, dispatch/payment/booking/OTP/availability/priority change or pricing setting write occurred.