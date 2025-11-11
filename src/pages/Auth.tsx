import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";
import { Capacitor } from '@capacitor/core';
import { useTranslation } from "react-i18next";
import didiPartnerLogo from "@/assets/didi-partner-logo.png";
import { DEMO_CONFIG, isDemoUser, DEMO_STORAGE_KEY } from "@/config/demo";
import { Info } from "lucide-react";

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;
// @ts-ignore - SMS Retriever bridge
const SmsRetrieverPlugin = (window as any).Capacitor?.Plugins?.SmsRetrieverPlugin;

const SERVICES = [
  { value: "maid", label: "auth.services.maid" },
  { value: "cook", label: "auth.services.cook" },
  { value: "bathroom_cleaning", label: "auth.services.bathroom_cleaning" }
];

// SECURITY: Input validation schemas
const phoneSchema = z.string()
  .regex(/^[6-9]\d{9}$/, 'Invalid phone number. Must be 10 digits starting with 6-9')
  .length(10, 'Phone number must be exactly 10 digits');

const nameSchema = z.string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must not exceed 100 characters')
  .regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters and spaces');

const upiSchema = z.string()
  .regex(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/, 'Invalid UPI ID format (e.g., name@bank)')
  .optional()
  .or(z.literal(''));

const otpSchema = z.string()
  .regex(/^\d{6}$/, 'OTP must be exactly 6 digits')
  .length(6);

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [communities, setCommunities] = useState<Array<{ name: string; value: string }>>([]);

  // Redirect if already logged in
  useEffect(() => {
    if (!authLoading && user) {
      console.log('👤 User already logged in, redirecting to home');
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
  const [signUpService, setSignUpService] = useState("");
  const [signUpOtp, setSignUpOtp] = useState("");

  // Auto OTP detection for Android
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !SmsRetrieverPlugin) {
      return;
    }

    const startSmsRetriever = async () => {
      try {
        const result = await SmsRetrieverPlugin.startWatching();
        console.log('📱 SMS Retriever started:', result);
        
        // Listen for SMS events
        SmsRetrieverPlugin.addListener('smsReceived', (data: any) => {
          console.log('📱 SMS received:', data);
          const message = data.message || '';
          
          // Extract 6-digit OTP from message
          const otpMatch = message.match(/\b\d{6}\b/);
          if (otpMatch) {
            const otp = otpMatch[0];
            console.log('📱 Auto-filled OTP:', otp);
            
            // Fill OTP based on which tab is active
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

  const normalizePhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.startsWith('91') ? `+${cleaned}` : `+91${cleaned}`;
  };

  const handleSignInSendOtp = async () => {
    if (!signInPhone) {
      toast({ title: "Please enter your phone number", variant: "destructive" });
      return;
    }

    const phone = normalizePhone(signInPhone);
    
    // DEMO MODE: Skip OTP entirely for demo account
    if (phone === DEMO_CONFIG.PHONE) {
      setOtpSent(true);
      setSignInOtp(DEMO_CONFIG.OTP);
      toast({ 
        title: "🎭 Demo Mode Activated", 
        description: `OTP auto-filled: ${DEMO_CONFIG.OTP}. Click "Verify OTP" to continue.`,
        duration: 8000
      });
      return;
    }

    // SECURITY: Validate phone number format for real users
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
      
      const { error } = await supabase.auth.signInWithOtp({ phone });
      
      if (error) throw error;
      
      setOtpSent(true);
      toast({ title: "OTP sent!", description: "Check your phone for the verification code" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignInVerifyOtp = async () => {
    if (!signInPhone || !signInOtp) {
      toast({ title: "Please enter phone and OTP", variant: "destructive" });
      return;
    }

    const phone = normalizePhone(signInPhone);
    const isDemo = isDemoUser(phone);

    // DEMO MODE: Use password-based auth instead of OTP to avoid SMS
    if (isDemo && signInOtp === DEMO_CONFIG.OTP) {
      try {
        setLoading(true);
        console.log('🎭 Demo login - using password auth...');
        
        const DEMO_EMAIL = 'demo@didisnow.app';
        const DEMO_PASSWORD = 'DemoPartner2025!';
        
        // Try to sign in with demo credentials
        let { data, error } = await supabase.auth.signInWithPassword({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD
        });

        // If account doesn't exist, create it
        if (error?.message?.includes('Invalid login credentials')) {
          console.log('🎭 Demo account not found, creating...');
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: DEMO_EMAIL,
            password: DEMO_PASSWORD,
            options: {
              data: { phone: DEMO_CONFIG.PHONE }
            }
          });
          
          if (signUpError) throw signUpError;
          data = signUpData;
        } else if (error) {
          throw error;
        }

        if (!data.user) throw new Error("No user returned");

        // Upsert demo worker profile with availability slots (ensure single record)
        const availabilitySlots = Array(26).fill(true); // All slots available
        const { error: upsertError } = await supabase
          .from('workers')
          .upsert({
            id: data.user.id,
            ...DEMO_CONFIG.WORKER_PROFILE,
            availability_slots: availabilitySlots,
            is_available: true, // Start as available for demo
          }, { 
            onConflict: 'phone',
            ignoreDuplicates: false 
          });

        if (upsertError) {
          console.error('Error upserting demo worker:', upsertError);
        }

        // Mark as demo user in localStorage
        localStorage.setItem(DEMO_STORAGE_KEY, 'true');
        
        // Log analytics event (no PII)
        console.log('📊 Analytics: demo_login_used');

        // CRITICAL: Save JWT to native storage
        if (Capacitor.isNativePlatform() && AuthBridge && data.session?.access_token) {
          console.log('🔐 [Auth Page] Saving JWT immediately after demo sign-in...');
          try {
            await AuthBridge.saveToken({ token: data.session.access_token });
            const verify = await AuthBridge.getToken();
            if (verify?.token === data.session.access_token) {
              console.log('✅ [Auth Page] JWT saved and verified successfully');
            } else {
              console.error('❌ [Auth Page] JWT verification failed!');
            }
          } catch (err) {
            console.error('❌ [Auth Page] Failed to save JWT:', err);
          }
        }

        toast({ 
          title: "🎭 Demo Mode Active", 
          description: "Logged in as Demo Partner",
          duration: 5000
        });
        
        navigate("/home");
        return;
      } catch (error: any) {
        console.error('❌ Demo login error:', error);
        toast({ title: "Error", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
    }

    // SECURITY: Validate OTP format for real users
    const validation = otpSchema.safeParse(signInOtp);
    if (!validation.success) {
      toast({ 
        title: "Invalid OTP", 
        description: "OTP must be 6 digits",
        variant: "destructive" 
      });
      return;
    }

    // REGULAR USER OTP VERIFICATION
    try {
      setLoading(true);
      const { data, error } = await supabase.auth.verifyOtp({ phone, token: signInOtp, type: 'sms' });
      
      if (error) throw error;
      if (!data.user) throw new Error("No user returned");

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
        // Link existing worker to auth user by updating the worker's ID
        await supabase.from('workers').update({ id: data.user.id }).eq('phone', phone);
      }

      // Clear demo flag
      localStorage.removeItem(DEMO_STORAGE_KEY);

      // CRITICAL: Save JWT to native storage immediately for overlay functionality
      if (Capacitor.isNativePlatform() && AuthBridge && data.session?.access_token) {
        console.log('🔐 [Auth Page] Saving JWT immediately after sign-in...');
        try {
          await AuthBridge.saveToken({ token: data.session.access_token });
          const verify = await AuthBridge.getToken();
          if (verify?.token === data.session.access_token) {
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
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpSendOtp = async () => {
    if (!signUpFullName || !signUpPhone || !signUpCommunity || !signUpService) {
      toast({ title: "Please fill all required fields", variant: "destructive" });
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

    if (signUpUpiId) {
      const upiValidation = upiSchema.safeParse(signUpUpiId);
      if (!upiValidation.success) {
        toast({ 
          title: "Invalid UPI ID", 
          description: upiValidation.error.errors[0].message,
          variant: "destructive" 
        });
        return;
      }
    }

    try {
      setLoading(true);
      const phone = normalizePhone(signUpPhone);
      const { error } = await supabase.auth.signInWithOtp({ 
        phone,
        options: {
          data: {
            full_name: signUpFullName.trim(),
            upi_id: signUpUpiId?.trim() || null,
            service_types: [signUpService],
            communities: [signUpCommunity]
          }
        }
      });
      
      if (error) throw error;
      
      setOtpSent(true);
      toast({ title: "OTP sent!", description: "Check your phone for the verification code" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUpVerifyOtp = async () => {
    if (!signUpPhone || !signUpOtp) {
      toast({ title: "Please enter phone and OTP", variant: "destructive" });
      return;
    }

    // SECURITY: Validate OTP format
    const validation = otpSchema.safeParse(signUpOtp);
    if (!validation.success) {
      toast({ 
        title: "Invalid OTP", 
        description: "OTP must be 6 digits",
        variant: "destructive" 
      });
      return;
    }

    try {
      setLoading(true);
      const phone = normalizePhone(signUpPhone);
      const { data, error } = await supabase.auth.verifyOtp({ phone, token: signUpOtp, type: 'sms' });
      
      if (error) throw error;
      if (!data.user) throw new Error("No user returned");

      // Check if worker with this phone already exists
      const { data: existingWorker } = await supabase
        .from('workers')
        .select('*')
        .eq('phone', phone)
        .maybeSingle();

      if (existingWorker) {
        // Update existing worker with new ID and details
        const { error: workerError } = await supabase.from('workers').upsert({
          id: data.user.id,
          full_name: signUpFullName.trim(),
          phone,
          upi_id: signUpUpiId?.trim() || existingWorker.upi_id,
          service_types: [signUpService],
          communities: [signUpCommunity],
          is_active: true,
          is_available: false,
          is_busy: false
        }, { onConflict: 'id' });

        if (workerError) throw workerError;
      } else {
        // Create new worker profile
        const { error: workerError } = await supabase.from('workers').insert({
          id: data.user.id,
          full_name: signUpFullName.trim(),
          phone,
          upi_id: signUpUpiId?.trim() || null,
          service_types: [signUpService],
          communities: [signUpCommunity],
          is_active: true,
          is_available: false,
          is_busy: false
        });

        if (workerError) throw workerError;
      }

      // CRITICAL: Save JWT to native storage immediately for overlay functionality
      if (Capacitor.isNativePlatform() && AuthBridge && data.session?.access_token) {
        console.log('🔐 [Auth Page] Saving JWT immediately after sign-up...');
        try {
          await AuthBridge.saveToken({ token: data.session.access_token });
          const verify = await AuthBridge.getToken();
          if (verify?.token === data.session.access_token) {
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
        .eq('worker_id', data.user.id)
        .limit(1);

      toast({ title: "Success!", description: "Account created successfully" });
      
      // Redirect to availability page if no slots set, otherwise home
      if (!availabilityData || availabilityData.length === 0) {
        navigate("/availability");
      } else {
        navigate("/home");
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 p-4">
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
          <Tabs defaultValue="signin" className="w-full">
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
                  onChange={(e) => setSignInPhone(e.target.value)}
                  maxLength={10}
                  disabled={otpSent || loading}
                />
                
                {/* Demo hint when demo phone detected */}
                {signInPhone === '9999999999' && !otpSent && (
                  <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-md">
                    <Info className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-700 dark:text-yellow-300">
                      Demo for reviewers: Use OTP <strong>{DEMO_CONFIG.OTP}</strong>
                    </p>
                  </div>
                )}
              </div>

              {otpSent && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="signin-otp">{t('auth.otpLabel')}</Label>
                    <Input
                      id="signin-otp"
                      type="text"
                      placeholder={t('auth.otpPlaceholder')}
                      value={signInOtp}
                      onChange={(e) => setSignInOtp(e.target.value)}
                      maxLength={6}
                      disabled={loading}
                    />
                  </div>
                  
                  {/* Demo OTP reminder */}
                  {normalizePhone(signInPhone) === DEMO_CONFIG.PHONE && (
                    <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-md">
                      <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-blue-700 dark:text-blue-300">
                        Enter demo OTP: <strong>{DEMO_CONFIG.OTP}</strong>
                      </p>
                    </div>
                  )}
                </>
              )}

              {!otpSent ? (
                <>
                  <Button 
                    onClick={handleSignInSendOtp} 
                    disabled={loading || !signInPhone}
                    className="w-full"
                  >
                    {loading ? t('auth.sending') : t('auth.sendOtp')}
                  </Button>
                  
                  {/* Demo login link */}
                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setSignInPhone('9999999999');
                        toast({
                          title: "Demo Mode",
                          description: `Now click "Send OTP" and use OTP: ${DEMO_CONFIG.OTP}`,
                          duration: 6000
                        });
                      }}
                      className="text-xs text-muted-foreground hover:text-primary underline"
                    >
                      Use demo login (for reviewers)
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <Button 
                    onClick={handleSignInVerifyOtp} 
                    disabled={loading || !signInOtp}
                    className="w-full"
                  >
                    {loading ? t('auth.verifying') : t('auth.verifyOtp')}
                  </Button>
                  <Button 
                    onClick={() => {
                      setOtpSent(false);
                      setSignInOtp("");
                    }}
                    disabled={loading}
                    variant="outline"
                    className="w-full"
                  >
                    {t('auth.changePhone')}
                  </Button>
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
                      onChange={(e) => setSignUpFullName(e.target.value)}
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
                      onChange={(e) => setSignUpPhone(e.target.value)}
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
                      onChange={(e) => setSignUpUpiId(e.target.value)}
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-community">{t('auth.communityLabel')}</Label>
                    <Select 
                      value={signUpCommunity} 
                      onValueChange={setSignUpCommunity}
                      disabled={loading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('auth.selectCommunity')} />
                      </SelectTrigger>
                      <SelectContent>
                        {communities.map((community) => (
                          <SelectItem key={community.value} value={community.value}>
                            {community.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-service">{t('auth.serviceLabel')}</Label>
                    <Select 
                      value={signUpService} 
                      onValueChange={setSignUpService}
                      disabled={loading}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('auth.selectService')} />
                      </SelectTrigger>
                      <SelectContent>
                        {SERVICES.map((service) => (
                          <SelectItem key={service.value} value={service.value}>
                            {t(service.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button 
                    onClick={handleSignUpSendOtp} 
                    disabled={loading || !signUpFullName || !signUpPhone || !signUpCommunity || !signUpService}
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
                      onChange={(e) => setSignUpOtp(e.target.value)}
                      maxLength={6}
                      disabled={loading}
                    />
                  </div>

                  <Button 
                    onClick={handleSignUpVerifyOtp} 
                    disabled={loading || !signUpOtp}
                    className="w-full"
                  >
                    {loading ? t('auth.creatingAccount') : t('auth.createAccount')}
                  </Button>
                  <Button 
                    onClick={() => {
                      setOtpSent(false);
                      setSignUpOtp("");
                    }}
                    disabled={loading}
                    variant="outline"
                    className="w-full"
                  >
                    {t('auth.changePhone')}
                  </Button>
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
      </div>
    </div>
  );
}