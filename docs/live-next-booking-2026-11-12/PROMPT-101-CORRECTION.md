# Prompt 101 — existing endpoint correction

- SOURCE: Client invocation corrected from `worker-availability-ranking` to `worker-next-booking`. Updated the concrete function-name/session-header test. No replacement ranking algorithm, backend function changes, deployment, publication or activation.
- HOSTED: POST to `worker-next-booking` with `{}` and an explicitly invalid bearer returns HTTP 401 `{"error":"unauthorized","ok":false}`. This establishes that the endpoint responds and rejects this invalid login, not that valid-worker authentication or ranking succeeds.
- NOT VERIFIED: Hosted request parameters and successful response structure. No local implementation of this function was found; no accessible Admin Panel project matched the search. The existing community/service request and strict privacy-safe snapshot parser remain unchanged, with activation OFF. Do not assume the staged independent service contract is the existing endpoint's contract. Obtain the existing hosted source or a sanitized successful authenticated response before activation; adapt only the display integration if necessary.
- TEST: 45 ranking contract/hook tests passed, including OFF, session refresh, one 401 retry, account isolation, eligibility reasons and invalid response refusal. These are mocked tests, not live ranking evidence.
- SOURCE: `use-mobile.tsx` imports `useEffect` and `useState` explicitly; the reported phrase is absent from source. No speculative hook edit was made.
- PREVIEW: Latest observed build entries at 01:30:49 and 01:30:58 UTC say build OK. Mobile 393×805 navigation to `/leaderboard` redirected to `/auth`, with zero page errors and no Vite error overlay. Authenticated ranking end-to-end is NOT VERIFIED (`external_unmanaged`); signed-out navigation is not a ranking-flow test.
- NOT VERIFIED: CORS preflight; the available function-testing tool refused OPTIONS as an unsupported method.

## Remaining gates

1. Confirm actual existing endpoint input/output and privacy using hosted source or a sanitized valid-worker result.
2. Verify eligible/ineligible workers, community/service isolation, IST positions and genuine errors with an authenticated worker.
3. Obtain separate live activation approval. `NEXT_BOOKING_LIVE_ENABLED` remains false.

Top Workers/Top Earners, OTP, payments, notifications and dispatch were not modified.