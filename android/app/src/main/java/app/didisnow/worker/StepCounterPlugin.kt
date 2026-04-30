package app.didisnow.worker

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.getcapacitor.JSObject
import org.json.JSONObject

@CapacitorPlugin(
    name = "StepCounter",
    permissions = [
        Permission(
            strings = [Manifest.permission.ACTIVITY_RECOGNITION],
            alias = "activityRecognition"
        )
    ]
)
class StepCounterPlugin : Plugin() {

    private val TAG = "StepCounterPlugin"
    private var sensorManager: SensorManager? = null
    private var stepSensor: Sensor? = null
    private var sensorType: String? = null
    private var listener: SensorEventListener? = null
    private var handler: Handler? = null
    private var timeoutRunnable: Runnable? = null

    // Monitoring state
    private var baselineSteps: Long = -1
    private var latestSteps: Long = -1
    private var monitoringBookingId: String? = null
    private var pendingCall: PluginCall? = null

    @PluginMethod
    fun checkSupport(call: PluginCall) {
        val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val stepCounter = sm?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        val stepDetector = sm?.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)

        val supported = stepCounter != null || stepDetector != null
        val type = when {
            stepCounter != null -> "step_counter"
            stepDetector != null -> "step_detector"
            else -> "none"
        }

        val ret = JSObject()
        ret.put("supported", supported)
        ret.put("sensorType", type)
        call.resolve(ret)
    }

    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACTIVITY_RECOGNITION
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }

        Log.d(TAG, "🔍 [Native] ACTIVITY_RECOGNITION checkPermission granted=$granted")
        val ret = JSObject()
        ret.put("granted", granted)
        call.resolve(ret)
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        Log.d(TAG, "🟢 [Native] StepCounterPlugin.requestPermission entered")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val granted = ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACTIVITY_RECOGNITION
            ) == PackageManager.PERMISSION_GRANTED

            if (granted) {
                Log.d(TAG, "✅ [Native] ACTIVITY_RECOGNITION already granted")
                val ret = JSObject()
                ret.put("granted", true)
                call.resolve(ret)
            } else {
                // Request permission via Capacitor's built-in mechanism.
                // The result is delivered to handlePermissionResult() (annotated
                // with @PermissionCallback below) — without that annotation
                // Capacitor cannot route the OS dialog result back here.
                Log.d(TAG, "📣 [Native] Launching ACTIVITY_RECOGNITION runtime prompt via requestPermissionForAlias")
                requestPermissionForAlias("activityRecognition", call, "handlePermissionResult")
            }
        } else {
            // Pre-Q, no permission needed for step sensors
            Log.d(TAG, "ℹ️ [Native] Pre-Android 10 — ACTIVITY_RECOGNITION auto-granted")
            val ret = JSObject()
            ret.put("granted", true)
            call.resolve(ret)
        }
    }

    // NOTE: Capacitor's @PermissionCallback dispatcher requires the method to
    // be reachable via reflection from the plugin base class. Keep it `public`
    // (Kotlin default) — `private fun` here silently breaks the callback on
    // some Capacitor versions and the OS dialog result never reaches JS.
    @PermissionCallback
    fun handlePermissionResult(call: PluginCall) {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACTIVITY_RECOGNITION
        ) == PackageManager.PERMISSION_GRANTED

        Log.d(TAG, "🔁 [Native] handlePermissionResult fired — granted=$granted (Build=${Build.MANUFACTURER}/${Build.MODEL})")
        val ret = JSObject()
        ret.put("granted", granted)
        call.resolve(ret)
    }

    @PluginMethod
    fun startMonitoring(call: PluginCall) {
        val bookingId = call.getString("bookingId") ?: run {
            call.reject("bookingId is required")
            return
        }
        val windowSeconds = call.getInt("windowSeconds", 180) ?: 180

        Log.d(TAG, "📊 Starting step monitoring for booking $bookingId, window=${windowSeconds}s")

        // Clean up any existing monitoring
        stopListenerInternal()

        val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        if (sm == null) {
            call.reject("SensorManager not available")
            return
        }
        sensorManager = sm

        // Prefer TYPE_STEP_COUNTER, fall back to TYPE_STEP_DETECTOR
        val counter = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        val detector = sm.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
        val sensor = counter ?: detector

        if (sensor == null) {
            Log.w(TAG, "📊 No step sensor available")
            val ret = JSObject()
            ret.put("status", "unsupported")
            ret.put("bookingId", bookingId)
            call.resolve(ret)
            return
        }

        stepSensor = sensor
        sensorType = if (counter != null) "step_counter" else "step_detector"
        monitoringBookingId = bookingId
        baselineSteps = -1
        latestSteps = -1

        // For step_detector, we count events manually
        var detectedSteps = 0L

        listener = object : SensorEventListener {
            override fun onSensorChanged(event: SensorEvent?) {
                if (event == null) return

                if (sensorType == "step_counter") {
                    val currentSteps = event.values[0].toLong()
                    if (baselineSteps == -1L) {
                        baselineSteps = currentSteps
                        Log.d(TAG, "📊 Baseline steps: $baselineSteps")
                    }
                    latestSteps = currentSteps
                } else {
                    // step_detector fires one event per step
                    detectedSteps++
                    if (baselineSteps == -1L) baselineSteps = 0
                    latestSteps = detectedSteps
                }

                val stepsInWindow = if (sensorType == "step_counter") {
                    if (baselineSteps >= 0 && latestSteps >= 0) (latestSteps - baselineSteps).toInt().coerceAtLeast(0) else 0
                } else {
                    latestSteps.toInt().coerceAtLeast(0)
                }
                val updateData = JSObject()
                updateData.put("bookingId", bookingId)
                updateData.put("stepCount", stepsInWindow)
                updateData.put("rawStepValue", if (latestSteps >= 0) latestSteps else JSONObject.NULL)
                updateData.put("baselineStepValue", if (baselineSteps >= 0) baselineSteps else JSONObject.NULL)
                updateData.put("sensorType", sensorType)
                updateData.put("timestamp", System.currentTimeMillis())
                Log.d(TAG, "📊 stepUpdate booking=$bookingId steps=$stepsInWindow raw=$latestSteps baseline=$baselineSteps")
                notifyListeners("stepUpdate", updateData)
            }

            override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
        }

        sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL)

        // Set up timeout to auto-complete monitoring
        handler = Handler(Looper.getMainLooper())
        timeoutRunnable = Runnable {
            Log.d(TAG, "📊 Monitoring window complete for booking $bookingId")
            val stepsInWindow = if (sensorType == "step_counter") {
                if (baselineSteps >= 0 && latestSteps >= 0) (latestSteps - baselineSteps).toInt() else 0
            } else {
                latestSteps.toInt().coerceAtLeast(0)
            }

            // Notify JS via event
            val eventData = JSObject()
            eventData.put("bookingId", bookingId)
            eventData.put("stepsInWindow", stepsInWindow)
            eventData.put("baselineStepValue", if (baselineSteps >= 0) baselineSteps else JSONObject.NULL)
            eventData.put("finalStepValue", if (latestSteps >= 0) latestSteps else JSONObject.NULL)
            eventData.put("sensorType", sensorType)
            eventData.put("windowSeconds", windowSeconds)
            notifyListeners("monitoringComplete", eventData)

            stopListenerInternal()
        }
        handler?.postDelayed(timeoutRunnable!!, windowSeconds * 1000L)

        val ret = JSObject()
        ret.put("status", "started")
        ret.put("bookingId", bookingId)
        ret.put("sensorType", sensorType)
        call.resolve(ret)
    }

    @PluginMethod
    fun stopMonitoring(call: PluginCall) {
        Log.d(TAG, "📊 Stopping step monitoring manually")
        stopListenerInternal()
        call.resolve()
    }

    private fun stopListenerInternal() {
        listener?.let { sensorManager?.unregisterListener(it) }
        listener = null
        timeoutRunnable?.let { handler?.removeCallbacks(it) }
        timeoutRunnable = null
        handler = null
        monitoringBookingId = null
    }
}
