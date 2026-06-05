package app.didisnow.worker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager

/**
 * Foreground Service that owns SensorManager step listeners and survives
 * activity pauses, screen lock, and app minimization.
 *
 * Supports two concurrent "tracks":
 *   - PASSIVE  → long-running while worker is online (bookingId == "passive:<workerId>")
 *   - BOOKING  → 5 min window after a booking is accepted
 *
 * Communicates with StepCounterPlugin via LocalBroadcastManager:
 *   ACTION_STEP_UPDATE         → per-sensor-event step count for a track
 *   ACTION_MONITORING_COMPLETE → booking window finished
 */
class MovementTrackingService : Service(), SensorEventListener {

    companion object {
        private const val TAG = "MovementTrackingSvc"

        const val NOTIFICATION_CHANNEL_ID = "movement_tracking"
        const val NOTIFICATION_ID = 4710

        const val ACTION_START_PASSIVE = "app.didisnow.worker.movement.START_PASSIVE"
        const val ACTION_START_BOOKING = "app.didisnow.worker.movement.START_BOOKING"
        const val ACTION_STOP_PASSIVE  = "app.didisnow.worker.movement.STOP_PASSIVE"
        const val ACTION_STOP_BOOKING  = "app.didisnow.worker.movement.STOP_BOOKING"
        const val ACTION_STOP_ALL      = "app.didisnow.worker.movement.STOP_ALL"

        const val EXTRA_BOOKING_ID      = "bookingId"
        const val EXTRA_WINDOW_SECONDS  = "windowSeconds"

        // LocalBroadcast actions
        const val ACTION_STEP_UPDATE         = "app.didisnow.worker.movement.STEP_UPDATE"
        const val ACTION_MONITORING_COMPLETE = "app.didisnow.worker.movement.MONITORING_COMPLETE"

        const val EXTRA_STEP_COUNT          = "stepCount"
        const val EXTRA_RAW_STEP_VALUE      = "rawStepValue"
        const val EXTRA_BASELINE_STEP_VALUE = "baselineStepValue"
        const val EXTRA_FINAL_STEP_VALUE    = "finalStepValue"
        const val EXTRA_STEPS_IN_WINDOW     = "stepsInWindow"
        const val EXTRA_SENSOR_TYPE         = "sensorType"
        const val EXTRA_TIMESTAMP           = "timestamp"

        fun startPassive(ctx: Context, bookingId: String) {
            val i = Intent(ctx, MovementTrackingService::class.java).apply {
                action = ACTION_START_PASSIVE
                putExtra(EXTRA_BOOKING_ID, bookingId)
            }
            startForegroundCompat(ctx, i)
        }

        fun startBooking(ctx: Context, bookingId: String, windowSeconds: Int) {
            val i = Intent(ctx, MovementTrackingService::class.java).apply {
                action = ACTION_START_BOOKING
                putExtra(EXTRA_BOOKING_ID, bookingId)
                putExtra(EXTRA_WINDOW_SECONDS, windowSeconds)
            }
            startForegroundCompat(ctx, i)
        }

        fun stopPassive(ctx: Context) {
            val i = Intent(ctx, MovementTrackingService::class.java).apply { action = ACTION_STOP_PASSIVE }
            try { ctx.startService(i) } catch (e: Exception) { Log.w(TAG, "stopPassive failed: ${e.message}") }
        }

        fun stopBooking(ctx: Context) {
            val i = Intent(ctx, MovementTrackingService::class.java).apply { action = ACTION_STOP_BOOKING }
            try { ctx.startService(i) } catch (e: Exception) { Log.w(TAG, "stopBooking failed: ${e.message}") }
        }

        private fun startForegroundCompat(ctx: Context, i: Intent) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ctx.startForegroundService(i)
                } else {
                    ctx.startService(i)
                }
            } catch (e: Exception) {
                Log.e(TAG, "startForegroundCompat failed: ${e.message}", e)
            }
        }
    }

    private data class Track(
        val bookingId: String,
        val isPassive: Boolean,
        val windowSeconds: Int,
        var baseline: Long = -1L,
        var latest: Long = -1L,
        var detectedSteps: Long = 0L,
        var timeoutRunnable: Runnable? = null,
    )

    private var sensorManager: SensorManager? = null
    private var stepSensor: Sensor? = null
    private var sensorTypeLabel: String = "none"
    private var listenerRegistered = false

    private val handler = Handler(Looper.getMainLooper())
    private val tracks = mutableMapOf<String, Track>() // key = bookingId

    // ── Heartbeat ticker (P0): keeps workers.last_heartbeat_at fresh while the
    //    service is alive (worker is Online or has an active booking), even
    //    when the app is backgrounded / screen is off.
    private val HEARTBEAT_INTERVAL_MS = 60_000L
    private val heartbeatRunnable = object : Runnable {
        override fun run() {
            try {
                BackendSync.sendHeartbeatAsync(applicationContext, "background")
            } catch (e: Exception) {
                Log.w(TAG, "heartbeat tick failed: ${e.message}")
            }
            handler.postDelayed(this, HEARTBEAT_INTERVAL_MS)
        }
    }
    private var heartbeatStarted = false

    private fun startHeartbeatTicker() {
        if (heartbeatStarted) return
        heartbeatStarted = true
        Log.d(TAG, "💓 starting 60s heartbeat ticker")
        // Fire immediately, then every 60s.
        handler.post(heartbeatRunnable)
    }

    private fun stopHeartbeatTicker() {
        if (!heartbeatStarted) return
        heartbeatStarted = false
        Log.d(TAG, "💓 stopping heartbeat ticker")
        handler.removeCallbacks(heartbeatRunnable)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        Log.d(TAG, "🟢 service onCreate")
        ensureChannel()
        startInForeground()
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Always (re)attach the foreground notification for safety against ANR/foregroundtimeout.
        startInForeground()

        val action = intent?.action
        val bookingId = intent?.getStringExtra(EXTRA_BOOKING_ID)
        Log.d(TAG, "▶️ onStartCommand action=$action booking=$bookingId tracks=${tracks.keys}")

        when (action) {
            ACTION_START_PASSIVE -> {
                if (bookingId.isNullOrEmpty()) return START_STICKY
                addTrack(bookingId, isPassive = true, windowSeconds = 0)
            }
            ACTION_START_BOOKING -> {
                if (bookingId.isNullOrEmpty()) return START_STICKY
                val window = intent.getIntExtra(EXTRA_WINDOW_SECONDS, 300)
                addTrack(bookingId, isPassive = false, windowSeconds = window)
            }
            ACTION_STOP_PASSIVE -> {
                tracks.keys.filter { it.startsWith("passive:") }.forEach { removeTrack(it) }
                stopIfIdle()
            }
            ACTION_STOP_BOOKING -> {
                tracks.keys.filter { !it.startsWith("passive:") }.forEach { removeTrack(it) }
                stopIfIdle()
            }
            ACTION_STOP_ALL -> {
                tracks.keys.toList().forEach { removeTrack(it) }
                stopIfIdle()
            }
            null -> {
                // Likely restart from START_STICKY after process kill — keep service alive.
                Log.d(TAG, "♻️ service restarted by system (null intent) — awaiting fresh start command")
            }
        }
        return START_STICKY
    }

    private fun addTrack(bookingId: String, isPassive: Boolean, windowSeconds: Int) {
        if (tracks.containsKey(bookingId)) {
            Log.d(TAG, "⏩ track already present, ignoring duplicate: $bookingId")
            return
        }
        val track = Track(bookingId = bookingId, isPassive = isPassive, windowSeconds = windowSeconds)
        tracks[bookingId] = track
        attachSensorIfNeeded()
        Log.d(TAG, "➕ track added booking=$bookingId passive=$isPassive window=${windowSeconds}s totalTracks=${tracks.size}")

        if (!isPassive && windowSeconds > 0) {
            val r = Runnable {
                Log.d(TAG, "⏱ booking window elapsed for $bookingId")
                emitMonitoringComplete(track)
                removeTrack(bookingId)
                stopIfIdle()
            }
            track.timeoutRunnable = r
            handler.postDelayed(r, windowSeconds * 1000L)
        }
        updateNotification()
    }

    private fun removeTrack(bookingId: String) {
        val t = tracks.remove(bookingId) ?: return
        t.timeoutRunnable?.let { handler.removeCallbacks(it) }
        Log.d(TAG, "➖ track removed booking=$bookingId remaining=${tracks.size}")
        if (tracks.isEmpty()) detachSensor()
        updateNotification()
    }

    private fun attachSensorIfNeeded() {
        if (listenerRegistered) return
        val sm = sensorManager ?: run {
            Log.w(TAG, "❌ SensorManager unavailable")
            return
        }
        val counter = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        val detector = sm.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
        val sensor = counter ?: detector
        if (sensor == null) {
            Log.w(TAG, "❌ no step sensor on this device")
            return
        }
        stepSensor = sensor
        sensorTypeLabel = if (counter != null) "step_counter" else "step_detector"
        val ok = sm.registerListener(this, sensor, SensorManager.SENSOR_DELAY_NORMAL)
        listenerRegistered = ok
        Log.d(TAG, "📡 sensor attached type=$sensorTypeLabel ok=$ok")
    }

    private fun detachSensor() {
        if (!listenerRegistered) return
        try { sensorManager?.unregisterListener(this) } catch (_: Exception) {}
        listenerRegistered = false
        stepSensor = null
        Log.d(TAG, "📴 sensor detached (no active tracks)")
    }

    /** Re-attach if listener mysteriously dies but we still have tracks. */
    private fun reattachIfDead() {
        if (tracks.isNotEmpty() && !listenerRegistered) {
            Log.w(TAG, "♻️ listener died with active tracks — reattaching")
            attachSensorIfNeeded()
        }
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (event == null) return
        val now = System.currentTimeMillis()
        val isCounter = sensorTypeLabel == "step_counter"
        val raw: Long = if (isCounter) event.values[0].toLong() else -1L

        // Update each active track independently — each has its own baseline.
        for (track in tracks.values.toList()) {
            if (isCounter) {
                if (track.baseline < 0) {
                    track.baseline = raw
                    Log.d(TAG, "📊 baseline set booking=${track.bookingId} baseline=$raw")
                }
                track.latest = raw
            } else {
                if (track.baseline < 0) track.baseline = 0L
                track.detectedSteps += 1
                track.latest = track.detectedSteps
            }
            val stepsInWindow = if (isCounter) {
                ((track.latest - track.baseline).toInt()).coerceAtLeast(0)
            } else {
                track.latest.toInt().coerceAtLeast(0)
            }
            broadcastStepUpdate(track, stepsInWindow, now)
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private fun broadcastStepUpdate(track: Track, stepsInWindow: Int, ts: Long) {
        val i = Intent(ACTION_STEP_UPDATE).apply {
            putExtra(EXTRA_BOOKING_ID, track.bookingId)
            putExtra(EXTRA_STEP_COUNT, stepsInWindow)
            putExtra(EXTRA_RAW_STEP_VALUE, track.latest)
            putExtra(EXTRA_BASELINE_STEP_VALUE, track.baseline)
            putExtra(EXTRA_SENSOR_TYPE, sensorTypeLabel)
            putExtra(EXTRA_TIMESTAMP, ts)
        }
        LocalBroadcastManager.getInstance(this).sendBroadcast(i)
    }

    private fun emitMonitoringComplete(track: Track) {
        val isCounter = sensorTypeLabel == "step_counter"
        val stepsInWindow = if (isCounter) {
            if (track.baseline >= 0 && track.latest >= 0)
                (track.latest - track.baseline).toInt().coerceAtLeast(0)
            else 0
        } else {
            track.latest.toInt().coerceAtLeast(0)
        }
        val i = Intent(ACTION_MONITORING_COMPLETE).apply {
            putExtra(EXTRA_BOOKING_ID, track.bookingId)
            putExtra(EXTRA_STEPS_IN_WINDOW, stepsInWindow)
            putExtra(EXTRA_BASELINE_STEP_VALUE, track.baseline)
            putExtra(EXTRA_FINAL_STEP_VALUE, track.latest)
            putExtra(EXTRA_SENSOR_TYPE, sensorTypeLabel)
            putExtra(EXTRA_WINDOW_SECONDS, track.windowSeconds)
        }
        LocalBroadcastManager.getInstance(this).sendBroadcast(i)
        Log.d(TAG, "🏁 monitoringComplete booking=${track.bookingId} steps=$stepsInWindow")
    }

    private fun stopIfIdle() {
        if (tracks.isEmpty()) {
            Log.d(TAG, "💤 no tracks remaining — stopping foreground service")
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                } else {
                    @Suppress("DEPRECATION")
                    stopForeground(true)
                }
                stopSelf()
            } catch (e: Exception) {
                Log.w(TAG, "stopIfIdle error: ${e.message}")
            }
        }
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(NOTIFICATION_CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            NOTIFICATION_CHANNEL_ID,
            "Movement Tracking",
            NotificationManager.IMPORTANCE_MIN
        ).apply {
            description = "Keeps step tracking alive while you are online or on a booking"
            setShowBadge(false)
            enableVibration(false)
            setSound(null, null)
        }
        nm.createNotificationChannel(channel)
    }

    private fun startInForeground() {
        try {
            val notif = buildNotification()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    NOTIFICATION_ID,
                    notif,
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
                )
            } else {
                startForeground(NOTIFICATION_ID, notif)
            }
            reattachIfDead()
        } catch (e: Exception) {
            Log.e(TAG, "startInForeground failed: ${e.message}", e)
        }
    }

    private fun updateNotification() {
        try {
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(NOTIFICATION_ID, buildNotification())
        } catch (e: Exception) {
            Log.w(TAG, "updateNotification failed: ${e.message}")
        }
    }

    private fun buildNotification(): Notification {
        val launchIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pi = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val hasBooking = tracks.values.any { !it.isPassive }
        val text = if (hasBooking) "Tracking active booking" else "Online — tracking activity"

        return NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setContentTitle("Didi Now Worker tracking active")
            .setContentText(text)
            .setSmallIcon(R.drawable.app_icon)
            .setOngoing(true)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setContentIntent(pi)
            .setShowWhen(false)
            .build()
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        Log.w(TAG, "🧹 onTaskRemoved — system removed the task; service will be restarted via START_STICKY")
    }

    override fun onDestroy() {
        Log.w(TAG, "❌ service onDestroy (tracks=${tracks.size}, listener=$listenerRegistered)")
        detachSensor()
        handler.removeCallbacksAndMessages(null)
        tracks.clear()
        super.onDestroy()
    }
}
