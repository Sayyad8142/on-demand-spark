package app.didisnow.worker

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Periodic native heartbeat — fires every 15 minutes (the minimum WorkManager
 * periodic interval) so the backend can record telemetry from devices even
 * when the JS layer is killed / backgrounded / asleep.
 *
 * Survives:
 *   - App closed / swiped away
 *   - Screen locked
 *   - Background / Doze (subject to OEM allowances)
 *   - Device reboot (BootReceiver re-enqueues)
 */
class HeartbeatWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val prefs = ctx.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        if (prefs.getString("user_id", null).isNullOrBlank()) {
            WorkerLog.add(ctx, "HEARTBEAT", "periodic skip — no user_id")
            return Result.success()
        }
        val ok = BackendSync.sendHeartbeat(ctx, "interval")
        WorkerLog.add(ctx, "HEARTBEAT", "periodic result=$ok")
        return if (ok) Result.success() else Result.retry()
    }

    companion object {
        const val UNIQUE_NAME = "worker-heartbeat-periodic"

        fun schedule(context: Context) {
            try {
                val req = PeriodicWorkRequestBuilder<HeartbeatWorker>(15, TimeUnit.MINUTES)
                    .setConstraints(
                        Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build()
                    )
                    .build()

                WorkManager.getInstance(context.applicationContext)
                    .enqueueUniquePeriodicWork(
                        UNIQUE_NAME,
                        ExistingPeriodicWorkPolicy.KEEP,
                        req
                    )
                WorkerLog.add(context, "HEARTBEAT", "periodic worker scheduled (15min)")
            } catch (e: Exception) {
                WorkerLog.add(context, "HEARTBEAT", "schedule failed: ${e.message}")
            }
        }

        fun cancel(context: Context) {
            try {
                WorkManager.getInstance(context.applicationContext)
                    .cancelUniqueWork(UNIQUE_NAME)
                WorkerLog.add(context, "HEARTBEAT", "periodic worker cancelled")
            } catch (_: Exception) {}
        }
    }
}
