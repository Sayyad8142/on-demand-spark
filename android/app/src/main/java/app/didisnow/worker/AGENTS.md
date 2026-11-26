# Native background authentication

- Native background calls (heartbeat, delivery confirmations) use only the worker's own login via `BackendSync.freshSessionJwt` (single-flight refresh, same-account check, written to both login stores; rules in `SessionRefreshRules.kt`), and the app reads login keys fresh from phone storage unless its own write is in flight. Why: the server refuses public-key calls and a stale refresh token would log workers out.
- Heartbeat `app_state` is only `foreground`/`background` (`HeartbeatRules.kt`, web `src/lib/heartbeatAppState.ts`); the trigger goes in `heartbeat_reason`. Why: the live receiver answers 400 invalid_request to any other value.
