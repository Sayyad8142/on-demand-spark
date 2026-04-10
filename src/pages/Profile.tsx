import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useWorkerPriorityMetrics } from "@/hooks/useWorkerPriorityMetrics";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, Loader2, Trash2, LogOut, ChevronDown, X, Pencil, Languages, Star, Briefcase, Wallet, Settings, MessageSquare, BarChart3, Camera, Upload, Clock, ChevronRight, Shield, FileText, HelpCircle, Phone, QrCode, CreditCard } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import RatingBreakdown from "@/components/RatingBreakdown";
import { DEMO_WORKER } from "@/config/demoData";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import BottomNav from "@/components/BottomNav";
import UpiQrUpload from "@/components/UpiQrUpload";
import { CURRENT_VERSION_CODE } from "@/config/version";
import BookingPriorityCard from "@/components/profile/BookingPriorityCard";
import WorkerRankCard from "@/components/profile/WorkerRankCard";
import WeeklyPerformanceCard from "@/components/profile/WeeklyPerformanceCard";
import HowToGetMoreBookingsCard from "@/components/profile/HowToGetMoreBookingsCard";
import MotivationCard from "@/components/profile/MotivationCard";
import PayoutSetupCard from "@/components/profile/PayoutSetupCard";
const SERVICES = [{
  value: "maid",
  label: "Maid Service",
  icon: "🧹"
}, {
  value: "bathroom_cleaning",
  label: "Bathroom Cleaning",
  icon: "🧼"
}];
interface Community {
  id: string;
  name: string;
  value: string;
  is_active: boolean;
}
export default function Profile() {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const {
    user
  } = useAuth();
  const isGuestMode = localStorage.getItem('guest_mode') === 'true';
  const {
    worker: realWorker,
    loading: realWorkerLoading,
    updateWorker,
    refetch: refetchWorker
  } = useWorkerProfile(!isGuestMode ? user?.id : undefined);
  const worker = isGuestMode ? DEMO_WORKER : realWorker;
  const workerLoading = isGuestMode ? false : realWorkerLoading;
  const {
    t,
    i18n
  } = useTranslation();
  const [fullName, setFullName] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedCommunities, setSelectedCommunities] = useState<string[]>([]);
  const [selectedCuisineTags, setSelectedCuisineTags] = useState<string[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [upiId, setUpiId] = useState("");
  const [upiQrUrl, setUpiQrUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [accountHolderName, setAccountHolderName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [ifscCode, setIfscCode] = useState("");
  const [preferredPayoutMethod, setPreferredPayoutMethod] = useState("upi");
  
  // Hidden debug screen trigger - tap version 5 times
  const versionTapCount = useRef(0);
  const versionTapTimeout = useRef<NodeJS.Timeout | null>(null);
  
  const handleVersionTap = () => {
    versionTapCount.current++;
    
    if (versionTapTimeout.current) {
      clearTimeout(versionTapTimeout.current);
    }
    
    if (versionTapCount.current >= 5) {
      versionTapCount.current = 0;
      navigate('/auth-debug');
      return;
    }
    
    // Reset count after 2 seconds of no taps
    versionTapTimeout.current = setTimeout(() => {
      versionTapCount.current = 0;
    }, 2000);
  };

  // Earnings data
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);
  const [monthEarnings, setMonthEarnings] = useState(0);
  const [completedJobs, setCompletedJobs] = useState(0);
  const [workerRating, setWorkerRating] = useState<number>(0);
  const [ratingsCount, setRatingsCount] = useState<number>(0);
  const [reviews, setReviews] = useState<any[]>([]);
  const [ratingBreakdown, setRatingBreakdown] = useState<{
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  }>({
    5: 0,
    4: 0,
    3: 0,
    2: 0,
    1: 0
  });

  // Priority metrics hook
  const primaryCommunity = worker?.communities?.[0] ?? worker?.community ?? undefined;
  const primaryService = worker?.service_types?.[0] ?? undefined;
  const { metrics: priorityMetrics, loading: priorityLoading } = useWorkerPriorityMetrics(
    worker?.id,
    primaryCommunity,
    primaryService,
    workerRating || Number(worker?.rating) || 5.0,
    ratingsCount,
    worker?.last_active_at
  );

  // Fetch communities from Supabase with real-time updates
  useEffect(() => {
    const fetchCommunities = async () => {
      const {
        data
      } = await supabase.from('communities').select('*').eq('is_active', true).order('name');
      if (data) {
        setCommunities(data);
      }
    };
    fetchCommunities();

    // Set up real-time subscription
    const channel = supabase.channel('communities-changes').on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'communities'
    }, payload => {
      console.log('Communities changed:', payload);
      fetchCommunities();
    }).subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
  useEffect(() => {
    if (worker) {
      setFullName(worker.full_name || "");
      setPhone(worker.phone || "");
      setUpiId(worker.upi_id || "");
      setUpiQrUrl(worker.upi_qr_url || null);
      setSelectedServices(worker.service_types || []);
      setSelectedCommunities(worker.communities || (worker.community ? [worker.community] : []));
      setSelectedCuisineTags(worker.cook_cuisine_tags || []);
      setTotalEarnings(worker.total_earnings || 0);
      setPhotoUrl(worker.photo_url || null);
      setAccountHolderName((worker as any).account_holder_name || "");
      setBankAccountNumber((worker as any).bank_account_number || "");
      setIfscCode((worker as any).ifsc_code || "");
      setPreferredPayoutMethod((worker as any).preferred_payout_method || "upi");
    }
  }, [worker]);
  useEffect(() => {
    if (isGuestMode) {
      // Set demo stats for guest mode
      setCompletedJobs(2);
      setTotalEarnings(750);
      setTodayEarnings(250);
      setWorkerRating(4.8);
      setRatingsCount(127);
      setRatingBreakdown({
        5: 100,
        4: 20,
        3: 5,
        2: 1,
        1: 1
      });
      setReviews([{
        id: 'demo-review-1',
        rating: 5,
        comment: 'Excellent service! Very professional and punctual.',
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        bookings: {
          cust_name: 'Priya Sharma',
          service_type: 'maid',
          flat_no: 'B-205',
          community: 'downtown'
        }
      }, {
        id: 'demo-review-2',
        rating: 5,
        comment: 'Great work! Highly recommended.',
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        bookings: {
          cust_name: 'Amit Patel',
          service_type: 'bathroom_cleaning',
          flat_no: 'C-302',
          community: 'downtown'
        }
      }]);
      return;
    }
    if (!user) return;
    const workerId = realWorker?.id ?? user.id;
    const fetchEarnings = async () => {
      // Count completed jobs from bookings
      const {
        data: bookingsData,
        error: bookingsError
      } = await supabase.from('bookings').select('id, completed_at').eq('worker_id', workerId).eq('status', 'completed');
      if (!bookingsError && bookingsData) {
        setCompletedJobs(bookingsData.length);
      }

      // Use real payout data for earnings (net amounts after platform fee)
      const {
        data: payoutsData,
        error: payoutsError
      } = await supabase.from('worker_payouts').select('payout_amount, created_at').eq('worker_id', workerId);
      if (!payoutsError && payoutsData) {
        const total = payoutsData.reduce((sum, p) => sum + (p.payout_amount || 0), 0);
        setTotalEarnings(total);

        // Calculate today's earnings from payouts
        const today = new Date().toISOString().split('T')[0];
        const todayTotal = payoutsData.filter(p => p.created_at && p.created_at.startsWith(today)).reduce((sum, p) => sum + (p.payout_amount || 0), 0);
        setTodayEarnings(todayTotal);

        // Calculate this month's earnings
        const monthPrefix = new Date().toISOString().slice(0, 7); // "YYYY-MM"
        const monthTotal = payoutsData.filter(p => p.created_at && p.created_at.startsWith(monthPrefix)).reduce((sum, p) => sum + (p.payout_amount || 0), 0);
        setMonthEarnings(monthTotal);
      }
    };
    const fetchRating = async () => {
      const {
        data,
        error
      } = await supabase.from('worker_rating_stats').select('avg_rating, ratings_count').eq('worker_id', workerId).maybeSingle();
      if (!error && data && Number(data.ratings_count) > 0) {
        setWorkerRating(Number(data.avg_rating) || 0);
        setRatingsCount(Number(data.ratings_count) || 0);
      } else {
        // Fallback to worker.rating from workers table (default 5.0)
        setWorkerRating(Number(realWorker?.rating) || 5.0);
        setRatingsCount(0);
      }
    };
    const fetchReviews = async () => {
      const {
        data,
        error
      } = await supabase.from('worker_ratings').select('*, bookings(cust_name, service_type, flat_no, community)').eq('worker_id', workerId).order('created_at', {
        ascending: false
      });
      if (!error && data) {
        setReviews(data);

        // Calculate rating breakdown
        const breakdown = {
          5: 0,
          4: 0,
          3: 0,
          2: 0,
          1: 0
        };
        data.forEach(review => {
          if (review.rating >= 1 && review.rating <= 5) {
            breakdown[review.rating as keyof typeof breakdown]++;
          }
        });
        setRatingBreakdown(breakdown);
      }
    };
    fetchEarnings();
    fetchRating();
    fetchReviews();
  }, [user, isGuestMode, realWorker?.id]);
  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Error",
        description: "Please upload an image file",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image must be less than 5MB",
        variant: "destructive"
      });
      return;
    }
    try {
      setUploadingPhoto(true);

      // Get authenticated user ID
      const {
        data: {
          user: authUser
        },
        error: authError
      } = await supabase.auth.getUser();
      if (authError || !authUser) {
        throw new Error('Not authenticated');
      }
      console.log('Starting photo upload for user:', authUser.id);

      // Delete old photo if exists
      if (photoUrl) {
        const oldPath = photoUrl.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('worker-photos').remove([`${authUser.id}/${oldPath}`]);
        }
      }

      // Upload new photo using auth user ID
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${authUser.id}/${fileName}`;
      console.log('Uploading to path:', filePath);
      console.log('Auth user ID:', authUser.id);
      const {
        error: uploadError,
        data: uploadData
      } = await supabase.storage.from('worker-photos').upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });
      console.log('Upload result:', {
        uploadData,
        uploadError
      });
      if (uploadError) throw uploadError;

      // Get public URL
      const {
        data: {
          publicUrl
        }
      } = supabase.storage.from('worker-photos').getPublicUrl(filePath);

      // Update worker profile
      const {
        error: updateError
      } = await supabase.from('workers').update({
        photo_url: publicUrl
      }).eq('id', user.id);
      if (updateError) throw updateError;
      setPhotoUrl(publicUrl);
      toast({
        title: "Success",
        description: "Photo updated successfully"
      });
    } catch (error: any) {
      console.error('Photo upload error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to upload photo",
        variant: "destructive"
      });
    } finally {
      setUploadingPhoto(false);
    }
  };
  const handleUpdate = async () => {
    if (!fullName.trim()) {
      toast({
        title: "Error",
        description: "Name is required",
        variant: "destructive"
      });
      return;
    }
    if (selectedServices.length === 0) {
      toast({
        title: "Error",
        description: "Select at least one service",
        variant: "destructive"
      });
      return;
    }
    if (selectedCommunities.length === 0) {
      toast({
        title: "Error",
        description: "Select at least one community",
        variant: "destructive"
      });
      return;
    }
    if (!upiId.trim() || !upiId.includes("@")) {
      toast({
        title: "UPI ID Required",
        description: "Please enter a valid UPI ID (must contain '@'). Example: name@paytm",
        variant: "destructive"
      });
      return;
    }
    try {
      setUpdating(true);
      // Filter out any legacy cook selection
      const validServices = selectedServices.filter(s => s !== 'cook');
      await updateWorker({
        full_name: fullName,
        phone: phone,
        upi_id: upiId,
        service_types: validServices,
        communities: selectedCommunities,
        cook_cuisine_tags: [],
        account_holder_name: accountHolderName || null,
        bank_account_number: bankAccountNumber || null,
        ifsc_code: ifscCode || null,
        preferred_payout_method: preferredPayoutMethod,
      } as any);
      toast({
        title: "Success",
        description: "Profile updated successfully"
      });
      setEditDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setUpdating(false);
    }
  };
  const handleLogout = async () => {
    try {
      // Handle guest mode logout
      if (isGuestMode) {
        localStorage.removeItem('guest_mode');
        toast({
          title: "Logged Out",
          description: "You have exited guest mode"
        });
        navigate("/auth");
        return;
      }

      // Handle regular user logout
      const {
        error
      } = await supabase.auth.signOut();

      // Clear local storage regardless of error
      localStorage.clear();

      // Navigate to auth page regardless of error
      navigate("/auth");

      // Show appropriate message based on whether logout succeeded
      if (error) {
        console.error('Logout error:', error);
        toast({
          title: "Session Cleared",
          description: "You have been logged out locally"
        });
      } else {
        toast({
          title: "Logged Out",
          description: "You have been successfully logged out"
        });
      }
    } catch (error: any) {
      console.error('Logout exception:', error);
      // Clear storage and navigate even on exception
      localStorage.clear();
      navigate("/auth");
      toast({
        title: "Session Cleared",
        description: "You have been logged out locally"
      });
    }
  };
  const handleDeleteAccount = async () => {
    if (!user) return;
    try {
      setDeleting(true);

      // Delete worker profile and related data
      const {
        error: deleteError
      } = await supabase.from('workers').delete().eq('id', user.id);
      if (deleteError) throw deleteError;

      // Delete the auth user account
      const {
        error: authError
      } = await supabase.auth.admin.deleteUser(user.id);

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
    return <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>;
  }
  return <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/home")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-semibold">{t('profile.title')}</h1>
          </div>
          
          {/* Account Settings Icon */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="w-5 h-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 bg-background z-50" align="end">
              <DropdownMenuLabel>Account Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              <div className="p-1 space-y-1">
                <Button onClick={() => navigate('/contact-support')} variant="ghost" className="w-full justify-start text-sm h-10">
                  <HelpCircle className="w-4 h-4 mr-2" />
                  Contact & Support
                </Button>
                <Button onClick={() => navigate('/privacy-policy')} variant="ghost" className="w-full justify-start text-sm h-10">
                  <Shield className="w-4 h-4 mr-2" />
                  Privacy Policy
                </Button>
                <Button onClick={() => navigate('/terms-of-service')} variant="ghost" className="w-full justify-start text-sm h-10">
                  <FileText className="w-4 h-4 mr-2" />
                  Terms of Service
                </Button>
              </div>

              <DropdownMenuSeparator />
              
              <div className="p-1 space-y-1">
                <Button onClick={handleLogout} variant="ghost" className="w-full justify-start text-sm h-10">
                  <LogOut className="w-4 h-4 mr-2" />
                  {t('profile.logout')}
                </Button>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 h-10" disabled={deleting}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      {deleting ? t('common.loading') : t('profile.deleteAccount')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('profile.deleteAccount')}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t('profile.deleteConfirm')}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('profile.cancel')}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteAccount} className="bg-destructive hover:bg-destructive/90">
                        {t('common.delete')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto pb-20">
        {/* Profile Header Card */}
        <div className="relative -mt-4">
          {/* Cover Image */}
          <div className="h-24 bg-gradient-to-br from-primary via-primary/90 to-primary/70 relative overflow-hidden">
            <div className="absolute inset-0 bg-white"></div>
          </div>
          
          {/* Profile Card */}
          <Card className="mx-4 -mt-12 border-0 shadow-xl relative">
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" size="icon" className="absolute top-4 right-4 h-9 w-9 bg-white hover:bg-gray-100 shadow-lg z-10">
                  <Pencil className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{t('profile.edit')}</DialogTitle>
                  <DialogDescription>
                    {t('profile.profileInfo')}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  {/* Profile Photo Upload */}
                  <div className="space-y-2">
                    <Label>Profile Photo</Label>
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-full overflow-hidden bg-muted flex items-center justify-center border-2 border-border">
                        {photoUrl ? (
                          <img src={photoUrl} alt="Profile" className="w-full h-full object-cover" />
                        ) : (
                          <Camera className="w-6 h-6 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex-1">
                        <label htmlFor="edit-photo-upload" className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all ${uploadingPhoto ? 'bg-muted text-muted-foreground' : 'bg-primary text-primary-foreground hover:bg-primary/90'}`}>
                          {uploadingPhoto ? (
                            <>Uploading...</>
                          ) : (
                            <><Camera className="w-4 h-4" />{photoUrl ? 'Change Photo' : 'Upload Photo'}</>
                          )}
                        </label>
                        <input
                          id="edit-photo-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploadingPhoto}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoUpload(file);
                          }}
                        />
                        <p className="text-xs text-muted-foreground mt-1">JPG or PNG, max 5MB</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-name">{t('profile.name')}</Label>
                    <Input id="edit-name" value={fullName} onChange={e => setFullName(e.target.value)} placeholder={t('auth.namePlaceholder')} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-phone">{t('profile.phone')}</Label>
                    <Input id="edit-phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Your mobile number" />
                  </div>

                  {/* Payment Details Section */}
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4" />
                      Payment Details
                    </Label>
                    
                    {/* Manual UPI ID Input */}
                    <div className="space-y-2">
                      <Label htmlFor="edit-upi">{t('auth.upiIdLabel', 'UPI ID')} *</Label>
                      <Input 
                        id="edit-upi" 
                        type="text" 
                        placeholder={t('auth.upiPlaceholder', 'e.g., name@paytm')} 
                        value={upiId} 
                        onChange={e => setUpiId(e.target.value)} 
                      />
                      <p className="text-xs text-muted-foreground">
                        Required for receiving payouts
                      </p>
                    </div>

                    </div>

                    {/* Payout Details Section */}
                    <div className="space-y-3 border-t pt-3">
                      <Label className="flex items-center gap-2 text-sm font-semibold">
                        <Wallet className="w-4 h-4" />
                        Payout Details
                      </Label>

                      <div className="space-y-2">
                        <Label htmlFor="edit-account-name">Account Holder Name</Label>
                        <Input
                          id="edit-account-name"
                          value={accountHolderName}
                          onChange={(e) => setAccountHolderName(e.target.value)}
                          placeholder="Name on bank account"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="edit-bank-account">Bank Account Number (Optional)</Label>
                        <Input
                          id="edit-bank-account"
                          value={bankAccountNumber}
                          onChange={(e) => setBankAccountNumber(e.target.value)}
                          placeholder="Account number"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="edit-ifsc">IFSC Code (Optional)</Label>
                        <Input
                          id="edit-ifsc"
                          value={ifscCode}
                          onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                          placeholder="e.g., SBIN0001234"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Preferred Payout Method</Label>
                        <div className="flex gap-2">
                          {[
                            { value: "upi", label: "UPI" },
                            { value: "bank_transfer", label: "Bank Transfer" },
                          ].map((m) => (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => setPreferredPayoutMethod(m.value)}
                              className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all border ${
                                preferredPayoutMethod === m.value
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-muted text-muted-foreground border-border hover:border-primary/50"
                              }`}
                            >
                              {m.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                  <div className="space-y-2">
                    <Label>{t('profile.services')}</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          <span className="text-muted-foreground">
                            {selectedServices.length > 0 ? `${selectedServices.length} selected` : "Select services"}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-full">
                    <DropdownMenuLabel>Select Services</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {SERVICES.map(service => <DropdownMenuCheckboxItem key={service.value} checked={selectedServices.includes(service.value)} onCheckedChange={checked => {
                        if (checked) {
                          setSelectedServices([...selectedServices, service.value]);
                        } else {
                          setSelectedServices(selectedServices.filter(s => s !== service.value));
                        }
                      }}>
                            {service.icon} {service.label}
                          </DropdownMenuCheckboxItem>)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {selectedServices.length > 0 && <div className="flex flex-wrap gap-2 mt-2">
                        {selectedServices.map(serviceValue => {
                      const service = SERVICES.find(s => s.value === serviceValue);
                      return <Badge key={serviceValue} variant="secondary" className="gap-1">
                              {service?.label}
                              <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedServices(selectedServices.filter(s => s !== serviceValue))} />
                            </Badge>;
                    })}
                      </div>}
                  </div>

                  <div className="space-y-2">
                    <Label>{t('profile.communities')}</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          <span className="text-muted-foreground">
                            {selectedCommunities.length > 0 ? `${selectedCommunities.length} selected` : "Select communities"}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-full">
                        <DropdownMenuLabel>Select Communities</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {communities.map(community => <DropdownMenuCheckboxItem key={community.id} checked={selectedCommunities.includes(community.value)} onCheckedChange={checked => {
                        if (checked) {
                          setSelectedCommunities([...selectedCommunities, community.value]);
                        } else {
                          setSelectedCommunities(selectedCommunities.filter(c => c !== community.value));
                        }
                      }}>
                            {community.name}
                          </DropdownMenuCheckboxItem>)}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {selectedCommunities.length > 0 && <div className="flex flex-wrap gap-2 mt-2">
                        {selectedCommunities.map(communityValue => {
                      const community = communities.find(c => c.value === communityValue);
                      return <Badge key={communityValue} variant="secondary" className="gap-1">
                              {community?.name}
                              <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedCommunities(selectedCommunities.filter(c => c !== communityValue))} />
                            </Badge>;
                    })}
                      </div>}
                  </div>


                  <Button onClick={handleUpdate} disabled={updating} className="w-full">
                    {updating ? t('common.loading') : t('profile.updateProfile')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <CardContent className="pt-6 pb-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="relative group">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg border-4 border-white dark:border-gray-800 overflow-hidden">
                    {photoUrl ? <img src={photoUrl} alt={worker?.full_name || "Profile"} className="w-full h-full object-cover" /> : <User className="w-10 h-10 text-primary-foreground" />}
                  </div>
                  <label htmlFor="photo-upload" className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                    {uploadingPhoto ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Camera className="w-6 h-6 text-white" />}
                  </label>
                  <input id="photo-upload" type="file" accept="image/*" onChange={handlePhotoUpload} disabled={uploadingPhoto} className="hidden" />
                </div>
                <div className="flex-1 pt-2">
                  <h2 className="text-2xl font-bold mb-1">{worker?.full_name}</h2>
                  <p className="text-muted-foreground text-sm mb-2 flex items-center gap-1">
                    📱 {worker?.phone}
                  </p>
                  <Badge variant={worker?.is_active ? "default" : "secondary"} className={worker?.is_active ? "bg-green-500 hover:bg-green-600 shadow-sm" : ""}>
                    {worker?.is_active ? t('profile.status.active') : t('profile.status.pending')}
                  </Badge>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2 mt-6">
                {/* Today's Earnings - Highlighted */}
                <div className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-950 dark:to-violet-950 rounded-2xl p-3 border-2 border-purple-200 dark:border-purple-800">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-purple-500 mb-2 mx-auto">
                    <Clock className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-xl font-extrabold text-purple-600 dark:text-purple-400 text-center mb-1">
                    ₹{todayEarnings}
                  </p>
                  <p className="text-[9px] text-muted-foreground font-semibold text-center uppercase tracking-tight leading-tight">
                    Today's Earnings
                  </p>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 rounded-2xl p-3 border-2 border-green-100 dark:border-green-900">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-500 mb-2 mx-auto">
                    <Wallet className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-xl font-extrabold text-green-600 dark:text-green-400 text-center mb-1">
                    ₹{monthEarnings}
                  </p>
                  <p className="text-[9px] text-muted-foreground font-semibold text-center uppercase tracking-tight leading-tight">
                    THIS MONTH
                  </p>
                </div>

                <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950 rounded-2xl p-3 border-2 border-amber-100 dark:border-amber-900">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-500 mb-2 mx-auto">
                    <Star className="w-5 h-5 text-white fill-white" />
                  </div>
                  <p className="text-xl font-extrabold text-amber-600 dark:text-amber-400 text-center mb-1">
                    {workerRating.toFixed(1)}
                  </p>
                  <p className="text-[9px] text-muted-foreground font-semibold text-center uppercase tracking-tight leading-tight">
                    {t('profile.rating')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Language Selection */}
        <div className="px-4 mt-4">
          <Card className="border-0 shadow-lg">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Languages className="w-5 h-5" />
                {t('profile.language')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {[{
                code: 'en',
                label: 'EN',
                toast: 'Language changed to English'
              }, {
                code: 'hi',
                label: 'हि',
                toast: 'भाषा हिंदी में बदल गई'
              }, {
                code: 'te',
                label: 'తె',
                toast: 'భాష తెలుగులోకి మార్చబడింది'
              }].map(lang => <button key={lang.code} onClick={() => {
                i18n.changeLanguage(lang.code);
                localStorage.setItem('language', lang.code);
                toast({
                  title: lang.toast
                });
              }} className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${i18n.language === lang.code ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                    {lang.label}
                  </button>)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Earnings Link */}
        <div className="px-4 mt-4">
          <Card className="border-0 shadow-lg cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => navigate('/earnings')}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Earnings & Payouts</p>
                    <p className="text-xs text-muted-foreground">Track your instant UPI payouts</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Enhanced Ratings & Reviews Link */}
        <div className="px-4 mt-4">
          <Card className="border-0 shadow-lg cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => navigate('/customer-reviews')}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">⭐ {workerRating.toFixed(1)} {t('profile.rating')}</p>
                    <p className="text-xs text-muted-foreground">
                      {ratingsCount > 0 ? `${ratingsCount} ${t('profile.reviews').toLowerCase()}` : 'No reviews yet'}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-[11px] text-primary font-medium mt-2 ml-13">
                {t('profile.ratingPriority')}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="px-4 mt-4 space-y-4">

          {/* Booking Priority Card */}
          <BookingPriorityCard metrics={priorityMetrics} />





          {/* Call Support Button */}
          <a href="tel:8008180018" className="block">
            <Button className="w-full h-12 bg-green-600 hover:bg-green-700 text-white">
              <Phone className="w-5 h-5 mr-2" />
              Call Support: 8008180018
            </Button>
          </a>
          
          {/* Version - tap 5 times for debug */}
          <p 
            className="text-xs text-center text-muted-foreground cursor-pointer select-none"
            onClick={handleVersionTap}
          >
            Version {CURRENT_VERSION_CODE}
          </p>
        </div>
      </main>
      <BottomNav />
    </div>;
}