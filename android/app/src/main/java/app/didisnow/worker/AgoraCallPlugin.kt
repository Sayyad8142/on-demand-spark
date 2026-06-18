package app.didisnow.worker

import android.content.Intent
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import io.agora.rtc2.ChannelMediaOptions
import io.agora.rtc2.Constants
import io.agora.rtc2.IRtcEngineEventHandler
import io.agora.rtc2.RtcEngine
import io.agora.rtc2.RtcEngineConfig

/**
 * Capacitor plugin wrapping the native Agora RTC engine for voice-only calls.
 * Exposed to JS as `AgoraCall`.
 *
 *  - init({ appId })          → create RtcEngine
 *  - join({ token, channel, uid }) → join voice channel
 *  - leave()                  → leave channel & release
 *  - setMuted({ muted })      → mute/unmute local mic
 *  - setSpeaker({ on })       → toggle speakerphone
 *
 * Fires JS events:
 *  - agora:joined             { channel, uid }
 *  - agora:remote-joined      { uid }
 *  - agora:remote-left        { uid }
 *  - agora:left
 *  - agora:error              { code, msg }
 */
@CapacitorPlugin(name = "AgoraCall")
class AgoraCallPlugin : Plugin() {
    private val TAG = "AgoraCallPlugin"
    private var engine: RtcEngine? = null
    private var appId: String? = null

    private val eventHandler = object : IRtcEngineEventHandler() {
        override fun onJoinChannelSuccess(channel: String?, uid: Int, elapsed: Int) {
            Log.d(TAG, "✅ joinChannelSuccess channel=$channel uid=$uid")
            val data = JSObject().apply {
                put("channel", channel ?: "")
                put("uid", uid)
            }
            notifyListeners("agora:joined", data)
            // Start foreground service to survive backgrounding
            try {
                val ctx = context
                val svc = Intent(ctx, CallForegroundService::class.java)
                svc.putExtra("channel", channel ?: "")
                androidx.core.content.ContextCompat.startForegroundService(ctx, svc)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to start CallForegroundService: ${e.message}")
            }
        }

        override fun onUserJoined(uid: Int, elapsed: Int) {
            Log.d(TAG, "👤 remote uid=$uid joined")
            notifyListeners("agora:remote-joined", JSObject().put("uid", uid))
        }

        override fun onUserOffline(uid: Int, reason: Int) {
            Log.d(TAG, "👤 remote uid=$uid left reason=$reason")
            notifyListeners("agora:remote-left", JSObject().put("uid", uid).put("reason", reason))
        }

        override fun onLeaveChannel(stats: IRtcEngineEventHandler.RtcStats?) {
            Log.d(TAG, "👋 left channel")
            notifyListeners("agora:left", JSObject())
        }

        override fun onError(err: Int) {
            Log.e(TAG, "❌ agora error code=$err")
            notifyListeners("agora:error", JSObject().put("code", err))
        }
    }

    @PluginMethod
    fun init(call: PluginCall) {
        val id = call.getString("appId")
        if (id.isNullOrBlank()) {
            call.reject("appId required")
            return
        }
        try {
            if (engine == null || appId != id) {
                appId = id
                val config = RtcEngineConfig().apply {
                    mContext = context.applicationContext
                    mAppId = id
                    mEventHandler = eventHandler
                    mChannelProfile = Constants.CHANNEL_PROFILE_COMMUNICATION
                }
                engine = RtcEngine.create(config)
                engine?.enableAudio()
                engine?.disableVideo()
                engine?.setDefaultAudioRoutetoSpeakerphone(false)
                Log.d(TAG, "✅ Agora engine initialised")
            }
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "init failed", e)
            call.reject("init_failed: ${e.message}")
        }
    }

    @PluginMethod
    fun join(call: PluginCall) {
        val token = call.getString("token") ?: ""
        val channel = call.getString("channel") ?: ""
        val uid = call.getInt("uid") ?: 0
        if (channel.isBlank()) {
            call.reject("channel required")
            return
        }
        val e = engine ?: run {
            call.reject("engine_not_initialised — call init() first")
            return
        }
        val opts = ChannelMediaOptions().apply {
            channelProfile = Constants.CHANNEL_PROFILE_COMMUNICATION
            clientRoleType = Constants.CLIENT_ROLE_BROADCASTER
            autoSubscribeAudio = true
            publishMicrophoneTrack = true
        }
        // null token allowed only if Agora project is in testing/no-auth mode
        val rc = e.joinChannel(if (token.isBlank()) null else token, channel, uid, opts)
        Log.d(TAG, "join() channel=$channel uid=$uid rc=$rc")
        if (rc != 0) {
            call.reject("join_failed code=$rc")
            return
        }
        call.resolve()
    }

    @PluginMethod
    fun leave(call: PluginCall) {
        try {
            engine?.leaveChannel()
            // Stop foreground service
            try {
                context.stopService(Intent(context, CallForegroundService::class.java))
            } catch (_: Exception) {}
            call.resolve()
        } catch (e: Exception) {
            call.reject("leave_failed: ${e.message}")
        }
    }

    @PluginMethod
    fun destroy(call: PluginCall) {
        try {
            engine?.leaveChannel()
            RtcEngine.destroy()
            engine = null
            try { context.stopService(Intent(context, CallForegroundService::class.java)) } catch (_: Exception) {}
            call.resolve()
        } catch (e: Exception) {
            call.reject("destroy_failed: ${e.message}")
        }
    }

    @PluginMethod
    fun setMuted(call: PluginCall) {
        val muted = call.getBoolean("muted") ?: false
        engine?.muteLocalAudioStream(muted)
        call.resolve(JSObject().put("muted", muted))
    }

    @PluginMethod
    fun setSpeaker(call: PluginCall) {
        val on = call.getBoolean("on") ?: false
        engine?.setEnableSpeakerphone(on)
        call.resolve(JSObject().put("speaker", on))
    }

    override fun handleOnDestroy() {
        try {
            engine?.leaveChannel()
            RtcEngine.destroy()
            engine = null
        } catch (_: Exception) {}
        super.handleOnDestroy()
    }
}
