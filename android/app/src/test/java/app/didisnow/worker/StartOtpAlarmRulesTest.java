package app.didisnow.worker;

import org.junit.Test;
import static org.junit.Assert.*;

/** JVM tests of the actual native rules; not Android audio/device verification. */
public class StartOtpAlarmRulesTest {
    private static final long ACCEPTED = 1000L;
    @Test public void onlyCompletionOtpSpeechYieldsNotCancellationVoice() {
        assertTrue(StartOtpAlarmRules.shouldYieldSpeech("OTP, OTP, please enter OTP."));
        assertFalse(StartOtpAlarmRules.shouldYieldSpeech("Booking cancelled. Booking cancelled."));
        assertFalse(StartOtpAlarmRules.shouldYieldSpeech(null));
    }
    @Test public void firstAlarmAtTenMinutesNotBefore() {
        assertFalse(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 599999, false));
        assertTrue(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 600000, false));
    }
    @Test public void continuousAtFifteenMinutes() {
        assertEquals(1, StartOtpAlarmRules.phase(ACCEPTED, ACCEPTED + 899999));
        assertEquals(3, StartOtpAlarmRules.phase(ACCEPTED, ACCEPTED + 900000));
        assertTrue(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 900000, true));
    }
    @Test public void noTwentyMinuteTrigger() {
        assertEquals(ACCEPTED + 900000, StartOtpAlarmRules.nextAt(ACCEPTED, ACCEPTED + 600001));
        assertEquals(ACCEPTED + 1200000, StartOtpAlarmRules.nextAt(ACCEPTED, ACCEPTED + 1200000));
        assertEquals(3, StartOtpAlarmRules.phase(ACCEPTED, ACCEPTED + 1200000));
    }
    @Test public void failedFinitePlaybackCanRetryWithoutDuplicatingSuccess() {
        assertTrue(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 630000, false));
        assertFalse(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 630000, true));
    }
    @Test public void lateReopenDoesNotReplayMissedFiniteAlarms() {
        assertTrue(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 690000, false));
        assertFalse(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 690001, false));
        assertTrue(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 990001, false)); // past 15 min: continuous, not a replayed clip
        assertTrue(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 3600000, true));
    }
    @Test public void serverVerificationStopsButWrongOtpDoesNot() {
        assertFalse(StartOtpAlarmRules.eligible("accepted", true, true, "w", "w"));
        assertTrue(StartOtpAlarmRules.eligible("accepted", true, false, "w", "w"));
    }
    @Test public void cancellationStopsEligibility() {
        assertFalse(StartOtpAlarmRules.eligible("cancelled", true, false, "w", "w"));
    }
    @Test public void anchorsOnServerDeadlineForInstantAndScheduled() throws Exception {
        String json = "{\"deadline_rule_version\":2,\"bookings\":["
            + "{\"booking_id\":\"i\",\"deadline_at\":\"2026-11-25T03:10:00+00:00\",\"deadline_minutes\":10,\"deadline_basis\":\"accepted_at\"},"
            + "{\"booking_id\":\"early\",\"deadline_at\":\"2026-11-25T03:40:00.123456+00:00\",\"deadline_minutes\":10,\"deadline_basis\":\"scheduled_start\"},"
            + "{\"booking_id\":\"late\",\"deadline_at\":\"2026-11-25T04:05:00Z\",\"deadline_minutes\":10,\"deadline_basis\":\"accepted_at\"},"
            + "{\"booking_id\":\"missing\",\"deadline_at\":null,\"deadline_minutes\":10,\"deadline_basis\":\"unmeasurable_missing_schedule\"}]}";
        java.util.Map<String, Long> m = StartOtpAlarmRules.parseDeadlines(json);
        long start = 1795577400000L; // 2026-11-25T03:30:00Z (scheduled start)
        assertEquals(Long.valueOf(start - 1800000L), m.get("i"));
        assertEquals(Long.valueOf(start + 123L), m.get("early"));
        assertEquals(Long.valueOf(start + 1500000L), m.get("late"));
        assertFalse(m.containsKey("missing"));
        // Early-accepted scheduled booking: silent until start + 10, continuous from start + 15.
        assertEquals(0, StartOtpAlarmRules.phase(m.get("early"), start + 599000L));
        assertEquals(1, StartOtpAlarmRules.phase(m.get("early"), start + 600200L));
        assertEquals(3, StartOtpAlarmRules.phase(m.get("early"), start + 900200L));
    }
    @Test(expected = org.json.JSONException.class) public void oldDeadlineRuleIsRejected() throws Exception {
        StartOtpAlarmRules.parseDeadlines("{\"deadline_rule_version\":1,\"bookings\":[]}");
    }
}
