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
    
    // Booking status polling
    private var statusCheckHandler: Handler? = null
    private var statusCheckRunnable: Runnable? = null
    private var currentBookingId: String? = null
    
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
    
    /**
     * Read the LATEST access token from storage JUST-IN-TIME
     * This ensures we always use the most recent token, not a stale one
     */
    private fun getLatestAccessToken(): String? {
        try {
            // First try AuthBridge (most recently saved JWT)
            val prefs = getSharedPreferences("worker_prefs", MODE_PRIVATE)
            val authBridgeToken = prefs.getString("supabase_jwt", null)
            if (!authBridgeToken.isNullOrEmpty()) {
                android.util.Log.d("BookingOverlay", "🔑 Using token from AuthBridge")
                return authBridgeToken
            }
            
            // Fallback to didi_session in CapacitorStorage
            val sessionJson = getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
                .getString("didi_session", null)
            
            if (!sessionJson.isNullOrEmpty()) {
                val session = JSONObject(sessionJson)
                val token = session.optString("accessToken", "")
                if (token.isNotEmpty()) {
                    android.util.Log.d("BookingOverlay", "🔑 Using token from didi_session")
                    return token
                }
            }
            
            android.util.Log.w("BookingOverlay", "⚠️ No access token found in storage")
            return null
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Error reading access token", e)
            return null
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
                    finishAndStop("countdown_expired")
                }
            }
        }

        // Accept button
        overlayView?.findViewById<Button>(R.id.btnAccept)?.setOnClickListener {
            if (!OverlaySingleton.isShowing) return@setOnClickListener
            if (isShuttingDown || acceptInFlight) return@setOnClickListener
            
            acceptInFlight = true
            android.util.Log.d("BookingOverlay", "✅ Accept button clicked for booking: $bookingId")
            
            serviceScope.launch {
                try {
                    val success = updateBookingStatus(bookingId, "accepted")
                    if (success) {
                        android.util.Log.d("BookingOverlay", "✅ Booking accepted successfully")
                        ui {
                            Toast.makeText(this@BookingOverlayService, "✅ Booking Accepted!", Toast.LENGTH_SHORT).show()
                        }
                        notifyWebApp(bookingId, "accepted")
                        finishAndStop("accepted")
                    } else {
                        android.util.Log.e("BookingOverlay", "❌ Failed to accept booking")
                        ui {
                            Toast.makeText(this@BookingOverlayService, "❌ Failed to accept", Toast.LENGTH_SHORT).show()
                        }
                        acceptInFlight = false
                    }
                } catch (e: Exception) {
                    android.util.Log.e("BookingOverlay", "❌ Exception accepting booking", e)
                    ui {
                        Toast.makeText(this@BookingOverlayService, "❌ Error: ${e.message}", Toast.LENGTH_SHORT).show()
                    }
                    acceptInFlight = false
                }
            }
        }

        // Decline button
        overlayView?.findViewById<Button>(R.id.btnDecline)?.setOnClickListener {
            if (!OverlaySingleton.isShowing) return@setOnClickListener
            if (isShuttingDown) return@setOnClickListener
            
            android.util.Log.d("BookingOverlay", "❌ Decline button clicked")
            
            serviceScope.launch {
                try {
                    updateBookingRequestStatus(bookingId, "declined")
                } catch (e: Exception) {
                    android.util.Log.e("BookingOverlay", "❌ Exception declining booking", e)
                }
                notifyWebApp(bookingId, "declined")
                finishAndStop("declined")
            }
        }

        try {
            windowManager?.addView(overlayView, params)
            addedWindows.add(overlayView!!)
            overlayAdded = true
            android.util.Log.d("BookingOverlay", "✅ Overlay view added successfully")
            
            countdownHandler?.post(countdownRunnable!!)
            startStatusPolling(bookingId)
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Failed to add overlay view", e)
            OverlaySingleton.isShowing = false
            stopSelf()
        }
    }
    
    private fun startStatusPolling(bookingId: String) {
        statusCheckHandler = Handler(mainLooper)
        statusCheckRunnable = object : Runnable {
            override fun run() {
                if (isShuttingDown) return
                
                serviceScope.launch {
                    try {
                        val status = checkBookingStatus(bookingId)
                        android.util.Log.d("BookingOverlay", "📊 Booking status: $status")
                        
                        if (status == "accepted" || status == "cancelled" || status == "assigned") {
                            android.util.Log.d("BookingOverlay", "🔄 Booking status changed to $status - closing overlay")
                            finishAndStop("status_changed_to_$status")
                            return@launch
                        }
                    } catch (e: Exception) {
                        android.util.Log.e("BookingOverlay", "❌ Status check failed", e)
                    }
                    
                    if (!isShuttingDown) {
                        statusCheckHandler?.postDelayed(this@Runnable, 3000)
                    }
                }
            }
        }
        statusCheckHandler?.postDelayed(statusCheckRunnable!!, 3000)
    }
    
    private suspend fun checkBookingStatus(bookingId: String): String? {
        return withContext(Dispatchers.IO) {
            try {
                // Read LATEST token just-in-time
                val accessToken = getLatestAccessToken()
                if (accessToken.isNullOrEmpty()) {
                    android.util.Log.w("BookingOverlay", "⚠️ No token for status check")
                    return@withContext null
                }
                
                val url = URL("$SUPABASE_URL/rest/v1/bookings?id=eq.$bookingId&select=status")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "GET"
                connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                connection.setRequestProperty("Authorization", "Bearer $accessToken")
                connection.connectTimeout = 5000
                connection.readTimeout = 5000
                
                val responseCode = connection.responseCode
                if (responseCode == 200) {
                    val response = connection.inputStream.bufferedReader().readText()
                    val jsonArray = org.json.JSONArray(response)
                    if (jsonArray.length() > 0) {
                        return@withContext jsonArray.getJSONObject(0).optString("status")
                    }
                }
                null
            } catch (e: Exception) {
                android.util.Log.e("BookingOverlay", "❌ checkBookingStatus error", e)
                null
            }
        }
    }
    
    private suspend fun updateBookingStatus(bookingId: String, status: String): Boolean {
        return withContext(Dispatchers.IO) {
            withTimeoutOrNull(10000L) {
                try {
                    // Read LATEST token just-in-time
                    val accessToken = getLatestAccessToken()
                    if (accessToken.isNullOrEmpty()) {
                        android.util.Log.e("BookingOverlay", "❌ No access token for update")
                        return@withTimeoutOrNull false
                    }
                    
                    android.util.Log.d("BookingOverlay", "🔄 Updating booking $bookingId to $status")
                    
                    val url = URL("$SUPABASE_URL/rest/v1/bookings?id=eq.$bookingId")
                    val connection = url.openConnection() as HttpURLConnection
                    connection.requestMethod = "PATCH"
                    connection.doOutput = true
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                    connection.setRequestProperty("Authorization", "Bearer $accessToken")
                    connection.setRequestProperty("Prefer", "return=minimal")
                    connection.connectTimeout = 8000
                    connection.readTimeout = 8000
                    
                    val now = java.time.Instant.now().toString()
                    val body = """{"status":"$status","accepted_at":"$now"}"""
                    
                    connection.outputStream.bufferedWriter().use { it.write(body) }
                    
                    val responseCode = connection.responseCode
                    android.util.Log.d("BookingOverlay", "📡 Update response: $responseCode")
                    
                    responseCode in 200..299
                } catch (e: Exception) {
                    android.util.Log.e("BookingOverlay", "❌ updateBookingStatus error", e)
                    false
                }
            } ?: false
        }
    }
    
    private suspend fun updateBookingRequestStatus(bookingId: String, status: String): Boolean {
        return withContext(Dispatchers.IO) {
            try {
                val accessToken = getLatestAccessToken()
                if (accessToken.isNullOrEmpty()) return@withContext false
                
                val url = URL("$SUPABASE_URL/rest/v1/booking_requests?booking_id=eq.$bookingId&status=eq.pending")
                val connection = url.openConnection() as HttpURLConnection
                connection.requestMethod = "PATCH"
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                connection.setRequestProperty("Authorization", "Bearer $accessToken")
                connection.setRequestProperty("Prefer", "return=minimal")
                
                val now = java.time.Instant.now().toString()
                val body = """{"status":"$status","responded_at":"$now"}"""
                
                connection.outputStream.bufferedWriter().use { it.write(body) }
                
                connection.responseCode in 200..299
            } catch (e: Exception) {
                android.util.Log.e("BookingOverlay", "❌ updateBookingRequestStatus error", e)
                false
            }
        }
    }
    
    private fun notifyWebApp(bookingId: String, action: String) {
        try {
            val intent = Intent("booking-action")
            intent.putExtra("bookingId", bookingId)
            intent.putExtra("action", action)
            LocalBroadcastManager.getInstance(this).sendBroadcast(intent)
            
            val mainIntent = Intent(this, MainActivity::class.java)
            mainIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            mainIntent.putExtra("navigateTo", "home")
            mainIntent.putExtra("bookingId", bookingId)
            mainIntent.putExtra("action", action)
            startActivity(mainIntent)
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ notifyWebApp error", e)
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
        countdownHandler?.removeCallbacks(countdownRunnable ?: {})
        countdownHandler = null
        countdownRunnable = null
        
        // Stop status polling
        statusCheckHandler?.removeCallbacks(statusCheckRunnable ?: {})
        statusCheckHandler = null
        statusCheckRunnable = null
        
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
        
        // Cancel coroutines
        serviceJob.cancel()
        
        // Stop service
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