package app.didisnow.worker;

import org.junit.Test;
import static org.junit.Assert.*;

/** JVM tests of the actual native rules; not Android audio/device verification. */
public class StartOtpAlarmRulesTest {
    private static final long ACCEPTED = 1000L;
    @Test public void firstAlarmAtTenMinutesNotBefore() {
        assertFalse(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 599999, false));
        assertTrue(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 600000, false));
    }
    @Test public void secondAlarmAtFifteenMinutes() {
        assertEquals(1, StartOtpAlarmRules.phase(ACCEPTED, ACCEPTED + 899999));
        assertEquals(2, StartOtpAlarmRules.phase(ACCEPTED, ACCEPTED + 900000));
        assertTrue(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 900000, false));
    }
    @Test public void twentyMinutesLoopsEvenAfterEarlierPlayback() {
        assertEquals(2, StartOtpAlarmRules.phase(ACCEPTED, ACCEPTED + 1199999));
        assertEquals(3, StartOtpAlarmRules.phase(ACCEPTED, ACCEPTED + 1200000));
        assertTrue(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 1200000, true));
    }
    @Test public void failedFinitePlaybackCanRetryWithoutDuplicatingSuccess() {
        assertTrue(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 630000, false));
        assertFalse(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 630000, true));
    }
    @Test public void lateReopenDoesNotReplayMissedFiniteAlarms() {
        assertTrue(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 690000, false));
        assertFalse(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 690001, false));
        assertFalse(StartOtpAlarmRules.shouldPlay(ACCEPTED, ACCEPTED + 990001, false));
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