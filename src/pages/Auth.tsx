import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";
import { Capacitor } from '@capacitor/core';
import { useTranslation } from "react-i18next";
import { Building2, Check, ChevronLeft, FileText, Landmark, Phone, ShieldCheck, Upload, UserRound, X } from "lucide-react";
import didiPartnerLogo from "@/assets/didi-partner-logo.png";
import maidServiceIcon from "@/assets/service-maid.jpg";
import bathroomServiceIcon from "@/assets/service-bathroom.jpg";
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
  const [signUpStep, setSignUpStep] = useState(1);
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [draftRestored, setDraftRestored] = useState(false);
  const passbookInputRef = useRef<HTMLInputElement>(null);
  // Cook cuisine tags removed - cook service discontinued
  

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

      // Check if worker with this phone exists (skip for demo number)
      const {
        data: existingWorker,
        error: workerCheckError
      } = await supabase.from('workers').select('id').eq('phone', phone).maybeSingle();
      if (workerCheckError) {
        console.error('Error checking worker:', workerCheckError);
      }
      if (!existingWorker) {
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
    // UPI is optional during signup. Validate only if provided.
    if (signUpUpiId.trim()) {
      const upiValidation = upiSchema.safeParse(signUpUpiId.trim());
      if (!upiValidation.success) {
        toast({
          title: "Invalid UPI ID",
          description: upiValidation.error.errors[0].message,
          variant: "destructive"
        });
        return;
      }
    }

    // Bank details are optional. If ANY bank field is filled, validate ALL required bank fields.
    const bankAccountNumber = signUpBankAccountNumber.trim();
    const confirmAccountNumber = signUpConfirmAccountNumber.trim();
    const accountHolderNameBank = signUpAccountHolderName.trim();
    const ifscCode = signUpIfscCode.trim().toUpperCase();
    const bankName = signUpBankName.trim();
    const anyBankFieldFilled = !!(bankAccountNumber || confirmAccountNumber || accountHolderNameBank || ifscCode || bankName);
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
      const {
        error
      } = await supabase.auth.signInWithOtp({
        phone,
        options: {
          data: {
            full_name: signUpFullName.trim(),
            upi_id: signUpUpiId?.trim() || null,
            service_types: signUpServices,
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
            services: signUpServices,
            cuisineTags: [],
            qrData: null,
            bankDetails: bankPayload,
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
            <TabsContent value="signup" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">{t('auth.fullNameLabel')}</Label>
                <Input id="signup-name" type="text" placeholder={t('auth.namePlaceholder')} value={signUpFullName} onChange={e => setSignUpFullName(e.target.value)} disabled={loading} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-phone">{t('auth.phoneLabel')} *</Label>
                <Input id="signup-phone" type="tel" placeholder={t('auth.phonePlaceholder')} value={signUpPhone} onChange={e => setSignUpPhone(e.target.value)} maxLength={10} disabled={loading} />
              </div>


              {/* Bank Account Details — optional during signup, recommended */}
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">Bank Account Details</p>
                  <p className="text-xs text-muted-foreground">
                    Optional for now, recommended. Required to receive payouts.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-acct-name">Account Holder Name</Label>
                  <Input
                    id="signup-acct-name"
                    type="text"
                    placeholder="Name as on bank account"
                    value={signUpAccountHolderName}
                    onChange={e => setSignUpAccountHolderName(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-acct-no">Bank Account Number</Label>
                  <Input
                    id="signup-acct-no"
                    inputMode="numeric"
                    placeholder="9 to 18 digits"
                    value={signUpBankAccountNumber}
                    onChange={e => setSignUpBankAccountNumber(e.target.value.replace(/\D/g, ""))}
                    maxLength={18}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-acct-no-confirm">Confirm Account Number</Label>
                  <Input
                    id="signup-acct-no-confirm"
                    inputMode="numeric"
                    placeholder="Re-enter account number"
                    value={signUpConfirmAccountNumber}
                    onChange={e => setSignUpConfirmAccountNumber(e.target.value.replace(/\D/g, ""))}
                    maxLength={18}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-ifsc">IFSC Code</Label>
                  <Input
                    id="signup-ifsc"
                    type="text"
                    placeholder="e.g., HDFC0001234"
                    value={signUpIfscCode}
                    onChange={e => setSignUpIfscCode(e.target.value.toUpperCase())}
                    maxLength={11}
                    disabled={loading}
                    className="uppercase"
                  />
                  <p className="text-xs text-muted-foreground">
                    11 characters. Format: 4 letters + 0 + 6 alphanumeric.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-bank-name">Bank Name (optional)</Label>
                  <Input
                    id="signup-bank-name"
                    type="text"
                    placeholder="e.g., HDFC Bank"
                    value={signUpBankName}
                    onChange={e => setSignUpBankName(e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Account Details Image (optional)</Label>
                  {signUpPassbookFile ? (
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-background p-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{signUpPassbookFile.name}</p>
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Check className="h-3 w-3" /> {extractingPassbook ? "Reading details..." : "Details read — verify above"}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSignUpPassbookFile(null);
                          if (passbookInputRef.current) passbookInputRef.current.value = "";
                        }}
                        disabled={loading || extractingPassbook}
                        className="h-8 w-8"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => passbookInputRef.current?.click()}
                      disabled={loading || extractingPassbook}
                      className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border bg-background p-4 text-center transition-colors hover:bg-muted/50 disabled:opacity-50"
                    >
                      <Upload className="h-7 w-7 text-muted-foreground" />
                      <span className="text-sm font-medium">Upload passbook or cheque</span>
                      <span className="text-xs text-muted-foreground">Fills name, account number, and IFSC instantly</span>
                    </button>
                  )}
                  <input
                    ref={passbookInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handlePassbookSelect}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Manual UPI ID Input — optional, saved for future use */}
              <div className="space-y-2">
                <Label htmlFor="signup-upi">{t('auth.upiIdLabel', 'UPI ID')} (optional, for future use)</Label>
                <Input 
                  id="signup-upi" 
                  type="text" 
                  placeholder={t('auth.upiPlaceholder', 'e.g., name@paytm')} 
                  value={signUpUpiId} 
                  onChange={e => setSignUpUpiId(e.target.value)} 
                  disabled={loading} 
                />
                <p className="text-xs text-muted-foreground">
                  You can update bank or UPI details anytime from your profile.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-community">{t('auth.communityLabel')}</Label>
                <Select value={signUpCommunity} onValueChange={setSignUpCommunity} disabled={loading}>
                  <SelectTrigger>
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
                <Label>{t('auth.serviceLabel')}</Label>
                <div className="grid grid-cols-2 gap-3">
                  {SERVICES.map(service => {
                    const isSelected = signUpServices.includes(service.value);
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
                        className={`relative overflow-hidden rounded-2xl border-2 text-left bg-background shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md ${
                          isSelected
                            ? 'border-primary shadow-md ring-2 ring-primary/30 scale-[1.02]'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="relative w-full aspect-square overflow-hidden bg-muted">
                          <img
                            src={service.icon}
                            alt={t(service.label)}
                            loading="lazy"
                            width={512}
                            height={512}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg">
                              <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="p-3">
                          <p className="font-semibold text-sm">{t(service.label)}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{service.description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button onClick={handleSignUpSendOtp} disabled={loading || extractingPassbook || !signUpFullName || !signUpPhone || !signUpCommunity || signUpServices.length === 0} className="w-full">
                {loading ? t('auth.sending') : extractingPassbook ? "Reading account image..." : t('auth.sendOtp')}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Language Selector - Below Card */}
      <div className="flex items-center justify-center gap-2 bg-background/80 backdrop-blur-sm rounded-full shadow-lg p-2">
        <Button variant={i18n.language === 'en' ? 'default' : 'ghost'} size="sm" onClick={() => {
          i18n.changeLanguage('en');
          localStorage.setItem('language', 'en');
          toast({
            title: "Language changed to English"
          });
        }} className="rounded-full px-4">
          English
        </Button>
        <Button variant={i18n.language === 'hi' ? 'default' : 'ghost'} size="sm" onClick={() => {
          i18n.changeLanguage('hi');
          localStorage.setItem('language', 'hi');
          toast({
            title: "भाषा हिंदी में बदल गई"
          });
        }} className="rounded-full px-4">
          हिंदी
        </Button>
        <Button variant={i18n.language === 'te' ? 'default' : 'ghost'} size="sm" onClick={() => {
          i18n.changeLanguage('te');
          localStorage.setItem('language', 'te');
          toast({
            title: "భాష తెలుగులోకి మార్చబడింది"
          });
        }} className="rounded-full px-4">
          తెలుగు
        </Button>
      </div>

      {/* Call Support Button */}
      <a href="tel:8008180018" className="w-full mt-4">
        <Button className="w-full bg-green-600 hover:bg-green-700 text-white py-0 my-[19px]">
          <Phone className="w-4 h-4 mr-2" />
          Call manager
        </Button>
      </a>


      </div>
    </div>;
}