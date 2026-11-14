package app.didisnow.worker

import android.app.Service
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.IBinder
import android.net.*
import java.util.concurrent.*

class StartOtpAlarmService : Service() {
    companion object { @Volatile var active: StartOtpAlarmService? = null }
    private var player: MediaPlayer? = null
    private var booking = ""
    private var continuous = false
    private val scheduler = Executors.newSingleThreadScheduledExecutor()
    private var network: ConnectivityManager.NetworkCallback? = null
    override fun onCreate() {
        super.onCreate(); active = this
        startForeground(StartOtpAlarmEngine.NOTIFICATION, StartOtpAlarmEngine.notification(this))
        // Slow, bounded read-only reconciliation while audible; events/network trigger immediate checks.
        scheduler.scheduleWithFixedDelay({ StartOtpAlarmEngine.reconcile(this, false) }, 60, 60, TimeUnit.SECONDS)
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(n: Network) { StartOtpAlarmEngine.reconcile(this@StartOtpAlarmService, false) }
        }
        try { (getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager).registerDefaultNetworkCallback(callback); network = callback } catch (_: Exception) {}
    }
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val id = intent?.getStringExtra("booking") ?: return START_NOT_STICKY
        val loop = intent.getBooleanExtra("loop", false)
        if (player != null && booking == id && continuous == loop) return START_NOT_STICKY
        stopAudio(); booking = id
        continuous = loop
        try {
            val mp = MediaPlayer()
            mp.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
            resources.openRawResourceFd(R.raw.start_otp_voice).use { fd -> mp.setDataSource(fd.fileDescriptor, fd.startOffset, fd.length) }
            mp.isLooping = loop
            mp.setWakeMode(this, android.os.PowerManager.PARTIAL_WAKE_LOCK)
            mp.setOnCompletionListener { stopSelf() }; mp.setOnErrorListener { _,_,_ -> stopSelf(); true }
            mp.prepare(); player = mp; mp.start()
        } catch (_: Exception) { stopSelf(); StartOtpAlarmEngine.fallback(this) }
        return START_NOT_STICKY
    }
    fun stopBooking(id: String) { if (booking == id) { stopAudio(); stopSelf() } }
    fun stopIfDifferent(id: String) { if (booking != id) { stopAudio(); stopSelf() } }
    fun silenceImmediately() { stopAudio(); stopSelf() }
    private fun stopAudio() { try { player?.stop(); player?.release() } catch (_: Exception) {} finally { player = null } }
    override fun onDestroy() {
        stopAudio(); scheduler.shutdownNow()
        network?.let { try { (getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager).unregisterNetworkCallback(it) } catch (_: Exception) {} }
        active = null; super.onDestroy()
    }
    override fun onBind(intent: Intent?): IBinder? = null
}
