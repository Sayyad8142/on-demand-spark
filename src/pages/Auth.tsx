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
import didiPartnerLogo from "@/assets/didi-partner-logo.png";
import { auth, getRecaptchaVerifier, clearRecaptchaVerifier } from "@/lib/firebase";
import { signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";
import { signInToSupabaseWithFirebaseToken } from "@/lib/supabaseAuthFirebase";

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;
// @ts-ignore - SMS Retriever bridge
const SmsRetrieverPlugin = (window as any).Capacitor?.Plugins?.SmsRetrieverPlugin;

const SERVICES = [{
  value: "maid",
  label: "auth.services.maid"
}, {
  value: "cook",
  label: "auth.services.cook"
}, {
  value: "bathroom_cleaning",
  label: "auth.services.bathroom_cleaning"
}];

// SECURITY: Input validation schemas
const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, 'Invalid phone number. Must be 10 digits starting with 6-9').length(10, 'Phone number must be exactly 10 digits');
const nameSchema = z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must not exceed 100 characters').regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters and spaces');
const upiSchema = z.string().regex(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/, 'Invalid UPI ID format (e.g., name@bank)').optional().or(z.literal(''));
const otpSchema = z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits').length(6);

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [communities, setCommunities] = useState<Array<{ name: string; value: string }>>([]);
  const [resendTimer, setResendTimer] = useState(0);
  
  // Firebase confirmation result
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);

  // Redirect if already logged in or in guest mode
  useEffect(() => {
    const isGuestMode = localStorage.getItem('guest_mode') === 'true';
    if (!authLoading && (user || isGuestMode)) {
      console.log('👤 User already logged in or in guest mode, redirecting to home');
      navigate("/home", { replace: true });
    }
  }, [user, authLoading, navigate]);

  // Sign In state
  const [signInPhone, setSignInPhone] = useState("");
  const [signInOtp, setSignInOtp] = useState("");

  // Sign Up state
  const [signUpFullName, setSignUpFullName] = useState("");
  const [signUpPhone, setSignUpPhone] = useState("");
  const [signUpUpiId, setSignUpUpiId] = useState("");
  const [signUpCommunity, setSignUpCommunity] = useState("");
  const [signUpServices, setSignUpServices] = useState<string[]>([]);
  const [signUpCuisineTags, setSignUpCuisineTags] = useState<string[]>([]);
  const [signUpOtp, setSignUpOtp] = useState("");
  
  // Track which tab is active for OTP
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const interval = setInterval(() => {
        setResendTimer(prev => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [resendTimer]);

  // Auto OTP detection for Android
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !SmsRetrieverPlugin) {
      return;
    }
    const startSmsRetriever = async () => {
      try {
        const result = await SmsRetrieverPlugin.startWatching();
        console.log('📱 SMS Retriever started:', result);

        SmsRetrieverPlugin.addListener('smsReceived', (data: any) => {
          console.log('📱 SMS received:', data);
          const message = data.message || '';
          const otpMatch = message.match(/\b\d{6}\b/);
          if (otpMatch) {
            const otp = otpMatch[0];
            console.log('📱 Auto-filled OTP:', otp);
            setSignInOtp(otp);
            setSignUpOtp(otp);
            toast({
              title: "OTP Auto-detected",
              description: `Code ${otp} filled automatically`
            });
          }
        });
      } catch (error) {
        console.error('❌ SMS Retriever error:', error);
      }
    };
    if (otpSent) {
      startSmsRetriever();
    }
    return () => {
      if (SmsRetrieverPlugin) {
        SmsRetrieverPlugin.removeAllListeners();
        SmsRetrieverPlugin.stopWatching().catch(console.error);
      }
    };
  }, [otpSent, toast]);

  useEffect(() => {
    const fetchCommunities = async () => {
      const { data, error } = await supabase
        .from('communities')
        .select('name, value')
        .eq('is_active', true)
        .order('name');
      if (error) {
        console.error('Error fetching communities:', error);
        return;
      }
      setCommunities(data || []);
    };
    fetchCommunities();
  }, []);

  // Cleanup reCAPTCHA on unmount
  useEffect(() => {
    return () => {
      clearRecaptchaVerifier();
    };
  }, []);

  const normalizePhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.startsWith('91') ? `+${cleaned}` : `+91${cleaned}`;
  };

  const handleFirebaseError = (error: any) => {
    console.error('Firebase Auth Error:', error);
    const code = error?.code || '';

    if (code === 'auth/invalid-verification-code') {
      toast({ title: "Invalid OTP", description: "The verification code is incorrect. Please try again.", variant: "destructive" });
    } else if (code === 'auth/code-expired') {
      toast({ title: "OTP Expired", description: "The verification code has expired. Please request a new one.", variant: "destructive" });
    } else if (code === 'auth/too-many-requests') {
      toast({ title: "Too Many Requests", description: "Too many attempts. Please try again later.", variant: "destructive" });
    } else if (code === 'auth/invalid-phone-number') {
      toast({ title: "Invalid Phone", description: "The phone number format is invalid.", variant: "destructive" });
    } else if (code === 'auth/invalid-app-credential') {
      toast({
        title: "App verification failed",
        description:
          "reCAPTCHA verification failed. If this is the Android app, set Capacitor to https://localhost and ensure Firebase Auth → Authorized domains includes 'localhost'.",
        variant: "destructive",
      });
    } else {
      toast({ title: "Error", description: error.message || "Something went wrong", variant: "destructive" });
    }
  };

  const handleSignInSendOtp = async () => {
    if (!signInPhone) {
      toast({ title: "Please enter your phone number", variant: "destructive" });
      return;
    }

    // Demo mode: Auto-login for Play Store reviewers
    if (signInPhone === "9999999999") {
      try {
        setLoading(true);
        const { data, error } = await supabase.auth.signInWithPassword({
          email: "demo@didisnow.app",
          password: "DemoPartner2025!"
        });
        if (error) throw error;
        if (!data.user) throw new Error("Demo login failed");

        if (Capacitor.isNativePlatform() && AuthBridge && data.session?.access_token) {
          console.log('🔐 [Demo Auth] Saving JWT immediately...');
          try {
            await AuthBridge.saveToken({ token: data.session.access_token });
            console.log('✅ [Demo Auth] JWT saved successfully');
          } catch (err) {
            console.error('❌ [Demo Auth] Failed to save JWT:', err);
          }
        }

        localStorage.setItem('demo_mode', 'true');
        toast({ title: "Demo Mode Activated", description: "Logged in as demo user for Play Store review" });
        navigate("/home");
        return;
      } catch (error: any) {
        toast({ title: "Demo Login Error", description: error.message, variant: "destructive" });
        return;
      } finally {
        setLoading(false);
      }
    }

    const validation = phoneSchema.safeParse(signInPhone);
    if (!validation.success) {
      toast({ title: "Invalid phone number", description: validation.error.errors[0].message, variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      clearRecaptchaVerifier();
      const phone = normalizePhone(signInPhone);
      const verifier = getRecaptchaVerifier('recaptcha-container');
      await verifier.render();
      const result = await signInWithPhoneNumber(auth, phone, verifier);
      confirmationResultRef.current = result;
      setOtpSent(true);
      setResendTimer(30);
      toast({ title: "OTP sent!", description: "Check your phone for the verification code" });
    } catch (error: any) {
      handleFirebaseError(error);
      clearRecaptchaVerifier();
    } finally {
      setLoading(false);
    }
  };

  const handleSignInVerifyOtp = async () => {
    if (!signInPhone || !signInOtp) {
      toast({ title: "Please enter phone and OTP", variant: "destructive" });
      return;
    }

    const validation = otpSchema.safeParse(signInOtp);
    if (!validation.success) {
      toast({ title: "Invalid OTP", description: "OTP must be 6 digits", variant: "destructive" });
      return;
    }

    if (!confirmationResultRef.current) {
      toast({ title: "Error", description: "Please request OTP again", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const phone = normalizePhone(signInPhone);
      
      // Verify OTP with Firebase
      const userCredential = await confirmationResultRef.current.confirm(signInOtp);
      const idToken = await userCredential.user.getIdToken(true);
      
      // Sign in to Supabase with Firebase token
      const supabaseData = await signInToSupabaseWithFirebaseToken(idToken);
      
      if (!supabaseData.user) throw new Error("No user returned from Supabase");

      // Check if a worker with this phone already exists
      const { data: existingWorker, error: workerCheckError } = await supabase
        .from('workers')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();
        
      if (workerCheckError) {
        console.error('Error checking worker:', workerCheckError);
      }
      
      if (existingWorker) {
        // Link existing worker to auth user
        await supabase.from('workers').update({ id: supabaseData.user.id }).eq('phone', phone);
      }

      // Save JWT to native storage
      if (Capacitor.isNativePlatform() && AuthBridge && supabaseData.session?.access_token) {
        console.log('🔐 [Auth Page] Saving JWT immediately after sign-in...');
        try {
          await AuthBridge.saveToken({ token: supabaseData.session.access_token });
          const verify = await AuthBridge.getToken();
          if (verify?.token === supabaseData.session.access_token) {
            console.log('✅ [Auth Page] JWT saved and verified successfully');
          } else {
            console.error('❌ [Auth Page] JWT verification failed!');
          }
        } catch (err) {
          console.error('❌ [Auth Page] Failed to save JWT:', err);
        }
      }
      
      toast({ title: "Success!", description: "Signed in successfully" });
      navigate("/home");
    } catch (error: any) {
      handleFirebaseError(error);
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

    const nameValidation = nameSchema.safeParse(signUpFullName);
    if (!nameValidation.success) {
      toast({ title: "Invalid name", description: nameValidation.error.errors[0].message, variant: "destructive" });
      return;
    }
    
    const phoneValidation = phoneSchema.safeParse(signUpPhone);
    if (!phoneValidation.success) {
      toast({ title: "Invalid phone number", description: phoneValidation.error.errors[0].message, variant: "destructive" });
      return;
    }
    
    if (signUpUpiId) {
      const upiValidation = upiSchema.safeParse(signUpUpiId);
      if (!upiValidation.success) {
        toast({ title: "Invalid UPI ID", description: upiValidation.error.errors[0].message, variant: "destructive" });
        return;
      }
    }

    try {
      setLoading(true);
      clearRecaptchaVerifier();
      const phone = normalizePhone(signUpPhone);
      const verifier = getRecaptchaVerifier('recaptcha-container');
      await verifier.render();
      const result = await signInWithPhoneNumber(auth, phone, verifier);
      confirmationResultRef.current = result;
      setOtpSent(true);
      setResendTimer(30);
      toast({ title: "OTP sent!", description: "Check your phone for the verification code" });
    } catch (error: any) {
      handleFirebaseError(error);
      clearRecaptchaVerifier();
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpVerifyOtp = async () => {
    if (!signUpPhone || !signUpOtp) {
      toast({ title: "Please enter phone and OTP", variant: "destructive" });
      return;
    }

    const validation = otpSchema.safeParse(signUpOtp);
    if (!validation.success) {
      toast({ title: "Invalid OTP", description: "OTP must be 6 digits", variant: "destructive" });
      return;
    }

    if (!confirmationResultRef.current) {
      toast({ title: "Error", description: "Please request OTP again", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const phone = normalizePhone(signUpPhone);
      
      // Verify OTP with Firebase
      const userCredential = await confirmationResultRef.current.confirm(signUpOtp);
      const idToken = await userCredential.user.getIdToken(true);
      
      // Sign in to Supabase with Firebase token
      const supabaseData = await signInToSupabaseWithFirebaseToken(idToken);
      
      if (!supabaseData.user) throw new Error("No user returned from Supabase");

      // Fetch the community ID from the community value
      const { data: communityData, error: communityError } = await supabase
        .from('communities')
        .select('id')
        .eq('value', signUpCommunity)
        .single();

      if (communityError) {
        console.error('Error fetching community ID:', communityError);
        throw new Error('Failed to fetch community information');
      }

      // Check if worker with this phone already exists
      const { data: existingWorker } = await supabase
        .from('workers')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

      const cuisineTags = signUpServices.includes('cook') ? signUpCuisineTags : [];

      if (existingWorker) {
        // Update existing worker
        const { error: workerError } = await supabase.from('workers').upsert({
          id: supabaseData.user.id,
          full_name: signUpFullName.trim(),
          phone,
          upi_id: signUpUpiId?.trim() || existingWorker.upi_id,
          service_types: signUpServices,
          communities: [signUpCommunity],
          selected_community_id: communityData.id,
          cook_cuisine_tags: cuisineTags,
          is_active: true,
          is_available: false,
          is_busy: false
        }, { onConflict: 'id' });
        if (workerError) throw workerError;
      } else {
        // Create new worker profile
        const { error: workerError } = await supabase.from('workers').insert({
          id: supabaseData.user.id,
          full_name: signUpFullName.trim(),
          phone,
          upi_id: signUpUpiId?.trim() || null,
          service_types: signUpServices,
          communities: [signUpCommunity],
          selected_community_id: communityData.id,
          cook_cuisine_tags: cuisineTags,
          is_active: true,
          is_available: false,
          is_busy: false
        });
        if (workerError) throw workerError;
      }

      // Save JWT to native storage
      if (Capacitor.isNativePlatform() && AuthBridge && supabaseData.session?.access_token) {
        console.log('🔐 [Auth Page] Saving JWT immediately after sign-up...');
        try {
          await AuthBridge.saveToken({ token: supabaseData.session.access_token });
          const verify = await AuthBridge.getToken();
          if (verify?.token === supabaseData.session.access_token) {
            console.log('✅ [Auth Page] JWT saved and verified successfully');
          } else {
            console.error('❌ [Auth Page] JWT verification failed!');
          }
        } catch (err) {
          console.error('❌ [Auth Page] Failed to save JWT:', err);
        }
      }

      // Check if worker has set availability
      const { data: availabilityData } = await supabase
        .from('worker_availability')
        .select('*')
        .eq('worker_id', supabaseData.user.id)
        .limit(1);
        
      toast({ title: "Success!", description: "Account created successfully" });

      // Redirect to availability page if no slots set, otherwise home
      if (!availabilityData || availabilityData.length === 0) {
        navigate("/availability");
      } else {
        navigate("/home");
      }
    } catch (error: any) {
      handleFirebaseError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendTimer > 0) return;
    
    clearRecaptchaVerifier();
    confirmationResultRef.current = null;
    
    if (activeTab === 'signin') {
      await handleSignInSendOtp();
    } else {
      await handleSignUpSendOtp();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 p-4">
      {/* reCAPTCHA container - invisible */}
      <div id="recaptcha-container" />
      
      <div className="w-full max-w-md space-y-4">
        <Card className="w-full">
          <CardHeader className="space-y-1">
            <div className="flex justify-center mb-4">
              <img src={didiPartnerLogo} alt="Didi Now Partner" className="w-24 h-24" />
            </div>
            <CardTitle className="text-2xl text-center">Didi now Partner</CardTitle>
            <CardDescription className="text-center">
              {t('auth.description')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs 
              defaultValue="signin" 
              className="w-full"
              onValueChange={(value) => setActiveTab(value as 'signin' | 'signup')}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">{t('auth.signIn')}</TabsTrigger>
                <TabsTrigger value="signup">{t('auth.signUp')}</TabsTrigger>
              </TabsList>

              {/* Sign In Tab */}
              <TabsContent value="signin" className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-phone">{t('auth.phoneLabel')}</Label>
                  <Input
                    id="signin-phone"
                    type="tel"
                    placeholder={t('auth.phonePlaceholder')}
                    value={signInPhone}
                    onChange={e => setSignInPhone(e.target.value)}
                    maxLength={10}
                    disabled={otpSent || loading}
                  />
                </div>

                {otpSent && (
                  <div className="space-y-2">
                    <Label htmlFor="signin-otp">{t('auth.otpLabel')}</Label>
                    <Input
                      id="signin-otp"
                      type="text"
                      placeholder={t('auth.otpPlaceholder')}
                      value={signInOtp}
                      onChange={e => setSignInOtp(e.target.value)}
                      maxLength={6}
                      disabled={loading}
                    />
                  </div>
                )}

                {!otpSent ? (
                  <Button onClick={handleSignInSendOtp} disabled={loading || !signInPhone} className="w-full">
                    {loading ? t('auth.sending') : t('auth.sendOtp')}
                  </Button>
                ) : (
                  <>
                    <Button onClick={handleSignInVerifyOtp} disabled={loading || !signInOtp} className="w-full">
                      {loading ? t('auth.verifying') : t('auth.verifyOtp')}
                    </Button>
                    
                    <div className="flex gap-2">
                      <Button
                        onClick={handleResendOtp}
                        disabled={loading || resendTimer > 0}
                        variant="outline"
                        className="flex-1"
                      >
                        {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
                      </Button>
                      <Button
                        onClick={() => {
                          setOtpSent(false);
                          setSignInOtp("");
                          confirmationResultRef.current = null;
                          clearRecaptchaVerifier();
                        }}
                        disabled={loading}
                        variant="outline"
                        className="flex-1"
                      >
                        {t('auth.changePhone')}
                      </Button>
                    </div>
                  </>
                )}
              </TabsContent>

              {/* Sign Up Tab */}
              <TabsContent value="signup" className="space-y-4">
                {!otpSent ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="signup-name">{t('auth.fullNameLabel')}</Label>
                      <Input
                        id="signup-name"
                        type="text"
                        placeholder={t('auth.namePlaceholder')}
                        value={signUpFullName}
                        onChange={e => setSignUpFullName(e.target.value)}
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-phone">{t('auth.phoneLabel')} *</Label>
                      <Input
                        id="signup-phone"
                        type="tel"
                        placeholder={t('auth.phonePlaceholder')}
                        value={signUpPhone}
                        onChange={e => setSignUpPhone(e.target.value)}
                        maxLength={10}
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-upi">{t('auth.upiLabel')}</Label>
                      <Input
                        id="signup-upi"
                        type="text"
                        placeholder={t('auth.upiPlaceholder')}
                        value={signUpUpiId}
                        onChange={e => setSignUpUpiId(e.target.value)}
                        disabled={loading}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="signup-community">{t('auth.communityLabel')}</Label>
                      <Select value={signUpCommunity} onValueChange={setSignUpCommunity} disabled={loading}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('auth.selectCommunity')} />
                        </SelectTrigger>
                        <SelectContent>
                          {communities.map(community => (
                            <SelectItem key={community.value} value={community.value}>
                              {community.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <Label>{t('auth.serviceLabel')}</Label>
                      <div className="space-y-2">
                        {SERVICES.map(service => (
                          <div key={service.value} className="flex items-center space-x-3 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors">
                            <Checkbox
                              id={`service-${service.value}`}
                              checked={signUpServices.includes(service.value)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSignUpServices(prev => [...prev, service.value]);
                                } else {
                                  setSignUpServices(prev => prev.filter(s => s !== service.value));
                                  if (service.value === 'cook') {
                                    setSignUpCuisineTags([]);
                                  }
                                }
                              }}
                              disabled={loading}
                            />
                            <Label
                              htmlFor={`service-${service.value}`}
                              className="flex-1 cursor-pointer font-normal"
                            >
                              {t(service.label)}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Cook Cuisine Specialization */}
                    {signUpServices.includes('cook') && (
                      <div className="space-y-3">
                        <Label>{t('auth.cuisineLabel', 'What type of cooking do you specialise in?')}</Label>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-3 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors">
                            <Checkbox
                              id="cuisine-north"
                              checked={signUpCuisineTags.includes('north_indian')}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSignUpCuisineTags(prev => [...prev, 'north_indian']);
                                } else {
                                  setSignUpCuisineTags(prev => prev.filter(c => c !== 'north_indian'));
                                }
                              }}
                              disabled={loading}
                            />
                            <Label htmlFor="cuisine-north" className="flex-1 cursor-pointer font-normal">
                              {t('auth.cuisineNorth', 'North Indian')}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-3 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors">
                            <Checkbox
                              id="cuisine-south"
                              checked={signUpCuisineTags.includes('south_indian')}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSignUpCuisineTags(prev => [...prev, 'south_indian']);
                                } else {
                                  setSignUpCuisineTags(prev => prev.filter(c => c !== 'south_indian'));
                                }
                              }}
                              disabled={loading}
                            />
                            <Label htmlFor="cuisine-south" className="flex-1 cursor-pointer font-normal">
                              {t('auth.cuisineSouth', 'South Indian')}
                            </Label>
                          </div>
                          <div className="flex items-center space-x-3 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors">
                            <Checkbox
                              id="cuisine-both"
                              checked={signUpCuisineTags.includes('north_indian') && signUpCuisineTags.includes('south_indian')}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSignUpCuisineTags(['north_indian', 'south_indian']);
                                } else {
                                  setSignUpCuisineTags([]);
                                }
                              }}
                              disabled={loading}
                            />
                            <Label htmlFor="cuisine-both" className="flex-1 cursor-pointer font-normal">
                              {t('auth.cuisineBoth', 'Both')}
                            </Label>
                          </div>
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={handleSignUpSendOtp}
                      disabled={loading || !signUpFullName || !signUpPhone || !signUpCommunity || signUpServices.length === 0}
                      className="w-full"
                    >
                      {loading ? t('auth.sending') : t('auth.sendOtp')}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="signup-otp">{t('auth.otpLabel')}</Label>
                      <Input
                        id="signup-otp"
                        type="text"
                        placeholder={t('auth.otpPlaceholder')}
                        value={signUpOtp}
                        onChange={e => setSignUpOtp(e.target.value)}
                        maxLength={6}
                        disabled={loading}
                      />
                    </div>

                    <Button onClick={handleSignUpVerifyOtp} disabled={loading || !signUpOtp} className="w-full">
                      {loading ? t('auth.creatingAccount') : t('auth.createAccount')}
                    </Button>
                    
                    <div className="flex gap-2">
                      <Button
                        onClick={handleResendOtp}
                        disabled={loading || resendTimer > 0}
                        variant="outline"
                        className="flex-1"
                      >
                        {resendTimer > 0 ? `Resend in ${resendTimer}s` : 'Resend OTP'}
                      </Button>
                      <Button
                        onClick={() => {
                          setOtpSent(false);
                          setSignUpOtp("");
                          confirmationResultRef.current = null;
                          clearRecaptchaVerifier();
                        }}
                        disabled={loading}
                        variant="outline"
                        className="flex-1"
                      >
                        {t('auth.changePhone')}
                      </Button>
                    </div>
                  </>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Language Selector - Below Card */}
        <div className="flex items-center justify-center gap-2 bg-background/80 backdrop-blur-sm rounded-full shadow-lg p-2">
          <Button
            variant={i18n.language === 'en' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              i18n.changeLanguage('en');
              localStorage.setItem('language', 'en');
              toast({ title: "Language changed to English" });
            }}
            className="rounded-full px-4"
          >
            English
          </Button>
          <Button
            variant={i18n.language === 'hi' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              i18n.changeLanguage('hi');
              localStorage.setItem('language', 'hi');
              toast({ title: "भाषा हिंदी में बदल गई" });
            }}
            className="rounded-full px-4"
          >
            हिंदी
          </Button>
          <Button
            variant={i18n.language === 'te' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => {
              i18n.changeLanguage('te');
              localStorage.setItem('language', 'te');
              toast({ title: "భాష తెలుగులోకి మార్చబడింది" });
            }}
            className="rounded-full px-4"
          >
            తెలుగు
          </Button>
        </div>

        {/* Guest Login Section */}
        <div className="w-full">
          <div className="pt-6 space-y-4">
            <div className="text-center space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  localStorage.setItem('guest_mode', 'true');
                  toast({
                    title: "Guest Mode",
                    description: "You can explore demo features. Create account to receive real bookings."
                  });
                  navigate('/home');
                }}
              >
                Login as Guest
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
