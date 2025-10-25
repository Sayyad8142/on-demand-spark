package app.didisnow.worker

import android.app.Activity
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import org.json.JSONObject

class BookingAlertActivity : Activity() {
    companion object {
        private const val SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co"
        private const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o"
    }

    private var countdownHandler: android.os.Handler? = null
    private var countdownRunnable: Runnable? = null
    private var mediaPlayer: MediaPlayer? = null

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

        // Play loud siren sound
        playAlertSound()

        val bookingId = intent.getStringExtra("booking_id") ?: ""
        val customer = intent.getStringExtra("customer_name") ?: "New Customer"
        val community = intent.getStringExtra("community") ?: ""
        val serviceType = intent.getStringExtra("service_type") ?: ""
        val flatNo = intent.getStringExtra("flat_no") ?: ""
        val price = intent.getIntExtra("price_inr", 0)

        findViewById<TextView>(R.id.alertTitle).text = "New Booking"
        findViewById<TextView>(R.id.alertService).text = serviceType
        findViewById<TextView>(R.id.alertLocation).text = "Flat: $flatNo"
        findViewById<TextView>(R.id.alertPrice).text = "₹$price"

        // Check and display authentication status
        val jwt = getSharedPreferences("worker_prefs", MODE_PRIVATE).getString("supabase_jwt", null)
        val authStatusView = findViewById<TextView>(R.id.authStatus)
        val acceptButton = findViewById<Button>(R.id.btnAccept)
        
        val isAuthenticated = jwt != null && jwt.isNotEmpty()
        
        if (isAuthenticated) {
            authStatusView.text = "✅ Authenticated"
            authStatusView.setTextColor(android.graphics.Color.parseColor("#22C55E"))
            authStatusView.setBackgroundColor(android.graphics.Color.parseColor("#F0FDF4"))
            acceptButton.isEnabled = true
            android.util.Log.d("BookingAlert", "✅ JWT found, showing authenticated status")
        } else {
            authStatusView.text = "❌ Please log in to accept bookings"
            authStatusView.setTextColor(android.graphics.Color.parseColor("#EF4444"))
            authStatusView.setBackgroundColor(android.graphics.Color.parseColor("#FEF2F2"))
            acceptButton.isEnabled = false
            acceptButton.alpha = 0.5f
            android.util.Log.w("BookingAlert", "⚠️ No JWT found, showing not authenticated status")
        }

        // Start 30-second countdown timer
        val countdownText = findViewById<TextView>(R.id.countdown)
        var secondsLeft = 30
        countdownHandler = android.os.Handler(mainLooper)
        countdownRunnable = object : Runnable {
            override fun run() {
                if (secondsLeft > 0) {
                    countdownText.text = "$secondsLeft"
                    
                    // Change color based on time remaining
                    when {
                        secondsLeft > 15 -> countdownText.setTextColor(android.graphics.Color.parseColor("#22C55E")) // Green
                        secondsLeft > 5 -> countdownText.setTextColor(android.graphics.Color.parseColor("#F59E0B")) // Orange
                        else -> countdownText.setTextColor(android.graphics.Color.parseColor("#EF4444")) // Red
                    }
                    
                    android.util.Log.d("BookingAlert", "⏱️ Countdown: ${secondsLeft}s")
                    secondsLeft--
                    countdownHandler?.postDelayed(this, 1000)
                } else {
                    android.util.Log.d("BookingAlert", "⏱️ Countdown finished - auto rejecting")
                    // Auto-reject after 30 seconds
                    if (bookingId.isNotEmpty()) {
                        rejectBooking(bookingId)
                    } else {
                        finish()
                    }
                }
            }
        }
        countdownHandler?.post(countdownRunnable!!)

        acceptButton.setOnClickListener {
            android.util.Log.d("BookingAlert", "✅ Accept button clicked")
            stopAlertSound() // Stop sound immediately
            countdownHandler?.removeCallbacks(countdownRunnable!!)
            
            // Check authentication again when clicking
            if (!isAuthenticated) {
                // Open app to login screen
                Toast.makeText(this, "Opening app to log in...", Toast.LENGTH_SHORT).show()
                val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
                launchIntent?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                startActivity(launchIntent)
                finish()
                return@setOnClickListener
            }
            
            if (bookingId.isNotEmpty()) {
                acceptBooking(bookingId)
            } else {
                Toast.makeText(this, "Error: No booking ID", Toast.LENGTH_SHORT).show()
                finish()
            }
        }

        findViewById<Button>(R.id.btnReject).setOnClickListener {
            android.util.Log.d("BookingAlert", "❌ Reject button clicked")
            stopAlertSound() // Stop sound immediately
            countdownHandler?.removeCallbacks(countdownRunnable!!)
            if (bookingId.isNotEmpty()) {
                rejectBooking(bookingId)
            } else {
                Toast.makeText(this, "Booking rejected", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        countdownHandler?.removeCallbacks(countdownRunnable!!)
        stopAlertSound()
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
                setDataSource(this@BookingAlertActivity, alarmUri)
                isLooping = true // Loop the alarm sound
                setVolume(1.0f, 1.0f) // Max volume
                prepare()
                start()
            }
            
            android.util.Log.d("BookingAlert", "🔊 Alert sound started")
        } catch (e: Exception) {
            android.util.Log.e("BookingAlert", "❌ Failed to play alert sound", e)
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
            android.util.Log.d("BookingAlert", "🔇 Alert sound stopped")
        } catch (e: Exception) {
            android.util.Log.e("BookingAlert", "❌ Failed to stop alert sound", e)
        }
    }
    
    private fun rejectBooking(bookingId: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                // Get the stored JWT token
                val jwt = getSharedPreferences("worker_prefs", MODE_PRIVATE)
                    .getString("supabase_jwt", null)
                
                val url = URL("$SUPABASE_URL/rest/v1/bookings?id=eq.$bookingId")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.requestMethod = "PATCH"
                connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                connection.setRequestProperty("Authorization", "Bearer ${jwt ?: SUPABASE_ANON_KEY}")  // Use JWT if available
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Prefer", "return=minimal")
                connection.doOutput = true

                val jsonPayload = """{"status":"cancelled"}"""
                connection.outputStream.use { os ->
                    os.write(jsonPayload.toByteArray())
                }

                val responseCode = connection.responseCode
                android.util.Log.d("BookingAlert", "✅ Reject response: $responseCode")
                connection.disconnect()

                withContext(Dispatchers.Main) {
                    if (responseCode in 200..299) {
                        android.util.Log.d("BookingAlert", "✅ Booking rejected successfully")
                    } else {
                        android.util.Log.e("BookingAlert", "❌ Failed to reject booking: $responseCode")
                    }
                    // Just finish without opening app or showing toast
                    finish()
                }
            } catch (e: Exception) {
                android.util.Log.e("BookingAlert", "❌ Error rejecting booking", e)
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@BookingAlertActivity,
                        "Error: ${e.message}",
                        Toast.LENGTH_SHORT
                    ).show()
                    finish()
                }
            }
        }
    }

    private fun acceptBooking(bookingId: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                android.util.Log.d("BookingAlert", "📤 Accepting booking $bookingId")
                
                // Get the stored JWT token
                val jwt = getSharedPreferences("worker_prefs", MODE_PRIVATE)
                    .getString("supabase_jwt", null)
                
                if (jwt == null || jwt.isEmpty()) {
                    android.util.Log.w("BookingAlert", "⚠️ No Supabase JWT — cannot accept")
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
                
                // Call try_accept_booking RPC with user JWT
                val rpcUrl = URL("$SUPABASE_URL/rest/v1/rpc/try_accept_booking")
                val connection = rpcUrl.openConnection() as HttpURLConnection
                
                connection.requestMethod = "POST"
                connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                connection.setRequestProperty("Authorization", "Bearer $jwt")  // Use JWT
                connection.setRequestProperty("Content-Type", "application/json")
                connection.doOutput = true

                val jsonPayload = """{"p_booking_id":"$bookingId"}"""
                connection.outputStream.use { os ->
                    os.write(jsonPayload.toByteArray())
                }

                val responseCode = connection.responseCode
                android.util.Log.d("BookingAlert", "📡 RPC Response Code: $responseCode")
                
                val responseBody = if (responseCode in 200..299) {
                    connection.inputStream.bufferedReader().use { it.readText() }
                } else {
                    connection.errorStream?.bufferedReader()?.use { it.readText() } ?: "No error details"
                }
                connection.disconnect()

                android.util.Log.d("BookingAlert", "📄 RPC Response Body: $responseBody")

                withContext(Dispatchers.Main) {
                    if (responseCode in 200..299) {
                        try {
                            // Check if response indicates success
                            val success = if (responseBody.isNotEmpty() && responseBody != "null") {
                                val json = JSONObject(responseBody)
                                json.optBoolean("success", true) // Default to true if not specified
                            } else {
                                true // Empty response means success
                            }
                            
                            if (success) {
                                android.util.Log.d("BookingAlert", "✅ Booking accepted successfully!")
                                // Just finish without showing toast or opening app
                                finish()
                            } else {
                                val error = JSONObject(responseBody).optString("error", "Could not accept booking")
                                android.util.Log.e("BookingAlert", "❌ Accept failed: $error")
                                Toast.makeText(
                                    this@BookingAlertActivity,
                                    "❌ $error",
                                    Toast.LENGTH_SHORT
                                ).show()
                                finish()
                            }
                        } catch (e: Exception) {
                            android.util.Log.e("BookingAlert", "❌ Response parse error", e)
                            // Assume success if response code is 2xx
                            finish()
                        }
                    } else {
                        val errorMsg = try {
                            val json = JSONObject(responseBody)
                            json.optString("message", json.optString("error", "HTTP $responseCode"))
                        } catch (e: Exception) {
                            "Failed to accept (HTTP $responseCode)"
                        }
                        android.util.Log.e("BookingAlert", "❌ Accept failed: $errorMsg")
                        Toast.makeText(
                            this@BookingAlertActivity,
                            "❌ $errorMsg",
                            Toast.LENGTH_SHORT
                        ).show()
                        finish()
                    }
                }
            } catch (e: Exception) {
                android.util.Log.e("BookingAlert", "❌ Error accepting booking", e)
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@BookingAlertActivity,
                        "Error: ${e.message}",
                        Toast.LENGTH_SHORT
                    ).show()
                    finish()
                }
            }
        }
    }
}
