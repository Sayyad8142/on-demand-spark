# send-fcm handoff (NOT EDITED — saving the file auto-deploys to production)

Add to `supabase/functions/send-fcm/index.ts` inside the per-worker send:

```ts
const isReminderCancel = data?.type === "START_OTP_REMINDER_CANCEL";
// worker_uid is set by the SERVER from the token lookup, never from the caller.
if (isReminderCancel) {
  baseData.worker_uid = String(userId);
  baseData.reason = String(data?.reason || "");
}
const message = isBookingAlert || isCancellationAlert || isReminderCancel
  ? { message: { token, android: { priority: "HIGH", ttl: isReminderCancel ? "7200s" : "60s" }, data: baseData } }
  : /* unchanged */;
```

Why: today any unknown type gets a visible notification and a 60 s lifetime. The cancel must be
data-only (silent) and wait up to 2 h for an offline phone (the reminder window).
