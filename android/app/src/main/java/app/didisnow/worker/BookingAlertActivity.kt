package app.didisnow.worker

import android.content.res.ColorStateList
import android.graphics.Color
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
import coil.Coil
import coil.request.ImageRequest
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

        // ---- Read payload (UNIFIED KEYS) ----
        val bookingId = intent.getStringExtra("booking_id") ?: ""
        val serviceType = (intent.getStringExtra("service_type") ?: "").lowercase()
        val flatNumber = intent.getStringExtra("flat_number") ?: ""
        val priceInr = intent.getStringExtra("price_inr") ?: "0"
        val notes = intent.getStringExtra("notes") ?: ""
        val community = intent.getStringExtra("community") ?: "Prestige High Fields"
        val imageUrl = intent.getStringExtra("image_url") ?: ""

        Log.d("BookingAlert", "📋 Received booking data:")
        Log.d("BookingAlert", "  booking_id: $bookingId")
        Log.d("BookingAlert", "  service_type: $serviceType")
        Log.d("BookingAlert", "  flat_number: $flatNumber")
        Log.d("BookingAlert", "  price_inr: $priceInr")
        Log.d("BookingAlert", "  notes: $notes")
        Log.d("BookingAlert", "  community: $community")
        Log.d("BookingAlert", "  image_url: $imageUrl")

        // ---- Safe view lookups ----
        val serviceView = findViewById<TextView?>(R.id.alertService)
        val subtitleView = findViewById<TextView?>(R.id.alertServiceSubtitle)
        val priceView = findViewById<TextView?>(R.id.alertPrice)
        val towerView = findViewById<TextView?>(R.id.alertTower)
        val communityView = findViewById<TextView?>(R.id.alertCommunity)
        val notesView = findViewById<TextView?>(R.id.alertNotes)
        val serviceIcon = findViewById<ImageView?>(R.id.alertServiceIcon)
        val countdownText = findViewById<TextView?>(R.id.countdown)
        val countdownCircle = findViewById<ProgressBar?>(R.id.countdownCircle)
        val countdownProgressBar = findViewById<ProgressBar?>(R.id.countdownProgressBar)
        val btnAccept = findViewById<Button?>(R.id.btnAccept)
        val btnReject = findViewById<Button?>(R.id.btnReject)
        val loadingIndicator = findViewById<View?>(R.id.loadingIndicator)

        // Set service title and subtitle
        serviceView?.text = when (serviceType) {
            "maid" -> "Maid Service"
            "cook" -> "Cook Service"
            "bathroom_cleaning", "bathroom" -> "Bathroom Cleaning"
            else -> serviceType.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        }

        subtitleView?.text = when (serviceType) {
            "maid" -> "Includes: Dishes & Jhaadu/Pocha"
            "cook" -> "Includes: Meal Preparation"
            "bathroom", "bathroom_cleaning" -> "Includes: Complete Bathroom Cleaning"
            else -> if (notes.isNotBlank()) notes else "Service details"
        }

        // Set price
        priceView?.text = "₹$priceInr"

        // Derive Tower No. from flat number (first digit)
        val towerNo = flatNumber.trim().firstOrNull { it.isDigit() }?.toString() ?: "—"
        towerView?.text = towerNo
        Log.d("BookingAlert", "🏢 Tower No derived: $towerNo from flat: $flatNumber")

        // Set community
        communityView?.text = community

        // Show notes if available
        if (notes.isNotBlank() && serviceType !in listOf("maid", "cook", "bathroom", "bathroom_cleaning")) {
            notesView?.text = notes
            notesView?.visibility = View.VISIBLE
        } else {
            notesView?.visibility = View.GONE
        }

        // Set service icon
        val iconResource = when (serviceType) {
            "maid" -> R.drawable.ic_service_maid
            "cook" -> R.drawable.ic_service_cook
            "bathroom_cleaning", "bathroom" -> R.drawable.ic_service_bathroom
            else -> R.drawable.ic_service_default
        }
        serviceIcon?.setImageResource(iconResource)

        // ---- Countdown (safe) ----
        countdownCircle?.max = 30
        countdownProgressBar?.max = 30

        // Start 30-second countdown timer
        countdownHandler = Handler(Looper.getMainLooper())
        countdownRunnable = object : Runnable {
            override fun run() {
                if (secondsLeft > 0) {
                    countdownText?.text = "${secondsLeft}s"
                    countdownCircle?.progress = secondsLeft
                    countdownProgressBar?.progress = secondsLeft
                    
                    // Change color based on time remaining
                    val color = when {
                        secondsLeft > 15 -> Color.parseColor("#16A34A") // Green
                        secondsLeft > 10 -> Color.parseColor("#F59E0B") // Amber
                        else -> Color.parseColor("#DC2626") // Red
                    }
                    countdownText?.setTextColor(color)
                    countdownProgressBar?.progressTintList = ColorStateList.valueOf(color)
                    countdownCircle?.progressTintList = ColorStateList.valueOf(color)
                    
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

        btnAccept?.setOnClickListener {
            if (isProcessing) return@setOnClickListener
            
            Log.d("BookingAlert", "✅ Accept button clicked")
            if (bookingId.isBlank()) {
                Toast.makeText(this, "No booking ID", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            
            isProcessing = true
            btnAccept.isEnabled = false
            btnReject?.isEnabled = false
            loadingIndicator?.visibility = View.VISIBLE
            stopAlertSound()
            countdownHandler?.removeCallbacks(countdownRunnable)
            
            handleAccept(bookingId)
        }

        btnReject?.setOnClickListener {
            if (isProcessing) return@setOnClickListener
            
            Log.d("BookingAlert", "❌ Reject button clicked")
            isProcessing = true
            btnAccept?.isEnabled = false
            btnReject.isEnabled = false
            loadingIndicator?.visibility = View.VISIBLE
            stopAlertSound()
            countdownHandler?.removeCallbacks(countdownRunnable)
            
            handleReassign(bookingId, "worker_rejected")
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        countdownHandler?.removeCallbacksAndMessages(null)
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
                val response = if (responseCode in 200..299) {
                    conn.inputStream.bufferedReader().readText()
                } else {
                    conn.errorStream?.bufferedReader()?.readText() ?: "Unknown error"
                }

                runOnUiThread {
                    if (responseCode == 200) {
                        Toast.makeText(this, "✅ Booking accepted!", Toast.LENGTH_SHORT).show()
                        Log.d("BookingAlert", "✅ Booking accepted: $bookingId")
                        finish()
                    } else {
                        Toast.makeText(this, "Failed to accept: $response", Toast.LENGTH_LONG).show()
                        Log.e("BookingAlert", "Accept failed ($responseCode): $response")
                        isProcessing = false
                        findViewById<Button?>(R.id.btnAccept)?.isEnabled = true
                        findViewById<Button?>(R.id.btnReject)?.isEnabled = true
                        findViewById<View?>(R.id.loadingIndicator)?.visibility = View.GONE
                    }
                }
            } catch (e: Exception) {
                Log.e("BookingAlert", "Error accepting booking", e)
                runOnUiThread {
                    Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
                    isProcessing = false
                    findViewById<Button?>(R.id.btnAccept)?.isEnabled = true
                    findViewById<Button?>(R.id.btnReject)?.isEnabled = true
                    findViewById<View?>(R.id.loadingIndicator)?.visibility = View.GONE
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
                val response = if (responseCode in 200..299) {
                    conn.inputStream.bufferedReader().readText()
                } else {
                    conn.errorStream?.bufferedReader()?.readText() ?: "Unknown error"
                }

                runOnUiThread {
                    if (responseCode == 200) {
                        val message = if (reason == "timeout") "Booking reassigned (timeout)" else "Booking rejected"
                        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
                        Log.d("BookingAlert", "✅ Booking reassigned: $bookingId, reason: $reason")
                        finish()
                    } else {
                        Toast.makeText(this, "Failed to process: $response", Toast.LENGTH_LONG).show()
                        Log.e("BookingAlert", "Reassign failed ($responseCode): $response")
                        finish()
                    }
                }
            } catch (e: Exception) {
                Log.e("BookingAlert", "Error reassigning booking", e)
                runOnUiThread {
                    Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
                    finish()
                }
            }
        }
    }
}
