import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, Loader2, Trash2, LogOut, ChevronDown, X, Pencil, Languages, Star, Briefcase, Wallet, Settings, MessageSquare, BarChart3, Camera, Upload, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import RatingBreakdown from "@/components/RatingBreakdown";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import BottomNav from "@/components/BottomNav";

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
  const { t, i18n } = useTranslation();
  
  const [fullName, setFullName] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedCommunities, setSelectedCommunities] = useState<string[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [updating, setUpdating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [upiId, setUpiId] = useState("");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  
  // Earnings data
  const [totalEarnings, setTotalEarnings] = useState(0);
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
  }>({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });

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
      setPhone(worker.phone || "");
      setUpiId(worker.upi_id || "");
      setSelectedServices(worker.service_types || []);
      setSelectedCommunities(worker.communities || (worker.community ? [worker.community] : []));
      setTotalEarnings(worker.total_earnings || 0);
      setPhotoUrl(worker.photo_url || null);
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

    const fetchRating = async () => {
      const { data, error } = await supabase
        .from('worker_rating_stats')
        .select('avg_rating, ratings_count')
        .eq('worker_id', user.id)
        .maybeSingle();

      if (!error && data) {
        setWorkerRating(Number(data.avg_rating) || 0);
        setRatingsCount(Number(data.ratings_count) || 0);
      }
    };

    const fetchReviews = async () => {
      const { data, error } = await supabase
        .from('worker_reviews')
        .select('*, bookings(cust_name, service_type)')
        .eq('worker_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setReviews(data);
        
        // Calculate rating breakdown
        const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
        data.forEach((review) => {
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
  }, [user]);

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({ title: "Error", description: "Please upload an image file", variant: "destructive" });
      return;
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Error", description: "Image must be less than 5MB", variant: "destructive" });
      return;
    }

    try {
      setUploadingPhoto(true);

      // Get authenticated user ID
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !authUser) {
        throw new Error('Not authenticated');
      }

      console.log('Starting photo upload for user:', authUser.id);

      // Delete old photo if exists
      if (photoUrl) {
        const oldPath = photoUrl.split('/').pop();
        if (oldPath) {
          await supabase.storage
            .from('worker-photos')
            .remove([`${authUser.id}/${oldPath}`]);
        }
      }

      // Upload new photo using auth user ID
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${authUser.id}/${fileName}`;

      console.log('Uploading to path:', filePath);
      console.log('Auth user ID:', authUser.id);

      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('worker-photos')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      console.log('Upload result:', { uploadData, uploadError });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('worker-photos')
        .getPublicUrl(filePath);

      // Update worker profile
      const { error: updateError } = await supabase
        .from('workers')
        .update({ photo_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setPhotoUrl(publicUrl);
      toast({ title: "Success", description: "Photo updated successfully" });
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
        phone: phone,
        upi_id: upiId,
        service_types: selectedServices,
        communities: selectedCommunities
      });
      toast({ title: "Success", description: "Profile updated successfully" });
      setEditDialogOpen(false);
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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/home")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{t('profile.title')}</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto pb-20">
        {/* Profile Header Card */}
        <div className="relative">
          {/* Cover Image */}
          <div className="h-32 bg-gradient-to-br from-primary via-primary/90 to-primary/70 relative overflow-hidden">
            <div className="absolute inset-0 bg-white"></div>
          </div>
          
          {/* Profile Card */}
          <Card className="mx-4 -mt-16 border-0 shadow-xl relative">
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="secondary" 
                  size="icon" 
                  className="absolute top-4 right-4 h-9 w-9 bg-white hover:bg-gray-100 shadow-lg z-10"
                >
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
                  <div className="space-y-2">
                    <Label htmlFor="edit-name">{t('profile.name')}</Label>
                    <Input
                      id="edit-name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder={t('auth.namePlaceholder')}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-phone">{t('profile.phone')}</Label>
                    <Input
                      id="edit-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Your mobile number"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-upi">UPI ID</Label>
                    <Input
                      id="edit-upi"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      placeholder="Your UPI ID"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t('profile.services')}</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          <span className="text-muted-foreground">
                            {selectedServices.length > 0 
                              ? `${selectedServices.length} selected` 
                              : "Select services"}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-full">
                        <DropdownMenuLabel>Select Services</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {SERVICES.map(service => (
                          <DropdownMenuCheckboxItem
                            key={service.value}
                            checked={selectedServices.includes(service.value)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedServices([...selectedServices, service.value]);
                              } else {
                                setSelectedServices(selectedServices.filter(s => s !== service.value));
                              }
                            }}
                          >
                            {service.label}
                          </DropdownMenuCheckboxItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    {selectedServices.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedServices.map(serviceValue => {
                          const service = SERVICES.find(s => s.value === serviceValue);
                          return (
                            <Badge key={serviceValue} variant="secondary" className="gap-1">
                              {service?.label}
                              <X 
                                className="h-3 w-3 cursor-pointer" 
                                onClick={() => setSelectedServices(selectedServices.filter(s => s !== serviceValue))}
                              />
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>{t('profile.communities')}</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" className="w-full justify-between">
                          <span className="text-muted-foreground">
                            {selectedCommunities.length > 0 
                              ? `${selectedCommunities.length} selected` 
                              : "Select communities"}
                          </span>
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-full">
                        <DropdownMenuLabel>Select Communities</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {communities.map(community => (
                          <DropdownMenuCheckboxItem
                            key={community.id}
                            checked={selectedCommunities.includes(community.value)}
                            onCheckedChange={(checked) => {
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
                    {selectedCommunities.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedCommunities.map(communityValue => {
                          const community = communities.find(c => c.value === communityValue);
                          return (
                            <Badge key={communityValue} variant="secondary" className="gap-1">
                              {community?.name}
                              <X
                                className="h-3 w-3 cursor-pointer" 
                                onClick={() => setSelectedCommunities(selectedCommunities.filter(c => c !== communityValue))}
                              />
                            </Badge>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={handleUpdate}
                    disabled={updating}
                    className="w-full"
                  >
                    {updating ? t('common.loading') : t('profile.updateProfile')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <CardContent className="pt-6 pb-6">
              <div className="flex items-start gap-4 mb-6">
                <div className="relative group">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg border-4 border-white dark:border-gray-800 overflow-hidden">
                    {photoUrl ? (
                      <img 
                        src={photoUrl} 
                        alt={worker?.full_name || "Profile"} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-10 h-10 text-primary-foreground" />
                    )}
                  </div>
                  <label 
                    htmlFor="photo-upload" 
                    className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="w-6 h-6 text-white animate-spin" />
                    ) : (
                      <Camera className="w-6 h-6 text-white" />
                    )}
                  </label>
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    disabled={uploadingPhoto}
                    className="hidden"
                  />
                </div>
                <div className="flex-1 pt-2">
                  <h2 className="text-2xl font-bold mb-1">{worker?.full_name}</h2>
                  <p className="text-muted-foreground text-sm mb-2 flex items-center gap-1">
                    📱 {worker?.phone}
                  </p>
                  <Badge 
                    variant={worker?.is_active ? "default" : "secondary"}
                    className={worker?.is_active ? "bg-green-500 hover:bg-green-600 shadow-sm" : ""}
                  >
                    {worker?.is_active ? t('profile.status.active') : t('profile.status.pending')}
                  </Badge>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-2 mt-6">
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

                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 rounded-2xl p-3 border-2 border-blue-100 dark:border-blue-900">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500 mb-2 mx-auto">
                    <Briefcase className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400 text-center mb-1">
                    {completedJobs}
                  </p>
                  <p className="text-[9px] text-muted-foreground font-semibold text-center uppercase tracking-tight leading-tight">
                    {t('profile.completedJobs')}
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
          {/* Rating Breakdown Section */}
          {reviews.length > 0 && (
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <BarChart3 className="w-5 h-5" />
                  Rating Breakdown
                </CardTitle>
                <CardDescription>
                  Distribution of your {ratingsCount} rating{ratingsCount !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RatingBreakdown 
                  ratings={ratingBreakdown} 
                  totalRatings={ratingsCount}
                />
              </CardContent>
            </Card>
          )}

          {/* Reviews Section */}
          {reviews.length > 0 && (
            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MessageSquare className="w-5 h-5" />
                  {t('profile.reviews')} ({reviews.length})
                </CardTitle>
                <CardDescription>
                  Customer feedback from completed jobs
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {reviews.map((review) => (
                  <Card key={review.id} className="bg-muted/50">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-semibold text-sm">
                            {review.bookings?.cust_name || 'Customer'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {review.bookings?.service_type} • {format(new Date(review.created_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                          <span className="font-semibold text-sm">{review.rating}</span>
                        </div>
                      </div>
                      {review.comment && (
                        <p className="text-sm text-foreground mt-2">
                          "{review.comment}"
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Language Selection */}
          <Card className="border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Languages className="w-5 h-5" />
                {t('profile.language')}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>{t('profile.selectLanguage')}</Label>
              <div className="grid gap-2">
                <Button
                  variant={i18n.language === 'en' ? 'default' : 'outline'}
                  className="w-full justify-start"
                  onClick={() => {
                    i18n.changeLanguage('en');
                    localStorage.setItem('language', 'en');
                    toast({ title: "Language changed to English" });
                  }}
                >
                  English
                </Button>
                <Button
                  variant={i18n.language === 'hi' ? 'default' : 'outline'}
                  className="w-full justify-start"
                  onClick={() => {
                    i18n.changeLanguage('hi');
                    localStorage.setItem('language', 'hi');
                    toast({ title: "भाषा हिंदी में बदल गई" });
                  }}
                >
                  हिंदी (Hindi)
                </Button>
                <Button
                  variant={i18n.language === 'te' ? 'default' : 'outline'}
                  className="w-full justify-start"
                  onClick={() => {
                    i18n.changeLanguage('te');
                    localStorage.setItem('language', 'te');
                    toast({ title: "భాష తెలుగులోకి మార్చబడింది" });
                  }}
                >
                  తెలుగు (Telugu)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

          {/* Actions */}
          <Card className="border-0 shadow-lg">
            <CardContent className="pt-6">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Account Settings
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-[calc(100vw-2rem)] sm:w-[400px] bg-background z-50" align="end">
                  <DropdownMenuLabel>Account Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
                  <div className="p-2">
                    <Button
                      onClick={handleLogout}
                      variant="ghost"
                      className="w-full justify-start"
                    >
                      <LogOut className="w-4 h-4 mr-2" />
                      {t('profile.logout')}
                    </Button>
                  </div>

                  <DropdownMenuSeparator />
                  
                  <div className="p-2">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                          disabled={deleting}
                        >
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
                          <AlertDialogAction
                            onClick={handleDeleteAccount}
                            className="bg-destructive hover:bg-destructive/90"
                          >
                            {t('common.delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}