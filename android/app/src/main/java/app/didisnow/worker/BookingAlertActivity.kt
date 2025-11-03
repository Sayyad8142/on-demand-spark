package app.didisnow.worker

import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.LayerDrawable
import android.graphics.drawable.RotateDrawable
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.CountDownTimer
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.util.Log
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import coil.load
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class BookingAlertActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "BookingAlertActivity"
        private const val SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co"
        private const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o"
    }

    // Views
    private lateinit var alertTitle: TextView
    private lateinit var countdownCircle: ProgressBar
    private lateinit var countdown: TextView
    private lateinit var alertHeroImage: ImageView
    private lateinit var alertService: TextView
    private lateinit var alertServiceSubtitle: TextView
    private lateinit var alertPrice: TextView
    private lateinit var alertTower: TextView
    private lateinit var alertCommunity: TextView
    private lateinit var alertNotes: LinearLayout
    private lateinit var alertNotesText: TextView
    private lateinit var btnReject: Button
    private lateinit var btnAccept: Button
    private lateinit var loadingIndicator: ProgressBar

    // Data
    private var bookingId: String = ""
    private var serviceType: String = ""
    private var flatNumber: String = ""
    private var priceInr: String = "0"
    private var notes: String = ""
    private var community: String = "Prestige High Fields"
    private var imageUrl: String = ""

    // Media
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    private var countdownTimer: CountDownTimer? = null
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Show over lock screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }

        setContentView(R.layout.activity_booking_alert)

        // Initialize views
        initViews()

        // Extract booking data from intent
        extractBookingData()

        // Populate UI
        populateUI()

        // Start alert sound and vibration
        playAlertSound()
        startVibration()

        // Start countdown timer
        startCountdown()

        // Set up button listeners
        setupButtons()
    }

    private fun initViews() {
        alertTitle = findViewById(R.id.alertTitle)
        countdownCircle = findViewById(R.id.countdownCircle)
        countdown = findViewById(R.id.countdown)
        alertHeroImage = findViewById(R.id.alertHeroImage)
        alertService = findViewById(R.id.alertService)
        alertServiceSubtitle = findViewById(R.id.alertServiceSubtitle)
        alertPrice = findViewById(R.id.alertPrice)
        alertTower = findViewById(R.id.alertTower)
        alertCommunity = findViewById(R.id.alertCommunity)
        alertNotes = findViewById(R.id.alertNotes)
        alertNotesText = findViewById(R.id.alertNotesText)
        btnReject = findViewById(R.id.btnReject)
        btnAccept = findViewById(R.id.btnAccept)
        loadingIndicator = findViewById(R.id.loadingIndicator)
    }

    private fun extractBookingData() {
        bookingId = intent.getStringExtra("booking_id") ?: ""
        serviceType = (intent.getStringExtra("service_type") ?: "").lowercase()
        flatNumber = intent.getStringExtra("flat_number") ?: ""
        priceInr = intent.getStringExtra("price_inr") ?: "0"
        notes = intent.getStringExtra("notes") ?: ""
        community = intent.getStringExtra("community") ?: "Prestige High Fields"
        imageUrl = intent.getStringExtra("image_url") ?: ""

        Log.d(TAG, "Booking data: id=$bookingId, service=$serviceType, flat=$flatNumber, price=$priceInr")
    }

    private fun populateUI() {
        // Title
        alertTitle.text = "New Booking Request"

        // Service title
        alertService.text = when (serviceType) {
            "maid" -> "Maid Service"
            "cook" -> "Cook Service"
            "bathroom_cleaning" -> "Bathroom Cleaning"
            else -> serviceType.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        }

        // Service subtitle
        alertServiceSubtitle.text = when (serviceType) {
            "maid" -> "Includes: Dishes & Jhaadu/Pocha"
            "cook" -> "Includes: Meal Preparation"
            "bathroom_cleaning" -> "Includes: Complete Bathroom Cleaning"
            else -> if (notes.isNotBlank()) notes else "Service details"
        }

        // Price
        alertPrice.text = "₹$priceInr"

        // Tower - derive from flat number
        val towerNo = flatNumber.firstOrNull { it.isDigit() }?.toString() ?: "—"
        alertTower.text = towerNo

        // Community
        alertCommunity.text = community

        // Notes
        if (notes.isNotBlank()) {
            alertNotes.visibility = View.VISIBLE
            alertNotesText.text = notes
        } else {
            alertNotes.visibility = View.GONE
        }

        // Load hero image with Coil
        val fallbackRes = when (serviceType) {
            "maid" -> R.drawable.maid_dishes
            "cook" -> R.drawable.service_cook
            "bathroom_cleaning" -> R.drawable.service_bathroom
            else -> R.drawable.placeholder_service
        }

        alertHeroImage.load(if (imageUrl.isBlank()) fallbackRes else imageUrl) {
            placeholder(R.drawable.placeholder_service)
            error(fallbackRes)
            crossfade(true)
        }
    }

    private fun startCountdown() {
        countdownCircle.max = 30
        countdownCircle.progress = 30

        countdownTimer = object : CountDownTimer(30000, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                val secondsLeft = (millisUntilFinished / 1000).toInt()
                countdown.text = "${secondsLeft}s"
                countdownCircle.progress = secondsLeft

                // Change countdown ring color based on time
                updateCountdownColor(secondsLeft)
            }

            override fun onFinish() {
                // Auto timeout - call reassign
                Log.d(TAG, "Countdown finished - timeout")
                handleTimeout()
            }
        }.start()
    }

    private fun updateCountdownColor(secondsLeft: Int) {
        val color = when {
            secondsLeft > 15 -> Color.parseColor("#16A34A") // Green
            secondsLeft > 10 -> Color.parseColor("#F59E0B") // Amber
            else -> Color.parseColor("#DC2626") // Red
        }

        countdown.setTextColor(color)
        
        // Update progress bar color
        val progressDrawable = countdownCircle.progressDrawable
        if (progressDrawable is LayerDrawable) {
            val layer = progressDrawable.findDrawableByLayerId(android.R.id.progress)
            if (layer is RotateDrawable) {
                layer.drawable?.setTint(color)
            }
        }
    }

    private fun setupButtons() {
        btnAccept.setOnClickListener {
            Log.d(TAG, "Accept button clicked")
            stopAlerts()
            handleAccept()
        }

        btnReject.setOnClickListener {
            Log.d(TAG, "Reject button clicked")
            stopAlerts()
            handleReject()
        }
    }

    private fun handleAccept() {
        setButtonsEnabled(false)
        loadingIndicator.visibility = View.VISIBLE

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val jwt = getJWT()
                if (jwt.isNullOrBlank()) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@BookingAlertActivity, "Not authenticated", Toast.LENGTH_SHORT).show()
                        finish()
                    }
                    return@launch
                }

                val url = URL("$SUPABASE_URL/functions/v1/accept-booking")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Authorization", "Bearer $jwt")
                conn.doOutput = true

                val jsonBody = JSONObject().apply {
                    put("booking_id", bookingId)
                }
                
                conn.outputStream.use { it.write(jsonBody.toString().toByteArray()) }

                val responseCode = conn.responseCode
                Log.d(TAG, "Accept response code: $responseCode")

                withContext(Dispatchers.Main) {
                    if (responseCode == 200) {
                        Toast.makeText(this@BookingAlertActivity, "Booking accepted!", Toast.LENGTH_SHORT).show()
                        finish()
                    } else {
                        val errorMsg = conn.errorStream?.bufferedReader()?.readText() ?: "Unknown error"
                        Log.e(TAG, "Accept failed: $errorMsg")
                        Toast.makeText(this@BookingAlertActivity, "Failed to accept", Toast.LENGTH_SHORT).show()
                        setButtonsEnabled(true)
                        loadingIndicator.visibility = View.GONE
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Accept error", e)
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@BookingAlertActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                    setButtonsEnabled(true)
                    loadingIndicator.visibility = View.GONE
                }
            }
        }
    }

    private fun handleReject() {
        setButtonsEnabled(false)
        loadingIndicator.visibility = View.VISIBLE

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val jwt = getJWT()
                if (jwt.isNullOrBlank()) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@BookingAlertActivity, "Not authenticated", Toast.LENGTH_SHORT).show()
                        finish()
                    }
                    return@launch
                }

                val url = URL("$SUPABASE_URL/functions/v1/reassign-booking")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Authorization", "Bearer $SUPABASE_ANON_KEY")
                conn.doOutput = true

                val jsonBody = JSONObject().apply {
                    put("booking_id", bookingId)
                    put("reject_reason", "worker_rejected")
                }
                
                conn.outputStream.use { it.write(jsonBody.toString().toByteArray()) }

                val responseCode = conn.responseCode
                Log.d(TAG, "Reject response code: $responseCode")

                withContext(Dispatchers.Main) {
                    if (responseCode == 200) {
                        Toast.makeText(this@BookingAlertActivity, "Booking rejected", Toast.LENGTH_SHORT).show()
                        finish()
                    } else {
                        val errorMsg = conn.errorStream?.bufferedReader()?.readText() ?: "Unknown error"
                        Log.e(TAG, "Reject failed: $errorMsg")
                        Toast.makeText(this@BookingAlertActivity, "Failed to reject", Toast.LENGTH_SHORT).show()
                        setButtonsEnabled(true)
                        loadingIndicator.visibility = View.GONE
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Reject error", e)
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@BookingAlertActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                    setButtonsEnabled(true)
                    loadingIndicator.visibility = View.GONE
                }
            }
        }
    }

    private fun handleTimeout() {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val url = URL("$SUPABASE_URL/functions/v1/reassign-booking")
                val conn = url.openConnection() as HttpURLConnection
                conn.requestMethod = "POST"
                conn.setRequestProperty("Content-Type", "application/json")
                conn.setRequestProperty("Authorization", "Bearer $SUPABASE_ANON_KEY")
                conn.doOutput = true

                val jsonBody = JSONObject().apply {
                    put("booking_id", bookingId)
                    put("reject_reason", "timeout")
                }
                
                conn.outputStream.use { it.write(jsonBody.toString().toByteArray()) }

                Log.d(TAG, "Timeout reassign response: ${conn.responseCode}")
            } catch (e: Exception) {
                Log.e(TAG, "Timeout reassign error", e)
            }
        }
        finish()
    }

    private fun setButtonsEnabled(enabled: Boolean) {
        btnAccept.isEnabled = enabled
        btnReject.isEnabled = enabled
    }

    private fun getJWT(): String? {
        val prefs = getSharedPreferences("supabase_auth", MODE_PRIVATE)
        return prefs.getString("access_token", null)
    }

    private fun playAlertSound() {
        try {
            mediaPlayer = MediaPlayer().apply {
                setDataSource(this@BookingAlertActivity, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .build()
                )
                isLooping = true
                prepare()
                start()
            }
            Log.d(TAG, "Alert sound playing")
        } catch (e: Exception) {
            Log.e(TAG, "Error playing alert sound", e)
        }
    }

    private fun startVibration() {
        try {
            vibrator = getSystemService(VIBRATOR_SERVICE) as Vibrator
            val pattern = longArrayOf(0, 500, 200, 500)
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                vibrator?.vibrate(pattern, 0)
            }
            Log.d(TAG, "Vibration started")
        } catch (e: Exception) {
            Log.e(TAG, "Error starting vibration", e)
        }
    }

    private fun stopAlerts() {
        countdownTimer?.cancel()
        
        mediaPlayer?.let {
            if (it.isPlaying) {
                it.stop()
            }
            it.release()
        }
        mediaPlayer = null

        vibrator?.cancel()
        vibrator = null
        
        Log.d(TAG, "Alerts stopped")
    }

    override fun onDestroy() {
        super.onDestroy()
        stopAlerts()
        handler.removeCallbacksAndMessages(null)
    }
}
