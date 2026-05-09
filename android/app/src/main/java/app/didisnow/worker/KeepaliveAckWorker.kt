package app.didisnow.worker

import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Phase 2 — Keepalive ACK.
 * Triggered when a silent FCM PING arrives. Collects device reachability
 * state and POSTs to worker-keepalive-ack so the backend can flip the
 * worker's availability_state to ONLINE_HEALTHY.
 */
class KeepaliveAckWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val prefs = ctx.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        val userId = prefs.getString("user_id", null)
        if (userId.isNullOrBlank()) {
            WorkerLog.add(ctx, "KEEPALIVE", "skip — no user_id")
            return Result.success()
        }

        val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager
        val ignoringBatt = pm?.isIgnoringBatteryOptimizations(ctx.packageName) ?: false
        val notifEnabled = NotificationManagerCompat.from(ctx).areNotificationsEnabled()
        val standby = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            (ctx.getSystemService(Context.USAGE_STATS_SERVICE) as? UsageStatsManager)
                ?.appStandbyBucket?.let { bucketName(it) } ?: "unknown"
        } else "unknown"

        val body = JSONObject().apply {
            put("user_id", userId)
            put("battery_optimized", !ignoringBatt)
            put("app_standby_bucket", standby)
            put("notification_permission", if (notifEnabled) "granted" else "denied")
            put("oem", "${Build.MANUFACTURER}/${Build.MODEL}")
        }

        return try {
            val url = URL("https://paywwbuqycovjopryele.supabase.co/functions/v1/worker-keepalive-ack")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 10_000
                readTimeout = 10_000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", BackendSync.ANON_KEY_PUBLIC)
                setRequestProperty("Authorization", "Bearer ${BackendSync.ANON_KEY_PUBLIC}")
            }
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val code = conn.responseCode
            conn.disconnect()
            WorkerLog.add(ctx, "KEEPALIVE", "ack http=$code battOpt=${!ignoringBatt} notif=$notifEnabled bucket=$standby")
            if (code in 200..299) Result.success() else Result.retry()
        } catch (e: Exception) {
            WorkerLog.add(ctx, "KEEPALIVE", "ack FAILED: ${e.message}")
            Result.retry()
        }
    }

    private fun bucketName(b: Int): String = when (b) {
        10 -> "active"
        20 -> "working_set"
        30 -> "frequent"
        40 -> "rare"
        45 -> "restricted"
        50 -> "never"
        else -> "unknown($b)"
    }
}
