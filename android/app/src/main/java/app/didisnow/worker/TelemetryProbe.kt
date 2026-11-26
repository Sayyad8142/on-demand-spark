package app.didisnow.worker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Admin test notification (type=telemetry_probe). Confirms delivery with the
 * signed ack_token (device-ack), optionally shows a plain "test" notification
 * (show_overlay) and confirms it (popup-ack). Never touches OfferQueue,
 * booking alerts, acceptance or booking ACKs.
 */
object TelemetryProbe {
    private const val BASE = "https://paywwbuqycovjopryele.supabase.co/functions/v1"
    private const val CHANNEL = "admin_test_notifications"
    private const val DEDUP_PREFS = "probe_dedup"

    /** Returns true when the message was a probe (handled or ignored) — caller must stop. */
    @JvmStatic
    fun handle(ctx: Context, data: Map<String, String>): Boolean {
        if (!BackgroundAuthRules.isProbeType(data["type"])) return false
        val probe = BackgroundAuthRules.parseProbe(data)
        if (probe == null) { WorkerLog.add(ctx, "PROBE", "ignored — missing id or token"); return true }
        val prefs = ctx.applicationContext.getSharedPreferences(DEDUP_PREFS, Context.MODE_PRIVATE)
        if (prefs.contains(probe.probeId)) { WorkerLog.add(ctx, "PROBE", "duplicate ignored"); return true }
        prefs.edit().putLong(probe.probeId, System.currentTimeMillis()).apply()
        Thread({
            send(ctx, "device-ack", probe)
            if (probe.showOverlay && show(ctx, probe)) send(ctx, "popup-ack", probe)
        }, "probe-ack").start()
        return true
    }

    private fun show(ctx: Context, probe: BackgroundAuthRules.Probe): Boolean = try {
        val nm = NotificationManagerCompat.from(ctx)
        if (!nm.areNotificationsEnabled()) false else {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                    .createNotificationChannel(NotificationChannel(CHANNEL, "Didi Now test messages", NotificationManager.IMPORTANCE_DEFAULT))
            }
            val n = NotificationCompat.Builder(ctx, CHANNEL)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle("Didi Now test message")
                .setContentText("This is a test from Didi Now. It is not a booking.")
                .setAutoCancel(true)
                .build()
            nm.notify(probe.probeId.hashCode(), n)
            true
        }
    } catch (e: Exception) { WorkerLog.add(ctx, "PROBE", "show failed: ${e.javaClass.simpleName}"); false }

    private fun send(ctx: Context, fn: String, probe: BackgroundAuthRules.Probe) {
        val body = JSONObject().put("probe_id", probe.probeId).put("worker_id", probe.workerId).put("ack_token", probe.ackToken)
        var attempt = 0
        while (attempt < 3) {
            attempt++
            val jwt = BackendSync.freshSessionJwt(ctx)
            val code = try {
                val c = (URL("$BASE/$fn").openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"; connectTimeout = 8_000; readTimeout = 8_000; doOutput = true
                    setRequestProperty("Content-Type", "application/json")
                    setRequestProperty("apikey", BackendSync.ANON_KEY_PUBLIC)
                    // The signed ack_token is the proof; the login is added when present.
                    setRequestProperty("Authorization", "Bearer ${jwt ?: BackendSync.ANON_KEY_PUBLIC}")
                }
                c.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                c.responseCode.also { c.disconnect() }
            } catch (_: Exception) { -1 }
            WorkerLog.add(ctx, "PROBE", "$fn attempt=$attempt http=$code")
            if (code in 200..299 || code in 400..499 && code != 408 && code != 429) return
            try { Thread.sleep(2_000L * attempt) } catch (_: InterruptedException) { return }
        }
    }
}
