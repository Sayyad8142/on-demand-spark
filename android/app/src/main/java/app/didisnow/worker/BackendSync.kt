package app.didisnow.worker

import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.app.NotificationManager
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Background-safe HTTP helper to ping the Supabase `worker-boot-ping` edge
 * function. Uses the public anon key (same one shipped in the JS bundle) and
 * the user_id stored in `worker_prefs` at login.
 *
 * Safe to call from BroadcastReceiver / WorkManager / Service contexts.
 */
object BackendSync {
    private const val SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co"
    // Public anon key (already shipped in JS bundle / .env).
    const val ANON_KEY_PUBLIC =
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
        "eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0." +
        "js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o"
    private const val ANON_KEY = ANON_KEY_PUBLIC

    private const val ENDPOINT = "$SUPABASE_URL/functions/v1/worker-boot-ping"

    /** event ∈ "boot" | "package_replaced" | "fcm_received" | "manual" */
    fun pingBootSync(
        ctx: Context,
        event: String,
        fcmToken: String?,
    ): Boolean {
        val prefs = ctx.applicationContext
            .getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        val userId = prefs.getString("user_id", null)

        if (userId.isNullOrBlank()) {
            WorkerLog.add(ctx, "BACKEND", "skip $event — no user_id stored")
            return false
        }

        val body = JSONObject().apply {
            put("user_id", userId)
            put("event", event)
            if (!fcmToken.isNullOrBlank()) put("fcm_token", fcmToken)
            put("oem", "${Build.MANUFACTURER}/${Build.MODEL}")
            put("android_version", Build.VERSION.RELEASE)
        }

        return try {
            val conn = (URL(ENDPOINT).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 10_000
                readTimeout = 10_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", ANON_KEY)
                setRequestProperty("Authorization", "Bearer $ANON_KEY")
            }
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            var code = conn.responseCode
            conn.disconnect()
            // Legacy receiver compatibility: the production build answers 400
            // to every current event name and only accepts "received"/"opened"
            // with booking_id + worker_id. Retry ONCE with the legacy name.
            val legacyEvent = LEGACY_ACK_EVENT[event]
            if (code == 400 && legacyEvent != null && !bookingId.isNullOrBlank() && !workerId.isNullOrBlank()) {
                val legacyBody = JSONObject().apply {
                    put("booking_id", bookingId)
                    put("worker_id", workerId)
                    put("event_type", legacyEvent)
                    put("app_version", appVersion(ctx))
                }
                val lc = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 8_000
                    readTimeout = 8_000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("apikey", ANON_KEY)
                    setRequestProperty("Authorization", "Bearer $ANON_KEY")
                }
                lc.outputStream.use { it.write(legacyBody.toString().toByteArray(Charsets.UTF_8)) }
                val legacyCode = lc.responseCode
                lc.disconnect()
                WorkerLog.add(ctx, "ACK", "$event legacy=$legacyEvent → http=$legacyCode")
                code = legacyCode
            }
            val result = classifyAckHttp(code, !ackToken.isNullOrBlank())
            val ok = result == AckResult.OK
            WorkerLog.add(
                ctx,
                "BACKEND",
                "boot-ping event=$event token=${fcmToken != null} → http=$code"
            )
            ok
        } catch (e: Exception) {
            WorkerLog.add(ctx, "BACKEND", "boot-ping event=$event FAILED: ${e.message}")
            false
        }
    }

    /**
     * Notify backend that an FCM booking alert reached the device, the popup
     * was rendered, or that a hard failure occurred.
     *
     * event ∈
     *   timestamps: "push_received" | "popup_shown" | "worker_seen"
     *   failures:   "popup_failed" | "permission_missing" | "overlay_blocked" | "app_killed" | "token_invalid"
     *
     * Uses the public anon apikey + the locally-stored worker_id (Firebase UID
     * in `worker_prefs.user_id`). Works in background, killed, and locked-screen
     * states where the Supabase user JWT may have expired.
     */
    /**
     * Resolve worker_id (== Firebase UID) from any durable store.
     * Falls back to CapacitorStorage.didi_session when worker_prefs.user_id
     * is missing (common after first login before AuthBridge writes, or after
     * a data-clear that only preserved CapacitorStorage). Backfills
     * worker_prefs on success.
     */
    private fun resolveWorkerId(ctx: Context): String? {
        val app = ctx.applicationContext
        val workerPrefs = app.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        val fromPrefs = workerPrefs.getString("user_id", null)
        if (!fromPrefs.isNullOrBlank()) return fromPrefs

        val capPrefs = app.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
        val sessionJson = capPrefs.getString("didi_session", null)
            ?: capPrefs.getString("didi-worker-session", null)
        if (!sessionJson.isNullOrBlank()) {
            try {
                val obj = JSONObject(sessionJson)
                val userObj = obj.optJSONObject("user")
                val uid = userObj?.optString("id")?.takeIf { it.isNotBlank() }
                if (!uid.isNullOrBlank()) {
                    workerPrefs.edit().putString("user_id", uid).apply()
                    WorkerLog.add(ctx, "ACK", "backfilled user_id from CapacitorStorage")
                    return uid
                }
            } catch (_: Exception) {}
        }
        return null
    }

    /**
     * Notify backend of a booking delivery lifecycle event.
     *
     * event ∈
     *   timestamps: "push_received" | "popup_shown" | "worker_seen"
     *   failures:   "popup_failed" | "permission_missing" | "overlay_blocked" | "app_killed" | "token_invalid"
     *
     * Durability:
     *   - missing worker_id → queued, flushed on next login / resume / boot
     *   - network / 5xx failure → queued + AckRetryWorker scheduled (exp backoff)
     *   - terminal 4xx (except 401/403) → dropped, not retried
     */
    /** Canonical event names; `booking_seen` is an accepted alias of `worker_seen`. */
    fun canonicalAckEvent(event: String): String = if (event == "booking_seen") "worker_seen" else event

    fun ackDelivery(
        ctx: Context,
        bookingId: String?,
        rawEvent: String,
        bookingRequestId: String? = null,
        ackToken: String? = null,
    ): Boolean {
        if (bookingId.isNullOrBlank() && bookingRequestId.isNullOrBlank()) {
            WorkerLog.add(ctx, "ACK", "skip $event — no booking id/request id")
            return false
        }

        val event = canonicalAckEvent(rawEvent)
        val gen = AckQueue.generation(ctx)
        val workerId = resolveWorkerId(ctx)
        // Phase 1C: a signed ack_token authenticates on its own, so a missing
        // local worker_id only blocks token-less ACKs.
        if (workerId.isNullOrBlank() && ackToken.isNullOrBlank() && sessionJwt(ctx) == null) {
            WorkerLog.add(ctx, "ACK", "queue $event — no worker_id available yet")
            AckQueue.enqueue(ctx, bookingId, bookingRequestId, event, appVersion(ctx), "no_worker_id", ackToken, gen)
            return false
        }

        val result = sendAckHttp(ctx, workerId, bookingId, bookingRequestId, event, attempt = 1, ackToken = ackToken)
        val ok = result == AckResult.OK
        if (result == AckResult.RETRY) {
            AckQueue.enqueue(ctx, bookingId, bookingRequestId, event, appVersion(ctx), "http_fail", ackToken, gen)
            AckRetryWorker.enqueue(ctx, "ack_fail:$event")
        }
        return ok
    }

    /** Called by AckRetryWorker — never re-enqueues (WorkManager owns retries). */
    fun sendAckDirect(
        ctx: Context,
        bookingId: String?,
        bookingRequestId: String?,
        event: String,
        attempt: Int,
        ackToken: String? = null,
    ): AckResult {
        val workerId = resolveWorkerId(ctx)
        if (workerId.isNullOrBlank() && ackToken.isNullOrBlank() && sessionJwt(ctx) == null) return AckResult.RETRY
        return sendAckHttp(ctx, workerId, bookingId, bookingRequestId, event, attempt, ackToken)
    }

    /**
     * Phase 1C outcome. REJECTED (400, or 401/403 on a token ACK) is never a
     * successful acknowledgment: it is logged and dropped, not retried with
     * the same (invalid/expired) token.
     */
    enum class AckResult { OK, RETRY, REJECTED }

    /** Mirrors LEGACY_ACK_EVENT in src/lib/bookingAck.ts. */
    val LEGACY_ACK_EVENT: Map<String, String> = mapOf(
        "push_received" to "received",
        "popup_shown" to "opened",
        "worker_seen" to "opened",
    )

    /** Pure classification — mirrored by src/lib/__tests__/ackToken.test.ts. */
    fun classifyAckHttp(code: Int, hasToken: Boolean): AckResult = when {
        code in 200..299 -> AckResult.OK
        code == 401 || code == 403 -> AckResult.REJECTED // never loop on auth failure
        code == 408 || code == 429 -> AckResult.RETRY
        code in 400..499 -> AckResult.REJECTED
        else -> AckResult.RETRY
    }

    /** Delivery confirmations that may use the login fallback (taps never). Mirrors SESSION_FALLBACK_EVENTS. */
    val SESSION_FALLBACK_EVENTS: Set<String> = setOf("push_received", "popup_shown", "worker_seen")

    /** Pure: mirrors sessionFallbackAllowed() in src/lib/bookingAck.ts. */
    fun sessionFallbackAllowed(event: String, code: Int, sentToken: Boolean): Boolean =
        sentToken && (code == 401 || code == 403) && event in SESSION_FALLBACK_EVENTS

    /**
     * Current worker login (Supabase session JWT written by AuthContext into
     * CapacitorStorage.didi_session). Returned only if not expiring within 30 s.
     * Cleared on logout, so a logged-out phone never authenticates. Never logged.
     */
    private fun sessionJwt(ctx: Context): String? {
        return try {
            val cap = ctx.applicationContext.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            // didi_session = AuthContext mirror; didi-worker-session = supabase-js
            // storage (auto-refreshed while the app runs). Freshest usable wins.
            val jwt = listOf("didi_session", "didi-worker-session")
                .mapNotNull { k ->
                    cap.getString(k, null)?.let { raw ->
                        try {
                            val o = JSONObject(raw)
                            o.optString("accessToken").ifBlank { o.optString("access_token") }.ifBlank { null }
                        } catch (_: Exception) { null }
                    }
                }
                .maxByOrNull { AckQueue.tokenExpiryMs(it) ?: 0L } ?: return null
            val exp = AckQueue.tokenExpiryMs(jwt) ?: return null
            if (exp - 30_000 > System.currentTimeMillis()) jwt else null
        } catch (_: Exception) { null }
    }

    private fun postAck(url: String, auth: String, body: JSONObject): Int {
        val c = (URL(url).openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 8_000
            readTimeout = 8_000
            doOutput = true
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("apikey", ANON_KEY)
            setRequestProperty("Authorization", "Bearer $auth")
        }
        c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
        val code = c.responseCode
        c.disconnect()
        return code
    }

    private fun sendAckHttp(
        ctx: Context,
        workerId: String?,
        bookingId: String?,
        bookingRequestId: String?,
        event: String,
        attempt: Int,
        ackToken: String? = null,
    ): AckResult {
        val url = "$SUPABASE_URL/functions/v1/ack-booking-delivery"
        val body = JSONObject().apply {
            if (!bookingId.isNullOrBlank()) put("booking_id", bookingId)
            if (!bookingRequestId.isNullOrBlank()) put("booking_request_id", bookingRequestId)
            // Phase 1C: signed ack token — echoed unchanged, never logged.
            if (!ackToken.isNullOrBlank()) put("ack_token", ackToken)
            if (!workerId.isNullOrBlank()) put("worker_id", workerId)
            put("event_type", event)
            put("app_version", appVersion(ctx))
            put("native_app_version", appVersion(ctx))
            put("native_version_code", nativeVersionCode(ctx))
            put("attempt", attempt)
            put("device_info", JSONObject().apply {
                put("oem", "${Build.MANUFACTURER}/${Build.MODEL}")
                put("android_version", Build.VERSION.RELEASE)
                put("sdk", Build.VERSION.SDK_INT)
            })
        }

        return try {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 8_000
                readTimeout = 8_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", ANON_KEY)
                // No signed token: the verified worker login is the proof of identity.
                val primaryAuth = if (ackToken.isNullOrBlank()) sessionJwt(ctx) ?: ANON_KEY else ANON_KEY
                setRequestProperty("Authorization", "Bearer $primaryAuth")
            }
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            var code = conn.responseCode
            conn.disconnect()
            // Token refused (invalid/expired/unknown to server): retry ONCE with
            // the worker login — no ack_token, no worker_id (server derives it).
            if (sessionFallbackAllowed(event, code, !ackToken.isNullOrBlank())) {
                val jwt = sessionJwt(ctx)
                if (jwt != null) {
                    val fbBody = JSONObject(body.toString()).apply { remove("ack_token"); remove("worker_id") }
                    code = postAck(url, jwt, fbBody)
                    WorkerLog.add(ctx, "ACK", "$event session-fallback → http=$code")
                } else {
                    WorkerLog.add(ctx, "ACK", "$event token refused, no current login — queued for next open")
                    return AckResult.RETRY
                }
            } else if (ackToken.isNullOrBlank() && (code == 401 || code == 403) && event in SESSION_FALLBACK_EVENTS && sessionJwt(ctx) == null) {
                // Login expired in background: keep it (bounded) in the queue; the app
                // refreshes the login on open/resume and the queue is flushed then.
                WorkerLog.add(ctx, "ACK", "$event no current login — queued for next open")
                return AckResult.RETRY
            }
            // Legacy receiver compatibility: the production build answers 400
            // to every current event name and only accepts "received"/"opened"
            // with booking_id + worker_id. Retry ONCE with the legacy name.
            val legacyEvent = LEGACY_ACK_EVENT[event]
            if (code == 400 && legacyEvent != null && !bookingId.isNullOrBlank() && !workerId.isNullOrBlank()) {
                val legacyBody = JSONObject().apply {
                    put("booking_id", bookingId)
                    put("worker_id", workerId)
                    put("event_type", legacyEvent)
                    put("app_version", appVersion(ctx))
                }
                val lc = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 8_000
                    readTimeout = 8_000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("apikey", ANON_KEY)
                    setRequestProperty("Authorization", "Bearer $ANON_KEY")
                }
                lc.outputStream.use { it.write(legacyBody.toString().toByteArray(Charsets.UTF_8)) }
                val legacyCode = lc.responseCode
                lc.disconnect()
                WorkerLog.add(ctx, "ACK", "$event legacy=$legacyEvent → http=$legacyCode")
                code = legacyCode
            }
            val result = classifyAckHttp(code, !ackToken.isNullOrBlank())
            val ok = result == AckResult.OK
            WorkerLog.add(
                ctx,
                "ACK",
                "$event booking=${bookingId ?: bookingRequestId} attempt=$attempt → http=$code"
            )

            if (ok && !bookingId.isNullOrBlank() && (event == "popup_shown" || event == "worker_seen")) {
                try { AckWatchdogWorker.cancel(ctx, bookingId) } catch (_: Exception) {}
            }
            if (result == AckResult.REJECTED) {
                WorkerLog.add(ctx, "ACK", "$event REJECTED http=$code — not acknowledged, dropping")
            }
            result
        } catch (e: Exception) {
            WorkerLog.add(
                ctx,
                "ACK",
                "$event booking=${bookingId ?: bookingRequestId} attempt=$attempt FAILED: ${e.message}"
            )
            AckResult.RETRY
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Missed-booking diagnostic — mirrors src/lib/missedBookingDiagnostics.ts
    // ─────────────────────────────────────────────────────────────────────────

    private const val MISSED_ENDPOINT = "$SUPABASE_URL/functions/v1/report-missed-booking"

    fun reportMissedBooking(
        ctx: Context,
        bookingId: String?,
        bookingRequestId: String?,
        reason: String,
        extra: JSONObject? = null,
    ): Boolean {
        val prefs = ctx.applicationContext
            .getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        val userId = prefs.getString("user_id", null)
        if (userId.isNullOrBlank()) {
            WorkerLog.add(ctx, "MISSED", "skip $reason — no user_id in prefs")
            return false
        }

        val body = JSONObject().apply {
            put("user_id", userId)
            if (!bookingId.isNullOrBlank()) put("booking_id", bookingId)
            if (!bookingRequestId.isNullOrBlank()) put("booking_request_id", bookingRequestId)
            put("reason", reason)
            put("platform", "android")
            put("app_state", "background_native")
            put("app_version", appVersion(ctx))
            put("network_online", networkType(ctx) != "none")
            put("notification_permission", if (notificationsEnabled(ctx)) "granted" else "denied")
            put("battery_optimized", !batteryOptimizationDisabled(ctx))
            put("manufacturer", Build.MANUFACTURER)
            put("model", Build.MODEL)
            put("sdk", Build.VERSION.SDK_INT)
            if (extra != null) put("extra", extra)
        }

        return try {
            val conn = (URL(MISSED_ENDPOINT).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 8_000
                readTimeout = 8_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", ANON_KEY)
                setRequestProperty("Authorization", "Bearer $ANON_KEY")
            }
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            var code = conn.responseCode
            conn.disconnect()
            // Legacy receiver compatibility: the production build answers 400
            // to every current event name and only accepts "received"/"opened"
            // with booking_id + worker_id. Retry ONCE with the legacy name.
            val legacyEvent = LEGACY_ACK_EVENT[event]
            if (code == 400 && legacyEvent != null && !bookingId.isNullOrBlank() && !workerId.isNullOrBlank()) {
                val legacyBody = JSONObject().apply {
                    put("booking_id", bookingId)
                    put("worker_id", workerId)
                    put("event_type", legacyEvent)
                    put("app_version", appVersion(ctx))
                }
                val lc = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 8_000
                    readTimeout = 8_000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("apikey", ANON_KEY)
                    setRequestProperty("Authorization", "Bearer $ANON_KEY")
                }
                lc.outputStream.use { it.write(legacyBody.toString().toByteArray(Charsets.UTF_8)) }
                val legacyCode = lc.responseCode
                lc.disconnect()
                WorkerLog.add(ctx, "ACK", "$event legacy=$legacyEvent → http=$legacyCode")
                code = legacyCode
            }
            val result = classifyAckHttp(code, !ackToken.isNullOrBlank())
            val ok = result == AckResult.OK
            WorkerLog.add(ctx, "MISSED", "$reason booking=$bookingId → http=$code")
            ok
        } catch (e: Exception) {
            WorkerLog.add(ctx, "MISSED", "$reason booking=$bookingId FAILED: ${e.message}")
            false
        }
    }

    fun reportMissedBookingAsync(
        ctx: Context,
        bookingId: String?,
        bookingRequestId: String?,
        reason: String,
        extra: JSONObject? = null,
    ) {
        Thread({ reportMissedBooking(ctx, bookingId, bookingRequestId, reason, extra) }, "missed-$reason").start()
    }

    // ── Presentation ACK dedup (survives process death; Activity+Overlay race) ──
    private const val DEDUP_PREFS = "ack_dedup"
    private const val DEDUP_TTL_MS = 15 * 60 * 1000L

    /** Returns true if this (event, offer) has not been acked recently. */
    private fun markAckOnce(ctx: Context, event: String, offerKey: String): Boolean {
        return try {
            val prefs = ctx.getSharedPreferences(DEDUP_PREFS, Context.MODE_PRIVATE)
            val key = "$event:$offerKey"
            val now = System.currentTimeMillis()
            val last = prefs.getLong(key, 0L)
            if (last > 0L && now - last < DEDUP_TTL_MS) return false
            val editor = prefs.edit().putLong(key, now)
            // Cheap GC of stale entries.
            prefs.all.forEach { (k, v) ->
                if (v is Long && now - v > DEDUP_TTL_MS) editor.remove(k)
            }
            editor.apply()
            true
        } catch (_: Exception) {
            true // never block a real ACK because dedup failed
        }
    }

    /**
     * Durable ack. The raw background thread used previously was frequently
     * killed/frozen by the OS as soon as onMessageReceived() returned while the
     * app was backgrounded, so push_received ACKs never reached the backend.
     *
     * We now persist the ACK first (AckQueue) and schedule AckRetryWorker —
     * WorkManager survives process freeze/kill — while still attempting the
     * inline send for the fast path. The entry is removed on inline success.
     */
    /** Events emitted at most once per offer per device (duplicate protection). */
    private val ONCE_PER_OFFER_EVENTS = setOf(
        "popup_shown", "worker_seen", "accept_tapped", "reject_tapped", "offer_expired", "offer_dismissed",
    )

    fun ackDeliveryAsync(
        ctx: Context,
        bookingId: String?,
        event: String,
        bookingRequestId: String? = null,
        ackToken: String? = null,
    ) {
        if (bookingId.isNullOrBlank() && bookingRequestId.isNullOrBlank()) return
        val app = ctx.applicationContext
        val gen = AckQueue.generation(app)
        // Duplicate protection: Activity + Overlay can both present the same
        // offer (fallback races). Presentation events are emitted exactly once
        // per offer per device within DEDUP_TTL_MS.
        if (event in ONCE_PER_OFFER_EVENTS) {
            if (!markAckOnce(app, event, bookingRequestId ?: bookingId!!)) {
                WorkerLog.add(app, "ACK", "skip duplicate $event booking=${bookingId ?: bookingRequestId}")
                return
            }
        }

        try {
            AckQueue.enqueue(app, bookingId, bookingRequestId, event, appVersion(app), "durable", ackToken, gen)
            AckRetryWorker.enqueue(app, "ack:$event")
        } catch (e: Exception) {
            WorkerLog.add(app, "ACK", "durable enqueue failed: ${e.message}")
        }
        Thread({
            val result = try {
                sendAckDirect(app, bookingId, bookingRequestId, event, attempt = 1, ackToken = ackToken)
            } catch (_: Exception) { AckResult.RETRY }
            // OK → done; REJECTED → never acked, drop so the bad token is not replayed.
            if (result != AckResult.RETRY) {
                try {
                    AckQueue.remove(
                        app,
                        AckQueue.Entry(bookingId, bookingRequestId, event, System.currentTimeMillis(), 0, null, null),
                    )
                } catch (_: Exception) {}
            }
        }, "ack-$event").start()
    }


    /** Convenience for failure events (popup_failed, overlay_blocked, etc). */
    fun ackFailureAsync(ctx: Context, bookingId: String?, reason: String, bookingRequestId: String? = null, ackToken: String? = null) {
        ackDeliveryAsync(ctx, bookingId, reason, bookingRequestId, ackToken)
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Heartbeat — posts to worker-heartbeat edge function. Safe to call from a
    // foreground service ticker; works in background / screen-off / locked.
    // ─────────────────────────────────────────────────────────────────────────

    private const val HEARTBEAT_ENDPOINT = "$SUPABASE_URL/functions/v1/worker-heartbeat"

    private fun batteryLevel(ctx: Context): Int {
        return try {
            val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as? BatteryManager
            bm?.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1
        } catch (_: Exception) { -1 }
    }

    private fun networkType(ctx: Context): String {
        return try {
            val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return "unknown"
            val net = cm.activeNetwork ?: return "none"
            val caps = cm.getNetworkCapabilities(net) ?: return "none"
            when {
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
                else -> "other"
            }
        } catch (_: Exception) { "unknown" }
    }

    private fun batteryOptimizationDisabled(ctx: Context): Boolean {
        return try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
            val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
            pm.isIgnoringBatteryOptimizations(ctx.packageName)
        } catch (_: Exception) { false }
    }

    private fun notificationsEnabled(ctx: Context): Boolean {
        return try { NotificationManagerCompat.from(ctx).areNotificationsEnabled() } catch (_: Exception) { false }
    }

    /** Native APK versionCode — proves which APK is actually installed (OTA cannot change it). */
    private fun nativeVersionCode(ctx: Context): Long {
        return try {
            val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) pi.longVersionCode
            else @Suppress("DEPRECATION") pi.versionCode.toLong()
        } catch (_: Exception) { -1L }
    }

    private fun appVersion(ctx: Context): String {
        return try {
            val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
            pi.versionName ?: "unknown"
        } catch (_: Exception) { "unknown" }
    }

    /**
     * Fire a heartbeat. Returns true on HTTP 2xx.
     * `appState` ∈ "foreground" | "background" | "interval" | "open" | "login".
     */
    fun sendHeartbeat(ctx: Context, appState: String): Boolean {
        val prefs = ctx.applicationContext
            .getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        val workerId = prefs.getString("user_id", null)
        if (workerId.isNullOrBlank()) {
            WorkerLog.add(ctx, "HEARTBEAT", "skip — no user_id stored")
            return false
        }
        val fcmToken = prefs.getString("last_known_fcm_token", null)
            ?: prefs.getString("pending_fcm_token", null)

        val body = JSONObject().apply {
            put("worker_id", workerId)
            put("app_state", appState)
            put("battery_level", batteryLevel(ctx))
            put("network_type", networkType(ctx))
            put("app_version", appVersion(ctx))
            put("native_app_version", appVersion(ctx))
            put("native_version_code", nativeVersionCode(ctx))
            put("notification_permission_granted", notificationsEnabled(ctx))
            put("battery_optimization_disabled", batteryOptimizationDisabled(ctx))
            put("device_manufacturer", Build.MANUFACTURER.lowercase())
            if (!fcmToken.isNullOrBlank()) put("fcm_token", fcmToken)
            put("device_info", JSONObject().apply {
                put("manufacturer", Build.MANUFACTURER)
                put("model", Build.MODEL)
                put("android_version", Build.VERSION.RELEASE)
                put("sdk", Build.VERSION.SDK_INT)
                put("platform", "android")
                put("notification_permission", if (notificationsEnabled(ctx)) "granted" else "denied")
                put("battery_optimized", !batteryOptimizationDisabled(ctx))
            })
        }

        return try {
            val conn = (URL(HEARTBEAT_ENDPOINT).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 8_000
                readTimeout = 8_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", ANON_KEY)
                setRequestProperty("Authorization", "Bearer $ANON_KEY")
            }
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            var code = conn.responseCode
            conn.disconnect()
            // Legacy receiver compatibility: the production build answers 400
            // to every current event name and only accepts "received"/"opened"
            // with booking_id + worker_id. Retry ONCE with the legacy name.
            val legacyEvent = LEGACY_ACK_EVENT[event]
            if (code == 400 && legacyEvent != null && !bookingId.isNullOrBlank() && !workerId.isNullOrBlank()) {
                val legacyBody = JSONObject().apply {
                    put("booking_id", bookingId)
                    put("worker_id", workerId)
                    put("event_type", legacyEvent)
                    put("app_version", appVersion(ctx))
                }
                val lc = (URL(url).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 8_000
                    readTimeout = 8_000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("apikey", ANON_KEY)
                    setRequestProperty("Authorization", "Bearer $ANON_KEY")
                }
                lc.outputStream.use { it.write(legacyBody.toString().toByteArray(Charsets.UTF_8)) }
                val legacyCode = lc.responseCode
                lc.disconnect()
                WorkerLog.add(ctx, "ACK", "$event legacy=$legacyEvent → http=$legacyCode")
                code = legacyCode
            }
            val result = classifyAckHttp(code, !ackToken.isNullOrBlank())
            val ok = result == AckResult.OK
            WorkerLog.add(ctx, "HEARTBEAT", "state=$appState token=${fcmToken != null} → http=$code")
            ok
        } catch (e: Exception) {
            WorkerLog.add(ctx, "HEARTBEAT", "state=$appState FAILED: ${e.message}")
            false
        }
    }

    /** Fire-and-forget heartbeat on a background thread. */
    fun sendHeartbeatAsync(ctx: Context, appState: String) {
        Thread({ sendHeartbeat(ctx, appState) }, "heartbeat-$appState").start()
    }
}

