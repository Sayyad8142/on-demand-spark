package app.didisnow.worker

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.work.*
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import kotlinx.coroutines.tasks.await
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

class LocationUpdateWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    companion object {
        private const val TAG = "LocationUpdateWorker"
        const val WORK_NAME = "location_update_work"
        
        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(false)
                .build()
            
            val workRequest = PeriodicWorkRequestBuilder<LocationUpdateWorker>(
                15, TimeUnit.MINUTES // Minimum periodic work interval
            )
                .setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.LINEAR,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS
                )
                .build()
            
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                workRequest
            )
            
            Log.d(TAG, "LocationUpdateWorker scheduled")
        }
        
        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(WORK_NAME)
            Log.d(TAG, "LocationUpdateWorker cancelled")
        }
    }
    
    override suspend fun doWork(): Result {
        Log.d(TAG, "LocationUpdateWorker executing")
        
        // Run as foreground worker to prevent being killed
        try {
            setForeground(createForegroundInfo())
        } catch (e: Exception) {
            Log.e(TAG, "Failed to set foreground, continuing anyway", e)
        }
        
        // Check if user is still logged in and available
        val prefs = applicationContext.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
        val isLoggedIn = prefs.getBoolean("is_logged_in", false)
        val isAvailable = prefs.getBoolean("is_available", false)
        
        if (!isLoggedIn || !isAvailable) {
            Log.d(TAG, "User not logged in or not available, skipping update")
            return Result.success()
        }
        
        // Check location permission
        if (ActivityCompat.checkSelfPermission(
                applicationContext,
                Manifest.permission.ACCESS_FINE_LOCATION
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            Log.e(TAG, "Location permission not granted")
            return Result.failure()
        }
        
        return try {
            val fusedLocationClient = LocationServices.getFusedLocationProviderClient(applicationContext)
            val cancellationTokenSource = CancellationTokenSource()
            
            val location = fusedLocationClient.getCurrentLocation(
                Priority.PRIORITY_HIGH_ACCURACY,
                cancellationTokenSource.token
            ).await()
            
            if (location != null) {
                Log.d(TAG, "Got location: ${location.latitude}, ${location.longitude}")
                updateLocationToSupabase(location.latitude, location.longitude)
                Result.success()
            } else {
                Log.e(TAG, "Failed to get location")
                Result.retry()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error in LocationUpdateWorker", e)
            Result.retry()
        }
    }
    
    private fun createForegroundInfo(): ForegroundInfo {
        val notificationIntent = android.content.Intent(applicationContext, MainActivity::class.java)
        val pendingIntent = android.app.PendingIntent.getActivity(
            applicationContext,
            0,
            notificationIntent,
            android.app.PendingIntent.FLAG_IMMUTABLE
        )
        
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            android.app.Notification.Builder(applicationContext, "location_tracking_channel")
                .setContentTitle("Location Update")
                .setContentText("Updating worker location...")
                .setSmallIcon(R.drawable.ic_notification)
                .setContentIntent(pendingIntent)
                .build()
        } else {
            @Suppress("DEPRECATION")
            android.app.Notification.Builder(applicationContext)
                .setContentTitle("Location Update")
                .setContentText("Updating worker location...")
                .setSmallIcon(R.drawable.ic_notification)
                .setContentIntent(pendingIntent)
                .build()
        }
        
        return ForegroundInfo(9999, notification)
    }
    
    private suspend fun updateLocationToSupabase(lat: Double, lng: Double) {
        try {
            val prefs = applicationContext.getSharedPreferences("worker_prefs", Context.MODE_PRIVATE)
            val jwtToken = prefs.getString("jwt_token", null)
            
            if (jwtToken == null) {
                Log.e(TAG, "No JWT token found")
                return
            }
            
            val url = URL("https://api.didisnow.com/rest/v1/rpc/update_worker_location")
            val connection = url.openConnection() as HttpURLConnection
            
            connection.apply {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheXd3YnVxeWNvdmpvcHJ5ZWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUxNjkyNjksImV4cCI6MjA3MDc0NTI2OX0.js1MaTBkjuGlaDfQjrZpZ9_G8Jy9ygNAB8KpNDiQg8o")
                setRequestProperty("Authorization", "Bearer $jwtToken")
                doOutput = true
                connectTimeout = 10000
                readTimeout = 10000
            }
            
            val payload = JSONObject().apply {
                put("p_lat", lat)
                put("p_lng", lng)
            }
            
            OutputStreamWriter(connection.outputStream).use { writer ->
                writer.write(payload.toString())
                writer.flush()
            }
            
            val responseCode = connection.responseCode
            Log.d(TAG, "Supabase update response: $responseCode")
            
            if (responseCode == 200) {
                prefs.edit().putLong("last_location_update", System.currentTimeMillis()).apply()
            }
            
        } catch (e: Exception) {
            Log.e(TAG, "Error updating location to Supabase", e)
            throw e
        }
    }
}
