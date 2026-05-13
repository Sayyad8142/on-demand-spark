package app.didisnow.worker

import android.content.Context
import android.os.Build
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
     * Notify backend that an FCM booking alert reached the device or that the
     * popup was rendered. Calls the `ack-booking-delivery` edge function with
     * the worker's Supabase JWT (read from CapacitorStorage).
     *
     * event ∈ "push_received" | "popup_shown" | "worker_seen"
     * Safe to call from FCM service / overlay service. Idempotent server-side.
     */
    fun ackDelivery(
        ctx: Context,
        bookingId: String?,
        event: String,
    ): Boolean {
        if (bookingId.isNullOrBlank()) {
            WorkerLog.add(ctx, "ACK", "skip $event — no booking_id")
            return false
        }

        // Resolve user JWT from CapacitorStorage (set by web layer on login/refresh)
        val jwt: String? = try {
            val capPrefs = ctx.applicationContext
                .getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE)
            val sessionJson = capPrefs.getString("didi_session", null)
            if (!sessionJson.isNullOrBlank()) {
                JSONObject(sessionJson).optString("accessToken", "").ifBlank { null }
            } else null
        } catch (e: Exception) {
            WorkerLog.add(ctx, "ACK", "session parse failed: ${e.message}")
            null
        }

        if (jwt.isNullOrBlank()) {
            WorkerLog.add(ctx, "ACK", "skip $event booking=$bookingId — no JWT")
            return false
        }

        val url = "$SUPABASE_URL/functions/v1/ack-booking-delivery"
        val body = JSONObject().apply {
            put("booking_id", bookingId)
            put("event_type", event)
        }

        return try {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 8_000
                readTimeout = 8_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", ANON_KEY)
                setRequestProperty("Authorization", "Bearer $jwt")
            }
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            conn.disconnect()
            val ok = code in 200..299
            WorkerLog.add(ctx, "ACK", "$event booking=$bookingId → http=$code")
            ok
        } catch (e: Exception) {
            WorkerLog.add(ctx, "ACK", "$event booking=$bookingId FAILED: ${e.message}")
            false
        }
    }

    /** Fire-and-forget ack on a background thread. */
    fun ackDeliveryAsync(ctx: Context, bookingId: String?, event: String) {
        Thread({ ackDelivery(ctx, bookingId, event) }, "ack-$event").start()
    }
}
