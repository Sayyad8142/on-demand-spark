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
}