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
  method?: string | null;
  payout_method?: string | null;
  completed_at?: string | null;
  paid_at?: string | null;
}

const formatTime = (iso?: string | null) => {
  try {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return "";
  }
};

const resolvePayoutMethod = (p: PayoutSummary | null): "UPI Transfer" | "Bank Transfer" => {
  const raw = (p?.method ?? p?.payout_method ?? "upi").toString().toLowerCase();
  if (raw.includes("bank") || raw === "imps" || raw === "neft" || raw === "rtgs") return "Bank Transfer";
  return "UPI Transfer";
};

const isPayoutCredited = (p: PayoutSummary | null) => {
  const s = (p?.status ?? "").toLowerCase();
  return s === "paid" || s === "success" || s === "completed" || s === "credited";
};

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

const normalizeOtp = (value: unknown) => String(value ?? "").replace(/\D/g, "").trim().slice(0, 4);

const logOtpDebug = (label: string, payload: Record<string, unknown>) => {
  try {
    // Temporary production-safe OTP diagnostics for the Worker App completion flow.
    console.log(`[OTP_DEBUG] ${label}`, payload);
  } catch {}
};

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
  const [completedAt, setCompletedAt] = useState<string | null>(null);

  const submitLockRef = useRef(false);
  const otpRef = useRef("");
  const otpContainerRef = useRef<HTMLDivElement | null>(null);
  const slowTimerRef = useRef<number | null>(null);
  const debugMode = (() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.has("otpDebug") || localStorage.getItem("otp_debug") === "1";
    } catch {
      return false;
    }
  })();

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

  // Capture local completion time once success flips on (fallback if backend doesn't send it)
  useEffect(() => {
    if (success && !completedAt) {
      setCompletedAt(payout?.completed_at ?? payout?.paid_at ?? new Date().toISOString());
    }
  }, [success, payout, completedAt]);

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
          {/* Minimal header */}
          <div className="px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-2 flex items-center">
            <button
              onClick={handleBack}
              disabled={loading}
              aria-label="Back"
              className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition disabled:opacity-50"
            >
              <ArrowLeft className="w-6 h-6 text-foreground" />
            </button>
          </div>

          {/* Body — OTP is the hero */}
          <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6">
            <div className="w-14 h-14 rounded-2xl bg-pink-50 flex items-center justify-center mb-5">
              <KeyRound className="w-7 h-7 text-pink-600" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground tracking-tight">
              Enter OTP
            </h1>
            <p className="text-sm text-muted-foreground mt-2 mb-10 text-center">
              Ask customer for the 4-digit code
            </p>

            <div ref={otpContainerRef} className={cn(shake && "animate-otp-shake")}>
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
                        "h-16 w-16 text-3xl font-semibold rounded-2xl border",
                        "first:rounded-2xl last:rounded-2xl border-l",
                        "bg-background transition-all",
                        errorKind === "wrong_otp" || errorKind === "validation"
                          ? "border-destructive"
                          : "border-border",
                        "data-[active=true]:border-pink-500 data-[active=true]:ring-4 data-[active=true]:ring-pink-100",
                      )}
                    />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-sm mt-6 max-w-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="font-medium">{error}</p>
                {errorKind === "network" && (
                  <button
                    onClick={() => handleSubmit(true)}
                    className="ml-1 inline-flex items-center gap-1 font-semibold underline"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry
                  </button>
                )}
              </div>
            )}

            {loading && showSlowWarning && (
              <p className="text-xs text-amber-600 mt-4 text-center">
                Taking longer than usual… check your internet.
              </p>
            )}
          </div>

          {/* Sticky footer */}
          <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] bg-background">
            <Button
              onClick={() => handleSubmit(false)}
              disabled={loading || otp.length < 4}
              className="w-full h-14 text-base font-semibold rounded-2xl bg-pink-600 hover:bg-pink-700 text-white shadow-sm disabled:opacity-40 disabled:shadow-none"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Verifying…
                </>
              ) : (
                "Complete Job"
              )}
            </Button>
          </div>
        </>
      ) : (
        // Success — celebratory earnings hero
        <>
          {/* Pink gradient hero header */}
          <div
            className="relative overflow-hidden px-5 pt-[max(env(safe-area-inset-top),1.5rem)] pb-8 text-white text-center"
            style={{ background: "linear-gradient(135deg, #ff007a 0%, #ff4da6 60%, #ff85c1 100%)" }}
          >
            {/* keep existing success body unchanged below */}
            {/* Decorative confetti dots */}
            <div className="pointer-events-none absolute inset-0 opacity-60">
              <span className="absolute left-6 top-4 text-xl animate-bounce" style={{ animationDelay: "0ms" }}>✨</span>
              <span className="absolute right-8 top-6 text-2xl animate-bounce" style={{ animationDelay: "150ms" }}>🎉</span>
              <span className="absolute left-10 bottom-6 text-lg animate-bounce" style={{ animationDelay: "300ms" }}>🎊</span>
              <span className="absolute right-6 bottom-4 text-xl animate-bounce" style={{ animationDelay: "450ms" }}>⭐</span>
            </div>

            <div className="relative z-10 flex flex-col items-center">
              <div className="w-20 h-20 rounded-full bg-white/25 backdrop-blur flex items-center justify-center mb-3 shadow-lg animate-in zoom-in duration-500">
                <Check className="w-12 h-12 text-white" strokeWidth={3} />
              </div>
              <p className="text-sm font-semibold uppercase tracking-wider text-white/90">
                You Earned
              </p>
              <p className="text-6xl font-black mt-1 drop-shadow-md animate-in zoom-in duration-500">
                ₹{payout?.payout_amount ?? 0}
              </p>
              <p className="text-base font-semibold mt-2 text-white/95">
                Job Completed Successfully 🎉
              </p>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-6 space-y-4 -mt-4">
            {/* Status pills */}
            <div className="flex flex-wrap justify-center gap-2">
              <div className="inline-flex items-center gap-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm">
                <ShieldCheck className="w-3.5 h-3.5" />
                Payment Secured
              </div>
              {isPayoutCredited(payout) ? (
                <div className="inline-flex items-center gap-1.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm">
                  <Check className="w-3.5 h-3.5" />
                  Amount Credited
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-900 px-3 py-1.5 rounded-full text-xs font-bold shadow-sm">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Payout Processing
                </div>
              )}
            </div>

            {/* Completed at */}
            {completedAt && (
              <p className="text-center text-xs text-muted-foreground">
                Job completed at: <span className="font-semibold text-foreground">{formatTime(completedAt)}</span>
              </p>
            )}

            {/* Earnings breakdown card */}
            {payout ? (
              <div className="w-full max-w-sm mx-auto bg-card rounded-3xl p-5 shadow-xl border border-green-100 dark:border-green-900/40">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-green-600" />
                  </div>
                  <h3 className="font-bold text-sm uppercase tracking-wide text-foreground">
                    Earnings Breakdown
                  </h3>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Customer Paid</span>
                    <span className="font-bold text-foreground">₹{payout.gross_amount}</span>
                  </div>
                  {payout.platform_fee > 0 && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Platform Fee (20%)</span>
                      <span className="font-bold text-destructive">−₹{payout.platform_fee}</span>
                    </div>
                  )}
                  <div className="border-t border-dashed pt-3 flex justify-between items-center bg-green-50 dark:bg-green-900/20 -mx-5 px-5 py-3 mt-3">
                    <div>
                      <p className="text-xs text-green-700 dark:text-green-400 font-semibold uppercase tracking-wide">Your Earnings</p>
                      <p className="text-[10px] text-green-700/70 dark:text-green-400/70">Net payout</p>
                    </div>
                    <span className="font-black text-green-600 text-3xl">₹{payout.payout_amount}</span>
                  </div>
                </div>

                {/* Payout meta */}
                <div className="mt-4 space-y-2 text-xs">
                  {!isPayoutCredited(payout) && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Expected Credit
                      </span>
                      <span className="font-semibold text-foreground">Within 24 hours</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Payout Method</span>
                    <span className="font-semibold text-foreground">{resolvePayoutMethod(payout)}</span>
                  </div>
                  {completedAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Completed At</span>
                      <span className="font-semibold text-foreground">{formatTime(completedAt)}</span>
                    </div>
                  )}
                  {bookingId && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Booking ID</span>
                      <span className="font-mono text-[10px] text-foreground">#{bookingId.slice(0, 8)}</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="max-w-sm mx-auto bg-muted/50 border border-border rounded-2xl p-4 text-center">
                <p className="text-sm font-semibold text-foreground">
                  Job completed successfully.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Payout details are being updated. Check the Earnings tab in a moment.
                </p>
              </div>
            )}

            {/* Reassurance message */}
            {payout && (
              <div className="max-w-sm mx-auto bg-pink-50 dark:bg-pink-950/20 border border-pink-100 dark:border-pink-900/40 rounded-2xl p-4 text-center">
                <p className="text-sm font-semibold text-pink-900 dark:text-pink-300">
                  {isPayoutCredited(payout)
                    ? "✅ Amount credited to your account"
                    : "💸 Your payout has been initiated"}
                </p>
                <p className="text-xs text-pink-800/80 dark:text-pink-400/80 mt-1 leading-relaxed">
                  {isPayoutCredited(payout)
                    ? `The amount has been sent via ${resolvePayoutMethod(payout)}. Track all payouts in the Earnings tab.`
                    : `The amount will be credited to your registered ${resolvePayoutMethod(payout) === "Bank Transfer" ? "bank account" : "UPI"} shortly. You can track all payouts in the Earnings tab.`}
                </p>
              </div>
            )}
          </div>

          {/* Sticky footer */}
          <div
            className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] border-t bg-background space-y-2"
            style={{ boxShadow: "0 -4px 12px rgba(0,0,0,0.04)" }}
          >
            <Button
              onClick={handleDone}
              className="w-full h-14 text-base font-bold rounded-2xl bg-pink-600 hover:bg-pink-700 text-white shadow-lg"
            >
              <Home className="w-5 h-5 mr-2" />
              Go to Home
            </Button>
            <Button
              onClick={() => {
                window.dispatchEvent(new CustomEvent("bookingCompleted", { detail: { bookingId } }));
                navigate("/earnings");
              }}
              variant="outline"
              className="w-full h-12 text-sm font-bold rounded-2xl border-pink-600 text-pink-600 hover:bg-pink-50 hover:text-pink-700"
            >
              View Earnings
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
