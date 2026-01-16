package app.didisnow.worker

import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.MediaPlayer
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
import androidx.localbroadcastmanager.content.LocalBroadcastManager

/**
 * BookingAlertActivity - UI-ONLY fallback for booking alerts when overlay cannot be shown
 * 
 * IMPORTANT: This activity does NOT make any Supabase/network calls.
 * All booking actions (accept/decline) are delegated to the web app via Intent.
 * This prevents:
 * - Token refresh race conditions
 * - 401 errors causing logout
 * - Session conflicts between native and web
 */
@Suppress("SetTextI18n")
class BookingAlertActivity : AppCompatActivity() {
    private var countdownHandler: Handler? = null
    private lateinit var countdownRunnable: Runnable
    private var secondsLeft = 30
    private var mediaPlayer: MediaPlayer? = null
    private var vibrator: Vibrator? = null
    
    // Single-flight guard to prevent double taps
    @Volatile
    private var actionInFlight = false

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
                    
                    // Change countdown text color based on time remaining
                    val textColor = when {
                        secondsLeft > 15 -> "#22C55E" // Green
                        secondsLeft > 10 -> "#F59E0B" // Orange
                        else -> "#DC2626" // Red
                    }
                    countdownText.setTextColor(Color.parseColor(textColor))
                    
                    Log.d("BookingAlert", "⏱️ Countdown: ${secondsLeft}s")
                    secondsLeft--
                    countdownHandler?.postDelayed(this, 1000)
                } else {
                    Log.d("BookingAlert", "⏱️ Countdown finished - sending timeout to web app")
                    sendActionToWebApp(bookingId, "timeout", openApp = false)
                    finish()
                }
            }
        }
        countdownHandler?.post(countdownRunnable)

        // Accept button - UI ONLY, delegates to web app
        btnAccept.setOnClickListener {
            if (actionInFlight) return@setOnClickListener
            actionInFlight = true
            
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
            
            // Show immediate feedback
            Toast.makeText(this, "Accepting booking...", Toast.LENGTH_SHORT).show()
            
            // Send action to web app - open app for accept
            sendActionToWebApp(bookingId, "accepted", openApp = true)
            finish()
        }

        // Decline button - UI ONLY, does NOT open app
        btnReject.setOnClickListener {
            if (actionInFlight) return@setOnClickListener
            actionInFlight = true
            
            Log.d("BookingAlert", "❌ Reject button clicked")
            stopAlertSound()
            stopVibration()
            countdownHandler?.removeCallbacks(countdownRunnable)
            
            // Disable buttons to prevent double-click
            btnAccept.isEnabled = false
            btnReject.isEnabled = false
            
            // Show immediate feedback
            Toast.makeText(this, "Booking declined", Toast.LENGTH_SHORT).show()
            
            // Queue action but do NOT open app
            sendActionToWebApp(bookingId, "declined", openApp = false)
            finish()
        }
    }

    override fun onDestroy() {
        countdownHandler?.removeCallbacks(countdownRunnable)
        stopAlertSound()
        stopVibration()
        super.onDestroy()
    }

    /**
     * Send booking action to web app via Intent to MainActivity.
     * The web app will handle the actual Supabase RPC call.
     * This prevents token/session conflicts.
     * 
     * @param bookingId The booking ID
     * @param action The action (accepted/declined/timeout)
     * @param openApp Whether to launch MainActivity (for accept we need the app open; for decline we don't)
     */
    private fun sendActionToWebApp(bookingId: String, action: String, openApp: Boolean = true) {
        try {
            Log.d("BookingAlert", "📤 Sending action to web app: bookingId=$bookingId, action=$action, openApp=$openApp")
            
            // Always queue the action to SharedPreferences
            queueActionToPrefs(bookingId, action)
            
            // Send local broadcast for any in-app listeners
            val broadcastIntent = Intent("booking-action")
            broadcastIntent.putExtra("bookingId", bookingId)
            broadcastIntent.putExtra("action", action)
            LocalBroadcastManager.getInstance(this).sendBroadcast(broadcastIntent)
            
            // Only launch MainActivity if openApp is true
            if (openApp) {
                val mainIntent = Intent(this, MainActivity::class.java)
                mainIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                mainIntent.putExtra("booking_action", action)
                mainIntent.putExtra("booking_id", bookingId)
                mainIntent.putExtra("navigate_to", "home")
                startActivity(mainIntent)
            }
            
            Log.d("BookingAlert", "✅ Action sent to web app successfully")
        } catch (e: Exception) {
            Log.e("BookingAlert", "❌ sendActionToWebApp error", e)
        }
    }
    
    /**
     * Queue action directly to SharedPreferences.
     */
    private fun queueActionToPrefs(bookingId: String, action: String) {
        try {
            val prefs = getSharedPreferences("booking_actions", Context.MODE_PRIVATE)
            val json = org.json.JSONObject().apply {
                put("bookingId", bookingId)
                put("action", action)
                put("createdAt", System.currentTimeMillis())
            }
            prefs.edit().putString("pending_action", json.toString()).apply()
            Log.d("BookingAlert", "✅ Action queued to prefs: $action for $bookingId")
        } catch (e: Exception) {
            Log.e("BookingAlert", "❌ Error queueing action to prefs", e)
        }
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
            val pattern = longArrayOf(0, 1000, 500, 1000, 500)
            
            vibrator?.let {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    val vibrationEffect = VibrationEffect.createWaveform(pattern, 0) // 0 = repeat from start
                    it.vibrate(vibrationEffect)
                } else {
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
}
