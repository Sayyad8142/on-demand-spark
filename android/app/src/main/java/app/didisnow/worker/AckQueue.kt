package app.didisnow.worker

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Durable ACK retry queue backed by SharedPreferences.
 *
 * Whenever an ACK (push_received / popup_shown / worker_seen / failure event)
 * fails to reach the backend — because the device is offline, the JWT flow
 * is unavailable, or Supabase returns a transient 5xx — we persist the
 * payload here. AckRetryWorker drains it on:
 *   - explicit enqueue (immediate + backoff retries)
 *   - app resume (MainActivity.onResume)
 *   - device boot / package replace (BootReceiver)
 *   - every heartbeat (HeartbeatWorker)
 *   - every network reconnect (WorkManager NetworkType.CONNECTED)
 *
 * The endpoint is idempotent on booking_request + event_type, so replays are
 * safe even if we accidentally send the same ACK twice.
 *
 * We keep this queue small (MAX_ENTRIES) and drop the oldest on overflow —
 * an ACK older than a booking's lifetime is worthless anyway.
 */
object AckQueue {
    private const val PREFS = "worker_ack_queue"
    private const val KEY = "pending"
    private const val MAX_ENTRIES = 100
    private const val MAX_AGE_MS = 24L * 60 * 60 * 1000 // 24h
    private const val KEY_GEN = "generation"

    /**
     * Client-side expiry of a signed ack_token, in epoch ms, or null if it
     * cannot be read. Used ONLY to stop client retries — the server remains
     * authoritative, and this is never used as the offer's acceptance deadline.
     * Format: v1.<base64url(JSON{r,w,b,exp})>.<sig>. Never logged.
     */
    fun tokenExpiryMs(token: String?): Long? {
        if (token.isNullOrBlank()) return null
        return try {
            val parts = token.split(".")
            if (parts.size != 3) return null
            val json = String(android.util.Base64.decode(parts[1], android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING or android.util.Base64.NO_WRAP), Charsets.UTF_8)
            val exp = JSONObject(json).optLong("exp", 0L)
            if (exp <= 0L) null else exp * 1000L
        } catch (_: Exception) { null }
    }

    fun isTokenExpired(token: String?, now: Long = System.currentTimeMillis()): Boolean {
        val exp = tokenExpiryMs(token) ?: return false
        return now >= exp
    }

    /** Bumped on logout/account switch; stale callbacks carrying an older value cannot re-enqueue. */
    fun generation(ctx: Context): Long = prefs(ctx).getLong(KEY_GEN, 0L)

    data class Entry(
        val bookingId: String?,
        val bookingRequestId: String?,
        val event: String,
        val queuedAt: Long,
        val attempts: Int,
        val appVersion: String?,
        val appState: String?,
        /** Phase 1C: signed ack token carried with this ACK (never logged). */
        val ackToken: String? = null,
    )

    private fun prefs(ctx: Context) =
        ctx.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun readAll(ctx: Context): JSONArray {
        val raw = prefs(ctx).getString(KEY, "[]") ?: "[]"
        return try { JSONArray(raw) } catch (_: Exception) { JSONArray() }
    }

    @Synchronized
    fun enqueue(
        ctx: Context,
        bookingId: String?,
        bookingRequestId: String?,
        event: String,
        appVersion: String? = null,
        appState: String? = null,
        ackToken: String? = null,
        expectedGeneration: Long? = null,
    ) {
        if (bookingId.isNullOrBlank() && bookingRequestId.isNullOrBlank()) return
        if (expectedGeneration != null && expectedGeneration != generation(ctx)) {
            WorkerLog.add(ctx, "ACK_QUEUE", "drop stale-generation event=$event (logout/account switch)")
            return
        }
        // Expired token: delivery confirmations are kept WITHOUT the token and
        // go through the worker login later; anything else is dropped.
        val ackToken = if (isTokenExpired(ackToken)) {
            if (event !in BackendSync.SESSION_FALLBACK_EVENTS) {
                WorkerLog.add(ctx, "ACK_QUEUE", "drop expired-token event=$event")
                return
            }
            null
        } else ackToken
        val now = System.currentTimeMillis()
        val arr = readAll(ctx)

        // Dedupe: if same (booking, event) is already queued, bump attempts only
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val sameBooking = (bookingRequestId != null && o.optString("booking_request_id") == bookingRequestId) ||
                (bookingRequestId == null && o.optString("booking_id") == bookingId)
            if (sameBooking && o.optString("event") == event) {
                WorkerLog.add(ctx, "ACK_QUEUE", "dedupe event=$event booking=${bookingId ?: bookingRequestId}")
                return
            }
        }

        val entry = JSONObject().apply {
            put("booking_id", bookingId ?: "")
            put("booking_request_id", bookingRequestId ?: "")
            put("event", event)
            put("queued_at", now)
            put("attempts", 0)
            if (appVersion != null) put("app_version", appVersion)
            if (appState != null) put("app_state", appState)
            if (!ackToken.isNullOrBlank()) put("ack_token", ackToken)
        }
        arr.put(entry)

        // Trim to MAX_ENTRIES, oldest first
        val trimmed = if (arr.length() > MAX_ENTRIES) {
            val out = JSONArray()
            val start = arr.length() - MAX_ENTRIES
            for (i in start until arr.length()) out.put(arr.get(i))
            out
        } else arr

        prefs(ctx).edit().putString(KEY, trimmed.toString()).apply()
        WorkerLog.add(ctx, "ACK_QUEUE", "enqueued event=$event booking=${bookingId ?: bookingRequestId} size=${trimmed.length()}")
    }

    @Synchronized
    fun snapshot(ctx: Context): List<Entry> {
        val arr = readAll(ctx)
        val out = mutableListOf<Entry>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out.add(
                Entry(
                    bookingId = o.optString("booking_id").ifBlank { null },
                    bookingRequestId = o.optString("booking_request_id").ifBlank { null },
                    event = o.optString("event"),
                    queuedAt = o.optLong("queued_at", 0),
                    attempts = o.optInt("attempts", 0),
                    appVersion = o.optString("app_version").ifBlank { null },
                    appState = o.optString("app_state").ifBlank { null },
                    ackToken = o.optString("ack_token").ifBlank { null },
                )
            )
        }
        return out
    }

    @Synchronized
    fun size(ctx: Context): Int = readAll(ctx).length()

    /**
     * Remove a specific entry after a successful send.
     * Matches on (bookingRequestId ?: bookingId, event).
     */
    @Synchronized
    fun remove(ctx: Context, entry: Entry) {
        val arr = readAll(ctx)
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val brid = o.optString("booking_request_id")
            val bid = o.optString("booking_id")
            val ev = o.optString("event")
            val matchByReq = entry.bookingRequestId != null && brid == entry.bookingRequestId
            val matchByBooking = entry.bookingRequestId == null && bid == (entry.bookingId ?: "")
            if ((matchByReq || matchByBooking) && ev == entry.event) continue
            out.put(o)
        }
        prefs(ctx).edit().putString(KEY, out.toString()).apply()
    }

    /**
     * Bump attempt counter and prune entries older than MAX_AGE_MS.
     */
    @Synchronized
    fun bumpAttempt(ctx: Context, entry: Entry) {
        val arr = readAll(ctx)
        val now = System.currentTimeMillis()
        val out = JSONArray()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (now - o.optLong("queued_at", now) > MAX_AGE_MS ||
                (isTokenExpired(o.optString("ack_token").ifBlank { null }, now) && o.optString("event") !in BackendSync.SESSION_FALLBACK_EVENTS)) {
                WorkerLog.add(ctx, "ACK_QUEUE", "dropped stale event=${o.optString("event")}")
                continue
            }
            val brid = o.optString("booking_request_id")
            val bid = o.optString("booking_id")
            val ev = o.optString("event")
            val matchByReq = entry.bookingRequestId != null && brid == entry.bookingRequestId
            val matchByBooking = entry.bookingRequestId == null && bid == (entry.bookingId ?: "")
            if ((matchByReq || matchByBooking) && ev == entry.event) {
                o.put("attempts", o.optInt("attempts", 0) + 1)
            }
            out.put(o)
        }
        prefs(ctx).edit().putString(KEY, out.toString()).apply()
    }

    @Synchronized
    fun clear(ctx: Context) {
        prefs(ctx).edit().remove(KEY).putLong(KEY_GEN, generation(ctx) + 1).commit()
    }
}
