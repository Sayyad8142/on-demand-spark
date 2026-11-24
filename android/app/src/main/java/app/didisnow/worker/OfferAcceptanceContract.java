package app.didisnow.worker;

/** Staged until Admin grants and certifies the strict worker endpoint. No fallback. */
public final class OfferAcceptanceContract {
    private OfferAcceptanceContract() {}
    public static final boolean SECURE_ENABLED = false;
    public static String rpc() { return rpc(SECURE_ENABLED); }
    public static String rpc(boolean secure) { return secure ? "accept_booking" : "try_accept_booking"; }
}