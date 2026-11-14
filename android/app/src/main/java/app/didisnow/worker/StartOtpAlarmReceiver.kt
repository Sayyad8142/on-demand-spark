package app.didisnow.worker
import android.content.*

class StartOtpAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
        when (intent.action) {
            "SILENCE" -> StartOtpAlarmEngine.silence(c)
            "TIMER" -> StartOtpAlarmEngine.reconcile(c, false)
            else -> {
                // Purge legacy schedules before dependency restore; new queue never replays finite clips.
                val store = c.getSharedPreferences("NOTIFICATION_STORE", Context.MODE_PRIVATE)
                val ids = store.all.keys.toList()
                for (key in ids) try {
                    val n = org.json.JSONObject(store.getString(key, "{}") ?: "{}")
                    if (n.optJSONObject("extra")?.optString("kind") == "start_otp_reminder") store.edit().remove(key).commit()
                } catch (_: Exception) {}
                // Android 15 forbids media-playback FGS at boot: wait for foreground user action.
                StartOtpAlarmEngine.fallback(c)
            }
        }
    }
}
