import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";
import { Capacitor } from '@capacitor/core';
import { useTranslation } from "react-i18next";
import { Check, ChevronLeft, ChevronRight, FileText, Landmark, Phone, QrCode, ShieldCheck, Sparkles, Upload, UserRound, X, Loader2 } from "lucide-react";
import jsQR from "jsqr";
import didiPartnerLogo from "@/assets/didi-partner-logo.png";
import maidServiceIcon from "@/assets/service-maid.png";
import bathroomServiceIcon from "@/assets/service-bathroom.png";
import { extractBankDetailsFromFile } from "@/lib/bankDetailsExtraction";


// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;
// @ts-ignore - SMS Retriever bridge
const SmsRetrieverPlugin = (window as any).Capacitor?.Plugins?.SmsRetrieverPlugin;
const SERVICES = [{
  value: "maid",
  label: "auth.services.maid",
  icon: maidServiceIcon,
  description: "Sweeping, mopping, dishes & more"
}, {
  value: "bathroom_cleaning",
  label: "auth.services.bathroom_cleaning",
  icon: bathroomServiceIcon,
  description: "Deep bathroom cleaning"
}];

// SECURITY: Input validation schemas
const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, 'Invalid phone number. Must be 10 digits starting with 6-9').length(10, 'Phone number must be exactly 10 digits');
const nameSchema = z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must not exceed 100 characters').regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters and spaces');
const upiSchema = z.string().regex(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/, 'Invalid UPI ID format (e.g., name@bank)');
const otpSchema = z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits').length(6);
const ifscSchema = z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code (e.g., HDFC0001234)');
const accountNumberSchema = z.string().regex(/^\d{9,18}$/, 'Account number must be 9–18 digits');
const PASSBOOK_ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const PASSBOOK_MAX_SIZE = 8 * 1024 * 1024;
const AUTH_DRAFT_KEY = "didi-worker-auth-draft-v1";
export default function Auth() {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const {
    user,
    loading: authLoading
  } = useAuth();
  const {
    t,
    i18n
  } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("signin");
  const [communities, setCommunities] = useState<Array<{
    name: string;
    value: string;
  }>>([]);

  // Redirect if already logged in or in guest mode
  useEffect(() => {
    const isGuestMode = localStorage.getItem('guest_mode') === 'true';
    if (!authLoading && (user || isGuestMode)) {
      console.log('👤 User already logged in or in guest mode, redirecting to home');
      navigate("/home", {
        replace: true
      });
    }
  }, [user, authLoading, navigate]);

  // Sign In state
  const [signInPhone, setSignInPhone] = useState("");

  // Sign Up state
  const [signUpFullName, setSignUpFullName] = useState("");
  const [signUpPhone, setSignUpPhone] = useState("");
  const [signUpUpiId, setSignUpUpiId] = useState("");
  const [signUpCommunity, setSignUpCommunity] = useState("");
  const [signUpServices, setSignUpServices] = useState<string[]>([]);
  // Bank account details (optional during signup)
  const [signUpAccountHolderName, setSignUpAccountHolderName] = useState("");
  const [signUpBankAccountNumber, setSignUpBankAccountNumber] = useState("");
  const [signUpConfirmAccountNumber, setSignUpConfirmAccountNumber] = useState("");
  const [signUpIfscCode, setSignUpIfscCode] = useState("");
  const [signUpBankName, setSignUpBankName] = useState("");
  const [signUpPassbookFile, setSignUpPassbookFile] = useState<File | null>(null);
  const [extractingPassbook, setExtractingPassbook] = useState(false);
  const [decodingUpiQr, setDecodingUpiQr] = useState(false);
  const [upiQrFilledFrom, setUpiQrFilledFrom] = useState<string | null>(null);
  const [signUpStep, setSignUpStep] = useState(1);
  const [showBankDetails, setShowBankDetails] = useState(true);
  // Selected payout method on Step 2. UPI is the default and recommended path.
  const [payoutMethod, setPayoutMethod] = useState<'upi' | 'bank'>('upi');
  // Collapsible bank fallback section on Step 2.
  const [showBankFallback, setShowBankFallback] = useState(false);
  // Admin-controlled flag: when false, signup payout step shows ONLY UPI input.
  // Default true to preserve existing behavior until config loads.
  const [bankPayoutEnabled, setBankPayoutEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('app_config')
          .select('enable_bank_payout_details')
          .limit(1)
          .maybeSingle();
        console.log('[PAYOUT_CONFIG_RAW]', data, 'error:', error?.message);
        console.log('[PAYOUT_CONFIG_VALUE]', data?.enable_bank_payout_details);
        if (error) {
          console.warn('[PAYOUT_CONFIG_LOADED] failed, defaulting to bank ENABLED', error.message);
          return;
        }
        // Strict: only true (or null/undefined fallback) keeps bank visible. false hides it.
        const raw = data?.enable_bank_payout_details;
        const enabled = raw === false ? false : true;
        if (cancelled) return;
        setBankPayoutEnabled(enabled);
        console.log('[BANK_PAYOUT_STATE]', enabled);
        console.log('[PAYOUT_CONFIG_LOADED]', { enable_bank_payout_details: enabled });
        if (enabled) console.log('[BANK_DETAILS_VISIBLE]');
        else console.log('[UPI_ONLY_MODE]');
      } catch (e: any) {
        console.warn('[PAYOUT_CONFIG_LOADED] error', e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  const [draftRestored, setDraftRestored] = useState(false);
  const passbookInputRef = useRef<HTMLInputElement>(null);
  const upiQrInputRef = useRef<HTMLInputElement>(null);

  const decodeUpiFromQrFile = (file: File): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(null);
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          const payload = code?.data || "";
          URL.revokeObjectURL(img.src);
          if (!payload) return resolve(null);
          const paMatch = payload.match(/[?&]pa=([^&]+)/i);
          if (paMatch) return resolve(decodeURIComponent(paMatch[1]));
          if (/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/.test(payload)) return resolve(payload);
          resolve(null);
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = URL.createObjectURL(file);
    });
  };

  const handleUpiQrSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (event.target) event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please upload a QR code image", variant: "destructive" });
      return;
    }
    setDecodingUpiQr(true);
    try {
      const upi = await decodeUpiFromQrFile(file);
      if (!upi) {
        toast({ title: "Could not read QR", description: "Try a clearer photo of your UPI QR", variant: "destructive" });
        return;
      }
      setSignUpUpiId(upi);
      setUpiQrFilledFrom(upi);
      toast({ title: "UPI ID added", description: upi });
    } finally {
      setDecodingUpiQr(false);
    }
  };
  

  // Auto OTP detection moved to OtpVerify page
  useEffect(() => {
    const fetchCommunities = async () => {
      const {
        data,
        error
      } = await supabase.from('communities').select('name, value').eq('is_active', true).order('name');
      if (error) {
        console.error('Error fetching communities:', error);
        return;
      }
      setCommunities(data || []);
    };
    fetchCommunities();
  }, []);

  useEffect(() => {
    try {
      const savedDraft = localStorage.getItem(AUTH_DRAFT_KEY);
      if (!savedDraft) {
        setDraftRestored(true);
        return;
      }

      const draft = JSON.parse(savedDraft);
      if (draft.activeTab === "signin" || draft.activeTab === "signup") setActiveTab(draft.activeTab);
      if (typeof draft.signInPhone === "string") setSignInPhone(draft.signInPhone);
      if (typeof draft.signUpFullName === "string") setSignUpFullName(draft.signUpFullName);
      if (typeof draft.signUpPhone === "string") setSignUpPhone(draft.signUpPhone);
      if (typeof draft.signUpUpiId === "string") setSignUpUpiId(draft.signUpUpiId);
      if (typeof draft.signUpCommunity === "string") setSignUpCommunity(draft.signUpCommunity);
      if (Array.isArray(draft.signUpServices)) setSignUpServices(draft.signUpServices.filter((service: unknown) => typeof service === "string"));
      if (typeof draft.signUpAccountHolderName === "string") setSignUpAccountHolderName(draft.signUpAccountHolderName);
      if (typeof draft.signUpBankAccountNumber === "string") setSignUpBankAccountNumber(draft.signUpBankAccountNumber);
      if (typeof draft.signUpConfirmAccountNumber === "string") setSignUpConfirmAccountNumber(draft.signUpConfirmAccountNumber);
      if (typeof draft.signUpIfscCode === "string") setSignUpIfscCode(draft.signUpIfscCode);
      if (typeof draft.signUpBankName === "string") setSignUpBankName(draft.signUpBankName);
    } catch (error) {
      console.error("Could not restore auth draft:", error);
      localStorage.removeItem(AUTH_DRAFT_KEY);
    } finally {
      setDraftRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!draftRestored) return;

    localStorage.setItem(AUTH_DRAFT_KEY, JSON.stringify({
      activeTab,
      signInPhone,
      signUpFullName,
      signUpPhone,
      signUpUpiId,
      signUpCommunity,
      signUpServices,
      signUpAccountHolderName,
      signUpBankAccountNumber,
      signUpConfirmAccountNumber,
      signUpIfscCode,
      signUpBankName,
    }));
  }, [
    activeTab,
    draftRestored,
    signInPhone,
    signUpFullName,
    signUpPhone,
    signUpUpiId,
    signUpCommunity,
    signUpServices,
    signUpAccountHolderName,
    signUpBankAccountNumber,
    signUpConfirmAccountNumber,
    signUpIfscCode,
    signUpBankName,
  ]);

  const normalizePhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.startsWith('91') ? `+${cleaned}` : `+91${cleaned}`;
  };

  const handlePassbookSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!PASSBOOK_ACCEPTED_TYPES.includes(file.type)) {
      toast({ title: "Invalid file", description: "Upload JPG, PNG, WEBP, or PDF", variant: "destructive" });
      event.target.value = "";
      return;
    }

    if (file.size > PASSBOOK_MAX_SIZE) {
      toast({ title: "File too large", description: "Max size is 8MB", variant: "destructive" });
      event.target.value = "";
      return;
    }

    setSignUpPassbookFile(file);
    setExtractingPassbook(true);

    try {
      const details = await extractBankDetailsFromFile(file);
      if (details?.account_holder_name) setSignUpAccountHolderName(details.account_holder_name);
      if (details?.bank_account_number) {
        setSignUpBankAccountNumber(details.bank_account_number);
        setSignUpConfirmAccountNumber(details.bank_account_number);
      }
      if (details?.ifsc_code) setSignUpIfscCode(details.ifsc_code.toUpperCase());
      if (details?.bank_name) setSignUpBankName(details.bank_name);

      if (details?.account_holder_name || details?.bank_account_number || details?.ifsc_code) {
        toast({ title: "Account details filled", description: "Please verify the extracted details before continuing" });
      } else {
        toast({ title: "Could not find details", description: "Please enter the bank details manually", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Could not read image", description: err?.message || "Please enter the bank details manually", variant: "destructive" });
    } finally {
      setExtractingPassbook(false);
    }
  };

  const selectedCommunityName = communities.find(community => community.value === signUpCommunity)?.name || "Not selected";
  const selectedServiceLabels = signUpServices.map(serviceValue => {
    const service = SERVICES.find(item => item.value === serviceValue);
    return service ? t(service.label) : serviceValue;
  });
  const hasPayoutDetails = !!(signUpAccountHolderName.trim() || signUpBankAccountNumber.trim() || signUpConfirmAccountNumber.trim() || signUpIfscCode.trim() || signUpBankName.trim() || signUpPassbookFile || signUpUpiId.trim());
  const canContinueSignup = !!signUpFullName && !!signUpPhone && !!signUpCommunity && signUpServices.length > 0;

  const skipSignupPayoutDetails = () => {
    setShowBankDetails(false);
    setSignUpAccountHolderName("");
    setSignUpBankAccountNumber("");
    setSignUpConfirmAccountNumber("");
    setSignUpIfscCode("");
    setSignUpBankName("");
    setSignUpUpiId("");
    setSignUpPassbookFile(null);
    if (passbookInputRef.current) passbookInputRef.current.value = "";
    setSignUpStep(3);
  };

  const goToSignupStepThree = () => {
    const upi = signUpUpiId.trim();
    const hasUpi = !!upi;

    // UPI is ALWAYS required for payouts (instant settlement).
    if (!hasUpi) {
      toast({
        title: "UPI ID is required",
        description: "Please enter your UPI ID or scan a UPI QR code to receive payouts.",
        variant: "destructive",
      });
      return;
    }
    const upiValidation = upiSchema.safeParse(upi);
    if (!upiValidation.success) {
      toast({
        title: "Invalid UPI ID",
        description: upiValidation.error.errors[0].message,
        variant: "destructive",
      });
      return;
    }

    // Bank fields are optional. Only validate if the fallback is open AND any field filled.
    const anyBankFilled = bankPayoutEnabled && showBankFallback && !!(
      signUpAccountHolderName.trim() ||
      signUpBankAccountNumber.trim() ||
      signUpConfirmAccountNumber.trim() ||
      signUpIfscCode.trim()
    );
    if (!anyBankFilled) {
      setSignUpStep(3);
      return;
    }

    if (!signUpAccountHolderName.trim()) {
      toast({ title: "Account holder name required", variant: "destructive" });
      return;
    }
    if (!accountNumberSchema.safeParse(signUpBankAccountNumber.trim()).success) {
      toast({ title: "Invalid bank account number", description: "Must be 9–18 digits.", variant: "destructive" });
      return;
    }
    if (signUpBankAccountNumber.trim() !== signUpConfirmAccountNumber.trim()) {
      toast({ title: "Account numbers do not match", variant: "destructive" });
      return;
    }
    if (!ifscSchema.safeParse(signUpIfscCode.trim().toUpperCase()).success) {
      toast({ title: "Invalid IFSC code", description: "Format: 4 letters + 0 + 6 alphanumeric.", variant: "destructive" });
      return;
    }
    setSignUpStep(3);
  };



  const goToSignupStepTwo = () => {
    if (!canContinueSignup) {
      toast({
        title: "Please fill basic details",
        description: signUpServices.length === 0 ? "Select at least one service type" : "Name, phone, community, and service are required",
        variant: "destructive"
      });
      return;
    }
    setSignUpStep(2);
  };

  const handleSignInSendOtp = async () => {
    if (!signInPhone) {
      toast({
        title: "Please enter your phone number",
        variant: "destructive"
      });
      return;
    }

    // Demo mode: Auto-login for Play Store reviewers
    if (signInPhone === "9999999999") {
      try {
        setLoading(true);
        const {
          data,
          error
        } = await supabase.auth.signInWithPassword({
          email: "demo@didisnow.app",
          password: "DemoPartner2025!"
        });
        if (error) throw error;
        if (!data.user) throw new Error("Demo login failed");

        // CRITICAL: Save JWT to native storage immediately for overlay functionality
        if (Capacitor.isNativePlatform() && AuthBridge && data.session?.access_token) {
          console.log('🔐 [Demo Auth] Saving JWT immediately...');
          try {
            await AuthBridge.saveToken({
              token: data.session.access_token
            });
            console.log('✅ [Demo Auth] JWT saved successfully');
          } catch (err) {
            console.error('❌ [Demo Auth] Failed to save JWT:', err);
          }
        }

        // Set demo mode flag
        localStorage.setItem('demo_mode', 'true');
        toast({
          title: "Demo Mode Activated",
          description: "Logged in as demo user for Play Store review"
        });
        navigate("/home");
        return;
      } catch (error: any) {
        toast({
          title: "Demo Login Error",
          description: error.message,
          variant: "destructive"
        });
        return;
      } finally {
        setLoading(false);
      }
    }

    // SECURITY: Validate phone number format
    const validation = phoneSchema.safeParse(signInPhone);
    if (!validation.success) {
      toast({
        title: "Invalid phone number",
        description: validation.error.errors[0].message,
        variant: "destructive"
      });
      return;
    }
    try {
      setLoading(true);
      const phone = normalizePhone(signInPhone);

      // Check if worker with this phone exists via SECURITY DEFINER RPC
      // (anon role cannot SELECT workers directly due to RLS).
      // URGENT RECOVERY: Bypass check for specific worker phone reported by user
      const isRecoveryPhone = signInPhone === "8367561667";
      
      let phoneExists = false;
      let checkError = null;

      if (isRecoveryPhone) {
        console.log("🛠️ Recovery phone detected, bypassing existence check");
        phoneExists = true;
      } else {
        const {
          data,
          error: workerCheckError
        } = await supabase.rpc('worker_phone_exists', { _phone: phone });
        
        phoneExists = !!data;
        checkError = workerCheckError;
      }

      if (checkError) {
        console.error('Error checking worker existence:', checkError);
        // If the RPC fails (e.g. RLS change, network, or server error), 
        // we shouldn't immediately block the user with "Account not registered".
        // Instead, we allow the OTP attempt. The subsequent verifyOtp + profile lookup
        // will be the final authority.
        phoneExists = true; 
      }

      if (!phoneExists) {
        toast({
          title: t('auth.accountNotRegistered', 'Account not registered'),
          description: t('auth.signUpFirst', 'Please sign up first to create your account'),
          variant: "destructive"
        });
        // Pre-fill phone in sign up and switch tab
        setSignUpPhone(signInPhone);
        setActiveTab("signup");
        setLoading(false);
        return;
      }
      const {
        error
      } = await supabase.auth.signInWithOtp({
        phone
      });
      if (error) throw error;
      localStorage.removeItem(AUTH_DRAFT_KEY);

      // Navigate to OTP verification page
      navigate("/otp-verify", {
        state: {
          phone: signInPhone,
          mode: 'signin'
        }
      });
      toast({
        title: "OTP sent!",
        description: "Check your phone for the verification code"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const handleSignUpSendOtp = async () => {
    if (!signUpFullName || !signUpPhone || !signUpCommunity || signUpServices.length === 0) {
      toast({
        title: "Please fill all required fields",
        description: signUpServices.length === 0 ? "Select at least one service type" : undefined,
        variant: "destructive"
      });
      return;
    }

    // SECURITY: Validate all inputs
    const nameValidation = nameSchema.safeParse(signUpFullName);
    if (!nameValidation.success) {
      toast({
        title: "Invalid name",
        description: nameValidation.error.errors[0].message,
        variant: "destructive"
      });
      return;
    }
    const phoneValidation = phoneSchema.safeParse(signUpPhone);
    if (!phoneValidation.success) {
      toast({
        title: "Invalid phone number",
        description: phoneValidation.error.errors[0].message,
        variant: "destructive"
      });
      return;
    }
    // UPI is mandatory during signup.
    if (!signUpUpiId.trim()) {
      toast({
        title: "UPI ID is required",
        description: "Please enter your UPI ID to receive payouts.",
        variant: "destructive"
      });
      return;
    }
    const upiValidation = upiSchema.safeParse(signUpUpiId.trim());
    if (!upiValidation.success) {
      toast({
        title: "Invalid UPI ID",
        description: upiValidation.error.errors[0].message,
        variant: "destructive"
      });
      return;
    }

    // Bank details are optional. If ANY bank field is filled, validate ALL required bank fields.
    // When admin flag `enable_bank_payout_details=false`, bank section is hidden — skip entirely.
    const bankAccountNumber = bankPayoutEnabled ? signUpBankAccountNumber.trim() : "";
    const confirmAccountNumber = bankPayoutEnabled ? signUpConfirmAccountNumber.trim() : "";
    const accountHolderNameBank = bankPayoutEnabled ? signUpAccountHolderName.trim() : "";
    const ifscCode = bankPayoutEnabled ? signUpIfscCode.trim().toUpperCase() : "";
    const bankName = bankPayoutEnabled ? signUpBankName.trim() : "";
    const anyBankFieldFilled = bankPayoutEnabled && !!(bankAccountNumber || confirmAccountNumber || accountHolderNameBank || ifscCode || bankName);
    let bankPayload: {
      account_holder_name: string;
      bank_account_number: string;
      ifsc_code: string;
      bank_name: string | null;
    } | null = null;

    if (anyBankFieldFilled) {
      if (!accountHolderNameBank) {
        toast({ title: "Account holder name is required", description: "Please complete bank details or clear them all.", variant: "destructive" });
        return;
      }
      const acctValidation = accountNumberSchema.safeParse(bankAccountNumber);
      if (!acctValidation.success) {
        toast({ title: "Invalid bank account number", description: acctValidation.error.errors[0].message, variant: "destructive" });
        return;
      }
      if (bankAccountNumber !== confirmAccountNumber) {
        toast({ title: "Account numbers do not match", description: "Please re-enter the same account number in both fields.", variant: "destructive" });
        return;
      }
      const ifscValidation = ifscSchema.safeParse(ifscCode);
      if (!ifscValidation.success) {
        toast({ title: "Invalid IFSC code", description: ifscValidation.error.errors[0].message, variant: "destructive" });
        return;
      }
      bankPayload = {
        account_holder_name: accountHolderNameBank,
        bank_account_number: bankAccountNumber,
        ifsc_code: ifscCode,
        bank_name: bankName || null,
      };
    }
    try {
      setLoading(true);
      const phone = normalizePhone(signUpPhone);
      const validSignupServices = signUpServices.filter(service => SERVICES.some(item => item.value === service));
      const {
        error
      } = await supabase.auth.signInWithOtp({
        phone,
        options: {
          data: {
            full_name: signUpFullName.trim(),
            upi_id: signUpUpiId?.trim() || null,
            service_types: validSignupServices,
            communities: [signUpCommunity]
          }
        }
      });
      if (error) throw error;
      localStorage.removeItem(AUTH_DRAFT_KEY);

      // Navigate to OTP verification page with signup data
      navigate("/otp-verify", {
        state: {
          phone: signUpPhone,
          mode: 'signup',
          signUpData: {
            fullName: signUpFullName,
            upiId: signUpUpiId,
            community: signUpCommunity,
            services: validSignupServices,
            cuisineTags: [],
            qrData: null,
            bankDetails: bankPayload,
            payoutReady: !!(signUpUpiId.trim() || bankPayload),
            passbookFile: signUpPassbookFile,
          }
        }
      });
      toast({
        title: "OTP sent!",
        description: "Check your phone for the verification code"
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  // OTP verification is now handled in OtpVerify page
  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 p-4">
      <div className="w-full max-w-md space-y-4">
        {/* Guest Button - Top Right */}
        <div className="flex justify-end">
          <Button variant="ghost" size="icon" onClick={() => {
          localStorage.setItem('guest_mode', 'true');
          toast({
            title: "Guest Mode",
            description: "Exploring as guest with demo data"
          });
          navigate("/home");
        }} className="h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm shadow-sm" title={t('auth.continueAsGuest', 'Continue as Guest')}>
            <UserRound className="h-4 w-4" />
          </Button>
        </div>

        <Card className="w-full">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <img src={didiPartnerLogo} alt="Didi Now Partner" className="w-24 h-24" />
          </div>
          
          
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">{t('auth.signIn')}</TabsTrigger>
              <TabsTrigger value="signup">{t('auth.signUp')}</TabsTrigger>
            </TabsList>

            {/* Sign In Tab */}
            <TabsContent value="signin" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-phone">{t('auth.phoneLabel')}</Label>
                <Input id="signin-phone" type="tel" placeholder={t('auth.phonePlaceholder')} value={signInPhone} onChange={e => setSignInPhone(e.target.value)} maxLength={10} disabled={loading} />
              </div>

              <Button onClick={handleSignInSendOtp} disabled={loading || !signInPhone} className="w-full">
                {loading ? t('auth.sending') : t('auth.sendOtp')}
              </Button>
            </TabsContent>

            {/* Sign Up Tab */}
            <TabsContent value="signup" className="space-y-5">
              <div className="rounded-2xl bg-primary/10 p-1">
                <div className="grid grid-cols-3 gap-1 text-center text-[11px] font-semibold">
                  {["Basic", "Payout", "Confirm"].map((label, index) => {
                    const stepNumber = index + 1;
                    const active = signUpStep === stepNumber;
                    const complete = signUpStep > stepNumber;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          if (stepNumber === 1) setSignUpStep(1);
                          if (stepNumber === 2) goToSignupStepTwo();
                          if (stepNumber === 3 && canContinueSignup) setSignUpStep(3);
                        }}
                        className={`rounded-xl px-2 py-2 transition-all ${
                          active || complete ? "bg-background text-primary shadow-sm" : "text-muted-foreground"
                        }`}
                      >
                        <span className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs">
                          {complete ? <Check className="h-3.5 w-3.5" /> : stepNumber}
                        </span>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {signUpStep === 1 && (
                <div className="space-y-5 rounded-3xl border bg-card p-4 shadow-sm">
                  <div>
                    <p className="text-lg font-bold">Step 1: Basic Details</p>
                    <p className="text-sm text-muted-foreground">Tell us where you work and what service you provide.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-name" className="text-base">{t('auth.fullNameLabel')}</Label>
                    <Input id="signup-name" type="text" placeholder={t('auth.namePlaceholder')} value={signUpFullName} onChange={e => setSignUpFullName(e.target.value)} disabled={loading} className="h-12 rounded-2xl text-base" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-phone" className="text-base">{t('auth.phoneLabel')} *</Label>
                    <Input id="signup-phone" type="tel" placeholder={t('auth.phonePlaceholder')} value={signUpPhone} onChange={e => setSignUpPhone(e.target.value)} maxLength={10} disabled={loading} className="h-12 rounded-2xl text-base" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-community" className="text-base">{t('auth.communityLabel')}</Label>
                    <Select value={signUpCommunity} onValueChange={setSignUpCommunity} disabled={loading}>
                      <SelectTrigger className="h-12 rounded-2xl text-base">
                        <SelectValue placeholder={t('auth.selectCommunity')} />
                      </SelectTrigger>
                      <SelectContent>
                        {communities.map(community => <SelectItem key={community.value} value={community.value}>
                            {community.name}
                          </SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <Label className="text-base">Service Type</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {SERVICES.map(service => {
                        const isSelected = signUpServices.includes(service.value);
                        const isMaid = service.value === "maid";
                        const serviceTitle = isMaid ? "Maid Service" : "Bathroom Cleaning";
                        const serviceImg = isMaid ? maidServiceIcon : bathroomServiceIcon;
                        const serviceDesc = isMaid
                          ? "Sweeping, mopping, dishwashing & more"
                          : "Deep bathroom & tile cleaning";
                        return (
                          <button
                            key={service.value}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSignUpServices(prev => prev.filter(s => s !== service.value));
                              } else {
                                setSignUpServices(prev => [...prev, service.value]);
                              }
                            }}
                            disabled={loading}
                            className={`group relative flex flex-col overflow-hidden rounded-[20px] border-2 text-left transition-all duration-200 ${
                              isSelected
                                ? 'border-[#ff007a] bg-[#ff007a]/[0.06] shadow-[0_8px_24px_-6px_rgba(255,0,122,0.25)]'
                                : 'border-transparent bg-white shadow-[0_2px_12px_-4px_rgba(0,0,0,0.08)] hover:shadow-[0_8px_24px_-6px_rgba(0,0,0,0.12)]'
                            }`}
                          >
                            {/* Image */}
                            <div className="relative h-32 w-full overflow-hidden">
                              <img
                                src={serviceImg}
                                alt={serviceTitle}
                                loading="lazy"
                                width={512}
                                height={512}
                                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                              />
                              {/* Checkmark overlay */}
                              <span className={`absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all ${isSelected ? 'border-[#ff007a] bg-[#ff007a] text-white shadow-md scale-110' : 'border-white/80 bg-white/80 text-transparent'}`}>
                                <Check className="h-3.5 w-3.5" strokeWidth={3} />
                              </span>
                            </div>

                            {/* Text content */}
                            <div className="flex flex-1 flex-col justify-between p-3">
                              <div>
                                <span className={`block text-sm font-bold leading-tight ${isSelected ? 'text-[#ff007a]' : 'text-gray-900'}`}>
                                  {serviceTitle}
                                </span>
                                <span className="mt-1 block text-[11px] leading-snug text-gray-500">
                                  {serviceDesc}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <Button onClick={goToSignupStepTwo} disabled={loading} className="h-12 w-full rounded-2xl text-base font-semibold">
                    Continue
                  </Button>
                </div>
              )}

              {signUpStep === 2 && (() => {
                const trimmedUpi = signUpUpiId.trim();
                const upiValid = upiSchema.safeParse(trimmedUpi).success;
                const upiShowError = trimmedUpi.length > 0 && !upiValid;
                return (
                <div className="space-y-5">
                  {/* Header */}
                  <div className="space-y-1.5 px-1">
                    <h2 className="text-2xl font-bold tracking-tight">
                      Get Paid Instantly <span aria-hidden>💸</span>
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Add your UPI ID so we can send your earnings instantly after every completed booking.
                    </p>
                  </div>

                  {/* Primary UPI card */}
                  <div className="space-y-5 rounded-3xl border-2 border-[#ff007a]/20 bg-gradient-to-br from-pink-50/60 via-white to-white p-4 shadow-sm">
                    <div className="flex items-start gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#ff007a]/10 text-[#ff007a]">
                        <QrCode className="h-6 w-6" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-base font-bold">UPI ID</p>
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700">
                            Recommended
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Instant payouts • Takes less than 30 seconds
                        </p>
                      </div>
                    </div>

                    {/* Option 1 — Upload QR */}
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => upiQrInputRef.current?.click()}
                        disabled={loading || decodingUpiQr}
                        className={`group relative block w-full overflow-hidden rounded-2xl border-2 border-dashed p-4 text-left transition-all active:scale-[0.99] disabled:opacity-60 ${
                          upiQrFilledFrom
                            ? 'border-green-500 bg-green-50'
                            : 'border-[#ff007a]/40 bg-white hover:border-[#ff007a]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm ring-2 ${upiQrFilledFrom ? 'ring-green-500/40' : 'ring-[#ff007a]/20'}`}>
                            {decodingUpiQr ? (
                              <Loader2 className="h-7 w-7 animate-spin text-[#ff007a]" />
                            ) : upiQrFilledFrom ? (
                              <Check className="h-8 w-8 text-green-600" strokeWidth={2.5} />
                            ) : (
                              <QrCode className="h-8 w-8 text-gray-900" strokeWidth={1.5} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm font-bold ${upiQrFilledFrom ? 'text-green-700' : 'text-gray-900'}`}>
                              {decodingUpiQr
                                ? 'Reading your QR...'
                                : upiQrFilledFrom
                                ? '✓ UPI QR uploaded'
                                : '📷 Upload UPI QR'}
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              {upiQrFilledFrom
                                ? `Detected: ${upiQrFilledFrom} · Tap to re-scan`
                                : 'PhonePe • Google Pay • Paytm • BHIM'}
                            </p>
                          </div>
                        </div>
                      </button>
                      {!upiQrFilledFrom && (
                        <p className="px-1 text-[11px] text-muted-foreground">Any UPI QR works.</p>
                      )}
                      <input
                        ref={upiQrInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleUpiQrSelect}
                        className="hidden"
                      />
                    </div>

                    {/* Divider */}
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-border" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">OR</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>

                    {/* Option 2 — Type UPI */}
                    <div className="space-y-2">
                      <Label htmlFor="signup-upi" className="text-sm font-semibold">
                        Enter UPI ID
                      </Label>
                      <div className="relative">
                        <Input
                          id="signup-upi"
                          type="text"
                          required
                          placeholder="yourname@okaxis"
                          value={signUpUpiId}
                          onChange={e => { setSignUpUpiId(e.target.value); if (upiQrFilledFrom && e.target.value !== upiQrFilledFrom) setUpiQrFilledFrom(null); }}
                          disabled={loading}
                          className={`h-12 rounded-2xl pr-10 text-base ${
                            upiValid
                              ? 'border-green-500/60 bg-green-50/40'
                              : upiShowError
                              ? 'border-amber-500/70 bg-amber-50/40'
                              : ''
                          }`}
                        />
                        {upiValid && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-green-600 p-1 text-white">
                            <Check className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                      {upiValid ? (
                        <p className="flex items-center gap-1 text-xs font-medium text-green-700">
                          ✅ UPI ID looks valid
                        </p>
                      ) : upiShowError ? (
                        <p className="flex items-center gap-1 text-xs font-medium text-amber-700">
                          ⚠️ Please enter a valid UPI ID
                        </p>
                      ) : (
                        <div className="rounded-xl bg-muted/50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                          <span className="font-semibold text-foreground">Examples:</span>
                          <br />9876543210@ybl
                          <br />name@oksbi
                          <br />username@paytm
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Bank fallback (collapsed) */}
                  {bankPayoutEnabled && (
                    <div className="rounded-2xl border bg-card">
                      {!showBankFallback ? (
                        <button
                          type="button"
                          onClick={() => setShowBankFallback(true)}
                          className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                        >
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                              <Landmark className="h-3 w-3" />
                            </div>
                            <p className="text-xs font-medium">
                              Can't receive UPI? <span className="text-muted-foreground">Add bank account</span>
                            </p>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>

                      ) : (
                        <div className="space-y-4 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-bold">Bank Account (Optional)</p>
                              <p className="text-[11px] text-muted-foreground">Used only if UPI payouts are unavailable.</p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full"
                              onClick={() => setShowBankFallback(false)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="signup-acct-name" className="text-sm">Account Holder Name</Label>
                            <Input id="signup-acct-name" type="text" placeholder="Name as on bank account" value={signUpAccountHolderName} onChange={e => setSignUpAccountHolderName(e.target.value)} disabled={loading} className="h-12 rounded-2xl text-base" />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="signup-acct-no" className="text-sm">Account Number</Label>
                            <Input id="signup-acct-no" inputMode="numeric" placeholder="9 to 18 digits" value={signUpBankAccountNumber} onChange={e => setSignUpBankAccountNumber(e.target.value.replace(/\D/g, ""))} maxLength={18} disabled={loading} className="h-12 rounded-2xl text-base" />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="signup-acct-no-confirm" className="text-sm">Confirm Account Number</Label>
                            <Input id="signup-acct-no-confirm" inputMode="numeric" placeholder="Re-enter account number" value={signUpConfirmAccountNumber} onChange={e => setSignUpConfirmAccountNumber(e.target.value.replace(/\D/g, ""))} maxLength={18} disabled={loading} className="h-12 rounded-2xl text-base" />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="signup-ifsc" className="text-sm">IFSC Code</Label>
                            <Input id="signup-ifsc" type="text" placeholder="e.g., HDFC0001234" value={signUpIfscCode} onChange={e => setSignUpIfscCode(e.target.value.toUpperCase())} maxLength={11} disabled={loading} className="h-12 rounded-2xl text-base uppercase" />
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm">Passbook / Cancelled Cheque (optional)</Label>
                            {signUpPassbookFile ? (
                              <div className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                                  <FileText className="h-5 w-5 text-muted-foreground" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{signUpPassbookFile.name}</p>
                                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <Check className="h-3 w-3" /> {extractingPassbook ? "Reading details..." : "Details auto-filled — verify above"}
                                  </p>
                                </div>
                                <Button type="button" variant="ghost" size="icon" onClick={() => {
                                  setSignUpPassbookFile(null);
                                  if (passbookInputRef.current) passbookInputRef.current.value = "";
                                }} disabled={loading || extractingPassbook} className="h-9 w-9 rounded-full">
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => passbookInputRef.current?.click()} disabled={loading || extractingPassbook} className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-border bg-background p-4 text-center transition-colors hover:bg-muted/50 disabled:opacity-50">
                                <Upload className="h-5 w-5 text-muted-foreground" />
                                <span className="text-sm font-semibold">Upload passbook or cheque</span>
                                <span className="text-[11px] text-muted-foreground">Auto-fills bank details</span>
                              </button>
                            )}
                            <input ref={passbookInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handlePassbookSelect} className="hidden" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="grid grid-cols-[auto_1fr] gap-3 pt-1">
                    <Button type="button" variant="outline" onClick={() => setSignUpStep(1)} className="h-14 rounded-2xl px-5">
                      <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <Button
                      type="button"
                      onClick={goToSignupStepThree}
                      disabled={extractingPassbook || !upiValid}
                      className="h-14 rounded-2xl bg-[#ff007a] text-base font-semibold text-white hover:bg-[#ff007a]/90"
                    >
                      Continue
                    </Button>
                  </div>
                </div>
                );
              })()}



              {signUpStep === 3 && (
                <div className="space-y-5 rounded-3xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-lg font-bold">Step 3: Confirm & Send OTP</p>
                      <p className="text-sm text-muted-foreground">Check your details before verification.</p>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl bg-muted/60 p-4 text-sm">
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">Name</span><span className="text-right font-semibold">{signUpFullName || "Not entered"}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">Phone</span><span className="text-right font-semibold">{signUpPhone || "Not entered"}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">Community</span><span className="text-right font-semibold">{selectedCommunityName}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">Service</span><span className="text-right font-semibold">{selectedServiceLabels.length ? selectedServiceLabels.join(", ") : "Not selected"}</span></div>
                    <div className="flex justify-between gap-3"><span className="text-muted-foreground">Payout</span><span className="text-right font-semibold">{hasPayoutDetails ? "Added" : "Skipped for now"}</span></div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button type="button" variant="outline" onClick={() => setSignUpStep(2)} className="h-12 rounded-2xl">
                      <ChevronLeft className="mr-1 h-4 w-4" /> Back
                    </Button>
                    <Button onClick={handleSignUpSendOtp} disabled={loading || extractingPassbook || !signUpFullName || !signUpPhone || !signUpCommunity || signUpServices.length === 0} className="h-12 rounded-2xl font-semibold">
                      {loading ? t('auth.sending') : extractingPassbook ? "Reading image..." : t('auth.sendOtp')}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Language Selector - Below Card */}
      <div className="flex items-center justify-center gap-1 rounded-full bg-background/80 p-1.5 shadow-sm backdrop-blur-sm">
        <Button variant={i18n.language === 'en' ? 'default' : 'ghost'} size="sm" onClick={() => {
          i18n.changeLanguage('en');
          localStorage.setItem('language', 'en');
          toast({
            title: "Language changed to English"
          });
        }} className="h-8 rounded-full px-3 text-xs">
          English
        </Button>
        <Button variant={i18n.language === 'hi' ? 'default' : 'ghost'} size="sm" onClick={() => {
          i18n.changeLanguage('hi');
          localStorage.setItem('language', 'hi');
          toast({
            title: "भाषा हिंदी में बदल गई"
          });
        }} className="h-8 rounded-full px-3 text-xs">
          हिंदी
        </Button>
        <Button variant={i18n.language === 'te' ? 'default' : 'ghost'} size="sm" onClick={() => {
          i18n.changeLanguage('te');
          localStorage.setItem('language', 'te');
          toast({
            title: "భాష తెలుగులోకి మార్చబడింది"
          });
        }} className="h-8 rounded-full px-3 text-xs">
          తెలుగు
        </Button>
      </div>

      {/* Call Support Button */}
      <a href="tel:8008180018" className="w-full mt-4">
        <Button className="my-2 h-11 w-full rounded-full bg-success text-success-foreground text-sm font-semibold shadow-sm hover:bg-success/90">
          <Phone className="w-4 h-4 mr-2" />
          Call manager
        </Button>
      </a>


      </div>
    </div>;
}