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
import appLogo from "@/assets/app-logo.png";

// @ts-ignore - Capacitor bridge
const AuthBridge = (window as any).Capacitor?.Plugins?.AuthBridge;

const SERVICES = [
  { value: "maid", label: "Maid Service" },
  { value: "cook", label: "Cook Service" },
  { value: "bathroom_cleaning", label: "Bathroom Cleaning" }
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
      
      // Check if worker exists with this phone number
      const { data: existingWorker, error: workerCheckError } = await supabase
        .from('workers')
        .select('id')
        .eq('phone', phone)
        .maybeSingle();

      if (workerCheckError) {
        throw workerCheckError;
      }

      if (!existingWorker) {
        toast({ 
          title: "Account not registered", 
          description: "Please sign up first",
          variant: "destructive" 
        });
        setLoading(false);
        return;
      }

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

    // SECURITY: Validate OTP format
    const validation = otpSchema.safeParse(signInOtp);
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
      const phone = normalizePhone(signInPhone);
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

      toast({ title: "Success!", description: "Account created successfully" });
      navigate("/home");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-primary/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <img src={appLogo} alt="Didi Now Worker" className="h-24 w-24 rounded-2xl object-cover" />
          </div>
          <CardTitle className="text-2xl text-center">Worker Portal</CardTitle>
          <CardDescription className="text-center">
            Sign in or create an account to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            {/* Sign In Tab */}
            <TabsContent value="signin" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-phone">Phone Number</Label>
                <Input
                  id="signin-phone"
                  type="tel"
                  placeholder="10-digit phone number"
                  value={signInPhone}
                  onChange={(e) => setSignInPhone(e.target.value)}
                  maxLength={10}
                  disabled={otpSent || loading}
                />
              </div>

              {otpSent && (
                <div className="space-y-2">
                  <Label htmlFor="signin-otp">OTP</Label>
                  <Input
                    id="signin-otp"
                    type="text"
                    placeholder="6-digit OTP"
                    value={signInOtp}
                    onChange={(e) => setSignInOtp(e.target.value)}
                    maxLength={6}
                    disabled={loading}
                  />
                </div>
              )}

              {!otpSent ? (
                <Button 
                  onClick={handleSignInSendOtp} 
                  disabled={loading || !signInPhone}
                  className="w-full"
                >
                  {loading ? "Sending..." : "Send OTP"}
                </Button>
              ) : (
                <>
                  <Button 
                    onClick={handleSignInVerifyOtp} 
                    disabled={loading || !signInOtp}
                    className="w-full"
                  >
                    {loading ? "Verifying..." : "Verify OTP"}
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
                    Change Phone Number
                  </Button>
                </>
              )}
            </TabsContent>

            {/* Sign Up Tab */}
            <TabsContent value="signup" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Full Name *</Label>
                <Input
                  id="signup-name"
                  type="text"
                  placeholder="Your full name"
                  value={signUpFullName}
                  onChange={(e) => setSignUpFullName(e.target.value)}
                  disabled={otpSent || loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-phone">Phone Number *</Label>
                <Input
                  id="signup-phone"
                  type="tel"
                  placeholder="10-digit phone number"
                  value={signUpPhone}
                  onChange={(e) => setSignUpPhone(e.target.value)}
                  maxLength={10}
                  disabled={otpSent || loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-upi">UPI ID (Optional)</Label>
                <Input
                  id="signup-upi"
                  type="text"
                  placeholder="yourname@bank"
                  value={signUpUpiId}
                  onChange={(e) => setSignUpUpiId(e.target.value)}
                  disabled={otpSent || loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-community">Community *</Label>
                <Select 
                  value={signUpCommunity} 
                  onValueChange={setSignUpCommunity}
                  disabled={otpSent || loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select your community" />
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
                <Label htmlFor="signup-service">Service Type *</Label>
                <Select 
                  value={signUpService} 
                  onValueChange={setSignUpService}
                  disabled={otpSent || loading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select service type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICES.map((service) => (
                      <SelectItem key={service.value} value={service.value}>
                        {service.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {otpSent && (
                <div className="space-y-2">
                  <Label htmlFor="signup-otp">OTP</Label>
                  <Input
                    id="signup-otp"
                    type="text"
                    placeholder="6-digit OTP"
                    value={signUpOtp}
                    onChange={(e) => setSignUpOtp(e.target.value)}
                    maxLength={6}
                    disabled={loading}
                  />
                </div>
              )}

              {!otpSent ? (
                <Button 
                  onClick={handleSignUpSendOtp} 
                  disabled={loading || !signUpFullName || !signUpPhone || !signUpCommunity || !signUpService}
                  className="w-full"
                >
                  {loading ? "Sending..." : "Send OTP"}
                </Button>
              ) : (
                <>
                  <Button 
                    onClick={handleSignUpVerifyOtp} 
                    disabled={loading || !signUpOtp}
                    className="w-full"
                  >
                    {loading ? "Creating Account..." : "Create Account"}
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
                    Change Phone Number
                  </Button>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}