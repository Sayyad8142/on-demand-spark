package app.didisnow.worker

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/**
 * Full-screen incoming Agora voice call screen. Launched from MyFirebaseService
 * when an `incoming_call` FCM data message arrives. Shows over lock screen, plays
 * ringtone, vibrates. Accept → opens MainActivity at /in-call/<bookingId>.
 * Decline → finish.
 */
class IncomingCallActivity : AppCompatActivity() {
    private val TAG = "IncomingCallActivity"
    private var ringtone: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var bookingId: String = ""
    private var customerName: String = ""
    private var autoEndHandler: android.os.Handler? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        bookingId = intent.getStringExtra("booking_id") ?: ""
        customerName = intent.getStringExtra("customer_name") ?: "Customer"

        if (bookingId.isBlank()) {
            Log.e(TAG, "❌ No booking_id — closing")
            finish()
            return
        }

        // Show over lock screen and turn screen on
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
            km.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        setContentView(R.layout.activity_incoming_call)

        findViewById<TextView>(R.id.callerName).text = customerName
        findViewById<TextView>(R.id.callerSubtitle).text = "Incoming voice call"
        findViewById<TextView>(R.id.bookingIdLabel).text = "Booking #${bookingId.take(8)}"

        findViewById<Button>(R.id.btnAccept).setOnClickListener { accept() }
        findViewById<Button>(R.id.btnDecline).setOnClickListener { decline() }

        startRingtone()
        startVibration()

        // Safety net: auto-decline after 45s if worker never responds
        autoEndHandler = android.os.Handler(mainLooper)
        autoEndHandler?.postDelayed({
            Log.w(TAG, "⏰ No answer in 45s — auto-declining")
            decline()
        }, 45_000)
    }

    private fun accept() {
        Log.d(TAG, "✅ Worker accepted call booking_id=$bookingId")
        stopRingtone()
        stopVibration()

        val launch = Intent(this, MainActivity::class.java).apply {
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            )
            putExtra("navigate_to", "in_call")
            putExtra("booking_id", bookingId)
            putExtra("customer_name", customerName)
            putExtra("call_action", "accept")
        }
        startActivity(launch)
        finish()
    }

    private fun decline() {
        Log.d(TAG, "❌ Worker declined call booking_id=$bookingId")
        stopRingtone()
        stopVibration()
        // Notify webview if alive so it can clear any state
        try {
            val b = Intent("INCOMING_CALL_DECLINED")
            b.putExtra("booking_id", bookingId)
            androidx.localbroadcastmanager.content.LocalBroadcastManager
                .getInstance(this).sendBroadcast(b)
        } catch (_: Exception) {}
        finish()
    }

    private fun startRingtone() {
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ringtone = MediaPlayer().apply {
                setDataSource(applicationContext, uri)
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) {
            Log.w(TAG, "Ringtone failed: ${e.message}")
        }
    }

    private fun stopRingtone() {
        try {
            ringtone?.stop()
            ringtone?.release()
        } catch (_: Exception) {}
        ringtone = null
    }

    private fun startVibration() {
        try {
            vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            val pattern = longArrayOf(0, 1000, 1000)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        } catch (_: Exception) {}
    }

    private fun stopVibration() {
        try { vibrator?.cancel() } catch (_: Exception) {}
        vibrator = null
    }

    override fun onDestroy() {
        autoEndHandler?.removeCallbacksAndMessages(null)
        stopRingtone()
        stopVibration()
        super.onDestroy()
    }
}
