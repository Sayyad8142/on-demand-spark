package app.didisnow.worker;

import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

/** Runs the production persisted queue, never sends a push or accepts a real booking. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28, manifest = Config.NONE)
public class RepeatBookingQueueTest {
    private Context ctx;
    private final OfferQueue queue = OfferQueue.INSTANCE;

    @Before public void reset() {
        ctx = RuntimeEnvironment.getApplication();
        ctx.getSharedPreferences("booking_offer_queue", Context.MODE_PRIVATE).edit().clear().commit();
    }

    private JSONObject offer(String booking, String request, long seconds) {
        Intent intent = new Intent().putExtra("booking_id", booking)
            .putExtra("booking_request_id", request)
            .putExtra("expires_at", System.currentTimeMillis() / 1000 + seconds);
        return queue.offerFromIntent(intent);
    }

    @Test public void acceptCancelThenSecondOfferIsNotBusyOrDuplicate() {
        JSONObject first = offer("first", "request-1", 60);
        assertTrue(queue.enqueue(ctx, first));
        queue.setActive(ctx, first);
        queue.markAcceptedByMe(ctx, "first");
        queue.markLocallyBusy(ctx);
        queue.clearAll(ctx, "worker_accepted");
        assertTrue(queue.isLocallyBusy(ctx));
        queue.releaseEndedBooking(ctx, "first");
        assertFalse(queue.isLocallyBusy(ctx));
        assertFalse(queue.isAcceptedByMe(ctx, "first"));
        JSONObject second = offer("e11e9242", "request-2", 60);
        assertTrue(queue.enqueue(ctx, second));
        assertEquals("e11e9242", queue.bookingIdOf(queue.nextValid(ctx)));
    }

    private void retireFirstThenSecond(String reason) {
        JSONObject first = offer("first", "request-1", 60);
        JSONObject second = offer("second", "request-2", 60);
        assertTrue(queue.enqueue(ctx, first));
        queue.setActive(ctx, first);
        assertTrue(queue.enqueue(ctx, second));
        queue.remove(ctx, "first", "request-1");
        queue.setActive(ctx, null);
        assertFalse(reason, queue.isLocallyBusy(ctx));
        assertEquals("second", queue.bookingIdOf(queue.nextValid(ctx)));
    }

    @Test public void rejectThenSecondOffer() { retireFirstThenSecond("reject"); }
    @Test public void timeoutThenSecondOffer() { retireFirstThenSecond("timeout"); }
    @Test public void dismissedThenSecondOffer() { retireFirstThenSecond("dismissed"); }

    @Test public void duplicateSameOfferIsNotQueuedTwice() {
        assertTrue(queue.enqueue(ctx, offer("first", "request-1", 60)));
        assertFalse(queue.enqueue(ctx, offer("first", "request-1", 60)));
    }

    @Test public void expiredOfferIsNeverActionable() {
        assertTrue(queue.isExpired(offer("expired", "request-expired", -1)));
        assertFalse(queue.isExpired(offer("valid", "request-valid", 60)));
    }

    @Test public void oldCancellationDoesNotReleaseSecondAcceptedBooking() {
        queue.markAcceptedByMe(ctx, "second");
        queue.markLocallyBusy(ctx);
        queue.releaseEndedBooking(ctx, "first");
        assertTrue(queue.isLocallyBusy(ctx));
        assertTrue(queue.isAcceptedByMe(ctx, "second"));
    }

    @Test public void cancellationDoesNotDeleteSecondVisibleOffer() {
        JSONObject second = offer("second", "request-2", 60);
        queue.enqueue(ctx, second);
        queue.setActive(ctx, second);
        queue.releaseEndedBooking(ctx, "first");
        assertTrue(queue.contains(ctx, "second"));
        assertEquals("req:request-2", ctx.getSharedPreferences("booking_offer_queue", Context.MODE_PRIVATE).getString("active_key", null));
    }

    @Test public void cancellationReleasesOnlyMatchingAcceptanceClaim() {
        assertTrue(queue.beginAcceptance(ctx, "second"));
        queue.releaseEndedBooking(ctx, "first");
        assertTrue(queue.isAcceptInFlight(ctx, "second"));
        queue.releaseEndedBooking(ctx, "second");
        assertFalse(queue.isAcceptInFlight(ctx, "second"));
    }
}