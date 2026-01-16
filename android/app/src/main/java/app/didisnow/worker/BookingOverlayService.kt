package app.didisnow.worker

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import android.os.Looper

/**
 * Singleton guard to prevent multiple overlays from being shown simultaneously
 */
private object OverlaySingleton {
    @Volatile var isShowing: Boolean = false
}

/**
 * BookingOverlayService - UI-ONLY overlay for booking alerts
 * 
 * IMPORTANT: This service does NOT make any Supabase/network calls.
 * All booking actions (accept/decline) are delegated to the web app via Intent.
 * This prevents:
 * - Token refresh race conditions
 * - 401 errors causing logout
 * - Session conflicts between native and web
 */
class BookingOverlayService : Service() {
    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var overlayAdded = false
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var isShuttingDown = false
    private var countdownHandler: Handler? = null
    private var countdownRunnable: Runnable? = null
    
    private var currentBookingId: String? = null
    
    // Track the startId so we can call stopSelfResult() with it
    private var startIdForStop: Int = 0
    
    // Track ALL windows we add, so we can remove them all in cleanup
    private val addedWindows = mutableListOf<View>()
    
    // Single-flight guard to prevent double taps
    @Volatile
    private var actionInFlight = false

    // Track whether we started as a foreground service (required on Android O+)
    @Volatile
    private var foregroundStarted = false

    companion object {
        private const val NOTIFICATION_CHANNEL_ID = "booking_overlay_channel"
        private const val NOTIFICATION_ID = 9001
    }

    private fun ensureForegroundStarted(bookingId: String, serviceType: String, flatNo: String) {
        if (foregroundStarted) return

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                val channel = NotificationChannel(
                    NOTIFICATION_CHANNEL_ID,
                    "Booking alerts",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "Keeps booking alert overlay running"
                    enableVibration(false)
                    setSound(null, null)
                }
                mgr.createNotificationChannel(channel)
            }

            val openIntent = Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                putExtra("navigate_to", "home")
                putExtra("booking_id", bookingId)
            }

            val pendingIntent = PendingIntent.getActivity(
                this,
                0,
                openIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val contentText = listOf(serviceType.ifBlank { "Service" }, flatNo.takeIf { it.isNotBlank() }?.let { "Flat $it" })
                .filterNotNull()
                .joinToString(" • ")

            val notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("New Booking")
                .setContentText(contentText.ifBlank { "Tap to open" })
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(pendingIntent)
                .build()

            startForeground(NOTIFICATION_ID, notification)
            foregroundStarted = true
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Failed to start foreground", e)
        }
    }

    private fun stopForegroundIfNeeded() {
        if (!foregroundStarted) return
        try {
            stopForeground(true)
        } catch (_: Exception) {
        } finally {
            foregroundStarted = false
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    /**
     * Helper function to safely run UI updates on main thread
     */
    private fun ui(block: () -> Unit) {
        if (isShuttingDown) return
        if (Looper.myLooper() == Looper.getMainLooper()) {
            block()
        } else {
            Handler(mainLooper).post {
                if (!isShuttingDown) block()
            }
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        android.util.Log.d("BookingOverlay", "🚀 BookingOverlayService.onStartCommand called")
        
        startIdForStop = startId
        
        // Single-instance guard
        if (OverlaySingleton.isShowing) {
            android.util.Log.w("BookingOverlay", "⚠️ Overlay already showing; ignoring duplicate start")
            return START_NOT_STICKY
        }
        OverlaySingleton.isShowing = true
        
        try {
            val mode = intent?.getStringExtra("mode") ?: "show"
            
            when (mode) {
                "hide" -> {
                    finishAndStop("hide_mode")
                    return START_NOT_STICKY
                }
                "idle" -> {
                    return START_STICKY
                }
                "show" -> {
                    val bookingId = intent?.getStringExtra("booking_id") ?: ""
                    val customer = intent?.getStringExtra("customer_name") ?: "New Customer"
                    val community = intent?.getStringExtra("community") ?: ""
                    val serviceType = intent?.getStringExtra("service_type") ?: ""
                    val flatNo = intent?.getStringExtra("flat_no") ?: ""
                    val price = intent?.getIntExtra("price_inr", 0) ?: 0

                    if (bookingId.isEmpty()) {
                        android.util.Log.e("BookingOverlay", "❌ No booking ID provided")
                        stopSelf()
                        return START_NOT_STICKY
                    }

                    currentBookingId = bookingId

                    // Android O+ cannot start a background service from FCM; we must become foreground fast.
                    ensureForegroundStarted(bookingId, serviceType, flatNo)

                    try {
                        showOverlay(bookingId, customer, community, serviceType, flatNo, price)
                    } catch (e: Exception) {
                        android.util.Log.e("BookingOverlay", "❌ showOverlay failed", e)
                        fallbackToActivity(intent)
                        stopSelf()
                    }
                }
            }
            
            return START_NOT_STICKY
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ onStartCommand failed", e)
            fallbackToActivity(intent)
            stopSelf()
            return START_NOT_STICKY
        }
    }

    private fun showOverlay(bookingId: String, customer: String, community: String, serviceType: String, flatNo: String, price: Int) {
        android.util.Log.d("BookingOverlay", "🖼️ showOverlay called")
        
        playAlertSound()
        startContinuousVibration()
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!android.provider.Settings.canDrawOverlays(this)) {
                android.util.Log.e("BookingOverlay", "❌ No overlay permission!")
                Toast.makeText(this, "Overlay permission required", Toast.LENGTH_LONG).show()
                stopSelf()
                return
            }
        }
        
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

        val inflater = getSystemService(Context.LAYOUT_INFLATER_SERVICE) as LayoutInflater
        overlayView = inflater.inflate(R.layout.overlay_booking_alert, null)

        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.CENTER
        }

        overlayView?.findViewById<TextView>(R.id.title)?.text = "New Booking"
        overlayView?.findViewById<TextView>(R.id.subtitle)?.text = serviceType
        overlayView?.findViewById<TextView>(R.id.customerName)?.text = customer
        overlayView?.findViewById<TextView>(R.id.community)?.text = community
        overlayView?.findViewById<TextView>(R.id.flatNo)?.text = "Flat #$flatNo"
        overlayView?.findViewById<TextView>(R.id.price)?.text = "₹$price"
        
        val towerNo = if (flatNo.isNotBlank()) {
            flatNo.firstOrNull { it.isDigit() }?.toString() ?: "—"
        } else {
            "—"
        }
        overlayView?.findViewById<TextView>(R.id.towerNo)?.text = towerNo
        
        val serviceImageView = overlayView?.findViewById<ImageView>(R.id.serviceImage)
        val imageResource = when {
            serviceType.contains("cook", ignoreCase = true) -> R.drawable.service_cook
            serviceType.contains("bathroom", ignoreCase = true) -> R.drawable.service_bathroom
            serviceType.contains("maid", ignoreCase = true) || 
            serviceType.contains("dish", ignoreCase = true) -> R.drawable.service_maid
            else -> R.drawable.service_maid
        }
        serviceImageView?.setImageResource(imageResource)
        
        val sirenIcon = overlayView?.findViewById<ImageView>(R.id.sirenIcon)
        sirenIcon?.startAnimation(android.view.animation.AnimationUtils.loadAnimation(this, R.anim.blink_animation))
        
        // Countdown setup
        val countdownText = overlayView?.findViewById<TextView>(R.id.countdown)
        val countdownCircle = overlayView?.findViewById<android.widget.ProgressBar>(R.id.countdownCircle)
        var secondsLeft = 30
        countdownHandler = Handler(mainLooper)
        countdownRunnable = object : Runnable {
            override fun run() {
                if (isShuttingDown || overlayView == null) return
                if (secondsLeft > 0) {
                    ui { 
                        countdownText?.text = "${secondsLeft}s"
                        countdownCircle?.progress = secondsLeft
                        
                        val textColor = when {
                            secondsLeft > 15 -> android.graphics.Color.parseColor("#22C55E")
                            secondsLeft > 10 -> android.graphics.Color.parseColor("#F59E0B")
                            else -> android.graphics.Color.parseColor("#DC2626")
                        }
                        countdownText?.setTextColor(textColor)
                    }
                    secondsLeft--
                    countdownHandler?.postDelayed(this, 1000)
                } else {
                    // Timeout - send timeout action to web app (don't open app)
                    sendActionToWebApp(bookingId, "timeout", openApp = false)
                    finishAndStop("countdown_expired")
                }
            }
        }

        // Accept button - UI ONLY, delegates to web app
        overlayView?.findViewById<Button>(R.id.btnAccept)?.setOnClickListener { button ->
            if (!OverlaySingleton.isShowing) return@setOnClickListener
            if (isShuttingDown || actionInFlight) return@setOnClickListener
            
            actionInFlight = true
            button.isEnabled = false
            android.util.Log.d("BookingOverlay", "✅ Accept button clicked for booking: $bookingId")
            
            // Stop alerts immediately for better UX
            stopAlertSound()
            stopVibration()
            countdownRunnable?.let { countdownHandler?.removeCallbacks(it) }
            
            // Show immediate feedback
            Toast.makeText(this@BookingOverlayService, "Accepting booking...", Toast.LENGTH_SHORT).show()
            
            // First close the overlay completely, then launch the app
            Handler(mainLooper).post {
                // Remove overlay first
                try {
                    for (view in addedWindows) {
                        try { windowManager?.removeView(view) } catch (e: Exception) {}
                    }
                    addedWindows.clear()
                    overlayView = null
                    overlayAdded = false
                } catch (e: Exception) {
                    android.util.Log.e("BookingOverlay", "Error removing overlay", e)
                }
                
                // Clear singleton flag
                OverlaySingleton.isShowing = false
                
                // Then send action to web app AFTER overlay is removed (open app for accept)
                Handler(mainLooper).postDelayed({
                    sendActionToWebApp(bookingId, "accepted", openApp = true)
                    isShuttingDown = true
                    stopSelfResult(startIdForStop)
                }, 100)
            }
        }

        // Reject button - UI ONLY, delegates to web app
        // NOTE: For reject, we do NOT open the app - action is queued and processed when user opens app later
        overlayView?.findViewById<Button>(R.id.btnReject)?.setOnClickListener { button ->
            if (!OverlaySingleton.isShowing) return@setOnClickListener
            if (isShuttingDown || actionInFlight) return@setOnClickListener
            
            actionInFlight = true
            button.isEnabled = false
            android.util.Log.d("BookingOverlay", "❌ Decline button clicked for booking: $bookingId")
            
            // Stop alerts immediately for better UX
            stopAlertSound()
            stopVibration()
            countdownRunnable?.let { countdownHandler?.removeCallbacks(it) }
            
            // Show immediate feedback
            Toast.makeText(this@BookingOverlayService, "Booking declined", Toast.LENGTH_SHORT).show()
            
            // Remove overlay - do NOT open app for reject
            Handler(mainLooper).post {
                try {
                    for (view in addedWindows) {
                        try { windowManager?.removeView(view) } catch (e: Exception) {}
                    }
                    addedWindows.clear()
                    overlayView = null
                    overlayAdded = false
                } catch (e: Exception) {
                    android.util.Log.e("BookingOverlay", "Error removing overlay", e)
                }
                
                // Clear singleton flag
                OverlaySingleton.isShowing = false
                
                // Queue action but do NOT open app (openApp = false)
                Handler(mainLooper).postDelayed({
                    sendActionToWebApp(bookingId, "declined", openApp = false)
                    isShuttingDown = true
                    stopSelfResult(startIdForStop)
                }, 100)
            }
        }

        try {
            windowManager?.addView(overlayView, params)
            addedWindows.add(overlayView!!)
            overlayAdded = true
            android.util.Log.d("BookingOverlay", "✅ Overlay view added successfully")
            
            countdownHandler?.post(countdownRunnable!!)
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Failed to add overlay view", e)
            OverlaySingleton.isShowing = false
            stopSelf()
        }
    }
    
    /**
     * Send booking action to web app via Intent to MainActivity.
     * The web app will handle the actual Supabase RPC call.
     * This prevents token/session conflicts.
     * 
     * @param bookingId The booking ID
     * @param action The action (accepted/declined/timeout)
     * @param openApp Whether to launch MainActivity (for accept we need the app open; for decline we don't)
     */
    private fun sendActionToWebApp(bookingId: String, action: String, openApp: Boolean = true) {
        try {
            android.util.Log.d("BookingOverlay", "📤 Sending action to web app: bookingId=$bookingId, action=$action, openApp=$openApp")
            
            // Always queue the action to SharedPreferences so it can be processed later
            queueActionToPrefs(bookingId, action)
            
            // Send local broadcast for any in-app listeners
            val broadcastIntent = Intent("booking-action")
            broadcastIntent.putExtra("bookingId", bookingId)
            broadcastIntent.putExtra("action", action)
            LocalBroadcastManager.getInstance(this).sendBroadcast(broadcastIntent)
            
            // Only launch MainActivity if openApp is true
            if (openApp) {
                // Launch MainActivity with booking action data
                // Use FLAG_ACTIVITY_REORDER_TO_FRONT to bring existing instance to front without recreating
                val mainIntent = Intent(this, MainActivity::class.java).apply {
                    addFlags(
                        Intent.FLAG_ACTIVITY_NEW_TASK or 
                        Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP
                    )
                    putExtra("booking_action", action)
                    putExtra("booking_id", bookingId)
                    putExtra("navigate_to", "home")
                }
                startActivity(mainIntent)
            }
            
            android.util.Log.d("BookingOverlay", "✅ Action sent to web app successfully")
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ sendActionToWebApp error", e)
        }
    }
    
    /**
     * Queue action directly to SharedPreferences.
     * This ensures the action is persisted even if the app is not running.
     */
    private fun queueActionToPrefs(bookingId: String, action: String) {
        try {
            val prefs = getSharedPreferences("booking_actions", Context.MODE_PRIVATE)
            val json = org.json.JSONObject().apply {
                put("bookingId", bookingId)
                put("action", action)
                put("createdAt", System.currentTimeMillis())
            }
            prefs.edit().putString("pending_action", json.toString()).apply()
            android.util.Log.d("BookingOverlay", "✅ Action queued to prefs: $action for $bookingId")
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Error queueing action to prefs", e)
        }
    }
    
    private fun fallbackToActivity(intent: Intent?) {
        try {
            val activityIntent = Intent(this, BookingAlertActivity::class.java)
            activityIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            intent?.extras?.let { activityIntent.putExtras(it) }
            startActivity(activityIntent)
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Fallback to activity failed", e)
        }
    }
    
    private fun playAlertSound() {
        try {
            mediaPlayer?.release()
            mediaPlayer = MediaPlayer().apply {
                val resId = resources.getIdentifier("new_loud_ringtone", "raw", packageName)
                if (resId != 0) {
                    val afd = resources.openRawResourceFd(resId)
                    setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                    afd.close()
                } else {
                    val defaultUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                    setDataSource(this@BookingOverlayService, defaultUri)
                }
                setAudioAttributes(AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build())
                isLooping = true
                prepare()
                start()
            }
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ playAlertSound error", e)
        }
    }
    
    private fun startContinuousVibration() {
        try {
            vibrator = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            val pattern = longArrayOf(0, 500, 200, 500, 200, 500)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ startContinuousVibration error", e)
        }
    }
    
    private fun stopAlertSound() {
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
            mediaPlayer = null
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ stopAlertSound error", e)
        }
    }
    
    private fun stopVibration() {
        try {
            vibrator?.cancel()
            vibrator = null
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ stopVibration error", e)
        }
    }
    
    private fun finishAndStop(reason: String) {
        if (isShuttingDown) return
        isShuttingDown = true
        
        android.util.Log.d("BookingOverlay", "🔚 finishAndStop called: $reason")
        
        // Stop countdown
        countdownRunnable?.let { countdownHandler?.removeCallbacks(it) }
        countdownHandler = null
        countdownRunnable = null
        
        // Stop sound and vibration
        stopAlertSound()
        stopVibration()
        
        // Remove all overlay views
        ui {
            for (view in addedWindows) {
                try {
                    windowManager?.removeView(view)
                } catch (e: Exception) {
                    android.util.Log.e("BookingOverlay", "❌ Error removing view", e)
                }
            }
            addedWindows.clear()
            overlayView = null
            overlayAdded = false
        }
        
        // Clear singleton flag
        OverlaySingleton.isShowing = false
        
        // Stop service (and foreground notification if any)
        stopForegroundIfNeeded()
        stopSelfResult(startIdForStop)
    }
    
    override fun onDestroy() {
        super.onDestroy()
        android.util.Log.d("BookingOverlay", "🗑️ BookingOverlayService.onDestroy")
        
        if (!isShuttingDown) {
            finishAndStop("onDestroy")
        }
        
        OverlaySingleton.isShowing = false
    }
}
