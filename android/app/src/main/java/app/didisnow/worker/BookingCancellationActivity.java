package app.didisnow.worker;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

public class BookingCancellationActivity extends Activity {

  private MediaPlayer mediaPlayer;
  private Vibrator vibrator;
  private final Handler handler = new Handler(Looper.getMainLooper());
  private final Runnable timeoutClose = this::finish;

  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    getWindow().addFlags(
      WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
      WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
      WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
    );

    LinearLayout root = new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setGravity(Gravity.CENTER);
    root.setPadding(48, 48, 48, 48);
    root.setBackgroundColor(Color.rgb(244, 67, 54));

    // White circle with red cancellation symbol
    LinearLayout iconContainer = new LinearLayout(this);
    iconContainer.setOrientation(LinearLayout.VERTICAL);
    iconContainer.setGravity(Gravity.CENTER);
    iconContainer.setBackgroundResource(R.drawable.circle_white_bg);
    int iconSize = (int) (96 * getResources().getDisplayMetrics().density);
    int iconPadding = (int) (20 * getResources().getDisplayMetrics().density);
    ImageView icon = new ImageView(this);
    icon.setImageResource(R.drawable.ic_cancel_white);
    icon.setScaleType(ImageView.ScaleType.FIT_CENTER);
    icon.setPadding(iconPadding, iconPadding, iconPadding, iconPadding);
    iconContainer.addView(icon, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(iconSize, iconSize);
    iconParams.setMargins(0, 0, 0, 32);
    root.addView(iconContainer, iconParams);


    TextView title = new TextView(this);
    title.setText("Booking Cancelled");
    title.setGravity(Gravity.CENTER);
    title.setTextColor(Color.WHITE);
    title.setTextSize(32);
    title.setTypeface(Typeface.DEFAULT_BOLD);
    title.setPadding(0, 0, 0, 12);
    root.addView(title, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    TextView body = new TextView(this);
    body.setText("Do not go to the flat");
    body.setGravity(Gravity.CENTER);
    body.setTextColor(Color.WHITE);
    body.setTextSize(24);
    body.setTypeface(Typeface.DEFAULT_BOLD);
    body.setPadding(0, 0, 0, 48);
    root.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    // Big OK button with icon and text
    Button ok = new Button(this);
    ok.setText("  OK  ");
    ok.setTextSize(22);
    ok.setTextColor(Color.rgb(244, 67, 54));
    ok.setTypeface(Typeface.DEFAULT_BOLD);
    ok.setAllCaps(false);
    ok.setBackgroundResource(R.drawable.btn_cancel_ok);
    ok.setCompoundDrawablesWithIntrinsicBounds(R.drawable.ic_check_red, 0, 0, 0);

    ok.setPadding(32, 28, 32, 28);
    ok.setOnClickListener(v -> finish());
    LinearLayout.LayoutParams okParams = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    okParams.setMargins(0, 16, 0, 0);
    root.addView(ok, okParams);

    setContentView(root);
    startSoundAndVibration();
    handler.postDelayed(timeoutClose, 45000);
  }

  private void startSoundAndVibration() {
    try {
      mediaPlayer = MediaPlayer.create(this, R.raw.booking_cancellation_voice);
      if (mediaPlayer != null) {
        mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_ALARM)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
          .build());
        mediaPlayer.setLooping(true);
        mediaPlayer.start();
      }
    } catch (Exception ignored) {}

    try {
      vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
      if (vibrator != null) {
        long[] pattern = new long[]{0, 700, 200, 700, 200, 1000};
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
          vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
        } else {
          vibrator.vibrate(pattern, 0);
        }
      }
    } catch (Exception ignored) {}
  }

  private void stopSoundAndVibration() {
    handler.removeCallbacks(timeoutClose);
    try {
      if (mediaPlayer != null) {
        mediaPlayer.stop();
        mediaPlayer.release();
        mediaPlayer = null;
      }
    } catch (Exception ignored) {}
    try {
      if (vibrator != null) vibrator.cancel();
    } catch (Exception ignored) {}
  }

  @Override
  protected void onDestroy() {
    stopSoundAndVibration();
    super.onDestroy();
  }
}

