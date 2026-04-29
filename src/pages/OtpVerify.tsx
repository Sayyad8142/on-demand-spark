import { useState, useEffect, useRef } from "react";
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
import { extractBankDetailsFromPassbook } from "@/lib/bankDetailsExtraction";

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;
// @ts-ignore - SMS Retriever bridge
const SmsRetrieverPlugin = (window as any).Capacitor?.Plugins?.SmsRetrieverPlugin;

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

  // Get state from navigation
  const state = location.state as OtpVerifyState | null;

  // Redirect if no state
  useEffect(() => {
    if (!state?.phone) {
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
          console.log('📱 SMS received event:', data);

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
            console.log('📱 Auto-filling OTP:', detectedOtp);
            setOtp(detectedOtp);
            setAutoDetected(true);
            toast({
              title: t('auth.otpAutoDetected', 'OTP Auto-detected'),
              description: t('auth.otpAutoFilled', `Code ${detectedOtp} filled automatically`, { otp: detectedOtp })
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
        // Sign In flow
        const { data: existingWorker, error: workerCheckError } = await supabase
          .from('workers')
          .select('*')
          .eq('phone', phone)
          .maybeSingle();

        if (workerCheckError) {
          console.error('Error checking worker:', workerCheckError);
        }

        if (existingWorker) {
          await supabase.from('workers').update({ id: data.user.id }).eq('phone', phone);
        }
      } else if (state.mode === 'signup' && state.signUpData) {
        // Sign Up flow
        const { fullName, upiId, community, services, qrData, bankDetails, passbookFile } = state.signUpData;
        const hasValidBankDetails = !!(
          bankDetails?.account_holder_name?.trim()
          && /^\d{9,18}$/.test(bankDetails.bank_account_number || "")
          && /^[A-Z]{4}0[A-Z0-9]{6}$/.test((bankDetails.ifsc_code || "").toUpperCase())
        );

        // Fetch the community ID
        const { data: communityData, error: communityError } = await supabase
          .from('communities')
          .select('id')
          .eq('value', community)
          .single();

        if (communityError) {
          console.error('Error fetching community ID:', communityError);
          throw new Error('Failed to fetch community information');
        }

        // Check if worker exists
        const { data: existingWorker } = await supabase
          .from('workers')
          .select('*')
          .eq('phone', phone)
          .maybeSingle();

        const validServices = services;
        
        // Prepare QR data fields
        let upiQrUrl: string | null = null;
        let upiQrPayload: string | null = null;
        let upiQrUploadedAt: string | null = null;
        let passbookPath: string | null = null;

        // Upload QR if provided
        if (qrData?.file) {
          const filePath = `${data.user.id}/${Date.now()}.png`;

          const { error: uploadError } = await supabase.storage
            .from('worker-upi-qr')
            .upload(filePath, qrData.file, {
              cacheControl: '3600',
              upsert: false,
            });

          if (uploadError) {
            throw uploadError;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('worker-upi-qr')
            .getPublicUrl(filePath);

          upiQrUrl = publicUrl;
          upiQrPayload = qrData.payload;
          upiQrUploadedAt = new Date().toISOString();
        }

        if (passbookFile) {
          const ext = passbookFile.type === "application/pdf" ? "pdf" : passbookFile.type.split("/")[1] || "jpg";
          passbookPath = `${data.user.id}/passbook-${Date.now()}.${ext}`;
          const { error: passbookUploadError } = await supabase.storage
            .from('worker-passbook')
            .upload(passbookPath, passbookFile, {
              cacheControl: '3600',
              upsert: true,
              contentType: passbookFile.type,
            });
          if (passbookUploadError) throw passbookUploadError;
        }

        // Bank details captured during signup (optional)
        const bankFieldsForInsert = bankDetails
          ? {
              account_holder_name: bankDetails.account_holder_name,
              bank_account_number: bankDetails.bank_account_number,
              ifsc_code: bankDetails.ifsc_code,
              bank_name: bankDetails.bank_name,
              bank_details_source: 'manual' as const,
              passbook_url: passbookPath,
              payout_ready: hasValidBankDetails,
            }
          : passbookPath
            ? { passbook_url: passbookPath, bank_details_source: 'passbook' as const }
            : {};

        if (existingWorker) {
          const { error: workerError } = await supabase.from('workers').upsert({
            id: data.user.id,
            user_id: data.user.id,
            full_name: fullName.trim(),
            phone,
            upi_id: upiId?.trim() || existingWorker.upi_id,
            upi_qr_url: upiQrUrl || existingWorker.upi_qr_url,
            upi_qr_payload: upiQrPayload || existingWorker.upi_qr_payload,
            upi_qr_uploaded_at: upiQrUploadedAt || existingWorker.upi_qr_uploaded_at,
            service_types: validServices,
            communities: [community],
            selected_community_id: communityData.id,
            is_active: true,
            is_available: false,
            is_busy: false,
              payout_ready: hasValidBankDetails,
            // Only overwrite bank fields if newly provided during signup
            ...(bankDetails
              ? {
                  account_holder_name: bankDetails.account_holder_name,
                  bank_account_number: bankDetails.bank_account_number,
                  ifsc_code: bankDetails.ifsc_code,
                  bank_name: bankDetails.bank_name,
                  bank_details_source: 'manual',
                  passbook_url: passbookPath || existingWorker.passbook_url,
                  payout_ready: hasValidBankDetails,
                }
              : passbookPath
                ? { passbook_url: passbookPath, bank_details_source: 'passbook' }
                : {}),
          }, { onConflict: 'id' });
          if (workerError) throw workerError;
        } else {
          const { error: workerError } = await supabase.from('workers').insert({
            id: data.user.id,
            user_id: data.user.id,
            full_name: fullName.trim(),
            phone,
            upi_id: upiId?.trim() || null,
            upi_qr_url: upiQrUrl,
            upi_qr_payload: upiQrPayload,
            upi_qr_uploaded_at: upiQrUploadedAt,
            service_types: validServices,
            communities: [community],
            selected_community_id: communityData.id,
            is_active: true,
            is_available: false,
            is_busy: false,
            payout_ready: hasValidBankDetails,
            ...bankFieldsForInsert,
          });
          if (workerError) throw workerError;
        }

        if (passbookPath && !bankDetails) {
          try {
            await extractBankDetailsFromPassbook(passbookPath, data.user.id);
          } catch (extractError) {
            console.warn('Passbook extraction after signup failed:', extractError);
          }
        }
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

      // Navigate based on mode
      if (state.mode === 'signup') {
        // New signup → always send to Account Details first
        navigate("/account-details?from=signup", { replace: true });
      } else {
        navigate("/home", { replace: true });
      }
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
          onClick={() => navigate("/auth")}
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
                className="gap-2"
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
              onClick={() => navigate("/auth")}
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
