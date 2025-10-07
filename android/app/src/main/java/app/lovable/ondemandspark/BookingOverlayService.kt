package app.lovable.ondemandspark

import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
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

class BookingOverlayService : Service() {
    private var windowManager: WindowManager? = null
    private var overlayView: View? = null
    
    companion object {
        private const val SUPABASE_URL = "https://paywwbuqycovjopryele.supabase.co"
        private const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o"
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val bookingId = intent?.getStringExtra("bookingId") ?: ""
        val customer = intent?.getStringExtra("customer") ?: "New Customer"
        val community = intent?.getStringExtra("community") ?: ""
        val serviceType = intent?.getStringExtra("serviceType") ?: ""

        showOverlay(bookingId, customer, community, serviceType)
        
        return START_NOT_STICKY
    }

    private fun showOverlay(bookingId: String, customer: String, community: String, serviceType: String) {
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager

        // Inflate the overlay layout
        val inflater = getSystemService(Context.LAYOUT_INFLATER_SERVICE) as LayoutInflater
        overlayView = inflater.inflate(R.layout.overlay_booking_alert, null)

        // Set overlay window parameters
        val layoutType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_SYSTEM_ALERT
        }

        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            layoutType,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.CENTER
        }

        // Set booking details
        overlayView?.findViewById<TextView>(R.id.title)?.text = "New Booking: $serviceType"
        overlayView?.findViewById<TextView>(R.id.subtitle)?.text = "$customer • $community"

        // Handle Accept button
        overlayView?.findViewById<Button>(R.id.btnAccept)?.setOnClickListener {
            if (bookingId.isNotEmpty()) {
                updateBooking(bookingId, "accepted")
                closeOverlay()
            } else {
                Toast.makeText(this, "Error: No booking ID", Toast.LENGTH_SHORT).show()
                closeOverlay()
            }
        }

        // Handle Reject button
        overlayView?.findViewById<Button>(R.id.btnReject)?.setOnClickListener {
            updateBooking(bookingId, "rejected")
            closeOverlay()
        }

        // Add overlay to window
        try {
            windowManager?.addView(overlayView, params)
        } catch (e: Exception) {
            e.printStackTrace()
            stopSelf()
        }
    }

    private fun updateBooking(bookingId: String, status: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val supabaseUrl = "https://paywwbuqycovjopryele.supabase.co"
                val supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o"
                
                val url = URL("$supabaseUrl/rest/v1/bookings?id=eq.$bookingId")
                val connection = url.openConnection() as HttpURLConnection
                
                connection.requestMethod = "PATCH"
                connection.setRequestProperty("apikey", supabaseKey)
                connection.setRequestProperty("Authorization", "Bearer $supabaseKey")
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Prefer", "return=minimal")
                connection.doOutput = true

                val jsonPayload = """{"status":"$status"}"""
                connection.outputStream.use { os ->
                    os.write(jsonPayload.toByteArray())
                }

                val responseCode = connection.responseCode
                connection.disconnect()

                withContext(Dispatchers.Main) {
                    if (responseCode in 200..299) {
                        Toast.makeText(
                            this@BookingOverlayService,
                            "Booking ${if (status == "accepted") "accepted" else "rejected"} successfully",
                            Toast.LENGTH_SHORT
                        ).show()
                    } else {
                        Toast.makeText(
                            this@BookingOverlayService,
                            "Failed to update booking",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@BookingOverlayService,
                        "Error: ${e.message}",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }

    private fun closeOverlay() {
        try {
            if (overlayView != null && overlayView?.windowToken != null) {
                windowManager?.removeView(overlayView)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            overlayView = null
            stopSelf()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        closeOverlay()
    }
}
