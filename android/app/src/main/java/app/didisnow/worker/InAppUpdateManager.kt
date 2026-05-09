package app.didisnow.worker

import android.app.Activity
import android.content.Intent
import android.util.Log
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability

/**
 * Google Play In-App Updates — IMMEDIATE flow.
 *
 * Workers cannot use the app while a required Play Store update is available.
 * Falls back silently on debug builds, sideloads, or if Play services unavailable.
 *
 * The existing Supabase force-update screen remains the secondary fallback.
 */
class InAppUpdateManager(private val activity: Activity) {

    companion object {
        private const val TAG = "InAppUpdate"
        const val REQUEST_CODE = 17341
    }

    private val appUpdateManager: AppUpdateManager by lazy {
        AppUpdateManagerFactory.create(activity.applicationContext)
    }

    /** Check on cold start. */
    fun checkForUpdate() {
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "Skipping update check in DEBUG build")
            return
        }
        try {
            appUpdateManager.appUpdateInfo
                .addOnSuccessListener { info -> handleUpdateInfo(info, firstCheck = true) }
                .addOnFailureListener { e ->
                    Log.w(TAG, "Update check failed: ${e.message}")
                }
        } catch (t: Throwable) {
            Log.w(TAG, "Update check threw: ${t.message}")
        }
    }

    /** Re-check on resume in case immediate update was interrupted. */
    fun resumeUpdateIfPending() {
        if (BuildConfig.DEBUG) return
        try {
            appUpdateManager.appUpdateInfo
                .addOnSuccessListener { info ->
                    if (info.updateAvailability() ==
                        UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS
                    ) {
                        Log.d(TAG, "Resuming pending immediate update")
                        startImmediateFlow(info)
                    } else {
                        // Also retry if a required update is still available
                        handleUpdateInfo(info, firstCheck = false)
                    }
                }
                .addOnFailureListener { e ->
                    Log.w(TAG, "Resume update check failed: ${e.message}")
                }
        } catch (t: Throwable) {
            Log.w(TAG, "Resume update threw: ${t.message}")
        }
    }

    private fun handleUpdateInfo(info: AppUpdateInfo, firstCheck: Boolean) {
        val versionCode = try {
            activity.packageManager.getPackageInfo(activity.packageName, 0).longVersionCode
        } catch (_: Throwable) { -1L }

        val available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE
        val immediateAllowed = info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE)

        Log.d(
            TAG,
            "currentVersionCode=$versionCode availability=${info.updateAvailability()} " +
                "available=$available immediateAllowed=$immediateAllowed " +
                "installStatus=${info.installStatus()} firstCheck=$firstCheck"
        )

        if (available && immediateAllowed) {
            startImmediateFlow(info)
        }
    }

    private fun startImmediateFlow(info: AppUpdateInfo) {
        try {
            val started = appUpdateManager.startUpdateFlowForResult(
                info,
                activity,
                AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build(),
                REQUEST_CODE
            )
            Log.d(TAG, "Immediate update flow started=$started")
        } catch (t: Throwable) {
            Log.w(TAG, "Failed to start update flow: ${t.message}")
        }
    }

    /** Call from MainActivity.onActivityResult. */
    fun handleActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE) return
        Log.d(TAG, "onActivityResult resultCode=$resultCode (immediate update)")
        if (resultCode != Activity.RESULT_OK) {
            // User cancelled or update failed — re-check on next resume will reprompt.
            Log.w(TAG, "Immediate update cancelled or failed (resultCode=$resultCode)")
        }
    }
}
