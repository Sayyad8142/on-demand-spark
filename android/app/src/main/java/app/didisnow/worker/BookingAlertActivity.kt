package app.didisnow.worker

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

@Suppress("SetTextI18n")
class BookingAlertActivity : AppCompatActivity() {
    private var countdownHandler: Handler? = null
    private lateinit var countdownRunnable: Runnable
    private var secondsLeft = 30
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    
    // Token refresh throttling
    private var lastRefreshTime: Long = 0
    private val REFRESH_THROTTLE_MS = 30_000L
    
    companion object {
        private const val SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co"
        private const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val bookingId = intent.getStringExtra("booking_id") ?: ""
        val bookingType = intent.getStringExtra("booking_type") ?: "instant"
        val prealertSent = intent.getBooleanExtra("prealert_sent", false)
        val scheduledTime = intent.getStringExtra("scheduled_time") ?: ""
        if (bookingType == "scheduled" && !prealertSent) {
            Log.w("BookingAlert", "🔕 Scheduled offer hidden until prealert_sent=true booking_id=$bookingId booking_type=$bookingType scheduled_at=$scheduledTime prealert_sent=$prealertSent request_status=null shown_to_worker=false")
            BackendSync.ackFailureAsync(applicationContext, bookingId, "prealert_suppressed",
                intent.getStringExtra("booking_request_id"))
            finish()
            return
        }

        // Keep screen on & show over lock screen
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
            WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
        )

        setContentView(R.layout.activity_booking_alert)

        // Play loud siren sound and vibrate
        playAlertSound()
        startVibration()

        val serviceType = intent.getStringExtra("service_type") ?: ""
        val flatNo = intent.getStringExtra("flat_no") ?: ""
        val priceInr = intent.getIntExtra("price_inr", 0)

        // Set service details
        val serviceText = findViewById<TextView>(R.id.alertService)
        val serviceSubtitle = findViewById<TextView>(R.id.alertServiceSubtitle)
        val serviceImage = findViewById<ImageView>(R.id.alertServiceImage)
        val priceText = findViewById<TextView>(R.id.alertPrice)
        val towerText = findViewById<TextView>(R.id.alertTower)
        val communityText = findViewById<TextView>(R.id.alertCommunity)

        when (serviceType.lowercase()) {
            "maid" -> {
                serviceText.text = "Maid Service"
                serviceSubtitle.text = "Includes: Dishes & Jhaadu/Pocha"
                serviceImage.setImageResource(R.drawable.maid_dishes)
            }
            "bathroom cleaning", "bathroom" -> {
                serviceText.text = "Bathroom Cleaning"
                serviceSubtitle.text = "Includes: Complete Bathroom Cleaning"
                serviceImage.setImageResource(R.drawable.ic_service_bathroom)
            }
            else -> {
                serviceText.text = serviceType
                serviceSubtitle.text = "Service details"
                serviceImage.setImageResource(R.drawable.ic_service_default)
            }
        }

        priceText.text = "₹$priceInr"
        
        // Derive Tower No from first digit of flat number
        val towerNo = if (flatNo.isNotBlank()) {
            flatNo.firstOrNull { it.isDigit() }?.toString() ?: "—"
        } else {
            "—"
        }
        towerText.text = towerNo
        communityText.text = "Prestige High Fields"

        val countdownText = findViewById<TextView>(R.id.countdown)
        val countdownCircle = findViewById<ProgressBar>(R.id.countdownCircle)
        val btnAccept = findViewById<Button>(R.id.btnAccept)
        val btnReject = findViewById<Button>(R.id.btnReject)

        // Start 30-second countdown timer
        countdownHandler = Handler(Looper.getMainLooper())
        countdownRunnable = object : Runnable {
            override fun run() {
                if (secondsLeft > 0) {
                    countdownText.text = "${secondsLeft}s"
                    countdownCircle.progress = secondsLeft
                    
                    // Change countdown text and circle color based on time remaining
                    val textColor = when {
                        secondsLeft > 15 -> "#22C55E" // Green
                        secondsLeft > 10 -> "#F59E0B" // Orange
                        else -> "#DC2626" // Red
                    }
                    countdownText.setTextColor(Color.parseColor(textColor))
                    
                    // Update circular progress bar color
                    val progressDrawable = countdownCircle.progressDrawable
                    if (progressDrawable is android.graphics.drawable.LayerDrawable) {
                        val progressLayer = progressDrawable.findDrawableByLayerId(android.R.id.progress)
                        if (progressLayer is android.graphics.drawable.RotateDrawable) {
                            val shapeDrawable = progressLayer.drawable
                            if (shapeDrawable is android.graphics.drawable.GradientDrawable) {
                                shapeDrawable.setColor(Color.parseColor(textColor))
                            }
                        }
                    }
                    
                    Log.d("BookingAlert", "⏱️ Countdown: ${secondsLeft}s")
                    secondsLeft--
                    countdownHandler?.postDelayed(this, 1000)
                } else {
                    Log.d("BookingAlert", "⏱️ Countdown finished - auto closing")
                    Toast.makeText(this@BookingAlertActivity, "Booking timed out", Toast.LENGTH_SHORT).show()
                    finish()
                }
            }
        }
        countdownHandler?.post(countdownRunnable)

        btnAccept.setOnClickListener {
            Log.d("BookingAlert", "✅ Accept button clicked")
            stopAlertSound()
            stopVibration()
            countdownHandler?.removeCallbacks(countdownRunnable)
            
            if (bookingId.isBlank()) {
                Toast.makeText(this, "No booking ID", Toast.LENGTH_SHORT).show()
                finish()
                return@setOnClickListener
            }
            
            // Disable buttons to prevent double-click
            btnAccept.isEnabled = false
            btnReject.isEnabled = false
            
            // Call the API to accept the booking
            updateBooking(bookingId, "accepted")
        }

        btnReject.setOnClickListener {
            Log.d("BookingAlert", "❌ Reject button clicked")
            stopAlertSound()
            stopVibration()
            countdownHandler?.removeCallbacks(countdownRunnable)
            
            // Disable buttons to prevent double-click
            btnAccept.isEnabled = false
            btnReject.isEnabled = false
            
            // Call the API to reject the booking
            updateBooking(bookingId, "rejected")
        }
    }

    override fun onDestroy() {
        countdownHandler?.removeCallbacks(countdownRunnable)
        stopAlertSound()
        stopVibration()
        super.onDestroy()
    }

    private fun playAlertSound() {
        try {
            // Stop any existing sound
            stopAlertSound()
            
            // Use the custom loud ringtone from raw resources
            mediaPlayer = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .build()
                )
                setDataSource(
                    this@BookingAlertActivity,
                    android.net.Uri.parse("android.resource://${packageName}/${R.raw.new_loud_ringtone}")
                )
                isLooping = true
                setVolume(1.0f, 1.0f)
                prepare()
                start()
            }
            
            Log.d("BookingAlert", "🔊 Custom alert sound started")
        } catch (e: Exception) {
            Log.e("BookingAlert", "❌ Failed to play custom alert sound", e)
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
            Log.d("BookingAlert", "🔇 Alert sound stopped")
        } catch (e: Exception) {
            Log.e("BookingAlert", "❌ Failed to stop alert sound", e)
        }
    }
    
    private fun startVibration() {
        try {
            vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            
            // Create a strong vibration pattern: [delay, vibrate, pause, vibrate, ...]
            // Pattern: wait 0ms, vibrate 1000ms, pause 500ms, repeat
            val pattern = longArrayOf(0, 1000, 500, 1000, 500)
            
            vibrator?.let {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    // For Android O and above, use VibrationEffect
                    val vibrationEffect = VibrationEffect.createWaveform(pattern, 0) // 0 = repeat from start
                    it.vibrate(vibrationEffect)
                } else {
                    // For older versions
                    @Suppress("DEPRECATION")
                    it.vibrate(pattern, 0)
                }
                Log.d("BookingAlert", "📳 Vibration started")
            }
        } catch (e: Exception) {
            Log.e("BookingAlert", "❌ Failed to start vibration", e)
        }
    }
    
    private fun stopVibration() {
        try {
            vibrator?.cancel()
            vibrator = null
            Log.d("BookingAlert", "📳 Vibration stopped")
        } catch (e: Exception) {
            Log.e("BookingAlert", "❌ Failed to stop vibration", e)
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
        
        Log.d("BookingAlert", "💾 Session synced to both stores (RT last 6: ${refreshToken.takeLast(6)})")
    }
    
    /**
     * Refresh the access token using the refresh token
     * Returns the new access token, or null if refresh failed
     */
    private fun refreshAccessToken(): String? {
        val now = System.currentTimeMillis()
        if (now - lastRefreshTime < REFRESH_THROTTLE_MS) {
            Log.d("BookingAlert", "⏳ Refresh throttled")
            val sessionJson = getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
                .getString("didi_session", null)
            if (!sessionJson.isNullOrEmpty()) {
                try { return org.json.JSONObject(sessionJson).optString("accessToken", "") } catch (e: Exception) { return null }
            }
            return null
        }
        
        try {
            val prefs = getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
            val sessionJson = prefs.getString("didi_session", null)
            
            if (sessionJson.isNullOrEmpty()) {
                Log.e("BookingAlert", "❌ No session found for refresh")
                return null
            }
            
            val session = org.json.JSONObject(sessionJson)
            val refreshToken = session.optString("refreshToken", "")
            
            if (refreshToken.isEmpty()) {
                Log.e("BookingAlert", "❌ No refresh token in session")
                return null
            }
            
            Log.d("BookingAlert", "🔄 Refreshing access token...")
            
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
                Log.d("BookingAlert", "🔄 Refresh response code: $responseCode")
                
                if (responseCode in 200..299) {
                    val responseBody = connection.inputStream.bufferedReader().use { it.readText() }
                    val newSession = org.json.JSONObject(responseBody)
                    
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
                        
                        lastRefreshTime = System.currentTimeMillis()
                        Log.d("BookingAlert", "✅ [NATIVE] Token refreshed -> wrote didi_session + didi-worker-session (RT last 6: ${newRefreshToken.takeLast(6)})")
                        return newAccessToken
                    }
                } else {
                    val errorBody = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error details"
                    Log.e("BookingAlert", "❌ Token refresh failed: $responseCode - $errorBody")
                }
            } finally {
                connection.disconnect()
            }
        } catch (e: Exception) {
            Log.e("BookingAlert", "❌ Token refresh exception", e)
        }
        
        return null
    }
    
    private fun updateBooking(bookingId: String, action: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                Log.d("BookingAlert", "📤 Updating booking $bookingId with action: $action")
                
                // First, try to get JWT from worker_prefs
                var jwt = getSharedPreferences("worker_prefs", MODE_PRIVATE)
                    .getString("supabase_jwt", null)
                
                // If not found, try CapacitorStorage
                if (jwt.isNullOrEmpty()) {
                    val sessionJson = getSharedPreferences("CapacitorStorage", MODE_PRIVATE)
                        .getString("didi_session", null)
                    if (!sessionJson.isNullOrEmpty()) {
                        try {
                            val session = JSONObject(sessionJson)
                            jwt = session.optString("accessToken", "")
                        } catch (e: Exception) {
                            Log.e("BookingAlert", "❌ Failed to parse session", e)
                        }
                    }
                }
                
                Log.d("BookingAlert", "🔑 JWT token present: ${!jwt.isNullOrEmpty()}")
                
                // Always try to refresh the token first - it might be expired
                Log.d("BookingAlert", "🔄 Proactively refreshing token...")
                val refreshedToken = refreshAccessToken()
                if (!refreshedToken.isNullOrEmpty()) {
                    jwt = refreshedToken
                    Log.d("BookingAlert", "✅ Using refreshed token")
                }
                
                if (jwt.isNullOrEmpty()) {
                    Log.w("BookingAlert", "⚠️ No Supabase JWT - cannot proceed")
                    withContext(Dispatchers.Main) {
                        Toast.makeText(
                            this@BookingAlertActivity,
                            "❌ Not authenticated - Please log in",
                            Toast.LENGTH_LONG
                        ).show()
                        finish()
                    }
                    return@launch
                }
                
                if (action == "accepted") {
                    // Call try_accept_booking RPC
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
                    Log.d("BookingAlert", "📡 RPC Response Code: $responseCode")
                    
                    val responseBody = if (responseCode in 200..299) {
                        connection.inputStream.bufferedReader().use { it.readText() }
                    } else {
                        connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error details"
                    }
                    connection.disconnect()

                    Log.d("BookingAlert", "📄 RPC Response Body: $responseBody")

                    withContext(Dispatchers.Main) {
                        if (responseCode in 200..299) {
                            try {
                                val jsonResponse = JSONObject(responseBody)
                                val success = jsonResponse.optBoolean("success", false)
                                
                                if (success) {
                                    Toast.makeText(
                                        this@BookingAlertActivity,
                                        "✅ Booking accepted successfully!",
                                        Toast.LENGTH_SHORT
                                    ).show()
                                    Log.d("BookingAlert", "✅ Booking accepted successfully")
                                } else {
                                    // RPC returns { success:false, error:"..." } — read `error` first,
                                    // fall back to `message` for older payloads.
                                    val errorMsg = jsonResponse.optString(
                                        "error",
                                        jsonResponse.optString("message", "Booking unavailable")
                                    )
                                    Toast.makeText(
                                        this@BookingAlertActivity,
                                        "⚠️ $errorMsg",
                                        Toast.LENGTH_LONG
                                    ).show()
                                    Log.w("BookingAlert", "⚠️ Accept failed: $errorMsg | raw=$responseBody")
                                }
                            } catch (e: Exception) {
                                Log.e("BookingAlert", "❌ Error parsing response", e)
                                Toast.makeText(
                                    this@BookingAlertActivity,
                                    "✅ Booking accepted",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        } else {
                            Toast.makeText(
                                this@BookingAlertActivity,
                                "❌ Failed to accept booking (Code: $responseCode)",
                                Toast.LENGTH_LONG
                            ).show()
                            Log.e("BookingAlert", "❌ HTTP Error: $responseCode - $responseBody")
                        }
                        finish()
                    }
                } else if (action == "rejected") {
                    // Extract user_id from JWT
                    val userId = try {
                        val parts = jwt.split(".")
                        if (parts.size >= 2) {
                            val payload = String(android.util.Base64.decode(parts[1], android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING))
                            val jsonObj = JSONObject(payload)
                            jsonObj.optString("sub", "")
                        } else {
                            ""
                        }
                    } catch (e: Exception) {
                        Log.e("BookingAlert", "❌ Failed to extract user_id from JWT", e)
                        ""
                    }
                    
                    if (userId.isEmpty()) {
                        withContext(Dispatchers.Main) {
                            Toast.makeText(
                                this@BookingAlertActivity,
                                "⚠️ Could not identify worker",
                                Toast.LENGTH_LONG
                            ).show()
                            finish()
                        }
                        return@launch
                    }
                    
                    Log.d("BookingAlert", "👤 Worker ID: $userId")
                    
                    // Call reject_booking_request RPC
                    val rpcUrl = URL("$SUPABASE_URL/rest/v1/rpc/reject_booking_request")
                    val connection = rpcUrl.openConnection() as HttpURLConnection
                    
                    connection.requestMethod = "POST"
                    connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                    connection.setRequestProperty("Authorization", "Bearer $jwt")
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.doOutput = true

                    val jsonPayload = """{"p_booking_id":"$bookingId","p_worker_id":"$userId"}"""
                    connection.outputStream.use { os ->
                        os.write(jsonPayload.toByteArray())
                    }

                    val responseCode = connection.responseCode
                    Log.d("BookingAlert", "📡 RPC Response Code: $responseCode")
                    
                    val responseBody = if (responseCode in 200..299) {
                        connection.inputStream.bufferedReader().use { it.readText() }
                    } else {
                        connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error details"
                    }
                    connection.disconnect()
                    
                    Log.d("BookingAlert", "📄 RPC Response Body: $responseBody")

                    withContext(Dispatchers.Main) {
                        if (responseCode in 200..299) {
                            try {
                                val jsonResponse = JSONObject(responseBody)
                                val success = jsonResponse.optBoolean("success", false)
                                val message = jsonResponse.optString("message", "")
                                
                                if (success) {
                                    val toastMessage = when {
                                        message.contains("next-tier-activated") -> "Booking offered to next available workers"
                                        message.contains("no-more-tiers") -> "Booking rejected"
                                        else -> "Booking rejected"
                                    }
                                    
                                    Toast.makeText(
                                        this@BookingAlertActivity,
                                        toastMessage,
                                        Toast.LENGTH_SHORT
                                    ).show()
                                    Log.d("BookingAlert", "✅ Booking rejected: $message")
                                } else {
                                    Toast.makeText(
                                        this@BookingAlertActivity,
                                        "⚠️ Failed to reject booking",
                                        Toast.LENGTH_SHORT
                                    ).show()
                                    Log.w("BookingAlert", "⚠️ Reject failed: ${jsonResponse.optString("error")}")
                                }
                            } catch (e: Exception) {
                                Log.e("BookingAlert", "❌ Error parsing response", e)
                                Toast.makeText(
                                    this@BookingAlertActivity,
                                    "Booking rejected",
                                    Toast.LENGTH_SHORT
                                ).show()
                            }
                        } else {
                            Toast.makeText(
                                this@BookingAlertActivity,
                                "⚠️ Failed to reject booking (Code: $responseCode)",
                                Toast.LENGTH_LONG
                            ).show()
                            Log.e("BookingAlert", "❌ HTTP Error: $responseCode - $responseBody")
                        }
                        finish()
                    }
                }
            } catch (e: Exception) {
                Log.e("BookingAlert", "❌ Error updating booking", e)
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@BookingAlertActivity,
                        "❌ Network error: ${e.message}",
                        Toast.LENGTH_LONG
                    ).show()
                    finish()
                }
            }
        }
    }
}
