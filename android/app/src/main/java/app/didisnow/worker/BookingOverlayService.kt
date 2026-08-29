package app.didisnow.worker

import android.app.NotificationChannel
import android.app.NotificationManager
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
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import android.os.Looper
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

/**
 * Singleton guard to prevent multiple overlays from being shown simultaneously
 */
private object OverlaySingleton {
    @Volatile var isShowing: Boolean = false
}

class BookingOverlayService : Service() {
    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var overlayAdded = false
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var isShuttingDown = false
    private var countdownHandler: Handler? = null
    private var countdownRunnable: Runnable? = null
    private var currentAccessToken: String? = null
    
    // Booking status polling
    private var statusCheckHandler: Handler? = null
    private var statusCheckRunnable: Runnable? = null
    private var currentBookingId: String? = null
    private var currentBookingRequestId: String? = null
    
    // Track the startId so we can call stopSelfResult() with it
    private var startIdForStop: Int = 0
    
    // Track ALL windows we add, so we can remove them all in cleanup
    private val addedWindows = mutableListOf<View>()
    
    // Service-level coroutine scope with SupervisorJob
    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.Main.immediate + serviceJob)
    
    // Single-flight guard to prevent double taps
    @Volatile
    private var acceptInFlight = false
    
    // Token refresh throttling
    @Volatile
    private var lastRefreshTime: Long = 0
    private val REFRESH_THROTTLE_MS = 30_000L // 30 seconds minimum between refreshes
    
    companion object {
        private const val SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co"
        private const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o"
        private const val NOTIFICATION_CHANNEL_ID = "booking_overlay_channel"
        private const val NOTIFICATION_ID = 9001
    }

    override fun onBind(intent: Intent?): IBinder? = null
    
    /**
     * Helper function to safely run UI updates on main thread
     * Guards against shutdown state to avoid touching detached views
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
        android.util.Log.d("BookingOverlay", "📦 Intent extras: ${intent?.extras}")
        
        // Save startId for proper cleanup
        startIdForStop = startId
        
        // Single-instance guard: only one overlay can be showing at a time
        if (OverlaySingleton.isShowing) {
            android.util.Log.w("BookingOverlay", "⚠️ Overlay already showing; ignoring duplicate start")
            return START_NOT_STICKY
        }
        OverlaySingleton.isShowing = true
        
        try {
            // No foreground service needed for overlay
            android.util.Log.d("BookingOverlay", "✅ Service starting without foreground mode")
            
            val mode = intent?.getStringExtra("mode") ?: "show"
            android.util.Log.d("BookingOverlay", "🎯 Mode: $mode")
            
            when (mode) {
                "hide" -> {
                    android.util.Log.d("BookingOverlay", "🔚 Hide mode - closing overlay")
                    finishAndStop("hide_mode")
                    return START_NOT_STICKY
                }
                "idle" -> {
                    android.util.Log.d("BookingOverlay", "⏸️ Idle mode - service running in background")
                    return START_STICKY
                }
                "show" -> {
                    val bookingId = intent?.getStringExtra("booking_id") ?: ""
                    currentBookingRequestId = intent?.getStringExtra("booking_request_id")
                    val bookingType = intent?.getStringExtra("booking_type") ?: "instant"
                    val prealertSent = intent?.getBooleanExtra("prealert_sent", false) ?: false
                    val scheduledTime = intent?.getStringExtra("scheduled_time") ?: ""
                    val customer = intent?.getStringExtra("customer_name") ?: "New Customer"
                    val community = intent?.getStringExtra("community") ?: ""
                    val serviceType = intent?.getStringExtra("service_type") ?: ""
                    val flatNo = intent?.getStringExtra("flat_no") ?: ""
                    val price = intent?.getIntExtra("price_inr", 0) ?: 0
                    
                    // Try to get access token from Intent first (passed from web)
                    var accessToken = intent?.getStringExtra("ACCESS_TOKEN")
                    android.util.Log.d("BookingOverlay", "🔑 Access token from Intent: ${if (accessToken != null) "✅ Present (${accessToken.take(12)}...)" else "❌ Not passed"}")

                    android.util.Log.d("BookingOverlay", "📋 Booking details - ID: $bookingId, Type: $bookingType, Prealert: $prealertSent, Scheduled: $scheduledTime, Service: $serviceType, Community: $community")
                    
                    if (bookingId.isEmpty()) {
                        android.util.Log.e("BookingOverlay", "❌ No booking ID provided, cannot show overlay")
                        stopSelf()
                        return START_NOT_STICKY
                    }

                    if (bookingType == "scheduled" && !prealertSent) {
                        android.util.Log.w("BookingOverlay", "🔕 Scheduled offer hidden until prealert_sent=true booking_id=$bookingId booking_type=$bookingType scheduled_at=$scheduledTime prealert_sent=$prealertSent request_status=null shown_to_worker=false")
                        BackendSync.ackFailureAsync(applicationContext, bookingId, "prealert_suppressed", currentBookingRequestId)
                        stopSelf()
                        return START_NOT_STICKY
                    }

                    // If no token in Intent, try to read from SharedPreferences (fallback)
                    if (accessToken.isNullOrEmpty()) {
                        android.util.Log.d("BookingOverlay", "🔍 No token in Intent, checking SharedPreferences...")
                        val sessionJson = getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
                            .getString("didi_session", null)
                        
                        android.util.Log.d("BookingOverlay", "🔍 Session check: ${if (sessionJson != null) "✅ Found" else "❌ Not found"}")
                        
                        if (sessionJson.isNullOrEmpty()) {
                            android.util.Log.e("BookingOverlay", "❌ No session found in SharedPreferences either!")
                            Toast.makeText(
                                this,
                                "⚠️ Please log in to accept bookings",
                                Toast.LENGTH_LONG
                            ).show()
                            stopSelf()
                            return START_NOT_STICKY
                        }
                        
                        // Parse session to extract access_token
                        try {
                            val session = JSONObject(sessionJson)
                            accessToken = session.optString("accessToken", "")
                            if (accessToken.isNullOrEmpty()) {
                                android.util.Log.e("BookingOverlay", "❌ No accessToken in session!")
                                Toast.makeText(
                                    this,
                                    "⚠️ Invalid session - Please log in again",
                                    Toast.LENGTH_LONG
                                ).show()
                                stopSelf()
                                return START_NOT_STICKY
                            }
                            android.util.Log.d("BookingOverlay", "✅ Access token from SharedPreferences: ${accessToken?.take(12)}...")
                        } catch (e: Exception) {
                            android.util.Log.e("BookingOverlay", "❌ Failed to parse session JSON", e)
                            Toast.makeText(
                                this,
                                "⚠️ Session error - Please log in again",
                                Toast.LENGTH_LONG
                            ).show()
                            stopSelf()
                            return START_NOT_STICKY
                        }
                    } else {
                        android.util.Log.d("BookingOverlay", "✅ Using access token from Intent")
                    }
                    
                    // Final validation
                    if (accessToken.isNullOrEmpty()) {
                        android.util.Log.e("BookingOverlay", "❌ No valid access token found!")
                        Toast.makeText(
                            this,
                            "⚠️ Please log in to accept bookings",
                            Toast.LENGTH_LONG
                        ).show()
                        stopSelf()
                        return START_NOT_STICKY
                    }
                    
                    // Store token for use in updateBooking
                    currentAccessToken = accessToken
                    android.util.Log.d("BookingOverlay", "✅ Token validated and cached (${accessToken?.take(12)}...) - proceeding to show overlay")

                    // Store booking ID for status polling
                    currentBookingId = bookingId
                    
                    try {
                        showOverlay(bookingId, customer, community, serviceType, flatNo, price)
                    } catch (e: Exception) {
                        android.util.Log.e("BookingOverlay", "❌ showOverlay failed, falling back to activity", e)
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

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "Booking Overlay",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows booking overlay alerts"
            }
            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager?.createNotificationChannel(channel)
        }
    }

    private fun startForegroundService() {
        // Foreground service removed - overlay works without foreground service
        android.util.Log.d("BookingOverlay", "✅ Overlay service starting (no foreground required)")
    }

    private fun showOverlay(bookingId: String, customer: String, community: String, serviceType: String, flatNo: String, price: Int) {
        android.util.Log.d("BookingOverlay", "🖼️ showOverlay called")
        
        // Play loud siren sound and start vibration
        playAlertSound()
        startContinuousVibration()
        
        // Check overlay permission
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!android.provider.Settings.canDrawOverlays(this)) {
                android.util.Log.e("BookingOverlay", "❌ No overlay permission! Cannot show overlay.")
                Toast.makeText(this, "Overlay permission required", Toast.LENGTH_LONG).show()
                stopSelf()
                return
            }
            android.util.Log.d("BookingOverlay", "✅ Overlay permission granted")
        }
        
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        android.util.Log.d("BookingOverlay", "📱 WindowManager obtained")

        // Inflate the overlay layout
        val inflater = getSystemService(Context.LAYOUT_INFLATER_SERVICE) as LayoutInflater
        overlayView = inflater.inflate(R.layout.overlay_booking_alert, null)
        android.util.Log.d("BookingOverlay", "📄 Overlay layout inflated")

        // Set overlay window parameters
        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT, // Fullscreen height
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

        // Set booking details
        overlayView?.findViewById<TextView>(R.id.title)?.text = "New Booking"
        overlayView?.findViewById<TextView>(R.id.subtitle)?.text = serviceType
        overlayView?.findViewById<TextView>(R.id.customerName)?.text = customer
        overlayView?.findViewById<TextView>(R.id.community)?.text = community
        overlayView?.findViewById<TextView>(R.id.flatNo)?.text = "Flat #$flatNo"
        overlayView?.findViewById<TextView>(R.id.price)?.text = "₹$price"
        
        // Derive Tower No from first digit of flat number
        val towerNo = if (flatNo.isNotBlank()) {
            flatNo.firstOrNull { it.isDigit() }?.toString() ?: "—"
        } else {
            "—"
        }
        overlayView?.findViewById<TextView>(R.id.towerNo)?.text = towerNo
        
        // Set service-specific image
        val serviceImageView = overlayView?.findViewById<ImageView>(R.id.serviceImage)
        val imageResource = when {
            serviceType.contains("bathroom", ignoreCase = true) -> R.drawable.service_bathroom
            serviceType.contains("maid", ignoreCase = true) || 
            serviceType.contains("dish", ignoreCase = true) -> R.drawable.service_maid
            else -> R.drawable.service_maid // Default to maid image
        }
        serviceImageView?.setImageResource(imageResource)
        
        // Start blinking animation for siren icon
        val sirenIcon = overlayView?.findViewById<ImageView>(R.id.sirenIcon)
        sirenIcon?.startAnimation(android.view.animation.AnimationUtils.loadAnimation(this, R.anim.blink_animation))
        
        android.util.Log.d("BookingOverlay", "✅ Overlay populated with booking data, tower number, service image, and blinking siren")
        
        // Prepare countdown handler (will start after view is added)
        val countdownText = overlayView?.findViewById<TextView>(R.id.countdown)
        val countdownCircle = overlayView?.findViewById<android.widget.ProgressBar>(R.id.countdownCircle)
        var secondsLeft = 30
        countdownHandler = Handler(mainLooper)
        countdownRunnable = object : Runnable {
            override fun run() {
                if (isShuttingDown || overlayView == null) {
                    android.util.Log.d("BookingOverlay", "🧹 Countdown cancelled - service shutting down")
                    return
                }
                if (secondsLeft > 0) {
                    ui { 
                        countdownText?.text = "${secondsLeft}s"
                        countdownCircle?.progress = secondsLeft
                        
                        // Change countdown text color based on time remaining
                        val textColor = when {
                            secondsLeft > 15 -> android.graphics.Color.parseColor("#22C55E") // Green
                            secondsLeft > 10 -> android.graphics.Color.parseColor("#F59E0B") // Orange
                            else -> android.graphics.Color.parseColor("#DC2626") // Red
                        }
                        countdownText?.setTextColor(textColor)
                    }
                    android.util.Log.d("BookingOverlay", "⏱️ Countdown: ${secondsLeft}s")
                    secondsLeft--
                    countdownHandler?.postDelayed(this, 1000)
                } else {
                    android.util.Log.d("BookingOverlay", "⏱️ Countdown expired - auto closing")
                    finishAndStop("countdown_expired")
                }
            }
        }

        // Handle Accept button with debouncing
        overlayView?.findViewById<Button>(R.id.btnAccept)?.setOnClickListener {
            // Singleton check: already closed elsewhere
            if (!OverlaySingleton.isShowing) {
                android.util.Log.d("BookingOverlay", "⚠️ Accept ignored - overlay already closed")
                return@setOnClickListener
            }
            
            if (isShuttingDown || acceptInFlight) {
                android.util.Log.d("BookingOverlay", "⚠️ Accept ignored - already in flight or shutting down")
                return@setOnClickListener
            }
            
            // Guard against null overlay
            if (overlayView == null) {
                android.util.Log.d("BookingOverlay", "⚠️ Accept ignored - overlay view null")
                return@setOnClickListener
            }
            
            acceptInFlight = true
            android.util.Log.d("BookingOverlay", "✅ Accept button clicked")
            
            // Disable buttons immediately to prevent double taps
            val acceptBtn = overlayView?.findViewById<Button>(R.id.btnAccept)
            val rejectBtn = overlayView?.findViewById<Button>(R.id.btnReject)
            acceptBtn?.isEnabled = false
            rejectBtn?.isEnabled = false
            
            stopAlertSound()
            stopVibration()
            
            // Cancel countdown safely
            countdownRunnable?.let { r -> 
                countdownHandler?.removeCallbacks(r)
                android.util.Log.d("BookingOverlay", "🧹 Countdown cancelled")
            }
            
            // Cancel status polling
            statusCheckRunnable?.let { r ->
                statusCheckHandler?.removeCallbacks(r)
                android.util.Log.d("BookingOverlay", "🧹 Status polling cancelled")
            }
            
            if (bookingId.isEmpty()) {
                ui { Toast.makeText(this, "Error: No booking ID", Toast.LENGTH_SHORT).show() }
                acceptInFlight = false
                finishAndStop("no_booking_id")
                return@setOnClickListener
            }
            
            // Wrap entire flow with 12s watchdog timeout
            serviceScope.launch {
                var outcome = "unknown"
                try {
                    val finished = withTimeoutOrNull(12_000) {
                        updateBooking(bookingId, "accepted")
                        true
                    }
                    outcome = if (finished == true) "accept_success" else "accept_timeout"
                    if (finished != true) {
                        ui { Toast.makeText(this@BookingOverlayService, "Network slow. Will refresh.", Toast.LENGTH_SHORT).show() }
                    }
                } catch (t: Throwable) {
                    android.util.Log.e("BookingOverlay", "❌ Accept flow crashed", t)
                    outcome = "accept_exception"
                    val reason = t.message?.takeIf { it.isNotBlank() } ?: "Accept failed"
                    ui { Toast.makeText(this@BookingOverlayService, "⚠️ $reason", Toast.LENGTH_LONG).show() }
                } finally {
                    // Always close overlay and stop service
                    acceptInFlight = false
                    // Tell React layer to refresh either way (it will fetch latest state)
                    LocalBroadcastManager.getInstance(applicationContext)
                        .sendBroadcast(Intent("DIDI_BOOKING_REFRESH").apply { putExtra("booking_id", bookingId) })
                    
                    // Launch MainActivity to bring app to foreground showing the accepted booking
                    if (outcome == "accept_success") {
                        try {
                            val appIntent = Intent(this@BookingOverlayService, MainActivity::class.java).apply {
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                                putExtra("navigate_to", "home")
                                putExtra("booking_id", bookingId)
                            }
                            startActivity(appIntent)
                            android.util.Log.d("BookingOverlay", "✅ Launched MainActivity with booking: $bookingId")
                        } catch (e: Exception) {
                            android.util.Log.e("BookingOverlay", "❌ Failed to launch MainActivity", e)
                        }
                    }
                    
                    finishAndStop(outcome)
                }
            }
        }

        // Handle Reject button with debouncing
        overlayView?.findViewById<Button>(R.id.btnReject)?.setOnClickListener {
            // Singleton check: already closed elsewhere
            if (!OverlaySingleton.isShowing) {
                android.util.Log.d("BookingOverlay", "⚠️ Reject ignored - overlay already closed")
                return@setOnClickListener
            }
            
            if (isShuttingDown || acceptInFlight) {
                android.util.Log.d("BookingOverlay", "⚠️ Reject ignored - already in flight or shutting down")
                return@setOnClickListener
            }
            
            // Guard against null overlay
            if (overlayView == null) {
                android.util.Log.d("BookingOverlay", "⚠️ Reject ignored - overlay view null")
                return@setOnClickListener
            }
            
            acceptInFlight = true
            android.util.Log.d("BookingOverlay", "❌ Reject button clicked")
            
            // Disable buttons immediately
            val acceptBtn = overlayView?.findViewById<Button>(R.id.btnAccept)
            val rejectBtn = overlayView?.findViewById<Button>(R.id.btnReject)
            acceptBtn?.isEnabled = false
            rejectBtn?.isEnabled = false
            
            stopAlertSound()
            stopVibration()
            
            // Cancel countdown safely
            countdownRunnable?.let { r ->
                countdownHandler?.removeCallbacks(r)
                android.util.Log.d("BookingOverlay", "🧹 Countdown cancelled")
            }
            
            // Cancel status polling
            statusCheckRunnable?.let { r ->
                statusCheckHandler?.removeCallbacks(r)
                android.util.Log.d("BookingOverlay", "🧹 Status polling cancelled")
            }
            
            if (bookingId.isEmpty()) {
                ui { Toast.makeText(this, "Error: No booking ID", Toast.LENGTH_SHORT).show() }
                acceptInFlight = false
                finishAndStop("no_booking_id")
                return@setOnClickListener
            }
            
            // Wrap entire flow with 12s watchdog timeout
            serviceScope.launch {
                var outcome = "unknown"
                try {
                    val finished = withTimeoutOrNull(12_000) {
                        updateBooking(bookingId, "rejected")
                        true
                    }
                    outcome = if (finished == true) "reject_success" else "reject_timeout"
                    if (finished != true) {
                        ui { Toast.makeText(this@BookingOverlayService, "Network slow. Will refresh.", Toast.LENGTH_SHORT).show() }
                    }
                } catch (t: Throwable) {
                    android.util.Log.e("BookingOverlay", "❌ Reject flow crashed", t)
                    outcome = "reject_exception"
                    ui { Toast.makeText(this@BookingOverlayService, "Reject failed", Toast.LENGTH_SHORT).show() }
                } finally {
                    // Always close overlay and stop service
                    acceptInFlight = false
                    // Tell React layer to refresh either way (it will fetch latest state)
                    LocalBroadcastManager.getInstance(applicationContext)
                        .sendBroadcast(Intent("DIDI_BOOKING_REFRESH").apply { putExtra("booking_id", bookingId) })
                    finishAndStop(outcome)
                }
            }
        }

        // Add overlay to window and track it
        try {
            android.util.Log.d("BookingOverlay", "➕ Adding overlay to window manager...")
            windowManager?.addView(overlayView, params)
            overlayAdded = true
            // Track this window for guaranteed cleanup
            overlayView?.let { addedWindows.add(it) }
            android.util.Log.d("BookingOverlay", "✅ Overlay added successfully! Starting countdown and status monitoring...")

            // 📨 ACK popup_shown — overlay is actually on screen now.
            android.util.Log.d("BookingOverlay", "📨 [ACK] Sending popup_shown for booking_id=$bookingId req=$currentBookingRequestId")
            BackendSync.ackDeliveryAsync(applicationContext, bookingId, "popup_shown", currentBookingRequestId)


            // Start countdown AFTER view is added to window
            countdownRunnable?.let { r -> countdownHandler?.post(r) }

            // Start booking status polling to detect if another worker accepts
            startBookingStatusPolling(bookingId)
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Failed to add overlay to window", e)
            e.printStackTrace()
            // Tell backend exactly why the popup did not show
            BackendSync.ackFailureAsync(applicationContext, bookingId, "popup_failed", currentBookingRequestId)
            Toast.makeText(this, "Failed to show overlay: ${e.message}", Toast.LENGTH_LONG).show()
            OverlaySingleton.isShowing = false
            stopSelf()
        }
    }
    
    private fun startBookingStatusPolling(bookingId: String) {
        statusCheckHandler = Handler(mainLooper)
        statusCheckRunnable = object : Runnable {
            override fun run() {
                if (isShuttingDown || overlayView == null) {
                    android.util.Log.d("BookingOverlay", "🧹 Status polling cancelled - service shutting down")
                    return
                }
                
                // Capture this Runnable instance so we can use it inside the coroutine
                val runnable = this
                
                // Check booking status in background
                serviceScope.launch {
                    try {
                        val isStillAvailable = checkBookingStatus(bookingId)
                        if (!isStillAvailable) {
                            android.util.Log.d("BookingOverlay", "📢 Booking $bookingId no longer available - another worker accepted it")
                            ui {
                                Toast.makeText(
                                    this@BookingOverlayService,
                                    "Booking was accepted by another worker",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                            finishAndStop("booking_taken_by_another_worker")
                        } else {
                            // Schedule next check in 2 seconds
                            statusCheckHandler?.postDelayed(runnable, 2000)
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("BookingOverlay", "❌ Error checking booking status", e)
                        // Continue polling even on error
                        statusCheckHandler?.postDelayed(runnable, 2000)
                    }
                }
            }
        }
        // Start first check after 2 seconds
        statusCheckRunnable?.let { r -> statusCheckHandler?.postDelayed(r, 2000) }
    }
    
    private suspend fun checkBookingStatus(bookingId: String): Boolean = withContext(Dispatchers.IO) {
        try {
            // Get access token
            var jwt = currentAccessToken
            if (jwt.isNullOrEmpty()) {
                val sessionJson = getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
                    .getString("didi_session", null)
                if (!sessionJson.isNullOrEmpty()) {
                    try {
                        val session = JSONObject(sessionJson)
                        jwt = session.optString("accessToken", "")
                    } catch (e: Exception) {
                        android.util.Log.e("BookingOverlay", "❌ Failed to parse session", e)
                    }
                }
            }
            
            if (jwt.isNullOrEmpty()) {
                android.util.Log.e("BookingOverlay", "❌ No access token for status check")
                return@withContext true // Assume still available if we can't check
            }
            
            // Query booking status
            val url = URL("$SUPABASE_URL/rest/v1/bookings?id=eq.$bookingId&select=status")
            val connection = url.openConnection() as HttpURLConnection
            
            try {
                connection.requestMethod = "GET"
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                connection.setRequestProperty("Authorization", "Bearer $jwt")
                connection.setRequestProperty("Content-Type", "application/json")
                
                val responseCode = connection.responseCode
                
                if (responseCode == 200) {
                    val responseBody = connection.inputStream.bufferedReader().use { it.readText() }
                    val json = JSONObject(responseBody.trim().removePrefix("[").removeSuffix("]"))
                    val status = json.optString("status", "")
                    
                    android.util.Log.d("BookingOverlay", "📊 Booking $bookingId status: $status")
                    
                    // Booking is still available if status is "pending"
                    return@withContext status == "pending"
                } else {
                    android.util.Log.e("BookingOverlay", "❌ Status check failed: $responseCode")
                    return@withContext true // Assume still available on error
                }
            } finally {
                connection.disconnect()
            }
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Error in checkBookingStatus", e)
            return@withContext true // Assume still available on error
        }
    }
    
    /**
     * Save session to ALL storage keys - keeps native and web in sync.
     * This prevents "already_used" refresh token errors.
     */
    private fun saveSessionToAllStores(
        accessToken: String,
        refreshToken: String,
        expiresIn: Int,
        user: JSONObject?
    ) {
        val prefs = getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
        val expiresAt = (System.currentTimeMillis() / 1000) + expiresIn
        
        // 1. Native format for didi_session (used by overlay/activity)
        val nativeSession = JSONObject().apply {
            put("accessToken", accessToken)
            put("refreshToken", refreshToken)
            put("expiresIn", expiresIn)
            if (user != null) put("user", user)
        }
        
        // 2. Supabase JS format for didi-worker-session (used by web layer)
        val webSession = JSONObject().apply {
            put("access_token", accessToken)
            put("refresh_token", refreshToken)
            put("expires_at", expiresAt)
            put("expires_in", expiresIn)
            put("token_type", "bearer")
            if (user != null) put("user", user)
        }
        
        prefs.edit()
            .putString("didi_session", nativeSession.toString())
            .putString("didi-worker-session", webSession.toString())
            .apply()
        
        // Also update worker_prefs for legacy access
        getSharedPreferences("worker_prefs", MODE_PRIVATE)
            .edit()
            .putString("supabase_jwt", accessToken)
            .apply()
        
        android.util.Log.d("BookingOverlay", "💾 Session synced to both stores (RT last 6: ${refreshToken.takeLast(6)})")
    }
    
    /**
     * Refresh the access token using the refresh token
     * Returns the new access token, or null if refresh failed
     */
    private fun refreshAccessToken(): String? {
        // Throttle: don't refresh if we refreshed within last 30 seconds
        val now = System.currentTimeMillis()
        if (now - lastRefreshTime < REFRESH_THROTTLE_MS) {
            android.util.Log.d("BookingOverlay", "⏳ Refresh throttled - last refresh ${(now - lastRefreshTime) / 1000}s ago")
            // Return current token from storage
            val sessionJson = getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
                .getString("didi_session", null)
            if (!sessionJson.isNullOrEmpty()) {
                try {
                    return JSONObject(sessionJson).optString("accessToken", "")
                } catch (e: Exception) {
                    return null
                }
            }
            return null
        }
        
        try {
            val prefs = getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
            val sessionJson = prefs.getString("didi_session", null)
            
            if (sessionJson.isNullOrEmpty()) {
                android.util.Log.e("BookingOverlay", "❌ No session found for refresh")
                return null
            }
            
            val session = JSONObject(sessionJson)
            val currentAccessToken = session.optString("accessToken", "")
            val expiresAt = session.optLong("expiresAt", 0)
            val refreshToken = session.optString("refreshToken", "")
            
            // Check if token expires in next 2 minutes (120 seconds)
            val expiresInSeconds = expiresAt - (now / 1000)
            if (expiresInSeconds > 120 && currentAccessToken.isNotEmpty()) {
                android.util.Log.d("BookingOverlay", "✅ Token still valid for ${expiresInSeconds}s - skipping refresh")
                return currentAccessToken
            }
            
            if (refreshToken.isEmpty()) {
                android.util.Log.e("BookingOverlay", "❌ No refresh token in session")
                return null
            }
            
            android.util.Log.d("BookingOverlay", "🔄 Refreshing access token (expires in ${expiresInSeconds}s)...")
            
            val url = URL("$SUPABASE_URL/auth/v1/token?grant_type=refresh_token")
            val connection = url.openConnection() as HttpURLConnection
            
            try {
                connection.requestMethod = "POST"
                connection.connectTimeout = 10000
                connection.readTimeout = 10000
                connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true
                
                val payload = """{"refresh_token":"$refreshToken"}"""
                connection.outputStream.use { os ->
                    os.write(payload.toByteArray())
                }
                
                val responseCode = connection.responseCode
                android.util.Log.d("BookingOverlay", "🔄 Refresh response code: $responseCode")
                
                if (responseCode in 200..299) {
                    val responseBody = connection.inputStream.bufferedReader().use { it.readText() }
                    val newSession = JSONObject(responseBody)
                    
                    val newAccessToken = newSession.optString("access_token", "")
                    val newRefreshToken = newSession.optString("refresh_token", refreshToken)
                    val expiresIn = newSession.optInt("expires_in", 3600)
                    
                    if (newAccessToken.isNotEmpty()) {
                        // Save to ALL storage keys to keep web + native in sync
                        saveSessionToAllStores(
                            newAccessToken, 
                            newRefreshToken, 
                            expiresIn, 
                            if (session.has("user")) session.optJSONObject("user") else null
                        )
                        
                        // Update cached token
                        this@BookingOverlayService.currentAccessToken = newAccessToken
                        lastRefreshTime = System.currentTimeMillis()
                        
                        android.util.Log.d("BookingOverlay", "✅ [NATIVE] Token refreshed -> wrote didi_session + didi-worker-session (RT last 6: ${newRefreshToken.takeLast(6)})")
                        return newAccessToken
                    }
                } else {
                    val errorBody = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error details"
                    android.util.Log.e("BookingOverlay", "❌ Token refresh failed: $responseCode - $errorBody")
                }
            } finally {
                connection.disconnect()
            }
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Token refresh exception", e)
        }
        
        return null
    }
    
    private suspend fun updateBooking(bookingId: String, action: String) {
        withContext(Dispatchers.IO) {
            android.util.Log.d("BookingOverlay", "📤 Updating booking $bookingId with action: $action")
            
            // Get access token - try multiple sources
            var jwt = currentAccessToken
            
            if (jwt.isNullOrEmpty()) {
                android.util.Log.d("BookingOverlay", "🔍 No cached token, checking SharedPreferences...")
                val sessionJson = getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
                    .getString("didi_session", null)
                
                if (!sessionJson.isNullOrEmpty()) {
                    try {
                        val session = JSONObject(sessionJson)
                        jwt = session.optString("accessToken", "")
                        android.util.Log.d("BookingOverlay", "🔑 Token from SharedPreferences: ${jwt?.take(12)}...")
                    } catch (e: Exception) {
                        android.util.Log.e("BookingOverlay", "❌ Failed to parse session", e)
                    }
                }
            }
            
            // If no token or token might be expired, try refreshing first
            if (jwt.isNullOrEmpty()) {
                android.util.Log.d("BookingOverlay", "🔄 No token found, attempting refresh...")
                jwt = refreshAccessToken()
            } else {
                // Proactively refresh if we have a session - token may be expired
                android.util.Log.d("BookingOverlay", "🔄 Proactively refreshing token to ensure it's valid...")
                val refreshedToken = refreshAccessToken()
                if (!refreshedToken.isNullOrEmpty()) {
                    jwt = refreshedToken
                }
            }
            
            if (jwt.isNullOrEmpty()) {
                android.util.Log.e("BookingOverlay", "❌ No access token available after refresh attempt!")
                throw IllegalStateException("No access token available - Please log in again")
            }
            
            android.util.Log.d("BookingOverlay", "✅ Using token: ${jwt?.take(12)}...")
            
            if (action == "accepted") {
                // Call try_accept_booking RPC with user JWT
                val rpcUrl = URL("$SUPABASE_URL/rest/v1/rpc/try_accept_booking")
                val connection = rpcUrl.openConnection() as HttpURLConnection
                
                try {
                    connection.requestMethod = "POST"
                    connection.connectTimeout = 8000
                    connection.readTimeout = 8000
                    connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                    connection.setRequestProperty("Authorization", "Bearer $jwt")
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.doOutput = true

                    val jsonPayload = """{"p_booking_id":"$bookingId"}"""
                    connection.outputStream.use { os ->
                        os.write(jsonPayload.toByteArray())
                    }

                    val responseCode = connection.responseCode
                    android.util.Log.d("BookingOverlay", "📡 RPC code: $responseCode")
                
                    val responseBody = if (responseCode in 200..299) {
                        connection.inputStream.bufferedReader().use { it.readText() }
                    } else {
                        connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error details"
                    }

                    android.util.Log.d("BookingOverlay", "📄 RPC Response Body: $responseBody")
                    
                    if (responseCode in 200..299) {
                        // Response is the JSONB object directly, not in an array
                        val json = JSONObject(responseBody.ifEmpty { "{}" })
                        val success = json.optBoolean("success", false)
                        
                        if (success) {
                            android.util.Log.d("BookingOverlay", "✅ Accept success")
                            withContext(Dispatchers.Main) {
                                ui {
                                    Toast.makeText(
                                        this@BookingOverlayService,
                                        "✅ Booking accepted!",
                                        Toast.LENGTH_SHORT
                                    ).show()
                                }
                            }
                            // Send local broadcast to React UI
                            val intent = Intent("DIDI_BOOKING_ACCEPTED").apply {
                                putExtra("booking_id", bookingId)
                            }
                            LocalBroadcastManager.getInstance(applicationContext).sendBroadcast(intent)
                            android.util.Log.d("BookingOverlay", "📡 Broadcast sent: DIDI_BOOKING_ACCEPTED")
                        } else {
                            val error = json.optString("error", "Unknown error")
                            android.util.Log.d("BookingOverlay", "❌ Accept failed: $error")
                            throw IllegalStateException("Server rejected: $error")
                        }
                    } else {
                        // HTTP error - throw with details
                        val errorMsg = try {
                            val json = JSONObject(responseBody)
                            json.optString("message", json.optString("error", json.optString("msg", "HTTP $responseCode")))
                        } catch (e: Exception) {
                            "HTTP $responseCode: ${responseBody.take(200)}"
                        }
                        android.util.Log.d("BookingOverlay", "❌ Accept failed: $errorMsg")
                        throw IllegalStateException(errorMsg)
                    }
                } finally {
                    connection.disconnect()
                }
            } else {
                // For reject, call reject_booking_request RPC with user JWT
                // First, extract user_id from JWT
                val userId = try {
                    val parts = jwt.split(".")
                    if (parts.size >= 2) {
                        val payload = String(android.util.Base64.decode(parts[1], android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING))
                        val json = JSONObject(payload)
                        json.optString("sub", "")
                    } else {
                        ""
                    }
                } catch (e: Exception) {
                    android.util.Log.e("BookingOverlay", "❌ Failed to extract user_id from JWT", e)
                    ""
                }
                
                if (userId.isEmpty()) {
                    android.util.Log.e("BookingOverlay", "❌ Could not extract user_id from JWT")
                    throw IllegalStateException("Could not extract user_id from JWT")
                }
                
                android.util.Log.d("BookingOverlay", "👤 Worker ID: $userId")
                
                val rpcUrl = URL("$SUPABASE_URL/rest/v1/rpc/reject_booking_request")
                val connection = rpcUrl.openConnection() as HttpURLConnection
                
                try {
                    connection.requestMethod = "POST"
                    connection.connectTimeout = 8000
                    connection.readTimeout = 8000
                    connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                    connection.setRequestProperty("Authorization", "Bearer $jwt")
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.doOutput = true

                    val jsonPayload = """{"p_booking_id":"$bookingId","p_worker_id":"$userId"}"""
                    connection.outputStream.use { os ->
                        os.write(jsonPayload.toByteArray())
                    }

                    val responseCode = connection.responseCode
                    android.util.Log.d("BookingOverlay", "📡 RPC code: $responseCode")
                    
                    val responseBody = if (responseCode in 200..299) {
                        connection.inputStream.bufferedReader().use { it.readText() }
                    } else {
                        connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error details"
                    }

                    android.util.Log.d("BookingOverlay", "📄 RPC Response Body: $responseBody")
                    
                    if (responseCode in 200..299) {
                        val json = JSONObject(responseBody.ifEmpty { "{}" })
                        val success = json.optBoolean("success", false)
                        val message = json.optString("message", "")
                        
                        if (success) {
                            android.util.Log.d("BookingOverlay", "✅ Reject success: $message")
                            
                            val toastMessage = when {
                                message.contains("next-tier-activated") -> "Booking offered to next available workers"
                                message.contains("no-more-tiers") -> "Booking rejected"
                                else -> "Booking rejected"
                            }
                            
                            withContext(Dispatchers.Main) {
                                ui {
                                    Toast.makeText(
                                        this@BookingOverlayService,
                                        toastMessage,
                                        Toast.LENGTH_SHORT
                                    ).show()
                                }
                            }
                        } else {
                            val error = json.optString("error", "Unknown error")
                            android.util.Log.d("BookingOverlay", "❌ Reject failed: $error")
                            throw IllegalStateException("Server rejected: $error")
                        }
                    } else {
                        val errorMsg = try {
                            val json = JSONObject(responseBody)
                            json.optString("message", json.optString("error", json.optString("msg", "HTTP $responseCode")))
                        } catch (e: Exception) {
                            "HTTP $responseCode: ${responseBody.take(200)}"
                        }
                        android.util.Log.d("BookingOverlay", "❌ Reject failed: $errorMsg")
                        throw IllegalStateException(errorMsg)
                    }
                } finally {
                    connection.disconnect()
                }
            }
        }
    }

    /**
     * Removes all tracked windows from WindowManager
     * Safe to call multiple times - idempotent
     */
    private fun cleanupAllWindows() {
        android.util.Log.d("BookingOverlay", "🪟 cleanupAllWindows: ${addedWindows.size} windows to remove")
        
        // Remove in reverse order (LIFO) to be safe
        for (v in addedWindows.asReversed()) {
            try {
                if (v.isAttachedToWindow) {
                    windowManager?.removeViewImmediate(v)
                    android.util.Log.d("BookingOverlay", "✅ Removed window: ${v.javaClass.simpleName}")
                }
            } catch (t: Throwable) {
                android.util.Log.w("BookingOverlay", "⚠️ removeViewImmediate warn for ${v.javaClass.simpleName}", t)
            }
        }
        addedWindows.clear()
        android.util.Log.d("BookingOverlay", "🧹 All windows cleared from tracking list")
    }

    /**
     * Final cleanup and service stop using stopSelfResult for deterministic shutdown
     * Guarantees singleton reset and all windows removed
     */
    private fun finishAndStop(reason: String) {
        if (isShuttingDown) {
            android.util.Log.d("BookingOverlay", "⚠️ finishAndStop already called, skipping duplicate")
            return
        }
        
        isShuttingDown = true
        android.util.Log.d("BookingOverlay", "🛑 finishAndStop: $reason")
        
        // Stop sound and vibration
        try {
            stopAlertSound()
            stopVibration()
        } catch (e: Throwable) {
            android.util.Log.e("BookingOverlay", "❌ Error stopping sound/vibration", e)
        }
        
        // Cancel countdown
        try {
            countdownRunnable?.let { countdownHandler?.removeCallbacks(it) }
            countdownRunnable = null
            countdownHandler = null
        } catch (e: Throwable) {
            android.util.Log.e("BookingOverlay", "❌ Error cancelling countdown", e)
        }
        
        // Cancel status polling
        try {
            statusCheckRunnable?.let { statusCheckHandler?.removeCallbacks(it) }
            statusCheckRunnable = null
            statusCheckHandler = null
        } catch (e: Throwable) {
            android.util.Log.e("BookingOverlay", "❌ Error cancelling status polling", e)
        }
        
        // Remove all windows
        cleanupAllWindows()
        
        // Clear references
        overlayAdded = false
        overlayView = null
        windowManager = null
        
        // Stop foreground
        try {
            stopForeground(true)
            android.util.Log.d("BookingOverlay", "🛑 Foreground stopped")
        } catch (e: Throwable) {
            android.util.Log.e("BookingOverlay", "❌ Error stopping foreground", e)
        }
        
        // Use stopSelfResult to ensure we stop the correct started instance
        val stopped = stopSelfResult(startIdForStop)
        android.util.Log.d("BookingOverlay", "stopSelfResult($startIdForStop) -> $stopped")
        
        // Reset singleton flag
        OverlaySingleton.isShowing = false
    }

    @Deprecated("Use finishAndStop instead", ReplaceWith("finishAndStop(\"legacy\")"))
    private fun closeOverlayAndStop(reason: String) {
        finishAndStop(reason)
    }

    @Deprecated("Use finishAndStop instead", ReplaceWith("finishAndStop(\"legacy\")"))
    private fun closeOverlay() {
        finishAndStop("legacy")
    }

    private fun playAlertSound() {
        try {
            // Stop any existing sound
            stopAlertSound()
            
            // Use custom loud ringtone from raw resources
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .build()
                )
                setDataSource(
                    this@BookingOverlayService,
                    android.net.Uri.parse("android.resource://${packageName}/${R.raw.new_loud_ringtone}")
                )
                isLooping = true // Loop the alarm sound
                setVolume(1.0f, 1.0f) // Max volume
                prepare()
                start()
            }
            
            android.util.Log.d("BookingOverlay", "🔊 Alert sound started (custom ringtone)")
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Failed to play alert sound", e)
        }
    }
    
    private fun startContinuousVibration() {
        try {
            vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            
            if (vibrator?.hasVibrator() == true) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    // Android 8.0+: Use VibrationEffect for continuous pattern
                    // Pattern: [delay, vibrate, pause, vibrate, ...]
                    val pattern = longArrayOf(0, 500, 200, 500, 200) // 500ms vibrate, 200ms pause, repeat
                    val effect = VibrationEffect.createWaveform(pattern, 0) // 0 = repeat from index 0
                    vibrator?.vibrate(effect)
                } else {
                    // Older Android: Use deprecated pattern method
                    @Suppress("DEPRECATION")
                    val pattern = longArrayOf(0, 500, 200, 500, 200)
                    @Suppress("DEPRECATION")
                    vibrator?.vibrate(pattern, 0) // 0 = repeat from index 0
                }
                android.util.Log.d("BookingOverlay", "📳 Continuous vibration started")
            } else {
                android.util.Log.w("BookingOverlay", "⚠️ Vibrator not available")
            }
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Failed to start vibration", e)
        }
    }
    
    private fun stopVibration() {
        try {
            vibrator?.cancel()
            vibrator = null
            android.util.Log.d("BookingOverlay", "🛑 Vibration stopped")
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Failed to stop vibration", e)
        }
    }

    private fun stopAlertSound() {
        try {
            mediaPlayer?.apply {
                if (isPlaying) {
                    stop()
                }
                release()
            }
            mediaPlayer = null
            android.util.Log.d("BookingOverlay", "🔇 Alert sound stopped")
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Failed to stop alert sound", e)
        }
    }

    private fun fallbackToActivity(intent: Intent?) {
        android.util.Log.d("BookingOverlay", "🔄 Falling back to BookingAlertActivity")
        try {
            val activityIntent = Intent(this, BookingAlertActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                intent?.extras?.let { putExtras(it) }
            }
            startActivity(activityIntent)
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Failed to start fallback activity", e)
        }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        super.onTaskRemoved(rootIntent)
        android.util.Log.d("BookingOverlay", "onTaskRemoved - stopping overlay service")
        // BookingOverlayService should stop when task is removed (it's only for active alerts)
        finishAndStop("onTaskRemoved")
    }

    override fun onDestroy() {
        android.util.Log.d("BookingOverlay", "🧹 onDestroy called")
        
        // Reset singleton FIRST in case of crash or forced destroy
        OverlaySingleton.isShowing = false
        
        // Cancel coroutines to prevent any pending work from trying to update closed views
        try {
            serviceJob.cancel()
            android.util.Log.d("BookingOverlay", "🚫 Coroutines cancelled in onDestroy")
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Error cancelling coroutines", e)
        }
        
        // Then cleanup if not already done
        if (!isShuttingDown) {
            finishAndStop("onDestroy")
        }
        
        super.onDestroy()
        android.util.Log.d("BookingOverlay", "✅ onDestroy complete")
    }
}
