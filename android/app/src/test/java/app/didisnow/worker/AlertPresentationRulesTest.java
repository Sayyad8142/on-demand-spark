package app.didisnow.worker;

import org.junit.Test;
import static org.junit.Assert.*;

public class AlertPresentationRulesTest {
    @Test public void realExpiryWinsOverFreshSixtySeconds() {
        assertEquals(11, AlertPresentationRules.remaining(AlertPresentationRules.deadline(1011, 1000, 60, 1000), 1000));
    }
    @Test public void expiredOffersStayAtZeroNotFive() {
        assertEquals(0, AlertPresentationRules.remaining(1000, 1001));
    }
    @Test public void lastSecondIsNotExtended() {
        assertEquals(1, AlertPresentationRules.remaining(1001, 1000));
    }
    @Test public void sleepingOrDelayedTimerDoesNotDrift() {
        assertEquals(0, AlertPresentationRules.remaining(1060, 1068));
    }
    @Test public void sentTimeKeepsOriginalDeadline() {
        assertEquals(1060, AlertPresentationRules.deadline(0, 1000, 60, 1049));
    }
    @Test public void foregroundWithoutOverlayCanOpenActivity() {
        assertTrue(AlertPresentationRules.mayOpenActivity(true, false));
    }
    @Test public void backgroundAndLockedUseTrayOnly() {
        assertFalse(AlertPresentationRules.mayOpenActivity(false, false));
        assertFalse(AlertPresentationRules.mayOpenActivity(true, true));
    }
    @Test public void invisibleOrClosingPopupNeverAcknowledges() {
        assertFalse(AlertPresentationRules.mayAcknowledge(true, false, true, false, 11));
        assertFalse(AlertPresentationRules.mayAcknowledge(true, true, false, false, 11));
        assertFalse(AlertPresentationRules.mayAcknowledge(false, true, true, false, 11));
        assertFalse(AlertPresentationRules.mayAcknowledge(true, true, true, true, 11));
        assertFalse(AlertPresentationRules.mayAcknowledge(true, true, true, false, 0));
        assertTrue(AlertPresentationRules.mayAcknowledge(true, true, true, false, 11));
    }
}