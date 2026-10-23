# Worker App — `workers` table write audit (for Admin Panel security team)

Audit only. No code, data, policy or deployment changed.
Labels: SOURCE = read from current code (build 102 / 10.0.02); LIVE = read-only query on production; NOT VERIFIED = not tested.

## 0. Live protection today (LIVE)
- Policy `workers_update_own` (authenticated): USING `user_id = auth.uid()::text OR id = auth.uid()`, WITH CHECK `user_id = auth.uid()::text`. **No column restriction** — a worker can change any column on her own row, incl. rating, is_blocked, is_active, payout_ready, priority, cooldown.
- Policy `workers_insert_own`: any signed-in user may insert a row with her own id/user_id and any values (incl. `is_active=true`, rating, payout_ready).
- `workers_select_own` also matches by phone suffix from the JWT.
- Relevant triggers: `set_worker_user_id_from_auth`, `trg_set_worker_payout_ready` (recomputes payout_ready), `trg_sync_cashfree_beneficiary` (AFTER INSERT/UPDATE → beneficiary sync), `trg_enforce_blocked_worker`, `trg_log_availability_change`, `trg_workers_recompute_state`, `trg_touch_worker_last_seen`.

## 1. Every direct write from the app (SOURCE)
All are direct PostgREST calls with the worker's Supabase session unless noted. All send only the listed fields (none send a full record) except the signup upsert, which sends a near-full row.

| # | File / function | Op | Fields | When | On rejection |
|---|---|---|---|---|---|
| W1 | `pages/OtpVerify.tsx` sign-in | UPDATE by **phone** | `id` (primary key!) | Every OTP sign-in when a row with that phone exists | Error ignored, login continues |
| W2 | `pages/OtpVerify.tsx` signup (existing phone) | UPSERT on id | full_name, phone, user_id, id, upi_id, upi_qr_*, service_types, communities, selected_community_id, **is_active=true**, is_available=false, is_busy=false, **payout_ready**, bank fields, passbook_url, bank_details_source | Signup when phone already exists | Throws → signup error shown |
| W3 | `pages/OtpVerify.tsx` signup (new) | INSERT | same as W2 | New signup | Throws → signup error shown |
| W4 | `hooks/useWorkerProfile.ts` fetchWorkerData | UPDATE | user_id (link legacy row) | Profile load, legacy row without user_id | Not checked |
| W5 | `hooks/useWorkerProfile.ts` fetchWorkerData | UPDATE | last_active_at | Every profile fetch (≈2 min cache) | Warning log only |
| W6 | `hooks/useWorkerProfile.ts` updateWorker (generic) | UPDATE | caller's fields + **user_id** + updated_at | Called by W7, W8 | Throws → toast |
| W7 | `pages/Profile.tsx` edit dialog → updateWorker | UPDATE | full_name, **phone**, upi_id, service_types, **communities** | Worker taps Save | Toast error |
| W8 | `pages/AccountDetails.tsx` → updateWorker | UPDATE | account_holder_name, bank_account_number, ifsc_code, bank_name, upi_id, passbook_url, bank_details_source, **payout_ready=true** | Worker saves payout details | Toast error |
| W9 | `components/profile/PayoutSetupCard.tsx` | UPDATE | account_holder_name, bank_account_number, ifsc_code, upi_id, **payout_ready** | Payout setup card save | Toast error |
| W10 | `components/UpiQrUpload.tsx` upload | UPDATE | user_id, upi_id, upi_qr_url, upi_qr_payload, upi_qr_uploaded_at | QR upload | Throws → toast |
| W11 | `components/UpiQrUpload.tsx` remove | UPDATE | user_id, upi_qr_* = null | QR removed | Throws → toast |
| W12 | `pages/Profile.tsx` photo | UPDATE | photo_url | Photo upload | Throws → toast |
| W13 | `pages/Profile.tsx` handleDeleteAccount | DELETE | row | Delete account | Fails today (admin-only delete policy); `auth.admin.deleteUser` from client also fails |
| W14 | `components/CommunitySelector.tsx` | UPDATE | selected_community_id | Worker picks community | Toast |
| W15 | `hooks/useAutoHeal.ts` | UPDATE | service_types=['maid'] | Startup if empty | Not checked |
| W16 | `contexts/AuthContext.tsx` signOut | UPDATE | fcm_token=null, fcm_token_status, **is_available=false**, updated_at | Logout | Caught; logout continues |
| W17 | `lib/pushToken.ts` syncTokenToBackend | UPDATE | fcm_token, fcm_token_status, fcm_token_updated_at, last_fcm_token_refresh_at, fcm_token_platform, last_app_opened_at, app_version | Token register/refresh | Returns failure, retried |
| W18 | `services/push/NativePushService.ts` registerToken | UPDATE | fcm_token, fcm_token_status, fcm_token_updated_at, fcm_token_platform, updated_at | Native registration | Caught |
| W19 | `hooks/useHeartbeat.ts` | UPDATE | last_seen_at; self-heal: fcm_token fields | Heartbeat interval | Warning only |
| W20 | `hooks/useFCMTokenSync.ts` | UPDATE | app_version, last_app_opened_at | App start | Warning only |
| W21 | `services/pushRepairCoordinator.ts` | UPDATE | notification_repair_failures | Push repair attempt | Not surfaced |
| W22 | `lib/backgroundLocation.ts` | UPDATE | location_enabled=false | Location stop | Caught |

## 2. Server-function paths (SOURCE)
| Path | Writes | Identity |
|---|---|---|
| `update-availability` edge fn (AvailabilityToggle, Home) | is_available via `set_worker_availability_manual` | Session JWT → worker by user_id |
| `worker-heartbeat` edge fn (web + native `BackendSync.kt`) | heartbeat/health fields | see function |
| `worker-boot-ping`, `worker-keepalive-ack` (native) | token/keepalive fields | anon key + body (separately flagged as weak) |
| RPC `update_worker_location` (native location service/worker) | location | session |
| RPC `ensure_worker_profile` | creates missing row | session |
| `extract-bank-details` edge fn | bank fields from passbook (NOT VERIFIED which columns) | session |
| `try_accept_booking`, `reject_booking_offer`, `booking_offer_open` | booking state (not workers directly) | session |

Notification permission, battery optimisation, device model are NOT written by the app directly to `workers` (SOURCE: no matching update); they come via the edge functions above. Daily streak / performance metrics: no app writes (read-only display).

## 3. Conflicts with the planned protected fields
| Protected field | App writes it? |
|---|---|
| rating, rating count, completed bookings, dispatch/priority score, cooldown, admin status, verification, bank approval | **No** |
| `is_active` | **Yes** — W2, W3 (signup sets `true`) |
| `payout_ready` | **Yes** — W2, W3, W8 (`true` always), W9 |
| `communities` (approved communities) | **Yes** — W2, W3, W7 |
| `service_types` (approved services) | **Yes** — W2, W3, W7, W15 |
| `selected_community_id` | Yes — W14, W2, W3 (decide if protected) |
| `is_blocked` | No |
| `phone` | **Yes** — W7 (lets a worker change her phone) |
| `id` / `user_id` (ownership) | **Yes** — W1 (id by phone), W4, W6 (every updateWorker), W10, W11, W2 |

## 4. Registration (SOURCE + LIVE)
- New workers are created by **direct INSERT/UPSERT** into `workers` from the phone (W3/W2), not through `worker_registration_requests`. `ensure_worker_profile` RPC is a second creation path.
- Signup sets `is_active=true` → **a new worker is active without admin approval** (is_available starts false; she can switch it ON herself).
- Ownership: Supabase phone OTP (`verifyOtp`) → `id = auth.uid()`, `user_id` set by trigger. W1 rewrites `id` for any row whose phone matches the signed-in phone — ownership is taken by phone match, and the SELECT policy also grants reads by phone suffix. Risk: phone-number reuse/format collisions could hand an old record to a new account. NOT VERIFIED live.

## 5. Payout details (SOURCE + LIVE)
- Bank/IFSC/UPI are written directly by W2, W3, W8, W9, W10 (and possibly `extract-bank-details`).
- `trg_set_worker_payout_ready` recomputes readiness and `trg_sync_cashfree_beneficiary` runs after every update, so **a worker's edit changes the payout destination automatically, with no admin approval**. The app also self-sets `payout_ready`.
- Existing approval: admin RPCs exist (`admin_block_worker_bank`, `admin_reject_worker_bank`, `admin_mark_worker_payout_ready`), but the app path bypasses them. No in-app verification step.

## 6. Results
**Compatible with column protection (no change needed):** W5, W12, W14*, W16–W22, all edge-function and RPC paths. (*if `selected_community_id` stays worker-editable)

**Would break:**
- W2/W3 signup — sends `is_active`, `payout_ready`, `communities`, `service_types`. If the server rejects the whole row, **signup fails**.
- W6 updateWorker — always sends `user_id`; if `user_id` is protected, profile edit and payout save both fail.
- W7 profile edit — `communities`, `service_types`, `phone`.
- W8/W9 payout save — `payout_ready`; bank fields if they become approval-only.
- W1, W4, W10, W11 — write `id`/`user_id`.
- W15 auto-heal — `service_types`.

**Rejected-update handling:** user actions (W2, W3, W6–W12, W14) show an error toast and keep the old value; no crash, no retry loop. Background writes (W1, W4, W5, W15, W19–W21) ignore or only log errors — safe, but W1/W4 failures are silent. Note: W8 shows "saved" only after success. A PostgREST row-level rejection fails the **whole** update, so mixing a protected field into an otherwise-allowed write (e.g. `user_id` in W6) blocks the allowed fields too.

## 7. Required Worker App changes (PROPOSED, not applied)
1. Signup: stop sending `is_active`, `payout_ready`, `communities`, `service_types`; move signup to a server function / registration request.
2. `updateWorker`: stop adding `user_id`; send only changed allowed fields.
3. Profile edit: services/communities/phone become a change request (or server function).
4. Payout save (W8, W9, W10): drop `payout_ready`; submit bank/UPI via a server function that records a pending change.
5. Remove W1 (id rewrite by phone) and W4 (user_id linking) — server-side only.
6. Auto-heal W15: remove or move to server.
7. Delete account (W13): replace with a server request (currently broken anyway).

## 8. Required backend changes (PROPOSED)
1. Column-level guard (trigger or column grants) for the protected list; allow only: full_name, photo_url, selected_community_id (if approved), fcm_* fields, last_seen_at/last_active_at/last_app_opened_at, app_version, notification_repair_failures, location_enabled, upi_qr_* (if UPI stays self-service).
2. Silently ignore vs reject: prefer **reject only protected changes and keep old value** (or strip them) so W6-style mixed writes don't fail during the transition.
3. Registration RPC that creates the row with `is_active=false` pending admin approval; restrict `workers_insert_own`.
4. Bank/UPI change RPC → pending state, admin approval before Cashfree sync; stop `trg_sync_cashfree_beneficiary` acting on unapproved data.
5. Forbid changing `id`, `user_id`, `phone` from clients.
6. Keep `update-availability`, `worker-heartbeat`, `update_worker_location` contracts unchanged.

## 9. Tests before enforcement (NOT RUN)
Isolated test project with 2 test workers:
- Signup (new + existing phone), sign-in, logout.
- Availability ON/OFF, token register/refresh, heartbeat, location, app version.
- Profile name/photo/community/services edit; UPI QR upload/remove; payout save.
- Attempt each protected field from a worker session → refused, row unchanged, app shows error, no crash.
- Admin approval flows still work; Cashfree sync not triggered by refused writes.
- Old builds (10.0.01, 7.0.x, 6.0.64): same set — they use the same direct writes (NOT VERIFIED).

## Conclusion
**NOT COMPATIBLE as-is.** Background reliability writes are safe, but signup, profile edit and payout save write protected fields and would fail under strict enforcement. Ship app changes (section 7) and the backend RPCs (section 8) first, or use strip-and-keep enforcement during transition.
