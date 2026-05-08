import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Check,
  Loader2,
  AlertCircle,
  PartyPopper,
  ArrowLeft,
  KeyRound,
  Home,
  Sparkles,
  RefreshCw,
  Phone,
  HelpCircle,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface PayoutSummary {
  payout_amount: number;
  platform_fee: number;
  gross_amount: number;
  status: string;
}

// Lightweight haptics using navigator.vibrate (works in Capacitor WebView on Android)
const haptic = {
  success: () => {
    try { navigator.vibrate?.([30]); } catch {}
  },
  error: () => {
    try { navigator.vibrate?.([60, 50, 60]); } catch {}
  },
};

// Simple analytics tracker — logs to console + posts to a booking_events row when possible.
// Non-blocking; never throws.
const trackEvent = (
  event:
    | "otp_submit_attempt"
    | "otp_wrong"
    | "otp_success"
    | "otp_network_error"
    | "otp_retry_click"
    | "otp_timeout_warning"
    | "otp_call_customer",
  bookingId: string,
  meta: Record<string, any> = {},
) => {
  try {
    // eslint-disable-next-line no-console
    console.log(`[analytics] ${event}`, { bookingId, ...meta });
    // Best-effort persistence — ignored if table policy blocks
    supabase.from("booking_events").insert({
      booking_id: bookingId,
      type: `worker_${event}`,
      meta: { ...meta, ts: new Date().toISOString() },
    } as any).then(() => {}, () => {});
  } catch {
    // swallow
  }
};

type ErrorKind = "validation" | "wrong_otp" | "payment" | "network" | "timeout" | "other" | null;

const TIMEOUT_WARNING_MS = 12_000;

export default function CompleteBooking() {
  const { bookingId = "" } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [shake, setShake] = useState(false);
  const [success, setSuccess] = useState(false);
  const [payout, setPayout] = useState<PayoutSummary | null>(null);
  const [bookingMeta, setBookingMeta] = useState<{
    flat_no?: string;
    service_type?: string;
    cust_phone?: string;
  } | null>(null);
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const submitLockRef = useRef(false);
  const otpContainerRef = useRef<HTMLDivElement | null>(null);
  const slowTimerRef = useRef<number | null>(null);

  // Fetch booking meta (flat / service / phone) for header chips + Call button
  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("bookings")
        .select("flat_no, service_type, cust_phone")
        .eq("id", bookingId)
        .maybeSingle();
      if (!cancelled && data) setBookingMeta(data);
    })();
    return () => { cancelled = true; };
  }, [bookingId]);

  // Auto-focus first OTP slot so numeric keyboard opens
  useEffect(() => {
    const t = setTimeout(() => {
      const input = otpContainerRef.current?.querySelector<HTMLInputElement>("input");
      input?.focus();
    }, 250);
    return () => clearTimeout(t);
  }, []);

  // Cleanup slow-warning timer on unmount
  useEffect(() => {
    return () => {
      if (slowTimerRef.current) window.clearTimeout(slowTimerRef.current);
    };
  }, []);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleWrongOtp = (msg: string) => {
    haptic.error();
    setError(msg);
    setErrorKind("wrong_otp");
    triggerShake();
    trackEvent("otp_wrong", bookingId, { entered_length: otp.length });
    // Clear OTP after 500ms (let user see what they typed + shake)
    setTimeout(() => setOtp(""), 500);
  };

  const startSlowTimer = () => {
    if (slowTimerRef.current) window.clearTimeout(slowTimerRef.current);
    setShowSlowWarning(false);
    slowTimerRef.current = window.setTimeout(() => {
      setShowSlowWarning(true);
      trackEvent("otp_timeout_warning", bookingId);
    }, TIMEOUT_WARNING_MS);
  };

  const stopSlowTimer = () => {
    if (slowTimerRef.current) {
      window.clearTimeout(slowTimerRef.current);
      slowTimerRef.current = null;
    }
    setShowSlowWarning(false);
  };

  const handleSubmit = async (isRetry = false) => {
    if (submitLockRef.current || loading) return;
    if (otp.length < 4) {
      setError("Please enter the complete 4-digit OTP");
      setErrorKind("validation");
      triggerShake();
      return;
    }

    if (isRetry) trackEvent("otp_retry_click", bookingId);
    trackEvent("otp_submit_attempt", bookingId, { is_retry: isRetry });

    submitLockRef.current = true;
    setLoading(true);
    setError(null);
    setErrorKind(null);
    startSlowTimer();

    try {
      const { data, error: fnError } = await supabase.functions.invoke("complete-booking-with-otp", {
        body: { booking_id: bookingId, otp },
      });

      // Try to extract the real backend error message even when invoke surfaces a generic non-2xx.
      // supabase-js attaches the response on fnError.context (a Response). We read its body if possible.
      let backendMessage: string | null = null;
      let backendPayload: any = null;
      if (fnError) {
        try {
          const ctx: any = (fnError as any).context;
          if (ctx && typeof ctx.json === "function") {
            backendPayload = await ctx.clone().json().catch(() => null);
          }
          if (!backendPayload && ctx && typeof ctx.text === "function") {
            const txt = await ctx.clone().text().catch(() => "");
            if (txt) {
              try { backendPayload = JSON.parse(txt); } catch { backendMessage = txt; }
            }
          }
          if (backendPayload?.error) backendMessage = String(backendPayload.error);
        } catch {
          // ignore — fall back to fnError.message
        }
        const errorBody = backendMessage || fnError.message || "Something went wrong";
        const isPaymentRequired = backendPayload?.payment_required === true;

        if (errorBody.includes("already completed")) {
          haptic.success();
          setSuccess(true);
          trackEvent("otp_success", bookingId, { already_completed: true });
          if (data?.payout || backendPayload?.payout) setPayout(data?.payout ?? backendPayload?.payout);
        } else if (errorBody.includes("Invalid OTP")) {
          handleWrongOtp("Wrong OTP. Please ask the customer for the correct code.");
        } else if (
          isPaymentRequired ||
          errorBody.includes("Payment not collected") ||
          errorBody.includes("Payment not completed")
        ) {
          haptic.error();
          setError("Please collect payment before completing this job.");
          setErrorKind("payment");
        } else {
          haptic.error();
          setError(errorBody);
          setErrorKind("other");
        }
        setLoading(false);
        return;
      }

      if (data?.error) {
        if (data.already_completed) {
          haptic.success();
          setSuccess(true);
          trackEvent("otp_success", bookingId, { already_completed: true });
          if (data?.payout) setPayout(data.payout);
        } else if (data.payment_required) {
          haptic.error();
          setError("Please collect payment before completing this job.");
          setErrorKind("payment");
        } else {
          haptic.error();
          setError(data.error);
          setErrorKind("other");
        }
        if (!data.already_completed) {
          setLoading(false);
          return;
        }
      }

      if (!data?.error) {
        haptic.success();
        setSuccess(true);
        trackEvent("otp_success", bookingId);
      }
      if (data?.payout) setPayout(data.payout);
    } catch (err: any) {
      haptic.error();
      setError("Network error. Please try again.");
      setErrorKind("network");
      trackEvent("otp_network_error", bookingId, { message: err?.message ?? "unknown" });
    } finally {
      submitLockRef.current = false;
      setLoading(false);
      stopSlowTimer();
    }
  };

  const handleBack = () => {
    if (loading) return;
    navigate(-1);
  };

  const handleDone = () => {
    // Notify other screens to refresh, then go home
    window.dispatchEvent(new CustomEvent("bookingCompleted", { detail: { bookingId } }));
    navigate("/home", { replace: true });
  };

  const handleCallCustomer = () => {
    if (!bookingMeta?.cust_phone) return;
    trackEvent("otp_call_customer", bookingId);
    window.location.href = `tel:${bookingMeta.cust_phone}`;
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {!success ? (
        <>
          {/* Header */}
          <div
            className="px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-5 text-white relative"
            style={{ background: "linear-gradient(135deg, #ff007a 0%, #ff4da6 100%)" }}
          >
            <button
              onClick={handleBack}
              disabled={loading}
              aria-label="Back"
              className="absolute left-3 top-[max(env(safe-area-inset-top),1rem)] p-2 rounded-full hover:bg-white/20 active:scale-95 transition disabled:opacity-50"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>

            <div className="flex flex-col items-center text-center mt-2">
              <div className="bg-white/20 p-3 rounded-2xl mb-3">
                <KeyRound className="w-7 h-7" />
              </div>
              <h1 className="text-2xl font-extrabold leading-tight">Complete Job</h1>
              <p className="text-white/90 text-sm mt-1.5 max-w-xs">
                Ask the customer for the 4-digit OTP
              </p>
            </div>

            {(bookingMeta?.flat_no || bookingMeta?.service_type) && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                {bookingMeta?.flat_no && (
                  <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur px-3 py-1.5 rounded-full text-sm font-semibold">
                    <Home className="w-4 h-4" />
                    <span>Flat {bookingMeta.flat_no}</span>
                  </div>
                )}
                {bookingMeta?.service_type && (
                  <div className="flex items-center gap-1.5 bg-white/15 backdrop-blur px-3 py-1.5 rounded-full text-sm font-semibold capitalize">
                    <Sparkles className="w-4 h-4" />
                    <span>{bookingMeta.service_type.replace(/_/g, " ")}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-8 flex flex-col items-center">
            <p className="text-base font-semibold text-foreground mb-2 text-center">
              Enter 4-digit OTP
            </p>
            <p className="text-sm text-muted-foreground mb-2 text-center">
              The OTP is shown in the customer's app
            </p>
            <p className="text-xs text-muted-foreground mb-6 text-center font-medium">
              🔒 Only customer OTP will complete the job
            </p>

            <div ref={otpContainerRef} className={cn("mb-6", shake && "animate-otp-shake")}>
              <InputOTP
                maxLength={4}
                value={otp}
                 onChange={(v) => {
                   setOtp(v);
                   if (error && errorKind !== "network" && errorKind !== "timeout") {
                     setError(null);
                     setErrorKind(null);
                   }
                   if (v.length === 4 && !loading && !submitLockRef.current) {
                     handleSubmit(false);
                   }
                 }}
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
              >
                <InputOTPGroup className="gap-3">
                  {[0, 1, 2, 3].map((i) => (
                    <InputOTPSlot
                      key={i}
                      index={i}
                      className={cn(
                        "h-20 w-20 text-4xl font-extrabold rounded-2xl border-2",
                        "first:rounded-2xl last:rounded-2xl border-l",
                        "bg-background shadow-sm transition-colors",
                        errorKind === "wrong_otp" || errorKind === "validation"
                          ? "border-destructive"
                          : "border-input",
                        "data-[active=true]:border-pink-600 data-[active=true]:ring-2 data-[active=true]:ring-pink-200",
                      )}
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-destructive text-sm bg-destructive/10 border border-destructive/20 px-4 py-3 rounded-xl w-full max-w-sm mb-4">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">{error}</p>
                  {errorKind === "network" && (
                    <button
                      onClick={() => handleSubmit(true)}
                      className="mt-2 inline-flex items-center gap-1.5 text-destructive font-bold text-sm underline"
                    >
                      <RefreshCw className="w-4 h-4" /> Retry
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Slow network warning (shown while loading > 12s) */}
            {loading && showSlowWarning && (
              <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400 text-sm bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-4 py-3 rounded-xl w-full max-w-sm mb-4">
                <Clock className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold">Taking longer than expected</p>
                  <p className="text-xs mt-0.5 opacity-90">Please check your internet. We won't lose your OTP.</p>
                  <button
                    onClick={() => {
                      stopSlowTimer();
                      submitLockRef.current = false;
                      setLoading(false);
                      handleSubmit(true);
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 font-bold text-sm underline"
                  >
                    <RefreshCw className="w-4 h-4" /> Retry now
                  </button>
                </div>
              </div>
            )}

            {/* Help / Customer not showing OTP */}
            <div className="w-full max-w-sm mt-2">
              <button
                type="button"
                onClick={() => setShowHelp((s) => !s)}
                className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-pink-600 py-2"
              >
                <HelpCircle className="w-4 h-4" />
                Customer not showing OTP?
              </button>

              {showHelp && (
                <div className="bg-muted rounded-2xl p-4 mt-2 text-sm text-foreground space-y-2">
                  <p className="font-semibold">Ask the customer to:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                    <li>Open the Didi Now app</li>
                    <li>Go to the active booking screen</li>
                    <li>Read out the 4-digit OTP shown there</li>
                  </ol>
                  {bookingMeta?.cust_phone && (
                    <Button
                      onClick={handleCallCustomer}
                      variant="outline"
                      className="w-full mt-3 h-12 rounded-xl border-pink-600 text-pink-600 hover:bg-pink-50 hover:text-pink-700 font-bold"
                    >
                      <Phone className="w-4 h-4 mr-2" />
                      Call Customer
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sticky footer */}
          <div
            className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] border-t bg-background"
            style={{ boxShadow: "0 -4px 12px rgba(0,0,0,0.04)" }}
          >
            <Button
              onClick={() => handleSubmit(false)}
              disabled={loading || otp.length < 4}
              className="w-full h-14 text-base font-bold rounded-2xl bg-pink-600 hover:bg-pink-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <Check className="w-6 h-6 mr-2" />
                  Verify & Complete
                </>
              )}
            </Button>
            <button
              onClick={handleBack}
              disabled={loading}
              className="w-full h-12 mt-2 text-muted-foreground font-semibold text-sm disabled:opacity-50"
            >
              Back
            </button>
          </div>
        </>
      ) : (
        // Success — manual exit only
        <>
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
            <div className="w-24 h-24 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-5 animate-in zoom-in duration-300">
              <PartyPopper className="w-12 h-12 text-green-600" />
            </div>
            <h2 className="text-3xl font-extrabold mb-2">Job Completed! 🎉</h2>
            <p className="text-muted-foreground mb-3">Great work! Your payout is being processed.</p>

            <div className="inline-flex items-center gap-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-full text-sm font-semibold mb-6">
              <ShieldCheck className="w-4 h-4" />
              Payment is secured
            </div>

            {payout && (
              <div className="w-full max-w-sm bg-muted rounded-2xl p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Customer Pays</span>
                  <span className="font-semibold">₹{payout.gross_amount}</span>
                </div>
                {payout.platform_fee > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Platform Fee</span>
                    <span className="font-semibold text-destructive">−₹{payout.platform_fee}</span>
                  </div>
                )}
                <div className="border-t pt-3 flex justify-between items-center">
                  <span className="font-bold">You Earn</span>
                  <span className="font-extrabold text-green-600 text-2xl">₹{payout.payout_amount}</span>
                </div>
                <p className="text-xs text-muted-foreground text-center pt-1">
                  Payout will be processed within 24 hours
                </p>
              </div>
            )}
          </div>

          <div
            className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] border-t bg-background"
            style={{ boxShadow: "0 -4px 12px rgba(0,0,0,0.04)" }}
          >
            <Button
              onClick={handleDone}
              className="w-full h-14 text-base font-bold rounded-2xl bg-pink-600 hover:bg-pink-700 text-white"
            >
              <Home className="w-5 h-5 mr-2" />
              Go to Home
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
