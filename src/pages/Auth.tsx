import { useState, useEffect } from "react";
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
import { Phone } from "lucide-react";
import didiPartnerLogo from "@/assets/didi-partner-logo.png";
import { sendOtpWeb, verifyOtpWeb, getFirebaseIdToken } from "@/lib/firebase";

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;
// @ts-ignore - Native Firebase Auth
const FirebasePhoneAuth = (window as any).Capacitor?.Plugins?.FirebasePhoneAuth;
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
  const [verificationId, setVerificationId] = useState<string | null>(null);

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

  // Auto OTP detection for Android
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !SmsRetrieverPlugin) {
      return;
    }
    let listenerHandle: any = null;
    const startSmsRetriever = async () => {
      try {
        const result = await SmsRetrieverPlugin.startWatching();
        console.log('📱 SMS Retriever started:', result);

        listenerHandle = await SmsRetrieverPlugin.addListener('smsReceived', (data: any) => {
          let otp = data.otp;
          if (!otp) {
            const message = data.message || '';
            const otpMatch = message.match(/\b(\d{6})\b/);
            if (otpMatch) {
              otp = otpMatch[1];
            }
          }
          if (otp) {
            console.log('📱 Auto-filling OTP:', otp);
            setSignInOtp(otp);
            setSignUpOtp(otp);
            toast({
              title: t('auth.otpAutoDetected', 'OTP Auto-detected'),
              description: t('auth.otpAutoFilled', `Code ${otp} filled automatically`, { otp })
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
        listenerHandle?.remove?.();
        SmsRetrieverPlugin.removeAllListeners?.();
        SmsRetrieverPlugin.stopWatching?.().catch(() => {});
      }
    };
  }, [otpSent, toast, t]);

  useEffect(() => {
    const fetchCommunities = async () => {
      const { data, error } = await supabase.from('communities').select('name, value').eq('is_active', true).order('name');
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

  // Firebase OTP Send - works for both native and web
  const sendFirebaseOtp = async (phone: string): Promise<boolean> => {
    const normalizedPhone = normalizePhone(phone);
    
    // Use native Firebase on Android
    if (Capacitor.isNativePlatform() && FirebasePhoneAuth) {
      try {
        console.log('📱 Sending OTP via native Firebase...');
        const result = await FirebasePhoneAuth.sendOtp({ phone: normalizedPhone });
        if (result.verificationId) {
          setVerificationId(result.verificationId);
        }
        console.log('✅ Native OTP sent');
        return true;
      } catch (error: any) {
        console.error('❌ Native Firebase OTP error:', error);
        throw new Error(error.message || 'Failed to send OTP');
      }
    }
    
    // Use web Firebase with reCAPTCHA
    try {
      console.log('🌐 Sending OTP via Firebase Web...');
      await sendOtpWeb(normalizedPhone, 'recaptcha-container');
      console.log('✅ Web OTP sent');
      return true;
    } catch (error: any) {
      console.error('❌ Web Firebase OTP error:', error);
      throw new Error(error.message || 'Failed to send OTP');
    }
  };

  // Firebase OTP Verify - works for both native and web
  const verifyFirebaseOtp = async (otp: string): Promise<{ uid: string; phone: string | null; idToken: string }> => {
    // Use native Firebase on Android
    if (Capacitor.isNativePlatform() && FirebasePhoneAuth) {
      try {
        console.log('📱 Verifying OTP via native Firebase...');
        const result = await FirebasePhoneAuth.verifyOtp({ 
          otp, 
          verificationId: verificationId || undefined 
        });
        
        if (!result.success || !result.uid) {
          throw new Error('Verification failed');
        }
        
        console.log('✅ Native OTP verified, UID:', result.uid);
        
        // Save JWT to native storage
        if (AuthBridge && result.idToken) {
          await AuthBridge.saveToken({ token: result.idToken });
          console.log('✅ JWT saved to native storage');
        }
        
        return {
          uid: result.uid,
          phone: result.phone || null,
          idToken: result.idToken || ''
        };
      } catch (error: any) {
        console.error('❌ Native Firebase verify error:', error);
        throw new Error(error.message || 'Failed to verify OTP');
      }
    }
    
    // Use web Firebase
    try {
      console.log('🌐 Verifying OTP via Firebase Web...');
      const firebaseUser = await verifyOtpWeb(otp);
      const idToken = await getFirebaseIdToken() || '';
      
      console.log('✅ Web OTP verified, UID:', firebaseUser.uid);
      
      return {
        uid: firebaseUser.uid,
        phone: firebaseUser.phoneNumber || null,
        idToken
      };
    } catch (error: any) {
      console.error('❌ Web Firebase verify error:', error);
      throw new Error(error.message || 'Failed to verify OTP');
    }
  };

  // Create or update worker profile in Supabase
  const ensureWorkerProfile = async (
    uid: string, 
    phone: string, 
    fullName: string,
    upiId: string | null,
    services: string[],
    community: string,
    cuisineTags: string[]
  ) => {
    // Fetch community ID
    const { data: communityData } = await supabase
      .from('communities')
      .select('id')
      .eq('value', community)
      .single();

    const workerData = {
      id: uid,
      user_id: uid,
      full_name: fullName.trim(),
      phone,
      upi_id: upiId?.trim() || null,
      service_types: services,
      communities: [community],
      selected_community_id: communityData?.id || null,
      cook_cuisine_tags: services.includes('cook') ? cuisineTags : [],
      is_active: true,
      is_available: false,
      is_busy: false
    };

    // Check if worker exists
    const { data: existing } = await supabase
      .from('workers')
      .select('id')
      .eq('phone', phone)
      .maybeSingle();

    if (existing) {
      // Update existing worker
      const { error } = await supabase
        .from('workers')
        .update(workerData)
        .eq('phone', phone);
      
      if (error) throw error;
    } else {
      // Create new worker
      const { error } = await supabase
        .from('workers')
        .insert(workerData);
      
      if (error) throw error;
    }
  };

  const handleSignInSendOtp = async () => {
    if (!signInPhone) {
      toast({ title: "Please enter your phone number", variant: "destructive" });
      return;
    }

    // Demo mode: Quick login for testing
    if (signInPhone === "9999999999") {
      toast({ title: "Demo Mode", description: "Use OTP: 123456" });
      setOtpSent(true);
      return;
    }

    const validation = phoneSchema.safeParse(signInPhone);
    if (!validation.success) {
      toast({ title: "Invalid phone number", description: validation.error.errors[0].message, variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      await sendFirebaseOtp(signInPhone);
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

    const validation = otpSchema.safeParse(signInOtp);
    if (!validation.success) {
      toast({ title: "Invalid OTP", description: "OTP must be 6 digits", variant: "destructive" });
      return;
    }

    // Demo mode bypass
    if (signInPhone === "9999999999" && signInOtp === "123456") {
      localStorage.setItem('demo_mode', 'true');
      toast({ title: "Demo Mode Activated" });
      navigate("/home");
      return;
    }

    try {
      setLoading(true);
      const { uid, phone } = await verifyFirebaseOtp(signInOtp);
      
      // Check if worker exists
      const { data: worker } = await supabase
        .from('workers')
        .select('id, user_id')
        .or(`user_id.eq.${uid},phone.eq.${phone}`)
        .maybeSingle();

      if (worker && !worker.user_id) {
        // Link existing worker to this user
        await supabase.from('workers').update({ user_id: uid }).eq('id', worker.id);
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
      await sendFirebaseOtp(signUpPhone);
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

    const validation = otpSchema.safeParse(signUpOtp);
    if (!validation.success) {
      toast({ title: "Invalid OTP", description: "OTP must be 6 digits", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const { uid, phone } = await verifyFirebaseOtp(signUpOtp);
      
      // Create worker profile
      await ensureWorkerProfile(
        uid,
        phone || normalizePhone(signUpPhone),
        signUpFullName,
        signUpUpiId,
        signUpServices,
        signUpCommunity,
        signUpCuisineTags
      );

      toast({ title: "Success!", description: "Account created successfully" });
      
      // Check if worker has set availability
      const { data: availabilityData } = await supabase
        .from('worker_availability')
        .select('*')
        .eq('worker_id', uid)
        .limit(1);

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
      {/* Hidden reCAPTCHA container for web */}
      <div id="recaptcha-container"></div>
      
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
                    <Button 
                      onClick={() => { setOtpSent(false); setSignInOtp(""); }} 
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
                              onCheckedChange={checked => {
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
                            <Label htmlFor={`service-${service.value}`} className="flex-1 cursor-pointer font-normal">
                              {t(service.label)}
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {signUpServices.includes('cook') && (
                      <div className="space-y-3">
                        <Label>{t('auth.cuisineLabel', 'What type of cooking do you specialise in?')}</Label>
                        <div className="space-y-2">
                          <div className="flex items-center space-x-3 p-2 rounded-lg border bg-background hover:bg-muted/50 transition-colors">
                            <Checkbox 
                              id="cuisine-north" 
                              checked={signUpCuisineTags.includes('north_indian')} 
                              onCheckedChange={checked => {
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
                              onCheckedChange={checked => {
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
                              onCheckedChange={checked => {
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
                    <Button 
                      onClick={() => { setOtpSent(false); setSignUpOtp(""); }} 
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

        {/* Language Selector */}
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

        {/* Call Support Button */}
        <a href="tel:8008180018" className="w-full mt-4">
          <Button className="w-full bg-green-600 hover:bg-green-700 text-white py-0 my-[19px]">
            <Phone className="w-4 h-4 mr-2" />
            Call Support: 8008180018
          </Button>
        </a>

        {/* Guest Login Button */}
        <Button 
          variant="outline" 
          onClick={() => {
            localStorage.setItem('guest_mode', 'true');
            toast({ title: "Guest Mode", description: "Exploring as guest with demo data" });
            navigate("/home");
          }} 
          className="w-full my-0"
        >
          {t('auth.continueAsGuest', 'Continue as Guest')}
        </Button>
      </div>
    </div>
  );
}
