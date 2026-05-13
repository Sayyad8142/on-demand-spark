import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Check,
  Loader2,
  AlertCircle,
  ArrowLeft,
  KeyRound,
  RefreshCw,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
    try { navigator.vibrate?.([30]); } catch { return undefined; }
  },
  error: () => {
    try { navigator.vibrate?.([60, 50, 60]); } catch { return undefined; }
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
  meta: Record<string, unknown> = {},
) => {
  try {
    console.log(`[analytics] ${event}`, { bookingId, ...meta });
    // Best-effort persistence — ignored if table policy blocks
    supabase.from("booking_events").insert({
      booking_id: bookingId,
      type: `worker_${event}`,
      meta: { ...meta, ts: new Date().toISOString() },
    } as never).then(() => {}, () => {});
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
  } catch { return undefined; }
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
  const autoVerifyTimerRef = useRef<number | null>(null);
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

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (slowTimerRef.current) window.clearTimeout(slowTimerRef.current);
      if (autoVerifyTimerRef.current) window.clearTimeout(autoVerifyTimerRef.current);
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

  const handleWrongOtp = (msg: string, attemptedOtp = otpRef.current) => {
    haptic.error();
    setError(msg);
    setErrorKind("wrong_otp");
    triggerShake();
    trackEvent("otp_wrong", bookingId, { entered_length: normalizeOtp(attemptedOtp).length });
    // Clear OTP after 500ms (let user see what they typed + shake)
    setTimeout(() => {
      otpRef.current = "";
      setOtp("");
    }, 500);
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

  const handleSubmit = async (isRetry = false, submittedOtp?: string) => {
    if (submitLockRef.current || loading) return;
    const enteredOtp = normalizeOtp(submittedOtp ?? otpRef.current ?? otp);
    logOtpDebug("submit", {
      bookingId,
      rawOtpState: `[${otp}]`,
      rawRef: `[${otpRef.current}]`,
      submittedOtp: submittedOtp === undefined ? undefined : `[${submittedOtp}]`,
      cleanedOtp: `[${enteredOtp}]`,
      length: enteredOtp.length,
      values: enteredOtp.split("").map((v) => `[${v}]`),
      isRetry,
    });

    if (enteredOtp.length !== 4) {
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
        body: { booking_id: bookingId, otp: enteredOtp },
      });
      logOtpDebug("function_response", {
        bookingId,
        cleanedOtpLength: enteredOtp.length,
        hasError: !!fnError,
        data,
        errorMessage: fnError?.message,
      });

      // Try to extract the real backend error message even when invoke surfaces a generic non-2xx.
      // supabase-js attaches the response on fnError.context (a Response). We read its body if possible.
      let backendMessage: string | null = null;
      let backendPayload: Record<string, unknown> | null = null;
      if (fnError) {
        try {
          const ctx = (fnError as { context?: Response }).context;
          if (ctx && typeof ctx.json === "function") {
            const parsed = await ctx.clone().json().catch(() => null);
            backendPayload = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
          }
          if (!backendPayload && ctx && typeof ctx.text === "function") {
            const txt = await ctx.clone().text().catch(() => "");
            if (txt) {
              try {
                const parsed = JSON.parse(txt);
                backendPayload = parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
              } catch { backendMessage = txt; }
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
          if (data?.payout || backendPayload?.payout) setPayout(data?.payout ?? backendPayload?.payout as PayoutSummary);
        } else if (errorBody.includes("Invalid OTP")) {
          handleWrongOtp("Wrong OTP. Please ask the customer for the correct code.", enteredOtp);
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
    } catch (err: unknown) {
      haptic.error();
      setError("Network error. Please try again.");
      setErrorKind("network");
      trackEvent("otp_network_error", bookingId, { message: err instanceof Error ? err.message : "unknown" });
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
                  const cleaned = normalizeOtp(v);
                  otpRef.current = cleaned;
                  setOtp(cleaned);
                  logOtpDebug("change", {
                    rawValue: `[${v}]`,
                    cleanedOtp: `[${cleaned}]`,
                    length: cleaned.length,
                  });
                  // Only clear validation error once user actually has < 4 digits
                  if (error && errorKind === "validation" && cleaned.length < 4) {
                    setError(null);
                    setErrorKind(null);
                  } else if (error && errorKind !== "network" && errorKind !== "timeout" && errorKind !== "validation") {
                    setError(null);
                    setErrorKind(null);
                  }
                  // Cancel any pending auto-verify if user is still typing/deleting
                  if (autoVerifyTimerRef.current) {
                    window.clearTimeout(autoVerifyTimerRef.current);
                    autoVerifyTimerRef.current = null;
                  }
                  if (cleaned.length === 4 && !loading && !submitLockRef.current) {
                    console.log("[OTP_AUTO_VERIFY]", {
                      finalOtp: cleaned,
                      length: cleaned.length,
                      source: "auto",
                    });
                    // Small debounce so React state + native IME settle on low-end Android
                    autoVerifyTimerRef.current = window.setTimeout(() => {
                      autoVerifyTimerRef.current = null;
                      handleSubmit(false, cleaned);
                    }, 200);
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

            {debugMode && (
              <div className="mt-4 rounded-xl border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                OTP: [{otpRef.current}] · length: {normalizeOtp(otpRef.current).length} · valid: {String(normalizeOtp(otpRef.current).length === 4)}
              </div>
            )}
          </div>

          {/* Sticky footer */}
          <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] bg-background">
            <Button
              onClick={() => {
                const current = normalizeOtp(otpRef.current || otp);
                console.log("[OTP_MANUAL_VERIFY]", {
                  otpFromState: otp,
                  otpFromRef: otpRef.current,
                  cleanedOtp: current,
                  source: "manual",
                });
                handleSubmit(false, current);
              }}
              disabled={loading || normalizeOtp(otp).length !== 4}
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
        // Success — minimal auto-close screen
        <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-6 pb-[max(env(safe-area-inset-bottom),1rem)] text-center">
          {/* Success icon */}
          <div className="mb-5">
            <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto animate-in zoom-in duration-500">
              <Check className="w-10 h-10 text-green-600" strokeWidth={3} />
            </div>
            <h1 className="text-xl font-bold text-foreground mt-4">
              Job Completed Successfully
            </h1>
          </div>

          {/* Amount earned */}
          <div className="mb-2">
            <p className="text-5xl font-black text-foreground">
              ₹{payout?.payout_amount ?? 0}
            </p>
            <p className="text-sm text-muted-foreground mt-1">earned</p>
          </div>

          {/* Payout status */}
          <div className="mb-8">
            {isPayoutCredited(payout) ? (
              <span className="inline-flex items-center gap-1.5 text-green-600 text-sm font-semibold">
                <Check className="w-4 h-4" />
                Payout credited
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-blue-600 text-sm font-semibold">
                <Loader2 className="w-4 h-4 animate-spin" />
                Payout processing
              </span>
            )}
          </div>

          {/* Countdown */}
          <p className="text-sm text-muted-foreground mb-6">
            Returning to Home in {countdown}…
          </p>

          {/* View Earnings */}
          <Button
            onClick={() => {
              window.dispatchEvent(new CustomEvent("bookingCompleted", { detail: { bookingId } }));
              navigate("/earnings");
            }}
            variant="outline"
            className="mb-4 h-11 text-sm font-semibold rounded-xl border-pink-600 text-pink-600 hover:bg-pink-50"
          >
            View Earnings
          </Button>

          {/* View Details collapsible */}
          <Collapsible className="w-full max-w-xs">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition mx-auto"
              >
                View Details <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 text-left bg-muted/50 rounded-2xl p-4 space-y-2 text-xs">
              {payout && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer Paid</span>
                    <span className="font-semibold">₹{payout.gross_amount}</span>
                  </div>
                  {payout.platform_fee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Platform Fee (20%)</span>
                      <span className="font-semibold text-destructive">−₹{payout.platform_fee}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-dashed pt-2">
                    <span className="text-muted-foreground">Your Earnings</span>
                    <span className="font-bold text-green-600">₹{payout.payout_amount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payout Method</span>
                    <span className="font-semibold">{resolvePayoutMethod(payout)}</span>
                  </div>
                  {!isPayoutCredited(payout) && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expected Credit</span>
                      <span className="font-semibold">Within 24 hours</span>
                    </div>
                  )}
                </>
              )}
              {completedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Completed At</span>
                  <span className="font-semibold">{formatTime(completedAt)}</span>
                </div>
              )}
              {bookingId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Booking ID</span>
                  <span className="font-mono text-[10px]">#{bookingId.slice(0, 8)}</span>
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}
    </div>
  );
}
