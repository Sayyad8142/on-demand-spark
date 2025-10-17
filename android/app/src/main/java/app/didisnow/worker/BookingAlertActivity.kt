package app.didisnow.worker

import android.app.Activity
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

        val bookingId = intent.getStringExtra("bookingId") ?: ""
        val customer = intent.getStringExtra("customer") ?: "New Customer"
        val community = intent.getStringExtra("community") ?: ""
        val serviceType = intent.getStringExtra("serviceType") ?: ""

        findViewById<TextView>(R.id.alertTitle).text = "New Booking Request!"
        findViewById<TextView>(R.id.alertCustomer).text = "Customer: $customer"
        findViewById<TextView>(R.id.alertCommunity).text = "Community: $community"
        findViewById<TextView>(R.id.alertService).text = "Service: $serviceType"

        findViewById<Button>(R.id.btnAccept).setOnClickListener {
            if (bookingId.isNotEmpty()) {
                acceptBooking(bookingId)
            } else {
                Toast.makeText(this, "Error: No booking ID", Toast.LENGTH_SHORT).show()
                finish()
            }
        }

        findViewById<Button>(R.id.btnReject).setOnClickListener {
            if (bookingId.isNotEmpty()) {
                rejectBooking(bookingId)
            } else {
                Toast.makeText(this, "Booking rejected", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }
    
    private fun rejectBooking(bookingId: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
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

                withContext(Dispatchers.Main) {
                    if (responseCode in 200..299) {
                        Toast.makeText(
                            this@BookingAlertActivity,
                            "Booking rejected",
                            Toast.LENGTH_SHORT
                        ).show()
                    } else {
                        Toast.makeText(
                            this@BookingAlertActivity,
                            "Failed to reject booking",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                    finish()
                }
            } catch (e: Exception) {
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

    private fun acceptBooking(bookingId: String) {
        CoroutineScope(Dispatchers.IO).launch {
            try {
                android.util.Log.d("BookingAlert", "📤 Accepting booking $bookingId")
                
                // Call try_accept_booking RPC
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

                android.util.Log.d("BookingAlert", "✅ RPC response: $responseCode - $responseBody")

                withContext(Dispatchers.Main) {
                    if (responseCode in 200..299) {
                        val json = JSONObject(responseBody)
                        val success = json.optBoolean("success", false)
                        
                        if (success) {
                            Toast.makeText(
                                this@BookingAlertActivity,
                                "✅ Booking accepted successfully!",
                                Toast.LENGTH_LONG
                            ).show()
                            finish()
                        } else {
                            val error = json.optString("error", "Unknown error")
                            Toast.makeText(
                                this@BookingAlertActivity,
                                "❌ $error",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    } else {
                        Toast.makeText(
                            this@BookingAlertActivity,
                            "❌ Failed to accept booking (HTTP $responseCode)",
                            Toast.LENGTH_SHORT
                        ).show()
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
                }
            }
        }
    }
}
