package app.didisnow.worker;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

@CapacitorPlugin(name = "OverlayPlugin")
public class OverlayPlugin extends Plugin {

    private static final String TAG = "OverlayPlugin";

    private boolean startSettingsIntent(Intent intent, String label) {
        Context ctx = getActivity() != null ? getActivity() : getContext();
        if (ctx == null) {
            Log.e(TAG, "❌ No context available for " + label);
            return false;
        }

        // NOTE: resolveActivity() pre-check removed — on Android 11+ with package
        // visibility restrictions, it can return null even when the Settings
        // activity is available. We now attempt startActivity() directly and
        // rely on try/catch to handle real failures.
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            if (getActivity() != null) {
                getActivity().startActivity(intent);
            } else {
                ctx.startActivity(intent);
            }
            Log.d(TAG, "✅ Started " + label);
            return true;
        } catch (android.content.ActivityNotFoundException e) {
            Log.w(TAG, "⚠️ ActivityNotFound for " + label + ": " + e.getMessage());
            return false;
        } catch (Exception e) {
            Log.w(TAG, "⚠️ Failed to start " + label + ": " + e.getMessage());
            return false;
        }
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

        Intent perPackageIntent = new Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:" + pkg)
        );
        perPackageIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (startSettingsIntent(perPackageIntent, "per-package ACTION_MANAGE_OVERLAY_PERMISSION")) {
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
