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
import { Phone, UserRound } from "lucide-react";
import didiPartnerLogo from "@/assets/didi-partner-logo.png";
import UpiQrUpload from "@/components/UpiQrUpload";

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;
// @ts-ignore - SMS Retriever bridge
const SmsRetrieverPlugin = (window as any).Capacitor?.Plugins?.SmsRetrieverPlugin;
const SERVICES = [{
  value: "maid",
  label: "auth.services.maid",
  icon: "🧹",
  description: "Sweeping, mopping, dishes & more"
}, {
  value: "bathroom_cleaning",
  label: "auth.services.bathroom_cleaning",
  icon: "🧼",
  description: "Deep bathroom cleaning"
}];

// SECURITY: Input validation schemas
const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, 'Invalid phone number. Must be 10 digits starting with 6-9').length(10, 'Phone number must be exactly 10 digits');
const nameSchema = z.string().trim().min(2, 'Name must be at least 2 characters').max(100, 'Name must not exceed 100 characters').regex(/^[a-zA-Z\s]+$/, 'Name can only contain letters and spaces');
const upiSchema = z.string().regex(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/, 'Invalid UPI ID format (e.g., name@bank)').optional().or(z.literal(''));
const otpSchema = z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits').length(6);
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
  // Cook cuisine tags removed - cook service discontinued
  
  // QR Code upload state
  const [signUpQrData, setSignUpQrData] = useState<{
    file: File;
    payload: string;
    extractedUpiId: string;
  } | null>(null);

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
  const normalizePhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.startsWith('91') ? `+${cleaned}` : `+91${cleaned}`;
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
        setLoading(false);
        return;
      }
      const {
        error
      } = await supabase.auth.signInWithOtp({
        phone
      });
      if (error) throw error;

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
            qrData: signUpQrData
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
          <Tabs defaultValue="signin" className="w-full">
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

              {/* UPI QR Code Upload */}
              <UpiQrUpload
                currentUpiId={signUpUpiId}
                onUpiIdExtracted={(upiId) => setSignUpUpiId(upiId)}
                onQrDataReady={(data) => setSignUpQrData(data)}
                onQrRemoved={() => setSignUpQrData(null)}
                mode="signup"
              />

              {/* Manual UPI ID Input */}
              <div className="space-y-2">
                <Label htmlFor="signup-upi">{t('auth.upiIdLabel', 'UPI ID')} ({t('common.optional', 'Optional')})</Label>
                <Input 
                  id="signup-upi" 
                  type="text" 
                  placeholder={t('auth.upiPlaceholder', 'e.g., name@paytm')} 
                  value={signUpUpiId} 
                  onChange={e => setSignUpUpiId(e.target.value)} 
                  disabled={loading} 
                />
                <p className="text-xs text-muted-foreground">
                  {t('auth.upiHint', 'Enter manually if QR scan didn\'t detect it')}
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
                        className={`relative p-4 rounded-2xl border-2 transition-all duration-200 text-left ${
                          isSelected
                            ? 'border-primary bg-primary/5 shadow-md ring-2 ring-primary/20'
                            : 'border-border bg-background hover:border-primary/40 hover:bg-muted/50'
                        }`}
                      >
                        <div className="text-2xl mb-2">{service.icon}</div>
                        <p className="font-semibold text-sm">{t(service.label)}</p>
                        <p className="text-xs text-muted-foreground mt-1">{service.description}</p>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                            <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button onClick={handleSignUpSendOtp} disabled={loading || !signUpFullName || !signUpPhone || !signUpCommunity || signUpServices.length === 0} className="w-full">
                {loading ? t('auth.sending') : t('auth.sendOtp')}
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