package app.didisnow.worker

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject

/**
 * StepCounter plugin — public JS API is unchanged. Internally now delegates
 * sensor work to MovementTrackingService (a true Android Foreground Service)
 * so step tracking survives backgrounding, screen lock, and activity pauses.
 *
 * Two concurrent tracks are supported:
 *   - bookingId starting with "passive:" → passive online tracking (no auto-stop)
 *   - any other bookingId               → booking-specific window (auto-stops)
 */
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
    private var receiverRegistered = false

    private val updateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent == null) return
            when (intent.action) {
                MovementTrackingService.ACTION_STEP_UPDATE -> {
                    val data = JSObject()
                    data.put("bookingId", intent.getStringExtra(MovementTrackingService.EXTRA_BOOKING_ID) ?: "")
                    data.put("stepCount", intent.getIntExtra(MovementTrackingService.EXTRA_STEP_COUNT, 0))
                    val raw = intent.getLongExtra(MovementTrackingService.EXTRA_RAW_STEP_VALUE, -1L)
                    data.put("rawStepValue", if (raw >= 0) raw else JSONObject.NULL)
                    val baseline = intent.getLongExtra(MovementTrackingService.EXTRA_BASELINE_STEP_VALUE, -1L)
                    data.put("baselineStepValue", if (baseline >= 0) baseline else JSONObject.NULL)
                    data.put("sensorType", intent.getStringExtra(MovementTrackingService.EXTRA_SENSOR_TYPE) ?: "none")
                    data.put("timestamp", intent.getLongExtra(MovementTrackingService.EXTRA_TIMESTAMP, System.currentTimeMillis()))
                    notifyListeners("stepUpdate", data)
                }
                MovementTrackingService.ACTION_MONITORING_COMPLETE -> {
                    val data = JSObject()
                    val bookingId = intent.getStringExtra(MovementTrackingService.EXTRA_BOOKING_ID) ?: ""
                    data.put("bookingId", bookingId)
                    data.put("stepsInWindow", intent.getIntExtra(MovementTrackingService.EXTRA_STEPS_IN_WINDOW, 0))
                    val baseline = intent.getLongExtra(MovementTrackingService.EXTRA_BASELINE_STEP_VALUE, -1L)
                    data.put("baselineStepValue", if (baseline >= 0) baseline else JSONObject.NULL)
                    val finalVal = intent.getLongExtra(MovementTrackingService.EXTRA_FINAL_STEP_VALUE, -1L)
                    data.put("finalStepValue", if (finalVal >= 0) finalVal else JSONObject.NULL)
                    data.put("sensorType", intent.getStringExtra(MovementTrackingService.EXTRA_SENSOR_TYPE) ?: "none")
                    data.put("windowSeconds", intent.getIntExtra(MovementTrackingService.EXTRA_WINDOW_SECONDS, 0))
                    notifyListeners("monitoringComplete", data)
                    Log.d(TAG, "🏁 monitoringComplete forwarded to JS booking=$bookingId")
                }
            }
        }
    }

    override fun load() {
        super.load()
        ensureReceiver()
    }

    override fun handleOnDestroy() {
        if (receiverRegistered) {
            try { LocalBroadcastManager.getInstance(context).unregisterReceiver(updateReceiver) } catch (_: Exception) {}
            receiverRegistered = false
        }
        super.handleOnDestroy()
    }

    private fun ensureReceiver() {
        if (receiverRegistered) return
        val f = IntentFilter().apply {
            addAction(MovementTrackingService.ACTION_STEP_UPDATE)
            addAction(MovementTrackingService.ACTION_MONITORING_COMPLETE)
        }
        LocalBroadcastManager.getInstance(context).registerReceiver(updateReceiver, f)
        receiverRegistered = true
        Log.d(TAG, "📨 LocalBroadcast receiver registered for step updates")
    }

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
        val ret = JSObject().put("supported", supported).put("sensorType", type)
        call.resolve(ret)
    }

    @PluginMethod
    fun checkPermission(call: PluginCall) {
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACTIVITY_RECOGNITION
            ) == PackageManager.PERMISSION_GRANTED
        } else true
        Log.d(TAG, "🔍 checkPermission granted=$granted")
        call.resolve(JSObject().put("granted", granted))
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        Log.d(TAG, "🟢 requestPermission entered")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val granted = ContextCompat.checkSelfPermission(
                context, Manifest.permission.ACTIVITY_RECOGNITION
            ) == PackageManager.PERMISSION_GRANTED
            if (granted) {
                call.resolve(JSObject().put("granted", true))
            } else {
                requestPermissionForAlias("activityRecognition", call, "handlePermissionResult")
            }
        } else {
            call.resolve(JSObject().put("granted", true))
        }
    }

    @PermissionCallback
    fun handlePermissionResult(call: PluginCall) {
        val granted = ContextCompat.checkSelfPermission(
            context, Manifest.permission.ACTIVITY_RECOGNITION
        ) == PackageManager.PERMISSION_GRANTED
        Log.d(TAG, "🔁 handlePermissionResult granted=$granted (${Build.MANUFACTURER}/${Build.MODEL})")
        call.resolve(JSObject().put("granted", granted))
    }

    @PluginMethod
    fun startMonitoring(call: PluginCall) {
        val bookingId = call.getString("bookingId") ?: run {
            call.reject("bookingId is required")
            return
        }
        val windowSeconds = call.getInt("windowSeconds", 300) ?: 300

        ensureReceiver()

        val sm = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
        val counter = sm?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
        val detector = sm?.getDefaultSensor(Sensor.TYPE_STEP_DETECTOR)
        val sensor = counter ?: detector
        if (sensor == null) {
            Log.w(TAG, "❌ no step sensor")
            call.resolve(JSObject().put("status", "unsupported").put("bookingId", bookingId))
            return
        }
        val sensorType = if (counter != null) "step_counter" else "step_detector"

        val isPassive = bookingId.startsWith("passive:")
        Log.d(TAG, "🚀 startMonitoring booking=$bookingId passive=$isPassive window=${windowSeconds}s sensor=$sensorType")

        try {
            if (isPassive) {
                MovementTrackingService.startPassive(context, bookingId)
            } else {
                MovementTrackingService.startBooking(context, bookingId, windowSeconds)
            }
        } catch (e: Exception) {
            Log.e(TAG, "❌ failed to start MovementTrackingService: ${e.message}", e)
            call.reject("Could not start tracking service: ${e.message}")
            return
        }

        call.resolve(
            JSObject()
                .put("status", "started")
                .put("bookingId", bookingId)
                .put("sensorType", sensorType)
        )
    }

    @PluginMethod
    fun stopMonitoring(call: PluginCall) {
        Log.d(TAG, "🛑 stopMonitoring (stops booking track only; passive runs independently)")
        try {
            // Preserve previous semantics: stopMonitoring() was used to end booking sessions.
            // Passive tracking has its own dedicated stopPassive entry.
            MovementTrackingService.stopBooking(context)
        } catch (e: Exception) {
            Log.w(TAG, "stopMonitoring error: ${e.message}")
        }
        call.resolve()
    }

    @PluginMethod
    fun stopPassive(call: PluginCall) {
        Log.d(TAG, "🛑 stopPassive (passive online tracking only)")
        try { MovementTrackingService.stopPassive(context) } catch (_: Exception) {}
        call.resolve()
    }

    @PluginMethod
    fun stopAll(call: PluginCall) {
        Log.d(TAG, "🛑 stopAll (stops both passive and booking)")
        try {
            val i = Intent(context, MovementTrackingService::class.java).apply {
                action = MovementTrackingService.ACTION_STOP_ALL
            }
            context.startService(i)
        } catch (_: Exception) {}
        call.resolve()
    }
}
