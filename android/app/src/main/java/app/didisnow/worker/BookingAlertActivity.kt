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
    
    companion object {
        private const val SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co"
        private const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o"
        private const val ACCEPT_FUNCTION_URL = "$SUPABASE_URL/functions/v1/worker-accept-booking"
    }
    
    // Helper methods to access stored session
    private fun getAccessToken(): String = OverlayAuthPlugin.getAccessToken(this)
    private fun getRefreshToken(): String = OverlayAuthPlugin.getRefreshToken(this)
    private fun getUserId(): String = OverlayAuthPlugin.getUserId(this)
    private fun getExpiresAt(): Long = OverlayAuthPlugin.getExpiresAt(this)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

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

        val bookingId = intent.getStringExtra("booking_id") ?: ""
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
            "cook" -> {
                serviceText.text = "Cook Service"
                serviceSubtitle.text = "Includes: Meal Preparation"
                serviceImage.setImageResource(R.drawable.ic_service_cook)
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
                    
                    // Change countdown box color based on time remaining
                    val bgColor = when {
                        secondsLeft > 15 -> "#22C55E" // Green
                        secondsLeft > 10 -> "#F59E0B" // Orange
                        else -> "#EF4444" // Red
                    }
                    countdownText.parent?.let { parent ->
                        if (parent is android.view.View) {
                            parent.setBackgroundColor(Color.parseColor(bgColor))
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
    
    private fun updateBooking(bookingId: String, action: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                Log.d("BookingAlert", "📤 Updating booking $bookingId with action: $action")
                
                // Get access token from OverlayAuthPlugin
                var accessToken = getAccessToken()
                val expiresAt = getExpiresAt()
                val now = System.currentTimeMillis() / 1000
                
                Log.d("BookingAlert", "🔑 Access token present: ${accessToken.isNotEmpty()}")
                Log.d("BookingAlert", "⏰ Token expires at: $expiresAt, now: $now")
                
                // Check if token needs refresh
                if (accessToken.isNotEmpty() && expiresAt > 0 && now >= (expiresAt - 30)) {
                    Log.d("BookingAlert", "🔄 Token expired or expiring soon, attempting refresh...")
                    accessToken = refreshToken() ?: accessToken
                }
                
                if (accessToken.isEmpty()) {
                    Log.w("BookingAlert", "⚠️ No access token available")
                    withContext(Dispatchers.Main) {
                        Toast.makeText(
                            this@BookingAlertActivity,
                            "❌ Not authenticated - Please log in to the app first",
                            Toast.LENGTH_LONG
                        ).show()
                        finish()
                    }
                    return@launch
                }
                
                if (action == "accepted") {
                    // Call worker-accept-booking Edge Function
                    Log.d("BookingAlert", "📡 Calling accept booking function...")
                    val functionUrl = URL(ACCEPT_FUNCTION_URL)
                    val connection = functionUrl.openConnection() as HttpURLConnection
                    
                    connection.requestMethod = "POST"
                    connection.setRequestProperty("Authorization", "Bearer $accessToken")
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.doOutput = true

                    val jsonPayload = """{"booking_id":"$bookingId"}"""
                    connection.outputStream.use { os ->
                        os.write(jsonPayload.toByteArray())
                    }

                    val responseCode = connection.responseCode
                    Log.d("BookingAlert", "📡 Function Response Code: $responseCode")
                    
                    val responseBody = if (responseCode in 200..299) {
                        connection.inputStream.bufferedReader().use { it.readText() }
                    } else {
                        connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error details"
                    }
                    connection.disconnect()

                    Log.d("BookingAlert", "📄 Function Response: $responseBody")

                    withContext(Dispatchers.Main) {
                        if (responseCode in 200..299) {
                            Toast.makeText(
                                this@BookingAlertActivity,
                                "✅ Booking accepted successfully!",
                                Toast.LENGTH_SHORT
                            ).show()
                            Log.d("BookingAlert", "✅ Booking accepted successfully")
                            
                            // Broadcast success to update app UI
                            sendBroadcast(Intent("BOOKING_ACCEPTED").putExtra("booking_id", bookingId))
                        } else if (responseCode == 409) {
                            Toast.makeText(
                                this@BookingAlertActivity,
                                "⚠️ Booking already accepted by another worker",
                                Toast.LENGTH_LONG
                            ).show()
                            Log.w("BookingAlert", "⚠️ Booking already taken")
                        } else if (responseCode == 401) {
                            Toast.makeText(
                                this@BookingAlertActivity,
                                "❌ Not authenticated - Please log in again",
                                Toast.LENGTH_LONG
                            ).show()
                            Log.e("BookingAlert", "❌ Auth error: $responseBody")
                        } else {
                            Toast.makeText(
                                this@BookingAlertActivity,
                                "❌ Failed to accept booking",
                                Toast.LENGTH_LONG
                            ).show()
                            Log.e("BookingAlert", "❌ HTTP Error: $responseCode - $responseBody")
                        }
                        finish()
                    }
                } else if (action == "rejected") {
                    // Update booking to cancelled status via REST API
                    val updateUrl = URL("$SUPABASE_URL/rest/v1/bookings?id=eq.$bookingId")
                    val connection = updateUrl.openConnection() as HttpURLConnection
                    
                    connection.requestMethod = "PATCH"
                    connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                    connection.setRequestProperty("Authorization", "Bearer $accessToken")
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.setRequestProperty("Prefer", "return=minimal")
                    connection.doOutput = true

                    val jsonPayload = """{"status":"cancelled"}"""
                    connection.outputStream.use { os ->
                        os.write(jsonPayload.toByteArray())
                    }

                    val responseCode = connection.responseCode
                    Log.d("BookingAlert", "📡 Update Response Code: $responseCode")
                    connection.disconnect()

                    withContext(Dispatchers.Main) {
                        if (responseCode in 200..299) {
                            Toast.makeText(
                                this@BookingAlertActivity,
                                "❌ Booking rejected",
                                Toast.LENGTH_SHORT
                            ).show()
                            Log.d("BookingAlert", "❌ Booking rejected successfully")
                        } else {
                            Toast.makeText(
                                this@BookingAlertActivity,
                                "⚠️ Failed to reject booking",
                                Toast.LENGTH_SHORT
                            ).show()
                            Log.e("BookingAlert", "❌ Reject failed with code: $responseCode")
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
    
    /**
     * Refresh the access token using the refresh token
     */
    private suspend fun refreshToken(): String? {
        return try {
            val refreshToken = getRefreshToken()
            if (refreshToken.isEmpty()) {
                Log.w("BookingAlert", "⚠️ No refresh token available")
                return null
            }
            
            Log.d("BookingAlert", "🔄 Refreshing token...")
            val url = URL("$SUPABASE_URL/auth/v1/token?grant_type=refresh_token")
            val connection = url.openConnection() as HttpURLConnection
            
            connection.requestMethod = "POST"
            connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
            connection.setRequestProperty("Content-Type", "application/json")
            connection.doOutput = true
            
            val body = """{"refresh_token":"$refreshToken"}"""
            connection.outputStream.use { os ->
                os.write(body.toByteArray())
            }
            
            val responseCode = connection.responseCode
            if (responseCode in 200..299) {
                val responseBody = connection.inputStream.bufferedReader().use { it.readText() }
                val json = JSONObject(responseBody)
                val newAccessToken = json.getString("access_token")
                val expiresIn = json.optInt("expires_in", 3600)
                
                // Save the new token
                val newExpiresAt = System.currentTimeMillis() / 1000 + expiresIn
                getSharedPreferences("supabase_session_shared", MODE_PRIVATE).edit()
                    .putString("accessToken", newAccessToken)
                    .putLong("expiresAt", newExpiresAt)
                    .apply()
                
                Log.d("BookingAlert", "✅ Token refreshed successfully")
                connection.disconnect()
                return newAccessToken
            } else {
                val errorBody = connection.errorStream?.bufferedReader()?.use { it.readText() }
                Log.e("BookingAlert", "❌ Token refresh failed: $responseCode - $errorBody")
                connection.disconnect()
                return null
            }
        } catch (e: Exception) {
            Log.e("BookingAlert", "❌ Error refreshing token", e)
            return null
        }
    }
}
