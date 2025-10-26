package app.didisnow.worker

import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.LayerDrawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageView
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import kotlin.concurrent.thread

@Suppress("SetTextI18n")
class BookingAlertActivity : AppCompatActivity() {
    private var countdownHandler: Handler? = null
    private lateinit var countdownRunnable: Runnable
    private var secondsLeft = 30
    private var mediaPlayer: MediaPlayer? = null
    private var isProcessing = false

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
        val serviceType = intent.getStringExtra("service_type") ?: ""
        val flatNo = intent.getStringExtra("flat_no") ?: ""
        val priceInr = intent.getIntExtra("price_inr", 0)
        val notes = intent.getStringExtra("notes") ?: ""
        val community = intent.getStringExtra("community") ?: "Prestige High Fields"

        // Set service title and subtitle
        findViewById<TextView>(R.id.alertService).text = when (serviceType.lowercase()) {
            "maid" -> "Maid Service"
            "cook" -> "Cook Service"
            "bathroom cleaning", "bathroom" -> "Bathroom Cleaning"
            else -> serviceType
        }

        findViewById<TextView>(R.id.alertServiceSubtitle).text = when (serviceType.lowercase()) {
            "maid" -> "Includes: Dishes & Jhaadu/Pocha"
            "cook" -> "Includes: Meal Preparation"
            "bathroom" -> "Includes: Complete Bathroom Cleaning"
            else -> if (notes.isNotBlank()) notes else "Service details"
        }

        // Set price
        findViewById<TextView>(R.id.alertPrice).text = "₹$priceInr"

        // Derive Tower No. from flat number (first digit)
        val towerNo = flatNo.trim().firstOrNull { it.isDigit() }?.toString() ?: "—"
        findViewById<TextView>(R.id.alertTower).text = towerNo

        // Set community
        findViewById<TextView>(R.id.alertCommunity).text = community

        // Show notes if available
        val notesView = findViewById<TextView>(R.id.alertNotes)
        if (notes.isNotBlank()) {
            notesView.text = notes
            notesView.visibility = View.VISIBLE
        }

        // Set service icon
        val serviceIcon = findViewById<ImageView>(R.id.alertServiceIcon)
        val iconResource = when (serviceType.lowercase()) {
            "maid" -> R.drawable.ic_service_maid
            "cook" -> R.drawable.ic_service_cook
            "bathroom cleaning", "bathroom" -> R.drawable.ic_service_bathroom
            else -> R.drawable.ic_service_default
        }
        serviceIcon.setImageResource(iconResource)

        val countdownText = findViewById<TextView>(R.id.countdown)
        val countdownCircle = findViewById<ProgressBar>(R.id.countdownCircle)
        val countdownProgressBar = findViewById<ProgressBar>(R.id.countdownProgressBar)
        val btnAccept = findViewById<Button>(R.id.btnAccept)
        val btnReject = findViewById<Button>(R.id.btnReject)
        val loadingIndicator = findViewById<ProgressBar>(R.id.loadingIndicator)

        // Start 30-second countdown timer
        countdownHandler = Handler(Looper.getMainLooper())
        countdownRunnable = object : Runnable {
            override fun run() {
                if (secondsLeft > 0) {
                    countdownText.text = "${secondsLeft}s"
                    countdownCircle.progress = secondsLeft
                    countdownProgressBar.progress = secondsLeft
                    
                    // Change color based on time remaining
                    val color = when {
                        secondsLeft > 15 -> "#16A34A" // Green
                        secondsLeft > 10 -> "#F59E0B" // Amber
                        else -> "#DC2626" // Red
                    }
                    val colorInt = Color.parseColor(color)
                    countdownText.setTextColor(colorInt)
                    countdownProgressBar.progressTintList = ColorStateList.valueOf(colorInt)
                    
                    // Update circular progress color
                    (countdownCircle.progressDrawable as? LayerDrawable)?.apply {
                        findDrawableByLayerId(android.R.id.progress)?.setTint(colorInt)
                    }
                    
                    Log.d("BookingAlert", "⏱️ Countdown: ${secondsLeft}s")
                    secondsLeft--
                    countdownHandler?.postDelayed(this, 1000)
                } else {
                    Log.d("BookingAlert", "⏱️ Timeout - reassigning booking")
                    handleReassign(bookingId, "timeout")
                }
            }
        }
        countdownHandler?.post(countdownRunnable)

        btnAccept.setOnClickListener {
            if (isProcessing) return@setOnClickListener
            
            Log.d("BookingAlert", "✅ Accept button clicked")
            if (bookingId.isBlank()) {
                Toast.makeText(this, "No booking ID", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            
            isProcessing = true
            btnAccept.isEnabled = false
            btnReject.isEnabled = false
            loadingIndicator.visibility = View.VISIBLE
            stopAlertSound()
            countdownHandler?.removeCallbacks(countdownRunnable)
            
            handleAccept(bookingId)
        }

        btnReject.setOnClickListener {
            if (isProcessing) return@setOnClickListener
            
            Log.d("BookingAlert", "❌ Reject button clicked")
            isProcessing = true
            btnAccept.isEnabled = false
            btnReject.isEnabled = false
            loadingIndicator.visibility = View.VISIBLE
            stopAlertSound()
            countdownHandler?.removeCallbacks(countdownRunnable)
            
            handleReassign(bookingId, "worker_rejected")
        }
    }

    override fun onDestroy() {
        countdownHandler?.removeCallbacks(countdownRunnable)
        stopAlertSound()
        super.onDestroy()
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
                isLooping = true
                setVolume(1.0f, 1.0f)
                prepare()
                start()
            }
            
            Log.d("BookingAlert", "🔊 Alert sound started")
        } catch (e: Exception) {
            Log.e("BookingAlert", "❌ Failed to play alert sound", e)
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

    private fun handleAccept(bookingId: String) {
        thread {
            try {
                val jwt = getSharedPreferences("auth", MODE_PRIVATE).getString("jwt", "")
                if (jwt.isNullOrBlank()) {
                    runOnUiThread {
                        Toast.makeText(this, "Not authenticated", Toast.LENGTH_SHORT).show()
                        finish()
                    }
                    return@thread
                }

                val url = URL("https://paywwbuqycovjopryele.supabase.co/functions/v1/accept-booking")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Authorization", "Bearer $jwt")
                conn.doOutput = true

                val payload = JSONObject().apply {
                    put("booking_id", bookingId)
                }

                conn.outputStream.use { it.write(payload.toString().toByteArray()) }

                val responseCode = conn.responseCode
                val response = conn.inputStream.bufferedReader().readText()

                runOnUiThread {
                    if (responseCode == 200) {
                        Toast.makeText(this, "✅ Booking accepted!", Toast.LENGTH_SHORT).show()
                        Log.d("BookingAlert", "✅ Booking accepted: $bookingId")
                        finish()
                    } else {
                        Toast.makeText(this, "Failed to accept booking", Toast.LENGTH_SHORT).show()
                        Log.e("BookingAlert", "Accept failed: $response")
                        isProcessing = false
                        findViewById<Button>(R.id.btnAccept).isEnabled = true
                        findViewById<Button>(R.id.btnReject).isEnabled = true
                        findViewById<ProgressBar>(R.id.loadingIndicator).visibility = View.GONE
                    }
                }
            } catch (e: Exception) {
                Log.e("BookingAlert", "Error accepting booking", e)
                runOnUiThread {
                    Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                    isProcessing = false
                    findViewById<Button>(R.id.btnAccept).isEnabled = true
                    findViewById<Button>(R.id.btnReject).isEnabled = true
                    findViewById<ProgressBar>(R.id.loadingIndicator).visibility = View.GONE
                }
            }
        }
    }

    private fun handleReassign(bookingId: String, reason: String) {
        thread {
            try {
                val jwt = getSharedPreferences("auth", MODE_PRIVATE).getString("jwt", "")
                
                val url = URL("https://paywwbuqycovjopryele.supabase.co/functions/v1/reassign-booking")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                if (!jwt.isNullOrBlank()) {
                    conn.setRequestProperty("Authorization", "Bearer $jwt")
                }
                conn.doOutput = true

                val payload = JSONObject().apply {
                    put("booking_id", bookingId)
                    put("reject_reason", reason)
                }

                conn.outputStream.use { it.write(payload.toString().toByteArray()) }

                val responseCode = conn.responseCode
                val response = conn.inputStream.bufferedReader().readText()

                runOnUiThread {
                    if (responseCode == 200) {
                        val message = if (reason == "timeout") "Booking reassigned (timeout)" else "Booking rejected"
                        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
                        Log.d("BookingAlert", "✅ Booking reassigned: $bookingId, reason: $reason")
                        finish()
                    } else {
                        Toast.makeText(this, "Failed to process booking", Toast.LENGTH_SHORT).show()
                        Log.e("BookingAlert", "Reassign failed: $response")
                        finish()
                    }
                }
            } catch (e: Exception) {
                Log.e("BookingAlert", "Error reassigning booking", e)
                runOnUiThread {
                    Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                    finish()
                }
            }
        }
    }
}
