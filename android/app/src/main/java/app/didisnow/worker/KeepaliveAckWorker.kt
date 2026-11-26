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
        val userId = BackendSync.resolveWorkerId(ctx)
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

        val r = BackendSync.authedPost(ctx, "https://paywwbuqycovjopryele.supabase.co/functions/v1/worker-keepalive-ack", body)
        WorkerLog.add(ctx, "KEEPALIVE", "ack $r battOpt=${!ignoringBatt} notif=$notifEnabled bucket=$standby")
        return when (r) {
            BackgroundAuthRules.Outcome.OK, BackgroundAuthRules.Outcome.DROP -> Result.success()
            // Login missing/expired or network trouble: bounded WorkManager retries, then stop.
            else -> if (runAttemptCount + 1 < BackgroundAuthRules.WORKER_MAX_RUNS) Result.retry() else Result.success()
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
