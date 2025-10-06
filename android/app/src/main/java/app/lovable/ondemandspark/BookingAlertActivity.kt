package app.lovable.ondemandspark

import android.app.Activity
import android.os.Bundle
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import android.widget.Toast

class BookingAlertActivity : Activity() {
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
            // Send message to WebView to handle acceptance
            Toast.makeText(this, "Opening app to accept booking...", Toast.LENGTH_SHORT).show()
            
            // Launch main activity with booking data
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            launchIntent?.apply {
                putExtra("bookingId", bookingId)
                putExtra("action", "accept")
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(launchIntent)
            finish()
        }

        findViewById<Button>(R.id.btnReject).setOnClickListener {
            Toast.makeText(this, "Booking rejected", Toast.LENGTH_SHORT).show()
            finish()
        }
    }
}
