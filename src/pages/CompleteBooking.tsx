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

type ErrorKind = "validation" | "wrong_otp" | "payment" | "network" | "other" | null;

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
  const [bookingMeta, setBookingMeta] = useState<{ flat_no?: string; service_type?: string } | null>(null);

  const submitLockRef = useRef(false);
  const otpContainerRef = useRef<HTMLDivElement | null>(null);

  // Fetch booking meta (flat / service) for header chips
  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("bookings")
        .select("flat_no, service_type")
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

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleWrongOtp = (msg: string) => {
    haptic.error();
    setError(msg);
    setErrorKind("wrong_otp");
    triggerShake();
    // Clear OTP after 500ms (let user see what they typed + shake)
    setTimeout(() => setOtp(""), 500);
  };

  const handleSubmit = async () => {
    if (submitLockRef.current || loading) return;
    if (otp.length < 3) {
      setError("Please enter the complete 3-digit OTP");
      setErrorKind("validation");
      triggerShake();
      return;
    }

    submitLockRef.current = true;
    setLoading(true);
    setError(null);
    setErrorKind(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("complete-booking-with-otp", {
        body: { booking_id: bookingId, otp },
      });

      if (fnError) {
        const errorBody = fnError.message || "Something went wrong";
        if (errorBody.includes("already completed")) {
          haptic.success();
          setSuccess(true);
          if (data?.payout) setPayout(data.payout);
        } else if (errorBody.includes("Invalid OTP")) {
          handleWrongOtp("Wrong OTP. Please ask the customer for the correct code.");
        } else if (errorBody.includes("Payment not collected") || errorBody.includes("Payment not completed")) {
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
      }
      if (data?.payout) setPayout(data.payout);
    } catch (err: any) {
      haptic.error();
      setError("Network error. Please try again.");
      setErrorKind("network");
    } finally {
      submitLockRef.current = false;
      setLoading(false);
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
                Ask the customer for the 3-digit OTP
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
              Enter 3-digit OTP
            </p>
            <p className="text-sm text-muted-foreground mb-6 text-center">
              The OTP is shown in the customer's app
            </p>

            <div ref={otpContainerRef} className={cn("mb-6", shake && "animate-otp-shake")}>
              <InputOTP
                maxLength={3}
                value={otp}
                onChange={(v) => {
                  setOtp(v);
                  if (error && errorKind !== "network") {
                    setError(null);
                    setErrorKind(null);
                  }
                }}
                inputMode="numeric"
                pattern="[0-9]*"
                autoFocus
              >
                <InputOTPGroup className="gap-3">
                  {[0, 1, 2].map((i) => (
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
                      onClick={handleSubmit}
                      className="mt-2 inline-flex items-center gap-1.5 text-destructive font-bold text-sm underline"
                    >
                      <RefreshCw className="w-4 h-4" /> Retry
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sticky footer */}
          <div
            className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] border-t bg-background"
            style={{ boxShadow: "0 -4px 12px rgba(0,0,0,0.04)" }}
          >
            <Button
              onClick={handleSubmit}
              disabled={loading || otp.length < 3}
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
            <p className="text-muted-foreground mb-6">Great work! Your payout is being processed.</p>

            {payout && (
              <div className="w-full max-w-sm bg-muted rounded-2xl p-5 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Booking Amount</span>
                  <span className="font-semibold">₹{payout.gross_amount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Platform Fee</span>
                  <span className="font-semibold text-destructive">-₹{payout.platform_fee}</span>
                </div>
                <div className="border-t pt-3 flex justify-between items-center">
                  <span className="font-bold">Your Payout</span>
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
