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
}