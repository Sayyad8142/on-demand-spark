import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Phone } from "lucide-react";

const SERVICES = [
  { value: "maid", label: "Maid Service" },
  { value: "cook", label: "Cook Service" },
  { value: "bathroom_cleaning", label: "Bathroom Cleaning" }
];

const COMMUNITIES = [
  "Sobha City",
  "Prestige Falcon City",
  "Brigade Orchards",
  "Purva Venezia",
  "Other"
];

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  
  // Sign In state
  const [signInPhone, setSignInPhone] = useState("");
  const [signInOtp, setSignInOtp] = useState("");
  
  // Sign Up state
  const [signUpFullName, setSignUpFullName] = useState("");
  const [signUpPhone, setSignUpPhone] = useState("");
  const [signUpCommunity, setSignUpCommunity] = useState("");
  const [signUpService, setSignUpService] = useState("");
  const [signUpOtp, setSignUpOtp] = useState("");

  const normalizePhone = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.startsWith('91') ? `+${cleaned}` : `+91${cleaned}`;
  };

  const handleSignInSendOtp = async () => {
    try {
      setLoading(true);
      const phone = normalizePhone(signInPhone);
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
    try {
      setLoading(true);
      const phone = normalizePhone(signInPhone);
      const { error } = await supabase.auth.verifyOtp({ phone, token: signInOtp, type: 'sms' });
      
      if (error) throw error;
      
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
      toast({ title: "Error", description: "Please fill all fields", variant: "destructive" });
      return;
    }

    try {
      setLoading(true);
      const phone = normalizePhone(signUpPhone);
      const { error } = await supabase.auth.signInWithOtp({ 
        phone,
        options: {
          data: {
            full_name: signUpFullName,
            community: signUpCommunity,
            service_type: signUpService
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
    try {
      setLoading(true);
      const phone = normalizePhone(signUpPhone);
      const { data, error } = await supabase.auth.verifyOtp({ phone, token: signUpOtp, type: 'sms' });
      
      if (error) throw error;
      if (!data.user) throw new Error("No user returned");

      // Create worker profile
      const { error: workerError } = await supabase.from('workers').insert({
        id: data.user.id,
        full_name: signUpFullName,
        phone,
        service_types: [signUpService],
        communities: [signUpCommunity],
        is_active: false, // Requires admin approval
        is_available: false,
        is_busy: false
      });

      if (workerError) throw workerError;

      // Create profile
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        full_name: signUpFullName,
        phone,
        community: signUpCommunity,
        flat_no: 'N/A'
      });

      if (profileError) throw profileError;

      toast({ 
        title: "Account created!", 
        description: "Waiting for admin approval. You'll be notified once approved." 
      });
      navigate("/home");
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-secondary to-primary-soft">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-pink">
              <Phone className="w-8 h-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center font-bold">Didi Now Worker</CardTitle>
          <CardDescription className="text-center">Sign in or create your worker account</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="space-y-4">
              {!otpSent ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="signin-phone">Phone Number</Label>
                    <Input
                      id="signin-phone"
                      placeholder="9876543210"
                      value={signInPhone}
                      onChange={(e) => setSignInPhone(e.target.value)}
                      type="tel"
                    />
                  </div>
                  <Button 
                    onClick={handleSignInSendOtp} 
                    disabled={loading || !signInPhone}
                    className="w-full"
                  >
                    Send OTP
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="signin-otp">Enter OTP</Label>
                    <Input
                      id="signin-otp"
                      placeholder="123456"
                      value={signInOtp}
                      onChange={(e) => setSignInOtp(e.target.value)}
                      maxLength={6}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => setOtpSent(false)} 
                      variant="outline"
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button 
                      onClick={handleSignInVerifyOtp} 
                      disabled={loading || !signInOtp}
                      className="flex-1"
                    >
                      Verify
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="signup" className="space-y-4">
              {!otpSent ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="fullname">Full Name</Label>
                    <Input
                      id="fullname"
                      placeholder="Your full name"
                      value={signUpFullName}
                      onChange={(e) => setSignUpFullName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-phone">Phone Number</Label>
                    <Input
                      id="signup-phone"
                      placeholder="9876543210"
                      value={signUpPhone}
                      onChange={(e) => setSignUpPhone(e.target.value)}
                      type="tel"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="community">Community</Label>
                    <Select value={signUpCommunity} onValueChange={setSignUpCommunity}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select community" />
                      </SelectTrigger>
                      <SelectContent>
                        {COMMUNITIES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="service">Service Type</Label>
                    <Select value={signUpService} onValueChange={setSignUpService}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select service" />
                      </SelectTrigger>
                      <SelectContent>
                        {SERVICES.map(s => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={handleSignUpSendOtp} 
                    disabled={loading}
                    className="w-full"
                  >
                    Send OTP
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="signup-otp">Enter OTP</Label>
                    <Input
                      id="signup-otp"
                      placeholder="123456"
                      value={signUpOtp}
                      onChange={(e) => setSignUpOtp(e.target.value)}
                      maxLength={6}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={() => setOtpSent(false)} 
                      variant="outline"
                      className="flex-1"
                    >
                      Back
                    </Button>
                    <Button 
                      onClick={handleSignUpVerifyOtp} 
                      disabled={loading || !signUpOtp}
                      className="flex-1"
                    >
                      Create Account
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}