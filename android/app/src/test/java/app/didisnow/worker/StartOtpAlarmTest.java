package app.didisnow.worker;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.SystemClock;
import org.robolectric.RuntimeEnvironment;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.json.*;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class StartOtpAlarmTest {
    private Context c;
    private SharedPreferences p;
    @Before public void setup() {
        c = RuntimeEnvironment.getApplication();
        StartOtpAlarmEngine.INSTANCE.stopAll(c);
        p = c.getSharedPreferences("start_otp_alarm_v2", Context.MODE_PRIVATE);
    }
    @Test public void tenMinuteFirstClip() { assertEquals(0, StartOtpAlarmRules.phase(1000,600999)); assertEquals(1,StartOtpAlarmRules.phase(1000,601000)); }
    @Test public void fifteenMinuteSecondClip() { assertEquals(2,StartOtpAlarmRules.phase(1000,901000)); }
    @Test public void twentyMinuteContinuous() { assertEquals(3,StartOtpAlarmRules.phase(1000,1201000)); }
    @Test public void noTwoHourCutoff() { assertEquals(3,StartOtpAlarmRules.phase(1000,8*3600000L)); }
    @Test public void serverStartStops() { assertFalse(StartOtpAlarmRules.eligible("accepted",true,true,"w","w")); }
    @Test public void wrongOtpDoesNotStop() { assertTrue(StartOtpAlarmRules.eligible("accepted",true,false,"w","w")); }
    @Test public void endedStatesStop() { for(String status:new String[]{"cancelled","completed","expired","closed"}) assertFalse(StartOtpAlarmRules.eligible(status,true,false,"w","w")); }
    @Test public void reassignmentStops() { assertFalse(StartOtpAlarmRules.eligible("accepted",true,false,"other","w")); }
    @Test public void cancellationRemovesOnlyItsBookingAndRetiresIt() throws Exception {
        p.edit().putString("rows",new JSONArray().put(new JSONObject().put("id","b1")).put(new JSONObject().put("id","b2")).toString()).commit();
        StartOtpAlarmEngine.INSTANCE.cancel(c,"b1");
        JSONArray rows=new JSONArray(p.getString("rows","[]"));
        assertEquals(1,rows.length()); assertEquals("b2",rows.getJSONObject(0).getString("id"));
        assertTrue(p.getStringSet("stopped",java.util.Collections.emptySet()).contains("b1"));
    }
    @Test public void logoutClearsAllDurableState() {
        StartOtpAlarmEngine.INSTANCE.configure(c,"u1",1); p.edit().putString("rows","[{\"id\":\"b\"}]").commit();
        StartOtpAlarmEngine.INSTANCE.stopAll(c); assertTrue(p.getAll().isEmpty());
    }
    @Test public void accountSwitchClearsOldBookings() {
        StartOtpAlarmEngine.INSTANCE.configure(c,"u1",1); p.edit().putString("rows","[{\"id\":\"b\"}]").commit();
        StartOtpAlarmEngine.INSTANCE.configure(c,"u2",2);
        assertEquals("u2",p.getString("user","")); assertEquals("[]",p.getString("rows","[]"));
    }
    @Test public void bootInvalidatesOldServerClockInsteadOfReplaying() {
        p.edit().putLong("server",123456).putLong("elapsed",SystemClock.elapsedRealtime()).commit();
        StartOtpAlarmEngine.INSTANCE.boot(c); assertEquals(0,StartOtpAlarmEngine.INSTANCE.serverNow(c));
    }
    @Test public void missedFiniteClipsAreNotQueued() { assertEquals(1201000,StartOtpAlarmRules.nextAt(1000,1001000)); }
    @Test public void offlineSilenceIsFiveMinutesNotAStop() {
        p.edit().putLong("server",1000000).putLong("elapsed",SystemClock.elapsedRealtime()).putString("rows","[{\"id\":\"b\"}]").commit();
        StartOtpAlarmEngine.INSTANCE.silence(c);
        assertEquals(1300000,p.getLong("silenceUntil",0)); assertEquals("[{\"id\":\"b\"}]",p.getString("rows",""));
    }
    @Test public void queuedPlaybackCannotRestartAfterCancellation() {
        p.edit().putLong("server",601000).putLong("elapsed",SystemClock.elapsedRealtime())
            .putString("rows","[{\"id\":\"b\",\"acceptedMs\":1000}]").commit();
        assertTrue(StartOtpAlarmEngine.INSTANCE.playbackAllowed(c,"b","b:1000:1"));
        StartOtpAlarmEngine.INSTANCE.cancel(c,"b");
        assertFalse(StartOtpAlarmEngine.INSTANCE.playbackAllowed(c,"b","b:1000:1"));
    }
    @Test public void signedOutReconcileReleasesReceiverImmediately() {
        java.util.concurrent.atomic.AtomicInteger released = new java.util.concurrent.atomic.AtomicInteger();
        StartOtpAlarmEngine.INSTANCE.reconcile(c,false,() -> { released.incrementAndGet(); return kotlin.Unit.INSTANCE; });
        assertEquals(1,released.get());
    }
    @Test public void cancellationWithoutServerClockDoesNotLeavePendingNotification() {
        p.edit().putString("rows","[{\"id\":\"b\"}]").commit();
        StartOtpAlarmEngine.INSTANCE.fallback(c);
        StartOtpAlarmEngine.INSTANCE.cancel(c,"b");
        org.robolectric.shadows.ShadowLooper.idleMainLooper();
        android.app.NotificationManager manager = (android.app.NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        assertEquals(0,org.robolectric.Shadows.shadowOf(manager).getAllNotifications().size());
    }
    @Test public void failedPlayerIsReleasedEvenWhenStopThrows() throws Exception {
        android.media.MediaPlayer mp = new android.media.MediaPlayer() {
            @Override public void stop() { throw new IllegalStateException("prepare failed"); }
        };
        StartOtpAlarmService service = new StartOtpAlarmService();
        java.lang.reflect.Field player = StartOtpAlarmService.class.getDeclaredField("player");
        player.setAccessible(true); player.set(service,mp);
        java.lang.reflect.Method stop = StartOtpAlarmService.class.getDeclaredMethod("stopAudio");
        stop.setAccessible(true); stop.invoke(service);
        assertNull(player.get(service));
        assertEquals(org.robolectric.shadows.ShadowMediaPlayer.State.END,org.robolectric.Shadows.shadowOf(mp).getState());
    }
    @Test public void alreadyRunningCompletionSpeechYieldsButCancellationSpeechIsPreserved() throws Exception {
        CancellationVoicePlugin plugin = new CancellationVoicePlugin();
        java.lang.reflect.Field active = CancellationVoicePlugin.class.getDeclaredField("activePlugin");
        java.lang.reflect.Field speaking = CancellationVoicePlugin.class.getDeclaredField("speaking");
        java.lang.reflect.Field phrase = CancellationVoicePlugin.class.getDeclaredField("phrase");
        active.setAccessible(true); speaking.setAccessible(true); phrase.setAccessible(true);
        Object previous = active.get(null);
        try {
            active.set(null,plugin); speaking.set(plugin,true); phrase.set(plugin,"OTP, OTP, please enter OTP.");
            CancellationVoicePlugin.yieldOtpSpeechToStartAlarm();
            assertFalse(speaking.getBoolean(plugin));
            speaking.set(plugin,true); phrase.set(plugin,"Booking cancelled. Booking cancelled.");
            CancellationVoicePlugin.yieldOtpSpeechToStartAlarm();
            assertTrue(speaking.getBoolean(plugin));
        } finally { active.set(null,previous); }
    }
    @Test public void audioErrorDoesNotRetainSuccessfulPlaybackMarker() {
        p.edit().putLong("server",601000).putLong("elapsed",SystemClock.elapsedRealtime())
            .putString("rows","[{\"id\":\"b\",\"acceptedMs\":1000}]").putString("played","b:1000:1").commit();
        StartOtpAlarmEngine.INSTANCE.playbackFailed(c,"b:1000:1");
        assertFalse(p.contains("played"));
        assertTrue(StartOtpAlarmEngine.INSTANCE.playbackAllowed(c,"b","b:1000:1"));
    }
    @Test public void normalCancellationPushRetiresAlarmWithoutWebView() throws Exception {
        p.edit().putString("rows","[{\"id\":\"b1\"},{\"id\":\"b2\"}]").commit();
        MyFirebaseService service = org.robolectric.Robolectric.buildService(MyFirebaseService.class).create().get();
        java.lang.reflect.Method ended = MyFirebaseService.class.getDeclaredMethod("releaseEndedBooking",String.class);
        ended.setAccessible(true);
        ended.invoke(service,"b1");
        JSONArray remaining = new JSONArray(p.getString("rows","[]"));
        assertEquals(1,remaining.length());
        assertEquals("b2",remaining.getJSONObject(0).getString("id"));
        assertTrue(p.getStringSet("stopped",java.util.Collections.emptySet()).contains("b1"));
    }
}