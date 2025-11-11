package app.didisnow.worker

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.ActivityCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "LocationPlugin")
class LocationPlugin : Plugin() {
    
    private var permissionCall: PluginCall? = null
    
    companion object {
        private const val TAG = "LocationPlugin"
        private const val PERMISSION_REQUEST_CODE = 1001
    }
    
    @PluginMethod
    fun requestLocationPermissions(call: PluginCall) {
        Log.d(TAG, "requestLocationPermissions called")
        
        // Check if already granted
        if (hasLocationPermissions()) {
            Log.d(TAG, "Location permissions already granted")
            val ret = JSObject()
            ret.put("granted", true)
            call.resolve(ret)
            return
        }
        
        // Request location permissions with rationale dialog
        activity?.runOnUiThread {
            PermissionHelper.requestLocationPermissionWithRationale(activity)
        }
        
        // Store call for later resolution (will be called by permission result)
        permissionCall = call
    }
    
    override fun handleRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ) {
        super.handleRequestPermissionsResult(requestCode, permissions, grantResults)
        
        // Handle location permission results from PermissionHelper
        if (requestCode == PermissionHelper.LOCATION_PERMISSION_CODE) {
            val call = permissionCall ?: return
            
            val granted = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            android.util.Log.d(TAG, "Location permission result from PermissionHelper: $granted")
            
            val ret = JSObject()
            ret.put("granted", granted)
            call.resolve(ret)
            
            permissionCall = null
        }
        // Keep original handling for other request codes
        else if (requestCode == PERMISSION_REQUEST_CODE) {
            val call = permissionCall ?: return
            
            val granted = grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            Log.d(TAG, "Permission request result: $granted")
            
            val ret = JSObject()
            ret.put("granted", granted)
            call.resolve(ret)
            
            permissionCall = null
        }
    }
    
    @PluginMethod
    fun startLocationTracking(call: PluginCall) {
        Log.d(TAG, "startLocationTracking called")
        
        // Check permissions
        if (!hasLocationPermissions()) {
            call.reject("Location permissions not granted")
            return
        }
        
        try {
            val context = context
            
            // Save state
            val prefs = context.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("is_available", true).apply()
            
            // Start foreground service
            val intent = Intent(context, LocationTrackingService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
            
            // Schedule WorkManager as backup
            LocationUpdateWorker.schedule(context)
            
            Log.d(TAG, "Location tracking started successfully")
            
            val ret = JSObject()
            ret.put("success", true)
            call.resolve(ret)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error starting location tracking", e)
            call.reject("Failed to start location tracking: ${e.message}")
        }
    }
    
    @PluginMethod
    fun stopLocationTracking(call: PluginCall) {
        Log.d(TAG, "stopLocationTracking called")
        
        try {
            val context = context
            
            // Save state
            val prefs = context.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("is_available", false).apply()
            
            // Stop foreground service
            val intent = Intent(context, LocationTrackingService::class.java)
            context.stopService(intent)
            
            // Cancel WorkManager
            LocationUpdateWorker.cancel(context)
            
            Log.d(TAG, "Location tracking stopped successfully")
            
            val ret = JSObject()
            ret.put("success", true)
            call.resolve(ret)
            
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping location tracking", e)
            call.reject("Failed to stop location tracking: ${e.message}")
        }
    }
    
    @PluginMethod
    fun isLocationTracking(call: PluginCall) {
        val prefs = context.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        val isAvailable = prefs.getBoolean("is_available", false)
        
        val ret = JSObject()
        ret.put("isTracking", isAvailable)
        call.resolve(ret)
    }
    
    @PluginMethod
    fun saveJwtToken(call: PluginCall) {
        val token = call.getString("token")
        if (token == null) {
            call.reject("Token is required")
            return
        }
        
        val prefs = context.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString("jwt_token", token).apply()
        
        Log.d(TAG, "JWT token saved")
        
        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }
    
    @PluginMethod
    fun requestBatteryOptimization(call: PluginCall) {
        try {
            BatteryOptimizationHelper.showBatteryDialog(activity)
            val ret = JSObject()
            ret.put("success", true)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("Failed to request battery optimization: ${e.message}")
        }
    }
    
    private fun hasLocationPermissions(): Boolean {
        val context = context
        val hasFineLocation = ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        
        val hasCoarseLocation = ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
        
        // For Android 10+, also check background location
        val hasBackgroundLocation = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ActivityCompat.checkSelfPermission(
                context,
                Manifest.permission.ACCESS_BACKGROUND_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true // Not required for older versions
        }
        
        return hasFineLocation && hasCoarseLocation && hasBackgroundLocation
    }
}
