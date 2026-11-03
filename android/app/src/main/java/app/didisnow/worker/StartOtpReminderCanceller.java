package app.didisnow.worker;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import com.capacitorjs.plugins.localnotifications.TimedNotificationPublisher;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Handles data-only FCM {type: START_OTP_REMINDER_CANCEL, booking_id, worker_uid}.
 * Cancels ONLY scheduled Start OTP reminders whose extra.kind == start_otp_reminder
 * AND extra.bookingId == booking_id. Idempotent: a repeat finds nothing to cancel.
 * Never touches bookings, OTP, dispatch or any other notification.
 */
public final class StartOtpReminderCanceller {
  private static final String STORE = "NOTIFICATION_STORE"; // Capacitor LocalNotifications store
  private static final String KIND = "start_otp_reminder";

  private StartOtpReminderCanceller() {}

  /** @return number of reminders cancelled (0 when wrong worker or nothing pending). */
  public static int cancel(Context ctx, String bookingId, String workerUid) {
    if (bookingId == null || bookingId.isEmpty()) return 0;
    try {
      String local = BackendSync.INSTANCE.resolveWorkerId(ctx);
      if (workerUid != null && local != null && !workerUid.equals(local)) return 0;
    } catch (Exception ignored) { /* unknown local worker: booking-scoped cancel is still safe */ }

    SharedPreferences store = ctx.getSharedPreferences(STORE, Context.MODE_PRIVATE);
    List<Integer> ids = new ArrayList<>();
    for (Map.Entry<String, ?> e : store.getAll().entrySet()) {
      try {
        JSONObject n = new JSONObject(String.valueOf(e.getValue()));
        JSONObject extra = n.optJSONObject("extra");
        if (extra != null && KIND.equals(extra.optString("kind")) && bookingId.equals(extra.optString("bookingId"))) {
          ids.add(Integer.parseInt(e.getKey()));
        }
      } catch (Exception ignored) { /* skip unrelated/unparseable entries */ }
    }
    if (ids.isEmpty()) return 0;

    AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
    int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0;
    SharedPreferences.Editor ed = store.edit();
    NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
    for (Integer id : ids) {
      PendingIntent pi = PendingIntent.getBroadcast(ctx, id, new Intent(ctx, TimedNotificationPublisher.class), flags);
      if (pi != null && am != null) am.cancel(pi);
      ed.remove(String.valueOf(id)); // so boot-restore cannot bring it back
      nm.cancel(id);                 // remove one already showing
    }
    ed.apply();
    WorkerLog.INSTANCE.add(ctx, "START_OTP_REMINDER", "cancelled=" + ids.size());
    return ids.size();
  }
}
