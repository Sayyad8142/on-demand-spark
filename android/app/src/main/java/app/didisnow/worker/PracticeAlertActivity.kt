package app.didisnow.worker

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

/** Reuses production layout/media only. All actions are local to PracticeSession. */
class PracticeAlertView(private val ctx: Context, private val id: String, private val close: () -> Unit) {
    val view: View = LayoutInflater.from(ctx).inflate(R.layout.activity_booking_alert, null)
    private val handler = Handler(Looper.getMainLooper())
    private var player: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var stopped = false
    fun show() {
        if (!PracticeSession.matches(ctx, id) || OfferQueue.isLocallyBusy(ctx) || OfferQueue.hasLiveOffer(ctx)) { close(); return }
        view.findViewById<TextView>(R.id.alertTitle).text = "TEST BOOKING"
        view.findViewById<TextView>(R.id.alertService).text = "Maid"
        view.findViewById<TextView>(R.id.alertServiceSubtitle).text = "Dishwashing • Practice Only"
        view.findViewById<TextView>(R.id.alertPrice).text = "₹100"
        view.findViewById<TextView>(R.id.alertTowerLabel).text = "Flat"
        view.findViewById<TextView>(R.id.alertTower).text = "001"
        view.findViewById<TextView>(R.id.alertCommunity).text = "TEST BOOKING — Practice Only"
        view.findViewById<Button>(R.id.btnAccept).setOnClickListener {
            if (PracticeSession.matches(ctx, id) && !OfferQueue.isLocallyBusy(ctx) && !OfferQueue.hasLiveOffer(ctx)) {
                PracticeSession.outcome(ctx, "accepted")
                // Return to the already prepared practice screen, not a real booking route.
                ctx.startActivity(Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP))
            } else PracticeSession.outcome(ctx, "blocked")
            close()
        }
        view.findViewById<Button>(R.id.btnReject).setOnClickListener { PracticeSession.outcome(ctx, "rejected"); close() }
        PracticeSession.mark(ctx, "overlay")
        try {
            val p = MediaPlayer()
            try {
                p.setAudioAttributes(AudioAttributes.Builder().setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).setUsage(AudioAttributes.USAGE_ALARM).build())
                p.setDataSource(ctx, Uri.parse("android.resource://${ctx.packageName}/${R.raw.new_loud_ringtone}"))
                p.isLooping = true; p.setVolume(1f, 1f); p.prepare(); p.start(); player = p
            } catch (_: Exception) { p.release() }
            vibrator = ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            val pattern = longArrayOf(0, 1000, 500)
            if (Build.VERSION.SDK_INT >= 26) vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            else { @Suppress("DEPRECATION") vibrator?.vibrate(pattern, 0) }
        } catch (_: Exception) { /* Audio is never inferred as verified. */ }
        tick()
    }
    private fun tick() {
        if (stopped) return
        if (OfferQueue.isLocallyBusy(ctx) || OfferQueue.hasLiveOffer(ctx)) { PracticeSession.outcome(ctx, "blocked"); close(); return }
        val seconds = ((PracticeSession.expiry(ctx) - System.currentTimeMillis() + 999) / 1000).coerceAtLeast(0).toInt()
        if (seconds <= 0) { PracticeSession.outcome(ctx, "expired"); close(); return }
        if (!PracticeSession.matches(ctx, id)) { close(); return }
        view.findViewById<TextView>(R.id.countdown).text = "${seconds}s"
        view.findViewById<ProgressBar>(R.id.countdownCircle).progress = seconds
        handler.postDelayed({ tick() }, 250)
    }
    fun stop() {
        stopped = true; handler.removeCallbacksAndMessages(null)
        val p = player; player = null
        try { p?.stop() } catch (_: Exception) {} finally { p?.release() }
        vibrator?.cancel(); vibrator = null
        (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).cancel(812340)
    }
}

class PracticeAlertActivity : AppCompatActivity() {
    private var alert: PracticeAlertView? = null
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        stopService(Intent(this, PracticeAlertService::class.java))
        val id = intent.getStringExtra("practice_id") ?: ""
        if (!PracticeSession.matches(this, id)) { finish(); return }
        alert = PracticeAlertView(this, id) { finish() }
        setContentView(alert?.view)
        alert?.show()
    }
    override fun onDestroy() { alert?.stop(); super.onDestroy() }
}
class PracticeAlertService : Service() {
    private var alert: PracticeAlertView? = null
    private var manager: WindowManager? = null
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val id = intent?.getStringExtra("practice_id") ?: ""
        if (!PracticeSession.matches(this, id) || alert != null) { stopSelf(); return START_NOT_STICKY }
        try {
            // AppCompat context is needed by the existing shared layout.
            val themed = androidx.appcompat.view.ContextThemeWrapper(this, androidx.appcompat.R.style.Theme_AppCompat_Light_NoActionBar)
            val next = PracticeAlertView(themed, id) { stopSelf() }
            manager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
            val type = if (Build.VERSION.SDK_INT >= 26) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY else { @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE }
            manager?.addView(next.view, WindowManager.LayoutParams(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.MATCH_PARENT, type, WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON, PixelFormat.TRANSLUCENT))
            alert = next; next.show()
        } catch (_: Exception) { stopSelf() }
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        alert?.stop()
        try { alert?.view?.let { manager?.removeView(it) } } catch (_: Exception) {}
        alert = null; super.onDestroy()
    }
}
