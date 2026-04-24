package app.didisnow.worker;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

@CapacitorPlugin(name = "OverlayPlugin")
public class OverlayPlugin extends Plugin {

    private static final String TAG = "OverlayPlugin";

    private boolean startSettingsIntent(Intent intent, String label) {
        Context ctx = getActivity() != null ? getActivity() : getContext();
        if (ctx == null) {
            Log.e(TAG, "❌ [intent] no_context label=" + label);
            return false;
        }

        String device = Build.MANUFACTURER + "/" + Build.MODEL + "/api" + Build.VERSION.SDK_INT;
        String action = intent.getAction();
        String data   = intent.getData() != null ? intent.getData().toString() : "null";

        // DO NOT use resolveActivity() here — it always returns null on Android 11+
        // due to package visibility restrictions (API 30+), even for valid Settings intents.
        Log.d(TAG, "[intent] try label=" + label + " action=" + action + " data=" + data + " device=" + device);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        final AtomicBoolean opened = new AtomicBoolean(false);
        final AtomicReference<Throwable> failure = new AtomicReference<>(null);
        final Runnable launch = () -> {
            try {
                if (getActivity() != null && !getActivity().isFinishing()) {
                    getActivity().startActivity(intent);
                } else {
                    ctx.startActivity(intent);
                }
                opened.set(true);
            } catch (Throwable t) {
                failure.set(t);
            }
        };

        if (getActivity() != null && Looper.myLooper() != Looper.getMainLooper()) {
            CountDownLatch latch = new CountDownLatch(1);
            getActivity().runOnUiThread(() -> {
                try {
                    launch.run();
                } finally {
                    latch.countDown();
                }
            });
            try {
                latch.await(1500, TimeUnit.MILLISECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                Log.w(TAG, "[intent] ❌ Interrupted while launching label=" + label + " device=" + device, e);
                return false;
            }
        } else {
            launch.run();
        }

        if (opened.get()) {
            Log.d(TAG, "[intent] ✅ ok label=" + label + " device=" + device);
            return true;
        }

        Throwable error = failure.get();
        if (error instanceof ActivityNotFoundException) {
            Log.w(TAG, "[intent] ❌ ActivityNotFound label=" + label + " device=" + device + " err=" + error.getMessage());
            return false;
        }
        if (error instanceof SecurityException) {
            Log.w(TAG, "[intent] ❌ SecurityException label=" + label + " device=" + device + " err=" + error.getMessage());
            return false;
        }
        if (error != null) {
            Log.w(TAG, "[intent] ❌ Exception label=" + label + " device=" + device + " err=" + error.getClass().getSimpleName() + ":" + error.getMessage());
            return false;
        }

        Log.w(TAG, "[intent] ❌ unknown_failure label=" + label + " device=" + device);
        return false;
    }

    /**
     * Launch the system overlay-permission Settings screen with multiple
     * fallbacks. Some OEMs (Vivo / Xiaomi / Realme) reject the per-package
     * intent and require the global list, and some require FLAG_ACTIVITY_NEW_TASK
     * because Settings launches in a different task.
     *
     * Fallback chain:
     *   1. ACTION_MANAGE_OVERLAY_PERMISSION (per-package URI)
     *   2. ACTION_MANAGE_OVERLAY_PERMISSION (no URI — global list)
     *   3. ACTION_APPLICATION_DETAILS_SETTINGS (worst-case: app info screen)
     */
    private boolean launchOverlaySettings() {
        Context ctx = getActivity() != null ? getActivity() : getContext();
        if (ctx == null) {
            Log.e(TAG, "❌ No context available to launch overlay settings");
            return false;
        }
        String pkg = ctx.getPackageName();
        String mfg = Build.MANUFACTURER + " / " + Build.MODEL + " / API " + Build.VERSION.SDK_INT;
        Log.d(TAG, "📣 Launching overlay settings (device: " + mfg + ", pkg=" + pkg + ")");
        Log.d(TAG, "📣 Attempting ACTION_MANAGE_OVERLAY_PERMISSION intent; Settings.canDrawOverlays(before)=" + Settings.canDrawOverlays(ctx));

        Intent perPackageIntent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + pkg)
        );
        perPackageIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (startSettingsIntent(perPackageIntent, "per-package ACTION_MANAGE_OVERLAY_PERMISSION")) {
            Log.d(TAG, "📣 ACTION_MANAGE_OVERLAY_PERMISSION attempted successfully; waiting for user return to re-check Settings.canDrawOverlays()");
            return true;
        }

        // 2. Global overlay permission list (no data URI)
        try {
            Intent globalIntent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
            globalIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (startSettingsIntent(globalIntent, "global ACTION_MANAGE_OVERLAY_PERMISSION")) {
                return true;
            }
        } catch (Exception e) {
            Log.w(TAG, "⚠️ Global overlay intent build failed: " + e.getMessage());
        }

        // 3. Final fallback: app details so the user can navigate manually
        try {
            Intent detailsIntent = new Intent(
                    Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    Uri.parse("package:" + pkg)
            );
            detailsIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (startSettingsIntent(detailsIntent, "ACTION_APPLICATION_DETAILS_SETTINGS")) {
                return true;
            }
        } catch (Exception e) {
            Log.e(TAG, "❌ App details fallback failed: " + e.getMessage(), e);
        }

        Log.e(TAG, "❌ All overlay setting intents failed for manufacturer=" + Build.MANUFACTURER);
        return false;
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        Log.d(TAG, "🟢 requestPermission entered");
        try {
            Context ctx = getActivity() != null ? getActivity() : getContext();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                    !Settings.canDrawOverlays(ctx)) {
                boolean opened = launchOverlaySettings();
                JSObject ret = new JSObject()
                        .put("granted", false)
                        .put("opened", opened)
                        .put("manufacturer", Build.MANUFACTURER);
                if (opened) {
                    call.resolve(ret);
                } else {
                    call.reject("Could not open overlay settings on this device");
                }
            } else {
                Log.d(TAG, "✅ Overlay already granted");
                call.resolve(new JSObject().put("granted", true).put("opened", false));
            }
        } catch (Exception e) {
            Log.e(TAG, "❌ requestPermission error", e);
            call.reject("Permission error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        try {
            boolean granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.M
                    || Settings.canDrawOverlays(getContext());
            JSObject ret = new JSObject().put("granted", granted);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Check error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void startForegroundService(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent intent = new Intent(ctx, BookingOverlayService.class);
            intent.putExtra("mode", "idle");
            ctx.startService(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Start service error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopForegroundService(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent intent = new Intent(ctx, BookingOverlayService.class);
            ctx.stopService(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Stop service error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void showBookingOverlay(PluginCall call) {
        try {
            String bookingJson = call.getString("booking", "{}");
            JSONObject b = new JSONObject(bookingJson);

            Context ctx = getContext();
            Intent intent = new Intent(ctx, BookingOverlayService.class);
            intent.putExtra("mode", "show");
            intent.putExtra("booking_id", b.optString("id", ""));
            intent.putExtra("service_type", b.optString("service_type", ""));
            intent.putExtra("customer_name", b.optString("cust_name", ""));
            intent.putExtra("community", b.optString("community", ""));
            intent.putExtra("flat_no", b.optString("flat_no", ""));
            intent.putExtra("price_inr", b.optInt("price_inr", 0));

            ctx.startService(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Show overlay error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void hideOverlay(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent intent = new Intent(ctx, BookingOverlayService.class);
            intent.putExtra("mode", "hide");
            ctx.startService(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Hide overlay error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        Log.d(TAG, "🟢 openOverlaySettings entered");
        boolean opened = launchOverlaySettings();
        if (opened) {
            call.resolve(new JSObject().put("opened", true).put("manufacturer", Build.MANUFACTURER));
        } else {
            call.reject("Could not open overlay settings on this device");
        }
    }
}
