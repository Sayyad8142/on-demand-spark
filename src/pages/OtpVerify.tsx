import { displayText } from "@/i18n/display";
import { useState, useEffect, useRef } from "react";
import { signupMayUpdateExisting, ACCOUNT_RECOVERY_MESSAGE } from "@/lib/workerLinkage";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from '@capacitor/core';
import { useTranslation } from "react-i18next";
import { ArrowLeft, Phone, Shield, CheckCircle2 } from "lucide-react";
import didiPartnerLogo from "@/assets/didi-partner-logo.png";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { REGISTRATION_ERROR_TEXT, peekSignupBank, registerWorkerV2, takeSignupBank, requestOwnBeneficiary } from "@/lib/bankOnboarding";
import { clearAccountBrowserData } from "@/lib/accountDataCleanup";

// @ts-ignore - Capacitor bridge
const AuthBridge = window.Capacitor?.Plugins?.AuthBridge;
// @ts-ignore - SMS Retriever bridge
const SmsRetrieverPlugin = window.Capacitor?.Plugins?.SmsRetrieverPlugin;

interface OtpVerifyState {
  phone: string;
  mode: 'signin' | 'signup';
  signUpData?: {
    fullName: string;
    upiId: string;
    community: string;
    services: string[];
    cuisineTags: string[];
    qrData?: {
      file: File;
      payload: string;
      extractedUpiId: string;
    } | null;
    bankDetails?: {
      account_holder_name: string;
      bank_account_number: string;
      ifsc_code: string;
      bank_name: string | null;
    } | null;
    payoutReady?: boolean;
    passbookFile?: File | null;
  };
}

export default function OtpVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoDetected, setAutoDetected] = useState(false);
  const [resendTimer, setResendTimer] = useState(30);
  const [canResend, setCanResend] = useState(false);

  // Get state from navigation, falling back to sessionStorage so a
  // page reload / live-update / app resume keeps the user on this page
  // instead of bouncing back to /auth.
  const OTP_STATE_KEY = 'didi_otp_verify_state';
  const navState = location.state as OtpVerifyState | null;
  const [state, setState] = useState<OtpVerifyState | null>(() => {
    if (navState?.phone) return navState;
    try {
      const raw = sessionStorage.getItem(OTP_STATE_KEY);
      if (raw) return JSON.parse(raw) as OtpVerifyState;
    } catch {}
    return null;
  });

  // Persist nav state into sessionStorage on first mount; clear on redirect.
  useEffect(() => {
    if (navState?.phone) {
      try {
        // signUpData may include File objects (qrData.file / passbookFile)
        // which cannot be serialized — strip them before persisting.
        const safe: OtpVerifyState = {
          phone: navState.phone,
          mode: navState.mode,
          signUpData: navState.signUpData
            ? { ...navState.signUpData, qrData: null, passbookFile: null, bankDetails: null }
            : undefined,
        };
        sessionStorage.setItem(OTP_STATE_KEY, JSON.stringify(safe));
      } catch {}
      setState(navState);
    }
  }, [navState]);

  // Redirect only when truly nothing to resume from.
  useEffect(() => {
    if (!state?.phone) {
      try { sessionStorage.removeItem(OTP_STATE_KEY); } catch {}
      navigate("/auth", { replace: true });
    }
  }, [state, navigate]);

  // Resend timer
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [resendTimer]);

  // Auto OTP detection for Android
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !SmsRetrieverPlugin) {
      console.log('📱 SMS Retriever not available (not native or plugin missing)');
      return;
    }

    let listenerHandle: any = null;

    const startSmsRetriever = async () => {
      try {
        // Start watching for SMS
        const result = await SmsRetrieverPlugin.startWatching();
        console.log('📱 SMS Retriever started:', result);

        // Listen for SMS events
        listenerHandle = await SmsRetrieverPlugin.addListener('smsReceived', (data: any) => {
          console.log('📱 SMS received event');

          // Get OTP directly from native layer if available, or extract from message
          let detectedOtp = data.otp;
          if (!detectedOtp) {
            const message = data.message || '';
            const otpMatch = message.match(/\b(\d{6})\b/);
            if (otpMatch) {
              detectedOtp = otpMatch[1];
            }
          }

          if (detectedOtp) {
            console.log('📱 Auto-filling OTP');
            setOtp(detectedOtp);
            setAutoDetected(true);
            toast({
              title: t('auth.otpAutoDetected', 'OTP Auto-detected'),
              description: t('auth.otpAutoFilled', 'Code filled automatically')
            });
          }
        });

        // Also listen for errors
        SmsRetrieverPlugin.addListener('smsError', (error: any) => {
          console.log('📱 SMS Retriever error/timeout:', error);
        });
      } catch (error) {
        console.error('❌ SMS Retriever error:', error);
      }
    };

    console.log('📱 Starting SMS Retriever for OTP page...');
    startSmsRetriever();

    return () => {
      if (SmsRetrieverPlugin) {
        console.log('📱 Cleaning up SMS Retriever...');
        if (listenerHandle?.remove) {
          listenerHandle.remove();
        }
        SmsRetrieverPlugin.removeAllListeners?.();
        SmsRetrieverPlugin.stopWatching?.().catch(() => {});
      }
    };
  }, [toast, t]);

  // Auto-verify when OTP is complete
  useEffect(() => {
    if (otp.length === 6 && !loading) {
      handleVerifyOtp();
    }
  }, [otp]);

  const normalizePhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 12 && cleaned.startsWith('91')) {
      return `+${cleaned}`;
    }
    if (cleaned.length === 10) {
      return `+91${cleaned}`;
    }
    return cleaned.startsWith('91') ? `+${cleaned}` : `+91${cleaned}`;
  };

  const handleVerifyOtp = async () => {
    if (!state?.phone || otp.length !== 6) return;

    try {
      setLoading(true);
      const phone = normalizePhone(state.phone);

      const { data, error } = await supabase.auth.verifyOtp({
        phone,
        token: otp,
        type: 'sms'
      });

      if (error) throw error;
      if (!data.user) throw new Error("No user returned");

      if (state.mode === 'signin') {
        // Sign In flow: the server alone links this login to a worker record.
        // Never re-point a worker record from the phone (account takeover risk).
        // Now that the phone is verified, the server may say whether it is registered.
        const { data: registered, error: lookupError } = await supabase.rpc('worker_phone_exists', { _phone: phone });
        if (!lookupError && registered === false) {
          await supabase.auth.signOut().catch(() => undefined);
          try { sessionStorage.removeItem(OTP_STATE_KEY); } catch {}
          clearAccountBrowserData();
          try {
            localStorage.setItem("didi-worker-auth-draft-v1", JSON.stringify({ activeTab: "signup", signUpPhone: phone.replace(/^\+91/, "") }));
          } catch {}
          toast({ title: t('auth.accountNotRegistered', 'Account not registered'), description: t('auth.signUpFirst', 'Please sign up first to create your account'), variant: "destructive" });
          navigate("/auth", { replace: true });
          return;
        }
      } else if (state.mode === 'signup' && state.signUpData) {
        // Admin-owned registration: the server checks the verified phone,
        // validates bank details, creates the worker (OFF, pending approval)
        // and registers the Cashfree beneficiary. No direct workers writes.
        const bank = peekSignupBank();
        const result = bank
          ? await registerWorkerV2({
              fullName: state.signUpData.fullName,
              phone: state.phone,
              services: state.signUpData.services,
              community: state.signUpData.community,
              upiId: state.signUpData.upiId || null,
              bank,
            })
          : { ok: false as const, error: "bank_details_missing" as const };
        if ("error" in result && result.error !== "login_already_linked") {
          // Leave no half-registered session behind; the worker retries from sign-up.
          await supabase.auth.signOut().catch(() => undefined);
          try { sessionStorage.removeItem(OTP_STATE_KEY); } catch {}
          clearAccountBrowserData();
          toast({ title: displayText("Registration not completed"), description: displayText(REGISTRATION_ERROR_TEXT[result.error]), variant: "destructive" });
          navigate("/auth", { replace: true });
          return;
        }
        takeSignupBank();
        // Bank beneficiary registration for the new worker (fire-and-forget; the
        // server also syncs on its own). Readiness is read back from the server later.
        if ("workerId" in result && result.workerId) void requestOwnBeneficiary(result.workerId);
      }

      // Save JWT to native storage
      if (Capacitor.isNativePlatform() && AuthBridge && data.session?.access_token) {
        console.log('🔐 [OTP Page] Saving JWT...');
        try {
          await AuthBridge.saveToken({ token: data.session.access_token });
          console.log('✅ [OTP Page] JWT saved successfully');
        } catch (err) {
          console.error('❌ [OTP Page] Failed to save JWT:', err);
        }
      }

      toast({
        title: t('auth.success', 'Success!'),
        description: state.mode === 'signin' 
          ? t('auth.signedIn', 'Signed in successfully') 
          : t('auth.accountCreated', 'Account created successfully')
      });

      // Clear resume state once OTP is verified
      try { sessionStorage.removeItem(OTP_STATE_KEY); } catch {}

      // Navigate based on mode. Fallback with window.location because the
      // react-router navigate is occasionally swallowed by the auth-state
      // change re-render on native webview (toast shows "Signed in" but
      // the page stays on /otp-verify until the app is reopened).
      const target = state.mode === 'signup' ? '/availability?from=signup' : '/home';
      navigate(target, { replace: true });
      setTimeout(() => {
        if (window.location.pathname.startsWith('/otp')) {
          console.warn('[OtpVerify] navigate() did not change route, forcing hard redirect to', target);
          window.location.replace(target);
        }
      }, 400);
    } catch (error: any) {
      toast({
        title: t('auth.error', 'Error'),
        description: error.message,
        variant: "destructive"
      });
      setOtp("");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!state?.phone || !canResend) return;

    try {
      setLoading(true);
      const phone = normalizePhone(state.phone);

      const { error } = await supabase.auth.signInWithOtp({ phone });
      if (error) throw error;

      setResendTimer(30);
      setCanResend(false);
      toast({
        title: t('auth.otpResent', 'OTP Resent'),
        description: t('auth.checkPhone', 'Check your phone for the verification code')
      });
    } catch (error: any) {
      toast({
        title: t('auth.error', 'Error'),
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const maskedPhone = state?.phone ? 
    `${state.phone.slice(0, 2)}****${state.phone.slice(-4)}` : '';

  if (!state?.phone) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 p-4">
      <div className="w-full max-w-md space-y-4">
        {/* Back Button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => { try { sessionStorage.removeItem(OTP_STATE_KEY); } catch {} navigate("/auth"); }}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('common.back', 'Back')}
        </Button>

        <Card className="w-full">
          <CardHeader className="space-y-4 text-center">
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Shield className="w-10 h-10 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl">
              {t('auth.verifyOtp', 'Verify OTP')}
            </CardTitle>
            <CardDescription className="text-base">
              {t('auth.otpSentTo', 'We have sent a 6-digit OTP to')}
              <br />
              <span className="font-semibold text-foreground flex items-center justify-center gap-2 mt-1">
                <Phone className="h-4 w-4" />
                +91 {maskedPhone}
              </span>
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* OTP Input */}
            <div className="flex flex-col items-center gap-4">
              <InputOTP
                maxLength={6}
                value={otp}
                onChange={setOtp}
                disabled={loading}
                autoFocus
                inputMode="numeric"
                pattern="[0-9]*"
                containerClassName="gap-2"
              >
                <InputOTPGroup className="gap-2">
                  <InputOTPSlot index={0} className="w-12 h-14 text-xl font-bold border-2 rounded-lg" />
                  <InputOTPSlot index={1} className="w-12 h-14 text-xl font-bold border-2 rounded-lg" />
                  <InputOTPSlot index={2} className="w-12 h-14 text-xl font-bold border-2 rounded-lg" />
                  <InputOTPSlot index={3} className="w-12 h-14 text-xl font-bold border-2 rounded-lg" />
                  <InputOTPSlot index={4} className="w-12 h-14 text-xl font-bold border-2 rounded-lg" />
                  <InputOTPSlot index={5} className="w-12 h-14 text-xl font-bold border-2 rounded-lg" />
                </InputOTPGroup>
              </InputOTP>

              {autoDetected && (
                <div className="flex items-center gap-2 text-green-600 text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  {t('auth.otpAutoDetected', 'OTP Auto-detected')}
                </div>
              )}
            </div>

            {/* Verify Button */}
            <Button
              onClick={handleVerifyOtp}
              disabled={loading || otp.length !== 6}
              className="w-full h-12 text-base font-semibold"
            >
              {loading ? t('auth.verifying', 'Verifying...') : t('auth.verifyOtp', 'Verify OTP')}
            </Button>

            {/* Resend OTP */}
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                {t('auth.didntReceive', "Didn't receive the OTP?")}
              </p>
              {canResend ? (
                <Button
                  variant="link"
                  onClick={handleResendOtp}
                  disabled={loading}
                  className="text-primary font-semibold"
                >
                  {t('auth.resendOtp', 'Resend OTP')}
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t('auth.resendIn', 'Resend in')} <span className="font-semibold text-primary">{resendTimer}s</span>
                </p>
              )}
            </div>

            {/* Change Number */}
            <Button
              variant="outline"
              onClick={() => { try { sessionStorage.removeItem(OTP_STATE_KEY); } catch {} navigate("/auth"); }}
              disabled={loading}
              className="w-full"
            >
              {t('auth.changePhone', 'Change Phone Number')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
