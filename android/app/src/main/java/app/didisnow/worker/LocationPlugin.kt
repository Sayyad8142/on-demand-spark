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
    
    companion object {
        private const val TAG = "LocationPlugin"
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
        return ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED &&
        ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }
}
