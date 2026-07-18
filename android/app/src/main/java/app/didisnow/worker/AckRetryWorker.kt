package app.didisnow.worker

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.util.concurrent.TimeUnit

/**
 * Drains AckQueue: replays every pending ACK to the backend.
 *
 * Triggered by:
 *   - BackendSync.ackDelivery() on network failure (immediate + WorkManager
 *     exponential backoff: ~30s, 1m, 2m, 4m, 8m … capped at 10m)
 *   - MainActivity.onResume (opportunistic flush)
 *   - BootReceiver (after boot / package replace)
 *   - HeartbeatWorker (every 15 min)
 *
 * We call BackendSync.ackDeliverySync directly, WITHOUT re-enqueuing on
 * failure — WorkManager owns the retry cadence via Result.retry().
 */
class AckRetryWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val entries = AckQueue.snapshot(ctx)
        if (entries.isEmpty()) return Result.success()

        WorkerLog.add(ctx, "ACK_RETRY", "flushing ${entries.size} pending ACKs")

        var anyFailed = false
        for (entry in entries) {
            AckQueue.bumpAttempt(ctx, entry)
            val ok = BackendSync.sendAckDirect(
                ctx = ctx,
                bookingId = entry.bookingId,
                bookingRequestId = entry.bookingRequestId,
                event = entry.event,
                attempt = entry.attempts + 1,
            )
            if (ok) {
                AckQueue.remove(ctx, entry)
                WorkerLog.add(ctx, "ACK_RETRY", "ok event=${entry.event} booking=${entry.bookingId ?: entry.bookingRequestId}")
            } else {
                anyFailed = true
                WorkerLog.add(ctx, "ACK_RETRY", "still failing event=${entry.event} attempts=${entry.attempts + 1}")
            }
        }

        return if (anyFailed) Result.retry() else Result.success()
    }

    companion object {
        const val UNIQUE_NAME = "worker-ack-retry"

        fun enqueue(context: Context, reason: String) {
            try {
                val req = OneTimeWorkRequestBuilder<AckRetryWorker>()
                    .setConstraints(
                        Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build()
                    )
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                    .build()

                WorkManager.getInstance(context.applicationContext)
                    .enqueueUniqueWork(UNIQUE_NAME, ExistingWorkPolicy.REPLACE, req)
                WorkerLog.add(context, "ACK_RETRY", "enqueued reason=$reason")
            } catch (e: Exception) {
                WorkerLog.add(context, "ACK_RETRY", "enqueue failed: ${e.message}")
            }
        }

        /** Fire-and-forget best-effort flush from foreground (no retry chain). */
        fun flushOpportunistic(context: Context, reason: String) {
            if (AckQueue.size(context) == 0) return
            enqueue(context, reason)
        }
    }
}
