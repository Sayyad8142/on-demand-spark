package app.didisnow.worker;
import org.junit.Test;
import static org.junit.Assert.*;
public class OfferAcceptanceContractTest {
    private static final String ID = "11111111-1111-4111-8111-111111111111";
    private static long d(String generation, String status, String favorite, String offer, Boolean actionable) {
        return OfferAcceptanceContract.favoriteDeadline("favorite-v1", "b1", "b1", ID, ID,
            generation, status, favorite, offer, actionable, 1060, 1030, 5000);
    }
    @Test public void canonicalEndpointsStayUnactivated() {
        assertEquals("try_accept_booking", OfferAcceptanceContract.rpc());
        assertEquals("get_my_offer_status", OfferAcceptanceContract.STATUS_RPC);
        assertFalse(OfferAcceptanceContract.FAVORITE_V1_STATUS_ENABLED);
    }
    @Test public void uuidGenerationPreservesServerClockCorrection() {
        assertEquals(5030, d(ID, "pending", "holding", "holding", true));
        assertEquals(5030, d(ID, "pending", null, "holding", true));
    }
    @Test public void generationIsNeverInventedOrNumeric() {
        assertNull(OfferAcceptanceContract.uuidOrNull(1));
        assertNull(OfferAcceptanceContract.generationOrNull(null, ID));
        assertNull(OfferAcceptanceContract.generationOrNull("1", ID));
        assertNull(OfferAcceptanceContract.generationOrNull("22222222-2222-4222-8222-222222222222", ID));
        assertEquals(ID, OfferAcceptanceContract.generationOrNull(ID, ID));
        assertEquals(0, d(null, "pending", "holding", "holding", true));
    }
    @Test public void deliveryAndUnknownStatesNeverAuthorize() {
        for (String status : new String[]{"sent", "queued", "accepted", "unknown"}) assertEquals(0, d(ID, status, "holding", "holding", true));
        for (String favorite : new String[]{"preparing", "fallback_pending", "accepted", "cancelled", "unknown"}) assertEquals(0, d(ID, "pending", favorite, "holding", true));
        for (String offer : new String[]{"accepted", "closed", "unknown"}) assertEquals(0, d(ID, "pending", null, offer, true));
        assertEquals(5030, d(ID, "pending", "fallback", "holding", true));
    }
    @Test public void expiredOfferAndNonActionableAreRefused() {
        assertEquals(0, d(ID, "pending", "holding", "holding", false));
        assertEquals(0, OfferAcceptanceContract.favoriteDeadline("favorite-v1", "b1", "b1", ID, ID, ID, "pending", "holding", "holding", true, 1030, 1030, 5000));
    }
    @Test public void repeatedWinnerDoesNotReplayEffects() {
        assertFalse(OfferAcceptanceContract.newAcceptanceEffects(true, true));
        assertTrue(OfferAcceptanceContract.newAcceptanceEffects(true, false));
        assertTrue(OfferAcceptanceContract.newAcceptanceEffects(true, "true"));
        assertFalse(OfferAcceptanceContract.newAcceptanceEffects(false, false));
    }
    @Test public void oldClosureCannotRetireNewServerGeneration() {
        assertFalse(OfferAcceptRules.closureApplies(1120, 1060));
        assertTrue(OfferAcceptRules.closureApplies(1060, 1060));
        assertFalse(OfferAcceptRules.closureApplies(1060, 0));
    }
}
