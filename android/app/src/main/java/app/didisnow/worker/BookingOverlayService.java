package app.didisnow.worker;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.TextView;
import androidx.core.app.NotificationCompat;

public class BookingOverlayService extends Service {
    private WindowManager windowManager;
    private View overlayView;
    private static final String CHANNEL_ID = "overlay_channel";
    private static final int NOTIFICATION_ID = 1001;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Check overlay permission first
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            Log.e("BookingOverlayService", "❌ Missing overlay permission. Cannot draw.");
            stopSelf();
            return START_NOT_STICKY;
        }
        
        createNotificationChannel();
        
        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Didi Now")
                .setContentText("Booking alert active")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
        
        startForeground(NOTIFICATION_ID, notification);

        String bookingId = intent != null ? intent.getStringExtra("bookingId") : "";
        String title = intent != null ? intent.getStringExtra("title") : "New Booking";
        String body = intent != null ? intent.getStringExtra("body") : "Tap to view";

        showOverlay(title, body, bookingId);
        return START_NOT_STICKY;
    }

    private void showOverlay(String title, String body, String bookingId) {
        if (overlayView != null) return;
        
        windowManager = (WindowManager) getSystemService(WINDOW_SERVICE);

        int type = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.MATCH_PARENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                type,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                        | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                        | WindowManager.LayoutParams.FLAG_WATCH_OUTSIDE_TOUCH,
                PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP;

        LayoutInflater inflater = LayoutInflater.from(this);
        overlayView = inflater.inflate(R.layout.overlay_booking, null);

        TextView txtTitle = overlayView.findViewById(R.id.txt_title);
        TextView txtBody = overlayView.findViewById(R.id.txt_body);
        Button btnAccept = overlayView.findViewById(R.id.btn_accept);
        Button btnReject = overlayView.findViewById(R.id.btn_reject);

        txtTitle.setText(title);
        txtBody.setText(body);

        btnAccept.setOnClickListener(v -> {
            String uri = "didinow://accept?bookingId=" + bookingId;
            Intent mainIntent = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(uri));
            mainIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(mainIntent);
            stopSelf();
        });

        btnReject.setOnClickListener(v -> {
            stopSelf();
        });

        windowManager.addView(overlayView, params);
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (overlayView != null && windowManager != null) {
            windowManager.removeView(overlayView);
            overlayView = null;
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Overlay Service",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps booking overlay active");
            
            NotificationManager notificationManager = getSystemService(NotificationManager.class);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }
}
