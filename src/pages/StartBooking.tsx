import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, AlertCircle, KeyRound, RefreshCw, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  verifyStartOtp,
  setResolvedOtpMode,
  otpV2ErrorMessage,
  type OtpV2ErrorCode,
} from "@/lib/otpV2";

const normalizeOtp = (value: unknown) =>
  String(value ?? "").replace(/\D/g, "").trim().slice(0, 4);

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
 * predates OTP V2 and the legacy status path (worker_set_booking_status) is
 * used instead. If the gateway is unavailable, nothing is started.
 */
export default function StartBooking() {
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

  /** Legacy path: booking predates OTP V2 — use the existing status RPC. */
  const startLegacy = async (): Promise<boolean> => {
    const { error: rpcError } = await supabase.rpc("worker_set_booking_status", {
      p_booking_id: bookingId,
      p_new_status: "started",
    });
    if (rpcError) {
      console.warn("[START_BOOKING] legacy start failed", { bookingId, message: rpcError.message });
      fail("other", rpcError.message || "Could not start booking. Please try again.");
      return false;
    }
    return true;
  };

  const handleSubmit = async (submittedOtp?: string) => {
    if (submitLockRef.current || loading) return;
    const enteredOtp = normalizeOtp(submittedOtp ?? otpRef.current ?? otp);

    if (enteredOtp.length !== 4) {
      fail("validation", "Please enter the complete 4-digit OTP");
      return;
    }

    submitLockRef.current = true;
    setLoading(true);
    setError(null);
    setErrorKind(null);

    try {
      const result = await verifyStartOtp(bookingId, enteredOtp);

      if (result.ok) {
        setResolvedOtpMode(bookingId, "v2");
        haptic.success();
        window.dispatchEvent(new CustomEvent("bookingStarted", { detail: { bookingId } }));
        navigate("/home", { replace: true });
        return;
      }

      const code: OtpV2ErrorCode = result.code;
      switch (code) {
        case "LEGACY_BOOKING": {
          setResolvedOtpMode(bookingId, "legacy");
          const started = await startLegacy();
          if (started) {
            haptic.success();
            window.dispatchEvent(new CustomEvent("bookingStarted", { detail: { bookingId } }));
            navigate("/home", { replace: true });
          }
          break;
        }
        case "INCORRECT_OTP":
          fail("wrong_otp", otpV2ErrorMessage(code), true);
          break;
        case "LOCKED":
        case "LIFETIME_LOCKED":
          fail("locked", otpV2ErrorMessage(code));
          break;
        case "NOT_CURRENT_ASSIGNMENT":
        case "TERMINAL_BOOKING":
        case "BOOKING_NOT_FOUND":
          fail("terminal", otpV2ErrorMessage(code));
          setTimeout(() => navigate("/home", { replace: true }), 1800);
          break;
        case "NETWORK":
        case "OTP_V2_UNAVAILABLE":
          fail("network", otpV2ErrorMessage(code));
          break;
        default:
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
          aria-label="Back"
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
          Start Booking
        </h1>
        <p className="text-sm text-muted-foreground mt-2 mb-10 text-center">
          Ask customer for the 4-digit Start OTP
        </p>

        <div ref={otpContainerRef} className={cn(shake && "animate-otp-shake")}>
          <InputOTP
            maxLength={4}
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
              if (cleaned.length === 4 && !loading && !submitLockRef.current) {
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
            <p className="font-medium">{error}</p>
            {errorKind === "network" && (
              <button
                onClick={() => handleSubmit()}
                className="ml-1 inline-flex items-center gap-1 font-semibold underline"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            )}
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] bg-background">
        <Button
          onClick={() => handleSubmit()}
          disabled={loading || normalizeOtp(otp).length !== 4}
          className="w-full h-14 text-base font-semibold rounded-2xl bg-green-600 hover:bg-green-700 text-white shadow-sm disabled:opacity-40 disabled:shadow-none"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Verifying…
            </>
          ) : (
            <>
              <Play className="w-5 h-5 mr-2" />
              Start Job
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
