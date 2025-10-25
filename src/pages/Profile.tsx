import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, Loader2, DollarSign, CheckCircle, TrendingUp, Trash2, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const SERVICES = [
  { value: "maid", label: "Maid Service" },
  { value: "cook", label: "Cook Service" },
  { value: "bathroom_cleaning", label: "Bathroom Cleaning" }
];

interface Community {
  id: string;
  name: string;
  value: string;
  is_active: boolean;
}

export default function Profile() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { worker, loading: workerLoading, updateWorker } = useWorkerProfile(user?.id);
  
  const [fullName, setFullName] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedCommunities, setSelectedCommunities] = useState<string[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  
  // Earnings data
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [completedJobs, setCompletedJobs] = useState(0);

  // Fetch communities from Supabase with real-time updates
  useEffect(() => {
    const fetchCommunities = async () => {
      const { data } = await supabase
        .from('communities')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (data) {
        setCommunities(data);
      }
    };

    fetchCommunities();

    // Set up real-time subscription
    const channel = supabase
      .channel('communities-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'communities'
        },
        (payload) => {
          console.log('Communities changed:', payload);
          fetchCommunities();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (worker) {
      setFullName(worker.full_name || "");
      setSelectedServices(worker.service_types || []);
      setSelectedCommunities(worker.communities || (worker.community ? [worker.community] : []));
      setTotalEarnings(worker.total_earnings || 0);
    }
  }, [worker]);

  useEffect(() => {
    if (!user) return;

    const fetchEarnings = async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select('price_inr')
        .eq('worker_id', user.id)
        .eq('status', 'completed');

      if (!error && data) {
        setCompletedJobs(data.length);
        const total = data.reduce((sum, b) => sum + (b.price_inr || 0), 0);
        setTotalEarnings(total);
      }
    };

    fetchEarnings();
  }, [user]);

  const handleUpdate = async () => {
    if (!fullName.trim()) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }

    if (selectedServices.length === 0) {
      toast({ title: "Error", description: "Select at least one service", variant: "destructive" });
      return;
    }

    if (selectedCommunities.length === 0) {
      toast({ title: "Error", description: "Select at least one community", variant: "destructive" });
      return;
    }

    try {
      setUpdating(true);
      await updateWorker({
        full_name: fullName,
        service_types: selectedServices,
        communities: selectedCommunities
      });
      toast({ title: "Success", description: "Profile updated successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setUpdating(false);
    }
  };


  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast({ 
        title: "Logged Out", 
        description: "You have been successfully logged out" 
      });
      navigate("/auth");
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to log out", 
        variant: "destructive" 
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (!user) return;

    try {
      setDeleting(true);

      // Delete worker profile and related data
      const { error: deleteError } = await supabase
        .from('workers')
        .delete()
        .eq('id', user.id);

      if (deleteError) throw deleteError;

      // Delete the auth user account
      const { error: authError } = await supabase.auth.admin.deleteUser(user.id);
      
      // Sign out (even if delete fails, we should sign out)
      await supabase.auth.signOut();

      toast({ 
        title: "Account Deleted", 
        description: "Your account has been permanently deleted" 
      });
      
      navigate("/auth");
    } catch (error: any) {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete account", 
        variant: "destructive" 
      });
    } finally {
      setDeleting(false);
    }
  };

  if (workerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-secondary">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b sticky top-0 z-10 shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/home")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">My Profile</h1>
            <p className="text-sm text-muted-foreground">Manage your information</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto p-4 space-y-6">
        {/* Profile Card */}
        <Card className="shadow-card">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shadow-pink">
                <User className="w-8 h-8 text-primary-foreground" />
              </div>
              <div>
                <CardTitle>{worker?.full_name}</CardTitle>
                <p className="text-sm text-muted-foreground">{worker?.phone}</p>
                <Badge className="mt-1" variant={worker?.is_active ? "default" : "secondary"}>
                  {worker?.is_active ? "Active" : "Pending Approval"}
                </Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Earnings Summary */}
        <Card className="shadow-card bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              Earnings Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                  <TrendingUp className="w-6 h-6 text-primary" />
                </div>
                <p className="text-2xl font-bold text-primary">₹{totalEarnings}</p>
                <p className="text-sm text-muted-foreground">Total Earned</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-2">
                  <CheckCircle className="w-6 h-6 text-success" />
                </div>
                <p className="text-2xl font-bold">{completedJobs}</p>
                <p className="text-sm text-muted-foreground">Jobs Done</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mx-auto mb-2">
                  <span className="text-lg font-bold text-purple-700">
                    {worker?.rating?.toFixed(1) || "N/A"}
                  </span>
                </div>
                <p className="text-2xl font-bold">{worker?.rating?.toFixed(1) || "N/A"}</p>
                <p className="text-sm text-muted-foreground">Rating</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit Profile */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Edit Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">Service Types</Label>
              <ToggleGroup 
                type="multiple" 
                value={selectedServices}
                onValueChange={setSelectedServices}
                className="justify-start flex-wrap"
              >
                {SERVICES.map(service => (
                  <ToggleGroupItem
                    key={service.value}
                    value={service.value}
                    aria-label={service.label}
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {service.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">Communities</Label>
              <ToggleGroup 
                type="multiple" 
                value={selectedCommunities}
                onValueChange={setSelectedCommunities}
                className="justify-start flex-wrap"
              >
                {communities.map(community => (
                  <ToggleGroupItem
                    key={community.id}
                    value={community.value}
                    aria-label={community.name}
                    className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                  >
                    {community.name}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>

            <Button
              onClick={handleUpdate}
              disabled={updating}
              className="w-full"
              size="lg"
            >
              {updating ? "Updating..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Logout */}
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full"
              size="lg"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </CardContent>
        </Card>

        {/* Delete Account */}
        <Card className="shadow-card border-destructive/20">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="w-full"
                  size="lg"
                  disabled={deleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {deleting ? "Deleting..." : "Delete Account"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This action cannot be undone. This will permanently delete your
                    account and remove all your data from our servers including your
                    profile, bookings history, and earnings records.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    className="bg-destructive hover:bg-destructive/90"
                  >
                    Yes, Delete My Account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}