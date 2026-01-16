import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { supabase } from "@/integrations/supabase/client";
import { setIntentionalLogout, forceClearNativeSession } from "@/lib/sessionManager";
import { Capacitor } from "@capacitor/core";
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
const SERVICES = [{
  value: "maid",
  label: "Maid Service"
}, {
  value: "cook",
  label: "Cook Service"
}, {
  value: "bathroom_cleaning",
  label: "Bathroom Cleaning"
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
    updateWorker
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

  // Earnings data
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [todayEarnings, setTodayEarnings] = useState(0);
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
          service_type: 'cook',
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
      const {
        data,
        error
      } = await supabase.from('bookings').select('price_inr, completed_at').eq('worker_id', workerId).eq('status', 'completed');
      if (!error && data) {
        setCompletedJobs(data.length);
        const total = data.reduce((sum, b) => sum + (b.price_inr || 0), 0);
        setTotalEarnings(total);

        // Calculate today's earnings
        const today = new Date().toISOString().split('T')[0];
        const todayTotal = data.filter(b => b.completed_at && b.completed_at.startsWith(today)).reduce((sum, b) => sum + (b.price_inr || 0), 0);
        setTodayEarnings(todayTotal);
      }
    };
    const fetchRating = async () => {
      const {
        data,
        error
      } = await supabase.from('worker_rating_stats').select('avg_rating, ratings_count').eq('worker_id', workerId).maybeSingle();
      if (!error && data) {
        setWorkerRating(Number(data.avg_rating) || 0);
        setRatingsCount(Number(data.ratings_count) || 0);
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
    try {
      setUpdating(true);
      // Clear cuisine tags if cook is not in services
      const cuisineTags = selectedServices.includes('cook') ? selectedCuisineTags : [];
      await updateWorker({
        full_name: fullName,
        phone: phone,
        upi_id: upiId,
        service_types: selectedServices,
        communities: selectedCommunities,
        cook_cuisine_tags: cuisineTags
      });
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

      // Mark this as intentional logout BEFORE calling signOut
      setIntentionalLogout(true);
      console.log("🚪 User initiated logout from Profile page");

      // Handle regular user logout
      const { error } = await supabase.auth.signOut();

      // Force clear native session on intentional logout
      if (Capacitor.isNativePlatform()) {
        await forceClearNativeSession();
      }

      // Clear local storage regardless of error
      localStorage.clear();

      // Reset the flag
      setIntentionalLogout(false);

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
      // Reset the flag
      setIntentionalLogout(false);
      // Force clear on native
      if (Capacitor.isNativePlatform()) {
        await forceClearNativeSession();
      }
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

      // Mark as intentional logout before signing out
      setIntentionalLogout(true);
      
      // Sign out (even if delete fails, we should sign out)
      await supabase.auth.signOut();
      
      // Force clear native session
      if (Capacitor.isNativePlatform()) {
        await forceClearNativeSession();
      }
      
      // Reset flag
      setIntentionalLogout(false);
      
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
              <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-0 gap-0">
                {/* Header */}
                <div className="sticky top-0 bg-background z-10 px-6 py-4 border-b">
                  <DialogHeader className="text-left">
                    <DialogTitle className="text-lg font-semibold">{t('profile.edit')}</DialogTitle>
                  </DialogHeader>
                </div>

                <div className="px-6 py-5 space-y-5">
                  {/* Personal Info Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <User className="w-4 h-4" />
                      <span>Personal Information</span>
                    </div>
                    
                    <div className="space-y-3 pl-1">
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-name" className="text-xs text-muted-foreground uppercase tracking-wide">{t('profile.name')}</Label>
                        <Input 
                          id="edit-name" 
                          value={fullName} 
                          onChange={e => setFullName(e.target.value)} 
                          placeholder={t('auth.namePlaceholder')}
                          className="h-11 bg-muted/30 border-muted-foreground/20 focus:bg-background transition-colors"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="edit-phone" className="text-xs text-muted-foreground uppercase tracking-wide">{t('profile.phone')}</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input 
                            id="edit-phone" 
                            value={phone} 
                            onChange={e => setPhone(e.target.value)} 
                            placeholder="Your mobile number"
                            className="h-11 pl-10 bg-muted/30 border-muted-foreground/20 focus:bg-background transition-colors"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-border" />

                  {/* Payment Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Wallet className="w-4 h-4" />
                      <span>Payment Details</span>
                    </div>
                    
                    <div className="space-y-3 pl-1">
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-upi" className="text-xs text-muted-foreground uppercase tracking-wide">
                          UPI ID
                        </Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">@</span>
                          <Input 
                            id="edit-upi" 
                            type="text" 
                            placeholder={t('auth.upiPlaceholder', 'e.g., name@paytm')} 
                            value={upiId} 
                            onChange={e => setUpiId(e.target.value)}
                            className="h-11 pl-8 bg-muted/30 border-muted-foreground/20 focus:bg-background transition-colors"
                          />
                        </div>
                      </div>

                      {/* UPI QR Upload - Compact */}
                      {!isGuestMode && worker && (
                        <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-4">
                          <UpiQrUpload 
                            currentUpiId={upiId} 
                            currentQrUrl={upiQrUrl} 
                            onUpiIdExtracted={newUpiId => setUpiId(newUpiId)} 
                            onQrRemoved={() => setUpiQrUrl(null)} 
                            onQrUrlSaved={url => setUpiQrUrl(url)}
                            mode="profile" 
                            workerId={worker.id} 
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="h-px bg-border" />

                  {/* Services Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-primary">
                      <Briefcase className="w-4 h-4" />
                      <span>{t('profile.services')}</span>
                    </div>
                    
                    <div className="pl-1 space-y-2">
                      {SERVICES.map(service => (
                        <label 
                          key={service.value}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            selectedServices.includes(service.value) 
                              ? 'border-primary bg-primary/5 shadow-sm' 
                              : 'border-muted-foreground/20 hover:border-muted-foreground/40 hover:bg-muted/30'
                          }`}
                        >
                          <input 
                            type="checkbox" 
                            checked={selectedServices.includes(service.value)}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedServices([...selectedServices, service.value]);
                              } else {
                                setSelectedServices(selectedServices.filter(s => s !== service.value));
                                if (service.value === 'cook') {
                                  setSelectedCuisineTags([]);
                                }
                              }
                            }}
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                          />
                          <span className="text-sm font-medium">{service.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Cook Cuisine Specialization */}
                  {selectedServices.includes('cook') && (
                    <>
                      <div className="h-px bg-border" />
                      <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                          <span className="text-lg">🍳</span>
                          <span>{t('profile.cuisineLabel', 'Cuisine Specialization')}</span>
                        </div>
                        
                        <div className="pl-1 flex flex-wrap gap-2">
                          {[
                            { id: 'north_indian', label: t('profile.cuisineNorth', 'North Indian'), emoji: '🍛' },
                            { id: 'south_indian', label: t('profile.cuisineSouth', 'South Indian'), emoji: '🍚' },
                          ].map(cuisine => (
                            <button
                              key={cuisine.id}
                              type="button"
                              onClick={() => {
                                if (selectedCuisineTags.includes(cuisine.id)) {
                                  setSelectedCuisineTags(selectedCuisineTags.filter(c => c !== cuisine.id));
                                } else {
                                  setSelectedCuisineTags([...selectedCuisineTags, cuisine.id]);
                                }
                              }}
                              className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-medium transition-all ${
                                selectedCuisineTags.includes(cuisine.id)
                                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 shadow-sm'
                                  : 'border-muted-foreground/20 hover:border-amber-300 hover:bg-amber-50/50 dark:hover:bg-amber-950/30'
                              }`}
                            >
                              <span>{cuisine.emoji}</span>
                              <span>{cuisine.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="h-px bg-border" />

                  {/* Communities Section */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-medium text-primary">
                        <Settings className="w-4 h-4" />
                        <span>{t('profile.communities')}</span>
                      </div>
                      {selectedCommunities.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {selectedCommunities.length} selected
                        </Badge>
                      )}
                    </div>
                    
                    <div className="pl-1">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="w-full justify-between h-11 bg-muted/30 border-muted-foreground/20 hover:bg-muted/50">
                            <span className="text-muted-foreground text-sm">
                              {selectedCommunities.length > 0 
                                ? communities.filter(c => selectedCommunities.includes(c.value)).map(c => c.name).join(', ')
                                : "Tap to select communities"
                              }
                            </span>
                            <ChevronDown className="h-4 w-4 opacity-50" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-full min-w-[280px] bg-background">
                          <DropdownMenuLabel>Select Communities</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {communities.map(community => (
                            <DropdownMenuCheckboxItem 
                              key={community.id} 
                              checked={selectedCommunities.includes(community.value)} 
                              onCheckedChange={checked => {
                                if (checked) {
                                  setSelectedCommunities([...selectedCommunities, community.value]);
                                } else {
                                  setSelectedCommunities(selectedCommunities.filter(c => c !== community.value));
                                }
                              }}
                            >
                              {community.name}
                            </DropdownMenuCheckboxItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>

                {/* Sticky Footer */}
                <div className="sticky bottom-0 bg-background border-t px-6 py-4">
                  <Button 
                    onClick={handleUpdate} 
                    disabled={updating} 
                    className="w-full h-12 text-base font-semibold shadow-lg"
                  >
                    {updating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      t('profile.updateProfile')
                    )}
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
                    ₹{totalEarnings}
                  </p>
                  <p className="text-[9px] text-muted-foreground font-semibold text-center uppercase tracking-tight leading-tight">
                    {t('profile.totalEarned')}
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

        <div className="px-4 mt-4 space-y-4">
          {/* Ratings & Reviews Link */}
          <Card className="border-0 shadow-lg cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => navigate('/customer-reviews')}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <Star className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm">Ratings & Reviews</p>
                    <p className="text-xs text-muted-foreground">
                      {ratingsCount > 0 ? `${workerRating.toFixed(1)} ★ • ${ratingsCount} review${ratingsCount !== 1 ? 's' : ''}` : 'No reviews yet'}
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          {/* Language Selection */}
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


          {/* Call Support Button */}
          <a href="tel:8008180018" className="block">
            <Button className="w-full h-12 bg-green-600 hover:bg-green-700 text-white">
              <Phone className="w-5 h-5 mr-2" />
              Call Support: 8008180018
            </Button>
          </a>
        </div>
      </main>
      <BottomNav />
    </div>;
}