package app.didisnow.worker

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
        val bookingId = intent?.getStringExtra("booking_id") ?: ""
        val customer = intent?.getStringExtra("customer_name") ?: "New Customer"
        val community = intent?.getStringExtra("community") ?: ""
        val serviceType = intent?.getStringExtra("service_type") ?: ""
        val price = intent?.getIntExtra("price", 0) ?: 0

        showOverlay(bookingId, customer, community, serviceType, price)
        
        return START_NOT_STICKY
    }

    private fun showOverlay(bookingId: String, customer: String, community: String, serviceType: String, price: Int) {
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
        overlayView?.findViewById<TextView>(R.id.price)?.text = "₹$price"
        
        // Start 30-second countdown
        val countdownText = overlayView?.findViewById<TextView>(R.id.countdown)
        var secondsLeft = 30
        val handler = android.os.Handler(mainLooper)
        val countdown = object : Runnable {
            override fun run() {
                if (secondsLeft > 0) {
                    countdownText?.text = "${secondsLeft}s"
                    secondsLeft--
                    handler.postDelayed(this, 1000)
                } else {
                    // Auto-reject after 30 seconds
                    closeOverlay()
                }
            }
        }
        handler.post(countdown)

        // Handle Accept button
        overlayView?.findViewById<Button>(R.id.btnAccept)?.setOnClickListener {
            handler.removeCallbacks(countdown)
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
            handler.removeCallbacks(countdown)
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

    private fun updateBooking(bookingId: String, action: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                android.util.Log.d("BookingOverlay", "📤 Updating booking $bookingId with action: $action")
                
                if (action == "accepted") {
                    // Call try_accept_booking RPC for accepting
                    val rpcUrl = URL("$SUPABASE_URL/rest/v1/rpc/try_accept_booking")
                    val connection = rpcUrl.openConnection() as HttpURLConnection
                    
                    connection.requestMethod = "POST"
                    connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                    connection.setRequestProperty("Authorization", "Bearer $SUPABASE_ANON_KEY")
                    connection.setRequestProperty("Content-Type", "application/json")
                    connection.doOutput = true

                    val jsonPayload = """{"p_booking_id":"$bookingId"}"""
                    connection.outputStream.use { os ->
                        os.write(jsonPayload.toByteArray())
                    }

                    val responseCode = connection.responseCode
                    val responseBody = connection.inputStream.bufferedReader().use { it.readText() }
                    connection.disconnect()

                    android.util.Log.d("BookingOverlay", "✅ RPC response: $responseCode - $responseBody")

                    withContext(Dispatchers.Main) {
                        if (responseCode in 200..299) {
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
                                Toast.makeText(
                                    this@BookingOverlayService,
                                    "❌ $error",
                                    Toast.LENGTH_LONG
                                ).show()
                            }
                        } else {
                            Toast.makeText(
                                this@BookingOverlayService,
                                "❌ Failed to accept booking (HTTP $responseCode)",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                } else {
                    // For reject, just update status directly
                    val url = URL("$SUPABASE_URL/rest/v1/bookings?id=eq.$bookingId")
                    val connection = url.openConnection() as HttpURLConnection
                    
                    connection.requestMethod = "PATCH"
                    connection.setRequestProperty("apikey", SUPABASE_ANON_KEY)
                    connection.setRequestProperty("Authorization", "Bearer $SUPABASE_ANON_KEY")
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
