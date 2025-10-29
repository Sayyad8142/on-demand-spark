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
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.Button
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
    private var isShuttingDown = false
    private var countdownHandler: Handler? = null
    private var countdownRunnable: Runnable? = null
    private var currentAccessToken: String? = null
    
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
            // Create notification channel and start foreground
            createNotificationChannel()
            startForegroundService()
            
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
                    val customer = intent?.getStringExtra("customer_name") ?: "New Customer"
                    val community = intent?.getStringExtra("community") ?: ""
                    val serviceType = intent?.getStringExtra("service_type") ?: ""
                    val flatNo = intent?.getStringExtra("flat_no") ?: ""
                    val price = intent?.getIntExtra("price_inr", 0) ?: 0
                    
                    // Try to get access token from Intent first (passed from web)
                    var accessToken = intent?.getStringExtra("ACCESS_TOKEN")
                    android.util.Log.d("BookingOverlay", "🔑 Access token from Intent: ${if (accessToken != null) "✅ Present (${accessToken.take(12)}...)" else "❌ Not passed"}")

                    android.util.Log.d("BookingOverlay", "📋 Booking details - ID: $bookingId, Service: $serviceType, Community: $community")
                    
                    if (bookingId.isEmpty()) {
                        android.util.Log.e("BookingOverlay", "❌ No booking ID provided, cannot show overlay")
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
        try {
            val notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
                .setContentTitle("Booking Alert Active")
                .setContentText("Ready to receive booking notifications")
                .setSmallIcon(R.drawable.ic_notification)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .build()

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                // Android 14+ (SDK 34+) - use DATA_SYNC type explicitly
                startForeground(NOTIFICATION_ID, notification, 
                    android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
                android.util.Log.d("BookingOverlay", "✅ FGS started as DATA_SYNC (Android 14+)")
            } else {
                startForeground(NOTIFICATION_ID, notification)
                android.util.Log.d("BookingOverlay", "✅ FGS started (Android < 14)")
            }
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ FGS start error", e)
            throw e
        }
    }

    private fun showOverlay(bookingId: String, customer: String, community: String, serviceType: String, flatNo: String, price: Int) {
        android.util.Log.d("BookingOverlay", "🖼️ showOverlay called")
        
        // Play loud siren sound
        playAlertSound()
        
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
        overlayView?.findViewById<TextView>(R.id.title)?.text = "New Booking: $serviceType"
        val subtitle = if (flatNo.isNotEmpty()) "$community • $flatNo" else "$customer • $community"
        overlayView?.findViewById<TextView>(R.id.subtitle)?.text = subtitle
        overlayView?.findViewById<TextView>(R.id.price)?.text = "₹$price"
        
        // Check and display authentication status (for debugging)
        val sessionJson = getSharedPreferences("CapacitorStorage", MODE_PRIVATE).getString("didi_session", null)
        val authStatusView = overlayView?.findViewById<TextView>(R.id.authStatus)
        authStatusView?.text = "✅ Token Present | FGS: DATA_SYNC | Booking: $bookingId"
        authStatusView?.setTextColor(android.graphics.Color.parseColor("#22C55E"))
        authStatusView?.setBackgroundColor(android.graphics.Color.parseColor("#F0FDF4"))
        android.util.Log.d("BookingOverlay", "✅ Debug banner: Token validated, FGS type: DATA_SYNC")
        
        // Prepare countdown handler (will start after view is added)
        val countdownText = overlayView?.findViewById<TextView>(R.id.countdown)
        var secondsLeft = 30
        countdownHandler = Handler(mainLooper)
        countdownRunnable = object : Runnable {
            override fun run() {
                if (isShuttingDown || overlayView == null) {
                    android.util.Log.d("BookingOverlay", "🧹 Countdown cancelled - service shutting down")
                    return
                }
                if (secondsLeft > 0) {
                    ui { countdownText?.text = "${secondsLeft}s" }
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
            
            // Cancel countdown safely
            countdownRunnable?.let { r -> 
                countdownHandler?.removeCallbacks(r)
                android.util.Log.d("BookingOverlay", "🧹 Countdown cancelled")
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
                    ui { Toast.makeText(this@BookingOverlayService, "Accept failed", Toast.LENGTH_SHORT).show() }
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
            
            // Cancel countdown safely
            countdownRunnable?.let { r ->
                countdownHandler?.removeCallbacks(r)
                android.util.Log.d("BookingOverlay", "🧹 Countdown cancelled")
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
            android.util.Log.d("BookingOverlay", "✅ Overlay added successfully! Starting countdown...")
            
            // Start countdown AFTER view is added to window
            countdownRunnable?.let { r -> countdownHandler?.post(r) }
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Failed to add overlay to window", e)
            e.printStackTrace()
            Toast.makeText(this, "Failed to show overlay: ${e.message}", Toast.LENGTH_LONG).show()
            OverlaySingleton.isShowing = false
            stopSelf()
        }
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
            
            if (jwt.isNullOrEmpty()) {
                android.util.Log.e("BookingOverlay", "❌ No access token available!")
                throw IllegalStateException("No access token available")
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
                // For reject, update status directly with user JWT
                val url = URL("$SUPABASE_URL/rest/v1/bookings?id=eq.$bookingId")
                val connection = url.openConnection() as HttpURLConnection
                
                try {
                    connection.requestMethod = "PATCH"
                    connection.connectTimeout = 8000
                    connection.readTimeout = 8000
                    connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                    connection.setRequestProperty("Authorization", "Bearer $jwt")
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.setRequestProperty("Prefer", "return=minimal")
                    connection.doOutput = true

                    val jsonPayload = """{"status":"cancelled"}"""
                    connection.outputStream.use { os ->
                        os.write(jsonPayload.toByteArray())
                    }

                    val responseCode = connection.responseCode
                    android.util.Log.d("BookingOverlay", "📡 PATCH code: $responseCode")
                    
                    if (responseCode in 200..299) {
                        android.util.Log.d("BookingOverlay", "✅ Reject success")
                        withContext(Dispatchers.Main) {
                            ui {
                                Toast.makeText(
                                    this@BookingOverlayService,
                                    "Booking rejected",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        }
                    } else {
                        val errorBody = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error details"
                        android.util.Log.d("BookingOverlay", "❌ Reject failed: HTTP $responseCode: $errorBody")
                        throw IllegalStateException("HTTP $responseCode: $errorBody")
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
        
        // Stop sound
        try {
            stopAlertSound()
        } catch (e: Throwable) {
            android.util.Log.e("BookingOverlay", "❌ Error stopping sound", e)
        }
        
        // Cancel countdown
        try {
            countdownRunnable?.let { countdownHandler?.removeCallbacks(it) }
            countdownRunnable = null
            countdownHandler = null
        } catch (e: Throwable) {
            android.util.Log.e("BookingOverlay", "❌ Error cancelling countdown", e)
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
            
            // Use the default alarm sound (loud siren-like sound)
            val alarmUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
                ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .build()
                )
                setDataSource(this@BookingOverlayService, alarmUri)
                isLooping = true // Loop the alarm sound
                setVolume(1.0f, 1.0f) // Max volume
                prepare()
                start()
            }
            
            android.util.Log.d("BookingOverlay", "🔊 Alert sound started")
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Failed to play alert sound", e)
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
