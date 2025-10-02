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
import { Phone } from "lucide-react";

const SERVICES = [
  { value: "maid", label: "Maid Service" },
  { value: "cook", label: "Cook Service" },
  { value: "bathroom_cleaning", label: "Bathroom Cleaning" }
];

export default function Auth() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [communities, setCommunities] = useState<Array<{ name: string; value: string }>>([]);
  
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
        const { error: updateError } = await supabase
          .from('workers')
          .update({ id: data.user.id })
          .eq('phone', phone);

        if (updateError) {
          console.error('Error linking worker:', updateError);
        }

        // Also create/update profile
        await supabase.from('profiles').upsert({
          id: data.user.id,
          full_name: existingWorker.full_name,
          phone,
          community: existingWorker.community || existingWorker.communities?.[0] || '',
          flat_no: 'N/A'
        }, { onConflict: 'id' });
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
          full_name: signUpFullName,
          phone,
          upi_id: signUpUpiId || existingWorker.upi_id,
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
          full_name: signUpFullName,
          phone,
          upi_id: signUpUpiId || null,
          service_types: [signUpService],
          communities: [signUpCommunity],
          is_active: true,
          is_available: false,
          is_busy: false
        });

        if (workerError) throw workerError;
      }

      // Create profile (upsert to handle re-registration)
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: data.user.id,
        full_name: signUpFullName,
        phone,
        community: signUpCommunity,
        flat_no: 'N/A'
      }, { onConflict: 'id' });

      if (profileError) throw profileError;

      toast({ 
        title: "Account created!", 
        description: "Your worker account is now active. Welcome!" 
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
                    <Label htmlFor="upi-id">UPI ID (Optional)</Label>
                    <Input
                      id="upi-id"
                      placeholder="yourname@paytm"
                      value={signUpUpiId}
                      onChange={(e) => setSignUpUpiId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="community">Community</Label>
                    <Select value={signUpCommunity} onValueChange={setSignUpCommunity}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select community" />
                      </SelectTrigger>
                      <SelectContent>
                        {communities.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.name}</SelectItem>
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