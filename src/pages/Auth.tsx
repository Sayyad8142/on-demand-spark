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
import { Capacitor, registerPlugin } from '@capacitor/core';
import { useTranslation } from "react-i18next";
import didiPartnerLogo from "@/assets/didi-partner-logo.png";
import { auth, getRecaptchaVerifier, ensureRecaptchaRendered, clearRecaptchaVerifier } from "@/lib/firebase";
import { signInWithPhoneNumber, ConfirmationResult } from "firebase/auth";

// Capacitor: register native plugins (do NOT rely on window.Capacitor.Plugins)
const AuthBridge = registerPlugin<any>('AuthBridge');
const SmsRetriever = registerPlugin<any>('SmsRetrieverPlugin');
const FirebasePhoneAuth = registerPlugin<any>('FirebasePhoneAuth');

const isCapPluginAvailable = (name: string) => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable(name);

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
  
  // Firebase confirmation result (web)
  const confirmationResultRef = useRef<ConfirmationResult | null>(null);
  // Native Android verification id
  const nativeVerificationIdRef = useRef<string | null>(null);

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
    if (!otpSent) return;
    if (!isCapPluginAvailable('SmsRetrieverPlugin')) return;

    const startSmsRetriever = async () => {
      try {
        const result = await SmsRetriever.startWatching();
        console.log('📱 SMS Retriever started:', result);

        SmsRetriever.addListener('smsReceived', (data: any) => {
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
              description: `Code ${otp} filled automatically`,
            });
          }
        });
      } catch (error) {
        console.error('❌ SMS Retriever error:', error);
      }
    };

    startSmsRetriever();

    return () => {
      try {
        SmsRetriever.removeAllListeners();
        SmsRetriever.stopWatching().catch(() => undefined);
      } catch {
        // ignore
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
    console.error('🔴 [Auth Error] Full error object:', JSON.stringify(error, null, 2));
    const code = error?.code || '';
    const msg = (error?.message || error?.error_description || '').toString().toLowerCase();
    const status = error?.status;

    // Show actionable guidance for Supabase Third-Party Firebase Auth errors
    if (msg.includes('custom oidc provider') && msg.includes('not found')) {
      toast({
        title: "Firebase Auth Setup Required",
        description:
          "Supabase Firebase provider is not configured. Go to Supabase Dashboard → Auth → Third-party Auth → Firebase and enable/configure it.",
        variant: "destructive",
      });
      return;
    }

    // Most common case: Firebase provider is enabled but Supabase rejects the Firebase ID token
    // because required Firebase custom claims are missing or the user is using an old token.
    if (msg.includes('custom oidc provider') && msg.includes('not allowed') && msg.includes('firebase')) {
      toast({
        title: "Login not ready yet",
        description:
          "Supabase rejected your Firebase token. Ensure Firebase users have custom claims role=authenticated and aud=authenticated, then sign out and sign in again to refresh the token.",
        variant: "destructive",
      });
      return;
    }

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
          "reCAPTCHA verification failed. Android now uses native PhoneAuth (no captcha UI). If this happens on web, ensure 'localhost' is an authorized domain in Firebase Auth.",
        variant: "destructive",
      });
    } else {
      toast({ title: "Error", description: msg || "Something went wrong", variant: "destructive" });
    }
  };

  const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

  const sendOtp = async (phoneE164: string) => {
    // On native Android, always use the native Firebase PhoneAuth plugin
    if (isNativeAndroid) {
      const available = isCapPluginAvailable('FirebasePhoneAuth');
      console.log('📲 [OTP] Native Android detected, plugin available:', available);

      if (!available) {
        throw new Error('FirebasePhoneAuth plugin not available on Android. Please rebuild the app.');
      }

      try {
        console.log('📲 [OTP] Using native Android PhoneAuth (no reCAPTCHA UI)');
        const res = await FirebasePhoneAuth.sendOtp({ phone: phoneE164 });

        // Auto verification can happen on some devices/SIMs.
        if (res?.autoVerified && res?.idToken) {
          return { kind: 'idToken' as const, idToken: res.idToken as string };
        }

        nativeVerificationIdRef.current = (res?.verificationId as string) || null;
        return { kind: 'sent' as const };
      } catch (nativeErr: any) {
        console.error('❌ [OTP] Native plugin error:', nativeErr);
        throw nativeErr; // Don't fall back to web on Android
      }
    }

    console.log('🌐 [OTP] Using web Firebase Phone Auth (invisible reCAPTCHA)');
    await ensureRecaptchaRendered('recaptcha-container');
    const verifier = getRecaptchaVerifier('recaptcha-container');
    const result = await signInWithPhoneNumber(auth, phoneE164, verifier);
    confirmationResultRef.current = result;
    return { kind: 'sent' as const };
  };

  const verifyOtp = async (otp: string) => {
    if (isNativeAndroid) {
      if (!isCapPluginAvailable('FirebasePhoneAuth')) {
        throw new Error('FirebasePhoneAuth plugin not available on Android. Please rebuild the app.');
      }

      const verificationId = nativeVerificationIdRef.current;
      if (!verificationId) throw new Error('missing verificationId');
      console.log('🔎 [OTP] Verifying via native Android PhoneAuth');
      const res = await FirebasePhoneAuth.verifyOtp({ otp, verificationId });
      if (!res?.idToken) throw new Error('missing idToken');
      return res.idToken as string;
    }

    if (!confirmationResultRef.current) throw new Error('missing confirmation result');
    console.log('🔎 [OTP] Verifying via web Firebase Phone Auth');
    const userCredential = await confirmationResultRef.current.confirm(otp);
    return await userCredential.user.getIdToken(true);
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

        const authBridge = isCapPluginAvailable('AuthBridge') ? AuthBridge : null;
        if (authBridge && data.session?.access_token) {
          console.log('🔐 [Demo Auth] Saving JWT immediately...');
          try {
            await authBridge.saveToken({ token: data.session.access_token });
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
      const phone = normalizePhone(signInPhone);
      nativeVerificationIdRef.current = null;
      confirmationResultRef.current = null;

      const res = await sendOtp(phone);

      // If auto-verified, Firebase user is already set - navigate directly
      if (res.kind === 'idToken') {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) {
          toast({ title: "Login failed", description: "User not found after OTP verification", variant: "destructive" });
          return;
        }
        console.log('✅ Auto-verified! Firebase user:', firebaseUser.uid);
        toast({ title: "OTP verified ✅", description: "Signed in successfully" });
        
        // Sync worker profile with Firebase UID
        await syncWorkerProfile(firebaseUser.uid, firebaseUser.phoneNumber || normalizePhone(signInPhone));
        
        navigate("/home");
        return;
      }

      setOtpSent(true);
      setResendTimer(30);
      toast({ title: "OTP sent!", description: "Check your phone for the verification code" });
    } catch (error: any) {
      handleFirebaseError(error);
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

    try {
      setLoading(true);
      const phone = normalizePhone(signInPhone);

      // Verify OTP - this signs in the Firebase user
      await verifyOtp(signInOtp);
      
      // Get the Firebase user
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        toast({ title: "Login failed", description: "User not found after OTP verification", variant: "destructive" });
        return;
      }
      
      console.log('✅ OTP verified! Firebase user:', firebaseUser.uid, 'phone:', firebaseUser.phoneNumber);
      toast({ title: "OTP verified ✅" });
      
      // Sync worker profile with Firebase UID
      await syncWorkerProfile(firebaseUser.uid, phone);

      // Save Firebase ID token to native storage
      const authBridge = isCapPluginAvailable('AuthBridge') ? AuthBridge : null;
      if (authBridge) {
        console.log('🔐 [Auth Page] Saving Firebase ID token after sign-in...');
        try {
          const idToken = await firebaseUser.getIdToken();
          await authBridge.saveToken({ token: idToken });
          const verifyToken = await authBridge.getToken();
          if (verifyToken?.token === idToken) {
            console.log('✅ [Auth Page] Token saved and verified successfully');
          } else {
            console.error('❌ [Auth Page] Token verification failed!');
          }
        } catch (err) {
          console.error('❌ [Auth Page] Failed to save token:', err);
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
  
  // Helper function to sync/upsert worker profile using Firebase UID (non-blocking)
  const syncWorkerProfile = (firebaseUid: string, phone: string) => {
    // Run in background - don't block login
    (async () => {
      try {
        console.log('🔄 Syncing worker profile for Firebase UID:', firebaseUid);
        
        const { callFn } = await import('@/lib/api');
        const result = await callFn('sync-worker-profile', { phone });
        
        if (!result.ok) {
          console.error('Profile sync failed:', result.error);
          toast({ title: "Warning", description: "Logged in, profile sync pending", variant: "default" });
        } else {
          console.log('✅ Worker profile synced successfully');
        }
      } catch (err) {
        console.error('Error syncing worker profile:', err);
        toast({ title: "Warning", description: "Logged in, profile sync pending", variant: "default" });
      }
    })();
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
      const phone = normalizePhone(signUpPhone);
      nativeVerificationIdRef.current = null;
      confirmationResultRef.current = null;

      const res = await sendOtp(phone);

      if (res.kind === 'idToken') {
        const firebaseUser = auth.currentUser;
        if (!firebaseUser) {
          toast({ title: "Login failed", description: "User not found after OTP verification", variant: "destructive" });
          return;
        }
        console.log('✅ Auto-verified signup! Firebase user:', firebaseUser.uid);
        toast({ title: "OTP verified ✅" });
        // Will continue to create worker profile below via normal signup flow
        // For now, just navigate - worker profile creation happens in handleSignUpVerifyOtp
        navigate("/home");
        return;
      }

      setOtpSent(true);
      setResendTimer(30);
      toast({ title: "OTP sent!", description: "Check your phone for the verification code" });
    } catch (error: any) {
      handleFirebaseError(error);
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

      // Verify OTP - this signs in the Firebase user
      await verifyOtp(signUpOtp);
      
      // Get the Firebase user
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        toast({ title: "Signup failed", description: "User not found after OTP verification", variant: "destructive" });
        return;
      }
      
      console.log('✅ OTP verified! Firebase user:', firebaseUser.uid);
      toast({ title: "OTP verified ✅" });

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

      // Use Firebase UID as the worker identifier
      const workerId = firebaseUser.uid;

      if (existingWorker) {
        // Update existing worker and link to Firebase UID
        const { error: workerError } = await supabase.from('workers').upsert({
          id: existingWorker.id,
          user_id: workerId,
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
        // Create new worker profile with Firebase UID
        const { error: workerError } = await supabase.from('workers').insert({
          user_id: workerId,
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

      // Save Firebase ID token to native storage
      const authBridge = isCapPluginAvailable('AuthBridge') ? AuthBridge : null;
      if (authBridge) {
        console.log('🔐 [Auth Page] Saving Firebase ID token after sign-up...');
        try {
          const idToken = await firebaseUser.getIdToken();
          await authBridge.saveToken({ token: idToken });
          const verify = await authBridge.getToken();
          if (verify?.token === idToken) {
            console.log('✅ [Auth Page] Token saved and verified successfully');
          } else {
            console.error('❌ [Auth Page] Token verification failed!');
          }
        } catch (err) {
          console.error('❌ [Auth Page] Failed to save token:', err);
        }
      }

      // Check if worker has set availability
      const { data: availabilityData } = await supabase
        .from('worker_availability')
        .select('*')
        .eq('worker_id', workerId)
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

    // Keep verifier instance; just restart the OTP flow.
    confirmationResultRef.current = null;
    nativeVerificationIdRef.current = null;

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
