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
import { ArrowLeft, User, Loader2, Trash2, LogOut, ChevronDown, X, Pencil, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
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
  
  // Earnings data
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [completedJobs, setCompletedJobs] = useState(0);
  const [workerRating, setWorkerRating] = useState<number>(0);
  const [ratingsCount, setRatingsCount] = useState<number>(0);

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

    fetchEarnings();
    fetchRating();
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
      <main className="max-w-2xl mx-auto p-4 space-y-4 pb-24">
        {/* Profile Info */}
        <Card className="border-0 shadow-lg">
          <CardContent className="pt-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
                <User className="w-12 h-12 text-primary-foreground" />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-1">{worker?.full_name}</h2>
                <p className="text-muted-foreground text-sm mb-3">{worker?.phone}</p>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={worker?.is_active ? "default" : "secondary"}
                    className={worker?.is_active ? "bg-green-500 hover:bg-green-600" : ""}
                  >
                    {worker?.is_active ? t('profile.status.active') : t('profile.status.pending')}
                  </Badge>
                  <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="icon" className="h-8 w-8">
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
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 pt-6 mt-6 border-t">
              <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-xl p-4 text-center border shadow-sm">
                <p className="text-2xl font-extrabold text-primary mb-1">₹{totalEarnings}</p>
                <p className="text-xs text-muted-foreground font-medium">{t('profile.totalEarned')}</p>
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-xl p-4 text-center border shadow-sm">
                <p className="text-2xl font-extrabold mb-1">{completedJobs}</p>
                <p className="text-xs text-muted-foreground font-medium">{t('profile.completedJobs')}</p>
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-white dark:from-gray-800 dark:to-gray-900 rounded-xl p-4 text-center border shadow-sm">
                <p className="text-2xl font-extrabold mb-1 flex items-center justify-center gap-1">
                  {workerRating.toFixed(1)} <span className="text-yellow-500">⭐</span>
                </p>
                <p className="text-xs text-muted-foreground font-medium">{t('profile.rating')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

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
          <CardContent className="pt-6 space-y-3">
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {t('profile.logout')}
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="w-full"
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
          </CardContent>
        </Card>
      </main>
    </div>
  );
}