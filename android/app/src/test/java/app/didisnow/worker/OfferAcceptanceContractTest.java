package app.didisnow.worker;
import org.junit.Test;
import static org.junit.Assert.*;
public class OfferAcceptanceContractTest {
    @Test public void everyNativePathUsesTheExistingAcceptEndpoint() {
        assertEquals("try_accept_booking", OfferAcceptanceContract.rpc());
        assertEquals("try_accept_booking", OfferAcceptanceContract.ACCEPT_RPC);
        assertFalse(OfferAcceptanceContract.FAVORITE_V1_STATUS_ENABLED);
    }
    private static long d(String v, String b, String r, long g, String s, Boolean a, long exp, long srv, long now) {
        return OfferAcceptanceContract.favoriteDeadline(v, b, "b1", r, "r1", g, s, a, exp, srv, now);
    }
    @Test public void favoriteV1UsesRemainingServerTimeAgainstPhoneClock() {
        assertEquals(5030, d("favorite-v1", "b1", "r1", 1, "sent", true, 1060, 1030, 5000));
    }
    @Test public void favoriteV1RefusesInvalidMismatchedOrClosedAnswers() {
        assertEquals(0, d("favorite-v2", "b1", "r1", 1, "sent", true, 1060, 1030, 5000));
        assertEquals(0, d("favorite-v1", "b2", "r1", 1, "sent", true, 1060, 1030, 5000));
        assertEquals(0, d("favorite-v1", "b1", "r2", 1, "sent", true, 1060, 1030, 5000));
        assertEquals(0, d("favorite-v1", "b1", "r1", 0, "sent", true, 1060, 1030, 5000));
        assertEquals(0, d("favorite-v1", "b1", "r1", 1, "open", true, 1060, 1030, 5000));
        assertEquals(0, d("favorite-v1", "b1", "r1", 1, "sent", null, 1060, 1030, 5000));
        assertEquals(0, d("favorite-v1", "b1", "r1", 1, "sent", false, 1060, 1030, 5000));
        assertEquals(0, d("favorite-v1", "b1", "r1", 1, "accepted", true, 1060, 1030, 5000));
        assertEquals(0, d("favorite-v1", "b1", "r1", 1, "sent", true, 1030, 1030, 5000));
    }
    @Test public void oldClosureCannotRetireNewServerGeneration() {
        assertFalse(OfferAcceptRules.closureApplies(1120, 1060));
        assertTrue(OfferAcceptRules.closureApplies(1060, 1060));
        assertFalse(OfferAcceptRules.closureApplies(1060, 0));
    }
}
