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
            val code = conn.responseCode
            conn.disconnect()
            val ok = code in 200..299
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
    fun ackDelivery(
        ctx: Context,
        bookingId: String?,
        event: String,
        bookingRequestId: String? = null,
    ): Boolean {
        if (bookingId.isNullOrBlank() && bookingRequestId.isNullOrBlank()) {
            WorkerLog.add(ctx, "ACK", "skip $event — no booking id/request id")
            return false
        }

        val prefs = ctx.applicationContext
            .getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        val workerId = prefs.getString("user_id", null)
        if (workerId.isNullOrBlank()) {
            WorkerLog.add(ctx, "ACK", "skip $event — no worker_id in prefs")
            return false
        }

        val appVersion = try {
            val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
            "${pi.versionName}+${pi.longVersionCode}"
        } catch (_: Exception) { "unknown" }

        val url = "$SUPABASE_URL/functions/v1/ack-booking-delivery"
        val body = JSONObject().apply {
            if (!bookingId.isNullOrBlank()) put("booking_id", bookingId)
            if (!bookingRequestId.isNullOrBlank()) put("booking_request_id", bookingRequestId)
            put("worker_id", workerId)
            put("event_type", event)
            put("app_version", appVersion)
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
                setRequestProperty("Authorization", "Bearer $ANON_KEY")
            }
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            conn.disconnect()
            val ok = code in 200..299
            WorkerLog.add(ctx, "ACK", "$event booking=${bookingId ?: bookingRequestId} → http=$code")

            // Cancel the native ack watchdog once the popup is actually up or seen.
            if (ok && !bookingId.isNullOrBlank() && (event == "popup_shown" || event == "worker_seen")) {
                try { AckWatchdogWorker.cancel(ctx, bookingId) } catch (_: Exception) {}
            }
            ok
        } catch (e: Exception) {
            WorkerLog.add(ctx, "ACK", "$event booking=${bookingId ?: bookingRequestId} FAILED: ${e.message}")
            false
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
            val code = conn.responseCode
            conn.disconnect()
            val ok = code in 200..299
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

    /** Fire-and-forget ack on a background thread. */
    fun ackDeliveryAsync(ctx: Context, bookingId: String?, event: String, bookingRequestId: String? = null) {
        Thread({ ackDelivery(ctx, bookingId, event, bookingRequestId) }, "ack-$event").start()
    }

    /** Convenience for failure events (popup_failed, overlay_blocked, etc). */
    fun ackFailureAsync(ctx: Context, bookingId: String?, reason: String, bookingRequestId: String? = null) {
        ackDeliveryAsync(ctx, bookingId, reason, bookingRequestId)
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
            val code = conn.responseCode
            conn.disconnect()
            val ok = code in 200..299
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

