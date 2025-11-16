package app.didisnow.worker

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import androidx.appcompat.app.AlertDialog
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

object LocationPermissionHelper {
    private const val LOCATION_PERMISSION_CODE = 9913
    
    fun hasPermission(activity: Activity): Boolean {
        val fineLocation = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        
        val coarseLocation = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        
        return fineLocation && coarseLocation
    }
    
    fun request(activity: Activity) {
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        
        // Request background location separately for Android 10+
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            permissions.add(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        }
        
        ActivityCompat.requestPermissions(
            activity,
            permissions.toTypedArray(),
            LOCATION_PERMISSION_CODE
        )
    }
    
    fun showLocationPermissionDialog(activity: Activity) {
        if (hasPermission(activity)) {
            android.util.Log.d("LocationPermission", "✅ Location permission already granted")
            return
        }
        
        android.util.Log.d("LocationPermission", "📍 Showing location permission dialog")
        
        AlertDialog.Builder(activity)
            .setTitle("📍 Enable Location")
            .setMessage(
                "🗺️ Why we need this permission:\n\n" +
                "• Share your real-time location with customers\n" +
                "• Help customers track when you're on the way\n" +
                "• Provide accurate ETA to job locations\n\n" +
                "✅ Location tracking builds trust with customers and improves your service quality.\n\n" +
                "This permission is required for location-based features."
            )
            .setPositiveButton("Allow") { _, _ ->
                android.util.Log.d("LocationPermission", "🔓 User clicked Allow - requesting permission")
                request(activity)
            }
            .setNegativeButton("Later") { _, _ ->
                android.util.Log.d("LocationPermission", "⏭️ User clicked Later")
            }
            .setCancelable(false)
            .show()
    }
}
