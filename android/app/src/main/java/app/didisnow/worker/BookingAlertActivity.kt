package app.didisnow.worker

import android.content.Intent
import android.graphics.Color
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.WindowManager
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

@Suppress("SetTextI18n")
class BookingAlertActivity : AppCompatActivity() {
    private var countdownHandler: Handler? = null
    private lateinit var countdownRunnable: Runnable
    private var secondsLeft = 30
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
        val serviceType = intent.getStringExtra("service_type") ?: ""
        val flatNo = intent.getStringExtra("flat_no") ?: ""
        val priceInr = intent.getIntExtra("price_inr", 0)

        findViewById<TextView>(R.id.alertTitle).text = "New Booking"
        findViewById<TextView>(R.id.alertService).text = serviceType
        findViewById<TextView>(R.id.alertLocation).text = "Flat: $flatNo"
        findViewById<TextView>(R.id.alertPrice).text = "₹$priceInr"

        val countdownText = findViewById<TextView>(R.id.countdown)
        val countdownProgressBar = findViewById<ProgressBar>(R.id.countdownProgressBar)
        val btnAccept = findViewById<Button>(R.id.btnAccept)
        val btnReject = findViewById<Button>(R.id.btnReject)

        // Start 30-second countdown timer
        countdownHandler = Handler(Looper.getMainLooper())
        countdownRunnable = object : Runnable {
            override fun run() {
                if (secondsLeft > 0) {
                    countdownText.text = "$secondsLeft"
                    countdownProgressBar.progress = secondsLeft
                    
                    // Change color based on time remaining
                    val color = when {
                        secondsLeft > 15 -> "#22C55E" // Green
                        secondsLeft > 5 -> "#F59E0B" // Orange
                        else -> "#EF4444" // Red
                    }
                    countdownText.setTextColor(Color.parseColor(color))
                    countdownProgressBar.progressTintList = android.content.res.ColorStateList.valueOf(Color.parseColor(color))
                    
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
            countdownHandler?.removeCallbacks(countdownRunnable)
            
            if (bookingId.isBlank()) {
                Toast.makeText(this, "No booking ID", Toast.LENGTH_SHORT).show()
                finish()
                return@setOnClickListener
            }
            
            // Forward to BookingOverlayService to handle the accept
            val i = Intent(this, BookingOverlayService::class.java).apply {
                putExtra("mode", "show")
                putExtra("booking_id", bookingId)
                putExtra("service_type", serviceType)
                putExtra("flat_no", flatNo)
                putExtra("price_inr", priceInr)
            }
            try {
                ContextCompat.startForegroundService(this, i)
                Log.d("BookingAlert", "Started BookingOverlayService")
            } catch (e: Exception) {
                Log.e("BookingAlert", "Failed to start service", e)
                Toast.makeText(this, "Unable to start service", Toast.LENGTH_SHORT).show()
            }
            finish()
        }

        btnReject.setOnClickListener {
            Log.d("BookingAlert", "❌ Reject button clicked")
            stopAlertSound()
            countdownHandler?.removeCallbacks(countdownRunnable)
            Toast.makeText(this, "Booking rejected", Toast.LENGTH_SHORT).show()
            finish()
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
}
