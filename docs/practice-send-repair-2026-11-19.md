# Test Booking sending repair — 19 November 2026

## Result

**Preview retry fix implemented; FCM delivery remains disabled and NOT VERIFIED.** No backend deployment, sender activation, real notification send, booking/payment mutation or publication.

The reported TS2686 text is absent from `src/hooks/use-mobile.tsx`: it imports useEffect/useState explicitly and does not reference that UMD global. Browser practice flow has no page errors; preview build checked separately. No speculative hook edit.

## Root cause and evidence

- SOURCE: `PRACTICE_PUSH_ENABLED=false` prevents sender invocation in normal builds. The exception requires an exact validate-only build key AND the previously approved pilot login; current normal builds do not qualify.
- HOSTED: an unauthenticated, empty POST to `send-practice-notification` returned **503 `{sent:false, reason:approval_required}`**. This demonstrates the hosted OFF refusal, not current deployed-source parity or Firebase configuration.
- HOSTED TOOL: function logs returned none; no successful send or device receipt observed.
- SOURCE: staged service supports OFF, validate-only (no delivery), and ON for a single verified pilot/device. Old validate-only notes are PRIOR evidence only, not a fresh working transport test.
- FOUND/FIXED: Try Again previously only reset to the intro screen. It now repeats the last chosen mode: actual send attempt for push mode, local alert for screen-practice mode; fresh practice ID, fresh real-work safety check and duplicate-tap lock. Unknown sends still wait for possible receipt before retrying. Definitive refused sends are not converted into successes.

## Safety and evidence paths reviewed

- Client sends only practice_id, expiry and current native token SHA-256, not worker identity/raw token. Native prepare checks login, permissions, channel, token and suspected real work; server derives worker from verified login, checks stored active Android token/fingerprint and idle state twice.
- Staged sender authenticates via Supabase Auth getUser; atomic practice journal prevents concurrent/duplicate sends. FCM must return success plus message name before `sent:true`. Validate-only never marks sent. No real booking/earnings/payout/performance records are created.
- Native receiver requires matching prepared account/device/session and bounded receipt window. Actual receipt and actual alert display are independently recorded; acceptance continues the same local practice. Unknown sends retain receipt matching.
- Practice notification uses the existing packaged loud ringtone/vibration and shared booking-alert layout, but isolated practice handlers—not BackendSync, production ACK or OfferQueue assignment. Real work wins. Tray/optional overlay subject to Android permission restrictions; source review is not proof of phone display.
- Practice Start/Complete OTP **1234** remains local-only. No real OTP authorization path changed.

## Exact remaining approval/configuration

1. Owner must explicitly approve **controlled test-notification delivery** (not merely preparation), naming the pilot worker/login and physical Android device. Do not reuse or broaden the old pilot silently. Do not supply tokens/passwords/service-account JSON in chat.
2. Recheck/download current hosted sender configuration/source and back it up; reconcile with reviewed self-contained staging. Separately approve any deployment. This task explicitly forbids deployment without approval, so nothing under auto-deploying functions was edited.
3. Confirm service credentials and Firebase project match current Android Firebase configuration; verify authorised FCM transport. The staged adapter uses legacy direct service-account transport; before any transport change, check existing connection mode and use the supported Firebase gateway where configured. No new connector, secret or transport was silently introduced.
4. Confirm practice journal RPCs, quota/ownership protections, verified login, active Android registration and phone/server token hash parity. Configure `PRACTICE_PILOT_USER_ID` and `PRACTICE_PILOT_TOKEN_SHA256` for that authorised device. Missing/mismatched config must refuse.
5. Use a separate approved pilot build gate; keep global `PRACTICE_PUSH_ENABLED=false` for normal Play/web/OTA builds. Existing validate-only build configuration does not approve delivery. First test transport in **validate** mode; then separately approved bounded **on** window, returning OFF in the same verification session. Neither enabling step was performed.
6. Update local source, build production web assets, then `npx cap sync android` and bundle verifier; generate/install a correctly signed test APK. Current sandbox lacks dist/native tools; no APK or physical phone verification. Please read the [Lovable Capacitor discussion](https://lovable.dev/blog/supercharge-lovable-chrome-extension) alongside local build instructions.
7. On the phone: permission/channel allowed → send once → Firebase acceptance → actual receipt → actual alert visible → accept → practice Start 1234 → Complete 1234. Repeat foreground/background/locked, revoked permission, stale token, real-offer interruption and rapid retries. Mark each step only from its own evidence. Restore sender OFF afterward; no unattended enablement.

## Tests / NOT VERIFIED

- **87 focused tests / 732 full frontend tests passed (66 files).** New tests cover actual retry invocation with a new ID, duplicate taps, uncertain-send wait; existing tests cover 1234 and sender isolation. Mocked phone/server tests do not prove Firebase delivery.
- Mobile Playwright **393×805**: guest practice screen, OFF refusal, Try Again, local accept → Start 1234 → Complete 1234 → success → Try Again reopening local alert; zero page errors. Screenshot inspected. Local practice retains truthful Failed/Not Verified push checks rather than fabricating successful transport.
- Authenticated hosted sender success, current worker token/channel/native registration, actual phone receipt/overlay/acceptance, native compilation and locked/background delivery **NOT VERIFIED**. Auth status is external_unmanaged; no injected session. Preview telemetry shows a signed-in worker but does not provide a usable authenticated phone session.
- No final Android merged manifest or AAB generated. Foreground-service Play policy/approval/backend release blockers from prior work remain open; unchanged 10.0.04/104.