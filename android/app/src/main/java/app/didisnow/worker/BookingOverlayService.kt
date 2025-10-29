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
import android.os.IBinder
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

class BookingOverlayService : Service() {
    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    private var mediaPlayer: MediaPlayer? = null
    
    companion object {
        private const val SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co"
        private const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o"
        private const val NOTIFICATION_CHANNEL_ID = "booking_overlay_channel"
        private const val NOTIFICATION_ID = 9001
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        android.util.Log.d("BookingOverlay", "🚀 BookingOverlayService.onStartCommand called")
        android.util.Log.d("BookingOverlay", "📦 Intent extras: ${intent?.extras}")
        
        try {
            // Create notification channel and start foreground
            createNotificationChannel()
            startForegroundService()
            
            val mode = intent?.getStringExtra("mode") ?: "show"
            android.util.Log.d("BookingOverlay", "🎯 Mode: $mode")
            
            when (mode) {
                "hide" -> {
                    android.util.Log.d("BookingOverlay", "🔚 Hide mode - closing overlay")
                    closeOverlay()
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
        val handler = android.os.Handler(mainLooper)
        val countdown = object : Runnable {
            override fun run() {
                if (secondsLeft > 0) {
                    countdownText?.text = "${secondsLeft}s"
                    android.util.Log.d("BookingOverlay", "⏱️ Countdown: ${secondsLeft}s")
                    secondsLeft--
                    handler.postDelayed(this, 1000)
                } else {
                    android.util.Log.d("BookingOverlay", "⏱️ Countdown finished - auto closing")
                    // Auto-reject after 30 seconds
                    closeOverlay()
                }
            }
        }

        // Handle Accept button
        overlayView?.findViewById<Button>(R.id.btnAccept)?.setOnClickListener {
            android.util.Log.d("BookingOverlay", "✅ Accept button clicked")
            stopAlertSound() // Stop sound immediately
            handler.removeCallbacks(countdown)
            if (bookingId.isNotEmpty()) {
                updateBooking(bookingId, "accepted")
                // closeOverlay will be called after network request completes
            } else {
                Toast.makeText(this, "Error: No booking ID", Toast.LENGTH_SHORT).show()
                closeOverlay()
            }
        }

        // Handle Reject button
        overlayView?.findViewById<Button>(R.id.btnReject)?.setOnClickListener {
            android.util.Log.d("BookingOverlay", "❌ Reject button clicked")
            stopAlertSound() // Stop sound immediately
            handler.removeCallbacks(countdown)
            updateBooking(bookingId, "rejected")
            // closeOverlay will be called after network request completes
        }

        // Add overlay to window
        try {
            android.util.Log.d("BookingOverlay", "➕ Adding overlay to window manager...")
            windowManager?.addView(overlayView, params)
            android.util.Log.d("BookingOverlay", "✅ Overlay added successfully! Starting countdown...")
            
            // Start countdown AFTER view is added to window
            handler.post(countdown)
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Failed to add overlay to window", e)
            e.printStackTrace()
            Toast.makeText(this, "Failed to show overlay: ${e.message}", Toast.LENGTH_LONG).show()
            stopSelf()
        }
    }

    private var currentAccessToken: String? = null
    
    private fun updateBooking(bookingId: String, action: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
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
                    withContext(Dispatchers.Main) {
                        Toast.makeText(
                            this@BookingOverlayService,
                            "❌ Please log in to accept bookings",
                            Toast.LENGTH_LONG
                        ).show()
                        closeOverlay()
                    }
                    return@launch
                }
                
                android.util.Log.d("BookingOverlay", "✅ Using token: ${jwt?.take(12)}...")
                
                if (action == "accepted") {
                    // Call try_accept_booking RPC with user JWT
                    val rpcUrl = URL("$SUPABASE_URL/rest/v1/rpc/try_accept_booking")
                    val connection = rpcUrl.openConnection() as HttpURLConnection
                    
                    connection.requestMethod = "POST"
                    connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                    connection.setRequestProperty("Authorization", "Bearer $jwt")
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.doOutput = true

                    val jsonPayload = """{"p_booking_id":"$bookingId"}"""
                    connection.outputStream.use { os ->
                        os.write(jsonPayload.toByteArray())
                    }

                    val responseCode = connection.responseCode
                    android.util.Log.d("BookingOverlay", "📡 RPC Response Code: $responseCode")
                    
                    val responseBody = if (responseCode in 200..299) {
                        connection.inputStream.bufferedReader().use { it.readText() }
                    } else {
                        connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error details"
                    }
                    connection.disconnect()

                    android.util.Log.d("BookingOverlay", "📄 RPC Response Body: $responseBody")

                    withContext(Dispatchers.Main) {
                        if (responseCode in 200..299) {
                            try {
                                // Response is the JSONB object directly, not in an array
                                val json = JSONObject(responseBody)
                                val success = json.optBoolean("success", false)
                                
                                if (success) {
                                    Toast.makeText(
                                        this@BookingOverlayService,
                                        "✅ Booking accepted successfully!",
                                        Toast.LENGTH_LONG
                                    ).show()
                                } else {
                                    val error = json.optString("error", "Unknown error")
                                    android.util.Log.e("BookingOverlay", "❌ RPC returned success=false: $error")
                                    Toast.makeText(
                                        this@BookingOverlayService,
                                        "❌ $error",
                                        Toast.LENGTH_LONG
                                    ).show()
                                }
                            } catch (e: Exception) {
                                android.util.Log.e("BookingOverlay", "❌ Failed to parse success response", e)
                                Toast.makeText(
                                    this@BookingOverlayService,
                                    "❌ Parse error: ${e.message}",
                                    Toast.LENGTH_LONG
                                ).show()
                            }
                        } else {
                            // Show detailed error from HTTP error response
                            val errorMsg = try {
                                val json = JSONObject(responseBody)
                                json.optString("message", json.optString("error", json.optString("msg", "HTTP $responseCode")))
                            } catch (e: Exception) {
                                "HTTP $responseCode: ${responseBody.take(200)}"
                            }
                            android.util.Log.e("BookingOverlay", "❌ Accept failed HTTP $responseCode: $errorMsg")
                            Toast.makeText(
                                this@BookingOverlayService,
                                "❌ $errorMsg",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                        closeOverlay()
                    }
                } else {
                    // For reject, update status directly with user JWT
                    val url = URL("$SUPABASE_URL/rest/v1/bookings?id=eq.$bookingId")
                    val connection = url.openConnection() as HttpURLConnection
                    
                    connection.requestMethod = "PATCH"
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
                    connection.disconnect()

                    android.util.Log.d("BookingOverlay", "✅ Reject response: $responseCode")

                    withContext(Dispatchers.Main) {
                        if (responseCode in 200..299) {
                            Toast.makeText(
                                this@BookingOverlayService,
                                "Booking rejected",
                                Toast.LENGTH_SHORT
                            ).show()
                        } else {
                            Toast.makeText(
                                this@BookingOverlayService,
                                "Failed to reject booking",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                        closeOverlay()
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("BookingOverlay", "❌ Error updating booking", e)
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@BookingOverlayService,
                        "Error: ${e.message}",
                        Toast.LENGTH_SHORT
                    ).show()
                    closeOverlay()
                }
            }
        }
    }

    private fun closeOverlay() {
        android.util.Log.d("BookingOverlay", "🔚 closeOverlay called")
        stopAlertSound() // Stop sound when closing
        try {
            if (overlayView != null && overlayView?.windowToken != null) {
                android.util.Log.d("BookingOverlay", "➖ Removing overlay from window")
                windowManager?.removeView(overlayView)
            }
        } catch (e: Exception) {
            android.util.Log.e("BookingOverlay", "❌ Error removing overlay", e)
            e.printStackTrace()
        } finally {
            overlayView = null
            android.util.Log.d("BookingOverlay", "🛑 Stopping service")
            stopSelf()
        }
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
        super.onDestroy()
        closeOverlay()
    }
}
