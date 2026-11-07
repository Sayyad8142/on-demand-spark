# Staged code changes (apply after GO)

## worker-health-watchdog/index.ts — notifyWorker
```ts
import { buildWorkerPausedPayload } from "../_shared/fcm_payloads.ts";
// ...
const { error } = await supabase.functions.invoke("send-fcm", {
  body: buildWorkerPausedPayload(worker.id, reason, title, body),
});
if (error) console.warn("[watchdog] notify failed", worker.id, error.message);
```

## fcm-keepalive/index.ts
```ts
import { buildKeepalivePingPayload } from "../_shared/fcm_payloads.ts";
import { internalKeyMatches } from "../_shared/notify_auth.ts";
// at top of handler (Stage 1 = observe only):
const ok = internalKeyMatches(req.headers.get("x-internal-key"), Deno.env.get("DISPATCH_INTERNAL_KEY"));
if (!ok) console.warn(JSON.stringify({ evt: "keepalive_unverified_caller" })); // Stage 3: return 401
// send:
body: JSON.stringify(buildKeepalivePingPayload(eligible, Date.now())),
```

## send-fcm/index.ts — silent PING
```ts
const isPing = data?.type === "PING";
const message = isBookingAlert || isCancellationAlert || isReminderCancel || isPing
  ? { message: { token, android: { priority: isPing ? "NORMAL" : "HIGH", ttl: isReminderCancel ? "7200s" : "60s" }, data: baseData } }
  : /* unchanged */;
```
