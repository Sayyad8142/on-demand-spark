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
import com.google.android.gms.tasks.Tasks
import com.google.firebase.messaging.FirebaseMessaging
import java.util.concurrent.TimeUnit

/**
 * One-shot worker scheduled by BootReceiver after device reboot or app update.
 * Fetches the latest FCM token from FirebaseMessaging and POSTs it to the
 * worker-boot-ping edge function so the backend knows the device is reachable.
 *
 * Network-constrained + exponential backoff so it survives airplane mode /
 * captive portals at boot time.
 */
class FcmBootSyncWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val event = inputData.getString(KEY_EVENT) ?: "boot"
        WorkerLog.add(ctx, "BOOT", "FcmBootSyncWorker started event=$event attempt=$runAttemptCount")

        val token: String? = try {
            // Block on the Firebase token task — we're already inside a CoroutineWorker.
            Tasks.await(FirebaseMessaging.getInstance().token, 15, TimeUnit.SECONDS)
        } catch (e: Exception) {
            WorkerLog.add(ctx, "TOKEN", "getToken() failed: ${e.message}")
            null
        }

        if (token.isNullOrBlank()) {
            WorkerLog.add(ctx, "TOKEN", "no token returned, will retry")
            return Result.retry()
        }

        // Mirror onNewToken side-effects: persist locally so JS layer can pick up.
        ctx.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
            .edit()
            .putString("pending_fcm_token", token)
            .putLong("pending_fcm_token_timestamp", System.currentTimeMillis())
            .apply()

        WorkerLog.add(ctx, "TOKEN", "boot token fetched len=${token.length}")

        val ok = BackendSync.pingBootSync(ctx, event, token)
        // Telemetry — heartbeat right after boot so the device shows reachable
        // even if the user never opens the app.
        try { BackendSync.sendHeartbeat(ctx, event) } catch (_: Exception) {}
        return if (ok) Result.success() else Result.retry()
    }

    companion object {
        const val UNIQUE_NAME = "fcm-boot-sync"
        const val KEY_EVENT = "event"

        fun enqueue(context: Context, event: String) {
            val req = OneTimeWorkRequestBuilder<FcmBootSyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .setInputData(Data.Builder().putString(KEY_EVENT, event).build())
                .build()

            WorkManager.getInstance(context.applicationContext)
                .enqueueUniqueWork(UNIQUE_NAME, ExistingWorkPolicy.REPLACE, req)

            WorkerLog.add(context, "BOOT", "FcmBootSyncWorker enqueued event=$event")
        }
    }
}
