package app.didisnow.worker

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Native FCM ack watchdog. Scheduled by MyFirebaseService when a BOOKING_ALERT
 * FCM payload is received. Fires after ACK_TIMEOUT_SEC unless the popup_shown
 * or worker_seen ack cancels it first.
 *
 * When it fires, it POSTs a missed-booking diagnostic with reason
 * "fcm_ack_timeout_native" — this covers the case where the WebView is
 * paused, killed, or otherwise unable to run the JS-side tracker.
 *
 * Uniqueness: per booking_id, so multiple offers coexist without collision.
 */
class AckWatchdogWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val bookingId = inputData.getString(KEY_BOOKING_ID) ?: return Result.success()
        val bookingRequestId = inputData.getString(KEY_BOOKING_REQUEST_ID)
        val scheduledAt = inputData.getLong(KEY_SCHEDULED_AT, System.currentTimeMillis())
        val elapsedMs = System.currentTimeMillis() - scheduledAt

        WorkerLog.add(
            ctx,
            "ACK_WATCHDOG",
            "fired booking=$bookingId req=$bookingRequestId elapsed=${elapsedMs}ms",
        )

        val ok = BackendSync.reportMissedBooking(
            ctx = ctx,
            bookingId = bookingId,
            bookingRequestId = bookingRequestId,
            reason = "fcm_ack_timeout_native",
            extra = JSONObject().apply {
                put("source", "ack_watchdog_worker")
                put("elapsed_ms", elapsedMs)
                put("ack_timeout_ms", ACK_TIMEOUT_MS)
            },
        )

        return if (ok) Result.success() else Result.retry()
    }

    companion object {
        private const val KEY_BOOKING_ID = "booking_id"
        private const val KEY_BOOKING_REQUEST_ID = "booking_request_id"
        private const val KEY_SCHEDULED_AT = "scheduled_at"

        const val ACK_TIMEOUT_MS = 20_000L
        private const val TAG_PREFIX = "ack-watchdog:"

        fun tagFor(bookingId: String) = "$TAG_PREFIX$bookingId"
        fun uniqueNameFor(bookingId: String) = "$TAG_PREFIX$bookingId"

        /** Called by MyFirebaseService when a BOOKING_ALERT arrives. */
        fun schedule(context: Context, bookingId: String, bookingRequestId: String?) {
            if (bookingId.isBlank()) return
            val ctx = context.applicationContext
            val req = OneTimeWorkRequestBuilder<AckWatchdogWorker>()
                .setInitialDelay(ACK_TIMEOUT_MS, TimeUnit.MILLISECONDS)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .addTag(tagFor(bookingId))
                .setInputData(
                    Data.Builder()
                        .putString(KEY_BOOKING_ID, bookingId)
                        .putString(KEY_BOOKING_REQUEST_ID, bookingRequestId)
                        .putLong(KEY_SCHEDULED_AT, System.currentTimeMillis())
                        .build()
                )
                .build()

            WorkManager.getInstance(ctx).enqueueUniqueWork(
                uniqueNameFor(bookingId),
                ExistingWorkPolicy.REPLACE,
                req,
            )
            WorkerLog.add(ctx, "ACK_WATCHDOG", "scheduled booking=$bookingId req=$bookingRequestId")
        }

        /** Cancel when popup_shown or worker_seen ack succeeds. */
        fun cancel(context: Context, bookingId: String) {
            if (bookingId.isBlank()) return
            val ctx = context.applicationContext
            try {
                WorkManager.getInstance(ctx).cancelUniqueWork(uniqueNameFor(bookingId))
                WorkerLog.add(ctx, "ACK_WATCHDOG", "cancelled booking=$bookingId")
            } catch (e: Exception) {
                WorkerLog.add(ctx, "ACK_WATCHDOG", "cancel failed booking=$bookingId: ${e.message}")
            }
        }
    }
}
