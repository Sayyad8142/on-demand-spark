import { displayText, useWorkerLanguage, serviceLabel, bookingStatusLabel, displayLocale } from "@/i18n/display";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, AlertCircle, KeyRound, RefreshCw, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { cn } from "@/lib/utils";
import {
  verifyStartOtp,
  isOtpV2Failure,
  isOtpV2ClientEnabled,
  otpV2ErrorMessage,
  V2_OTP_LENGTH,
  type OtpV2ErrorCode,
} from "@/lib/otpV2";
import { TERMINAL_CODES, RETRYABLE_CODES } from "@/lib/otpCompletionFlow";
import {
  isStartOtpWorkerEnabled,
  verifyStartOtp as verifyStartOtpMain,
  startOtpMessage,
} from "@/lib/startOtp";

const normalizeOtp = (value: unknown) =>
  String(value ?? "").replace(/\D/g, "").trim().slice(0, V2_OTP_LENGTH);

const haptic = {
  success: () => { try { navigator.vibrate?.([30]); } catch { /* noop */ } },
  error: () => { try { navigator.vibrate?.([60, 50, 60]); } catch { /* noop */ } },
};

type ErrorKind = "validation" | "wrong_otp" | "locked" | "network" | "terminal" | "other" | null;

/**
 * Start Booking — first stage of the two-stage OTP flow.
 *
 * The worker asks the customer for the 4-digit Booking Start OTP and submits
 * it to the OTP V2 gateway (verify_start). The booking is marked started ONLY
 * after confirmed backend success — never locally before verification.
 *
 * Legacy compatibility: if the gateway answers LEGACY_BOOKING, the booking
 * predates OTP V2; the original lifecycle has no Start step, so the worker is
 * sent to the legacy completion screen. Nothing is marked started locally.
 * If the gateway is unavailable, nothing is started.
 */
export default function StartBooking() {
  useWorkerLanguage();
  const { bookingId = "" } = useParams<{ bookingId: string }>();
  const navigate = useNavigate();

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);
  const [shake, setShake] = useState(false);

  const submitLockRef = useRef(false);
  const otpRef = useRef("");
  const otpContainerRef = useRef<HTMLDivElement | null>(null);
  const autoVerifyTimerRef = useRef<number | null>(null);

  // V2 client switched off → original lifecycle has no Start step.
  useEffect(() => {
    if (!isStartOtpWorkerEnabled() && !isOtpV2ClientEnabled()) navigate(`/complete-booking/${bookingId}`, { replace: true });
  }, [bookingId, navigate]);


  // Auto-focus first OTP slot so the numeric keyboard opens
  useEffect(() => {
    const t = setTimeout(() => {
      otpContainerRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    }, 250);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => () => {
    if (autoVerifyTimerRef.current) window.clearTimeout(autoVerifyTimerRef.current);
  }, []);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const fail = (kind: ErrorKind, message: string, clearOtp = false) => {
    haptic.error();
    setError(message);
    setErrorKind(kind);
    triggerShake();
    if (clearOtp) {
      setTimeout(() => {
        otpRef.current = "";
        setOtp("");
      }, 500);
    }
  };

  const handleSubmit = async (submittedOtp?: string) => {
    if (submitLockRef.current || loading) return;
    const enteredOtp = normalizeOtp(submittedOtp ?? otpRef.current ?? otp);

    if (enteredOtp.length !== V2_OTP_LENGTH) {
      fail("validation", "Please enter the complete 4-digit OTP");
      return;
    }

    submitLockRef.current = true;
    setLoading(true);
    setError(null);
    setErrorKind(null);

    try {
      if (isStartOtpWorkerEnabled()) {
        const r = await verifyStartOtpMain(bookingId, enteredOtp);
        if (r.ok) {
          haptic.success();
          // Never mark started locally: the job card refetches from the server.
          window.dispatchEvent(new CustomEvent("bookingStarted", { detail: { bookingId } }));
          navigate("/home", { replace: true });
          return;
        }
        const msg = startOtpMessage(r.code);
        if (r.code === "INCORRECT_OTP" || r.code === "INVALID_REQUEST") fail("wrong_otp", msg, true);
        else if (r.code === "LOCKED") fail("locked", msg);
        else if (r.code === "NOT_AVAILABLE" || r.code === "NOT_ASSIGNED") {
          fail("terminal", msg);
          window.dispatchEvent(new CustomEvent("bookingReassigned", { detail: { bookingId } }));
        } else fail("network", msg);
        return;
      }

      const result = await verifyStartOtp(bookingId, enteredOtp);

      if (!isOtpV2Failure(result)) {
        haptic.success();
        window.dispatchEvent(new CustomEvent("bookingStarted", { detail: { bookingId } }));
        navigate("/home", { replace: true });
        return;
      }

      const code: OtpV2ErrorCode = result.code;
      if (code === "LEGACY_BOOKING") {
        // Legacy booking: original lifecycle has no Start step — go straight
        // to the legacy completion screen. Nothing is marked started here.
        navigate(`/complete-booking/${bookingId}`, { replace: true });
        return;
      }
      if (code === "INCORRECT_OTP") {
        fail("wrong_otp", result.message || otpV2ErrorMessage(code), true);
      } else if (code === "LOCKED" || code === "LIFETIME_LOCKED") {
        fail("locked", result.message || otpV2ErrorMessage(code));
      } else if (TERMINAL_CODES.includes(code)) {
        fail("terminal", otpV2ErrorMessage(code));
        window.dispatchEvent(new CustomEvent("bookingReassigned", { detail: { bookingId } }));
        setTimeout(() => navigate("/home", { replace: true }), 1800);
      } else if (RETRYABLE_CODES.includes(code)) {
        fail("network", otpV2ErrorMessage(code, result.message));
      } else {
        fail("other", otpV2ErrorMessage(code, result.message));
      }
    } catch (err) {
      fail("network", "Network error. Please try again.");
      console.warn("[START_BOOKING] unexpected error", { bookingId, message: err instanceof Error ? err.message : "unknown" });
    } finally {
      submitLockRef.current = false;
      setLoading(false);
    }
  };

  const handleBack = () => {
    if (loading) return;
    navigate(-1);
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Minimal header */}
      <div className="px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-2 flex items-center">
        <button
          onClick={handleBack}
          disabled={loading}
          aria-label={displayText("Back")}
          className="p-2 -ml-2 rounded-full hover:bg-muted active:scale-95 transition disabled:opacity-50"
        >
          <ArrowLeft className="w-6 h-6 text-foreground" />
        </button>
      </div>

      {/* Body — OTP is the hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-6">
        <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mb-5">
          <KeyRound className="w-7 h-7 text-green-600" />
        </div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          {displayText("Start Booking")}
        </h1>
        <p className="text-sm text-muted-foreground mt-2 mb-10 text-center">
          {displayText("Ask customer for the 4-digit Start OTP")}
        </p>

        <div ref={otpContainerRef} className={cn(shake && "animate-otp-shake")}>
          <InputOTP
            maxLength={V2_OTP_LENGTH}
            value={otp}
            onChange={(v) => {
              const cleaned = normalizeOtp(v);
              otpRef.current = cleaned;
              setOtp(cleaned);
              if (error && errorKind !== "locked" && errorKind !== "terminal") {
                setError(null);
                setErrorKind(null);
              }
              if (autoVerifyTimerRef.current) {
                window.clearTimeout(autoVerifyTimerRef.current);
                autoVerifyTimerRef.current = null;
              }
              if (cleaned.length === V2_OTP_LENGTH && !loading && !submitLockRef.current) {
                autoVerifyTimerRef.current = window.setTimeout(() => {
                  autoVerifyTimerRef.current = null;
                  handleSubmit(cleaned);
                }, 200);
              }
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            autoFocus
          >
            <InputOTPGroup className="gap-2">
              {Array.from({ length: V2_OTP_LENGTH }, (_, i) => i).map((i) => (
                <InputOTPSlot
                  key={i}
                  index={i}
                  className={cn(
                    "h-14 w-11 text-2xl font-semibold rounded-2xl border",
                    "first:rounded-2xl last:rounded-2xl border-l",
                    "bg-background transition-all",
                    errorKind === "wrong_otp" || errorKind === "validation"
                      ? "border-destructive"
                      : "border-border",
                    "data-[active=true]:border-green-500 data-[active=true]:ring-4 data-[active=true]:ring-green-100",
                  )}
                />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm mt-6 max-w-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <p className="font-medium">{displayText(error)}</p>
            {errorKind === "network" && (
              <button
                onClick={() => handleSubmit()}
                className="ml-1 inline-flex items-center gap-1 font-semibold underline"
              >
                <RefreshCw className="w-3.5 h-3.5" /> {displayText("Retry")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] bg-background">
        <Button
          onClick={() => handleSubmit()}
          disabled={loading || normalizeOtp(otp).length !== V2_OTP_LENGTH}
          className="w-full h-14 text-base font-semibold rounded-2xl bg-green-600 hover:bg-green-700 text-white shadow-sm disabled:opacity-40 disabled:shadow-none"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              {displayText("Verifying…")}
            </>
          ) : (
            <>
              <Play className="w-5 h-5 mr-2" />
              {displayText("Verify & Start Booking")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
