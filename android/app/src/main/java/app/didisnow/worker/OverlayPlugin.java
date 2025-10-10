package app.didisnow.worker;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PluginMethod;

import org.json.JSONObject;

@CapacitorPlugin(name = "OverlayPlugin")
public class OverlayPlugin extends Plugin {

    @PluginMethod
    public void requestPermission(PluginCall call) {
        try {
            if (getActivity() == null) {
                call.reject("Activity not available");
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
                    !Settings.canDrawOverlays(getActivity())) {
                Intent intent = new Intent(
                        Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getActivity().getPackageName())
                );
                getActivity().startActivity(intent);
                JSObject ret = new JSObject().put("granted", false);
                call.resolve(ret);
            } else {
                JSObject ret = new JSObject().put("granted", true);
                call.resolve(ret);
            }
        } catch (Exception e) {
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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
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

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
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
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Hide overlay error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        try {
            if (getActivity() == null) {
                call.reject("Activity not available");
                return;
            }
            Intent intent = new Intent(
                    Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                    Uri.parse("package:" + getActivity().getPackageName())
            );
            getActivity().startActivity(intent);
            JSObject ret = new JSObject().put("opened", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Open settings error: " + e.getMessage());
        }
    }
}
