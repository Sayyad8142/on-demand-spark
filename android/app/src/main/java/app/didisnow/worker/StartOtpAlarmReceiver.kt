package app.didisnow.worker
import android.content.*
import android.os.Handler
import android.os.Looper
import java.util.concurrent.atomic.AtomicBoolean

class StartOtpAlarmReceiver : BroadcastReceiver() {
    override fun onReceive(c: Context, intent: Intent) {
        when (intent.action) {
            "SILENCE" -> StartOtpAlarmEngine.silence(c)
            "TIMER" -> {
                // Keep the receiver's process alive during the asynchronous server read.
                // A hard bound respects Android's broadcast deadline even if the network stalls.
                val pending = goAsync()
                val done = AtomicBoolean(false)
                val handler = Handler(Looper.getMainLooper())
                val finish = Runnable { if (done.compareAndSet(false, true)) pending?.finish() }
                handler.postDelayed(finish, 9000)
                try {
                    StartOtpAlarmEngine.reconcile(c.applicationContext, false) {
                        handler.removeCallbacks(finish)
                        finish.run()
                    }
                } catch (_: Exception) {
                    handler.removeCallbacks(finish)
                    finish.run()
                }
            }
            else -> {
                // Purge legacy schedules before dependency restore; new queue never replays finite clips.
                val store = c.getSharedPreferences("NOTIFICATION_STORE", Context.MODE_PRIVATE)
                val ids = store.all.keys.toList()
                for (key in ids) try {
                    val n = org.json.JSONObject(store.getString(key, "{}") ?: "{}")
                    if (n.optJSONObject("extra")?.optString("kind") == "start_otp_reminder") store.edit().remove(key).commit()
                } catch (_: Exception) {}
                // Android 15 forbids media-playback FGS at boot: wait for foreground user action.
                StartOtpAlarmEngine.boot(c)
            }
        }
    }
}
