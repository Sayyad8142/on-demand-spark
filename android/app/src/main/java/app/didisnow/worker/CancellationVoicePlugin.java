package app.didisnow.worker;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.HashMap;
import java.util.Locale;

/**
 * Native Android cancellation-voice bridge.
 *
 * - Uses TextToSpeech with AudioAttributes.USAGE_ALARM so it cuts through silent/DnD.
 * - Acquires a temporary wake lock so speech finishes on a locked device.
 * - Falls back to bundled R.raw.booking_cancellation_voice if TTS fails.
 * - Singleton per app process — duplicate speak() calls while active are suppressed.
 */
@CapacitorPlugin(name = "CancellationVoice")
public class CancellationVoicePlugin extends Plugin {
    private static final String TAG = "CancelVoice";
    private static final String UTTER_ID = "didi_cancel";

    private TextToSpeech tts;
    private boolean ttsReady = false;
    private boolean speaking = false;
    private int repeatsRemaining = 0;
    private int totalRepeats = 0;
    private MediaPlayer fallbackPlayer;
    private PowerManager.WakeLock wakeLock;
    private int previousAlarmVolume = -1; // -1 = not changed / nothing to restore
    private final Handler handler = new Handler(Looper.getMainLooper());

    private String phrase = "Booking cancelled. Booking cancelled.";
    private static final long REPEAT_GAP_MS = 600L;

    @Override
    public void load() {
        super.load();
        Context ctx = getContext().getApplicationContext();
        tts = new TextToSpeech(ctx, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int res = tts.setLanguage(new Locale("en", "IN"));
                if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                    tts.setLanguage(Locale.US);
                }
                tts.setSpeechRate(0.95f);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    AudioAttributes attrs = new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build();
                    tts.setAudioAttributes(attrs);
                }
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String utteranceId) {
                        int idx = totalRepeats - repeatsRemaining + 1;
                        Log.d(TAG, "[CANCEL_ALERT] repeat_" + idx);
                        if (idx == 1) Log.d(TAG, "[CANCEL_ALERT] speech_started");
                    }
                    @Override public void onDone(String utteranceId) {
                        repeatsRemaining--;
                        if (repeatsRemaining > 0 && speaking) {
                            handler.postDelayed(CancellationVoicePlugin.this::speakOnce, REPEAT_GAP_MS);
                        } else {
                            Log.d(TAG, "[CANCEL_ALERT] completed_all_repeats");
                            Log.d(TAG, "[CANCEL_ALERT] speech_completed");
                            speaking = false;
                            handler.post(() -> { restoreAlarmVolume(); releaseWakeLock(); });
                        }
                    }
                    @Override public void onError(String utteranceId) {
                        Log.w(TAG, "[CANCEL_ALERT] speech_error → fallback");
                        handler.post(CancellationVoicePlugin.this::playFallbackLoop);
                    }
                });
                ttsReady = true;
                Log.d(TAG, "TTS ready");
            } else {
                Log.w(TAG, "TTS init failed status=" + status);
            }
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (speaking) {
            Log.d(TAG, "[CANCEL_ALERT] duplicate_suppressed");
            JSObject ret = new JSObject();
            ret.put("started", false);
            ret.put("reason", "already_playing");
            call.resolve(ret);
            return;
        }

        String text = call.getString("text");
        if (text != null && !text.isEmpty()) phrase = text;
        int repeats = call.getInt("repeats", 3);
        totalRepeats = Math.max(1, repeats);
        repeatsRemaining = totalRepeats;
        speaking = true;

        Log.d(TAG, "[CANCEL_ALERT] popup_shown");
        acquireWakeLock();
        vibrate();
        maxAlarmVolume();

        if (ttsReady && tts != null) {
            handler.post(this::speakOnce);
        } else {
            // TTS not ready yet — wait briefly then try, else fallback.
            handler.postDelayed(() -> {
                if (!speaking) return;
                if (ttsReady && tts != null) speakOnce();
                else playFallbackLoop();
            }, 600);
        }

        JSObject ret = new JSObject();
        ret.put("started", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopInternal();
        call.resolve();
    }

    private void speakOnce() {
        try {
            HashMap<String, String> params = new HashMap<>();
            params.put(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, UTTER_ID);
            params.put(TextToSpeech.Engine.KEY_PARAM_STREAM,
                String.valueOf(AudioManager.STREAM_ALARM));
            int result = tts.speak(phrase, TextToSpeech.QUEUE_FLUSH, params);
            if (result != TextToSpeech.SUCCESS) {
                Log.w(TAG, "tts.speak returned " + result + " → fallback");
                playFallbackLoop();
            }
        } catch (Exception e) {
            Log.e(TAG, "speakOnce error", e);
            playFallback();
        }
    }

    private void playFallbackLoop() {
        Log.d(TAG, "[CANCEL_ALERT] fallback_audio_used");
        playFallbackOnce();
    }

    private void playFallbackOnce() {
        if (!speaking) return;
        try {
            if (fallbackPlayer != null) {
                try { fallbackPlayer.release(); } catch (Exception ignored) {}
                fallbackPlayer = null;
            }
            int idx = totalRepeats - repeatsRemaining + 1;
            Log.d(TAG, "[CANCEL_ALERT] repeat_" + idx);
            fallbackPlayer = MediaPlayer.create(getContext(), R.raw.booking_cancellation_voice);
            if (fallbackPlayer == null) {
                speaking = false;
                releaseWakeLock();
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                fallbackPlayer.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build());
            }
            fallbackPlayer.setLooping(false);
            fallbackPlayer.setOnCompletionListener(mp -> {
                repeatsRemaining--;
                if (repeatsRemaining > 0 && speaking) {
                    handler.postDelayed(this::playFallbackOnce, REPEAT_GAP_MS);
                } else {
                    Log.d(TAG, "[CANCEL_ALERT] completed_all_repeats");
                    Log.d(TAG, "[CANCEL_ALERT] speech_completed");
                    speaking = false;
                    restoreAlarmVolume();
                    releaseWakeLock();
                }
            });
            fallbackPlayer.start();
        } catch (Exception e) {
            Log.e(TAG, "fallback error", e);
            speaking = false;
            restoreAlarmVolume();
            releaseWakeLock();
        }
    }

    private void stopInternal() {
        speaking = false;
        repeatsRemaining = 0;
        try { if (tts != null) tts.stop(); } catch (Exception ignored) {}
        if (fallbackPlayer != null) {
            try { fallbackPlayer.stop(); } catch (Exception ignored) {}
            try { fallbackPlayer.release(); } catch (Exception ignored) {}
            fallbackPlayer = null;
        }
        try {
            Vibrator v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) v.cancel();
        } catch (Exception ignored) {}
        releaseWakeLock();
    }

    private void vibrate() {
        try {
            Vibrator v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null) return;
            long[] pattern = new long[]{0, 400, 150, 400, 150, 800};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createWaveform(pattern, -1));
            } else {
                v.vibrate(pattern, -1);
            }
        } catch (Exception ignored) {}
    }

    private void maxAlarmVolume() {
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am == null) return;
            int max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM);
            int current = am.getStreamVolume(AudioManager.STREAM_ALARM);
            // Bring alarm stream up to ~85% so the worker hears it but it isn't painful.
            int target = (int) Math.round(max * 0.85);
            if (current != target) {
                if (previousAlarmVolume < 0) previousAlarmVolume = current;
                am.setStreamVolume(AudioManager.STREAM_ALARM, target, 0);
            }
        } catch (Exception ignored) {}
    }

    private void restoreAlarmVolume() {
        if (previousAlarmVolume < 0) return;
        try {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setStreamVolume(AudioManager.STREAM_ALARM, previousAlarmVolume, 0);
                Log.d(TAG, "[CANCEL_ALERT] alarm_volume_restored=" + previousAlarmVolume);
            }
        } catch (Exception ignored) {}
        previousAlarmVolume = -1;
    }

    @SuppressWarnings("WakelockTimeout")
    private void acquireWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) return;
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "DidiNow:CancelVoice"
            );
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire(20_000L);
        } catch (Exception e) {
            Log.w(TAG, "wakelock acquire failed", e);
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {}
        wakeLock = null;
    }

    @Override
    protected void handleOnDestroy() {
        stopInternal();
        try { if (tts != null) { tts.shutdown(); } } catch (Exception ignored) {}
        super.handleOnDestroy();
    }
}
