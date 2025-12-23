import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Loader2, Star, MessageSquare, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import RatingBreakdown from "@/components/RatingBreakdown";
import { DEMO_WORKER } from "@/config/demoData";

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  bookings: {
    cust_name: string;
    service_type: string;
    flat_no: string;
    community: string;
  } | null;
}

export default function CustomerReviews() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const isGuestMode = localStorage.getItem('guest_mode') === 'true';
  
  const { worker: realWorker, loading: realWorkerLoading } = useWorkerProfile(!isGuestMode ? user?.id : undefined);
  const worker = isGuestMode ? DEMO_WORKER : realWorker;
  const workerLoading = isGuestMode ? false : realWorkerLoading;

  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [workerRating, setWorkerRating] = useState<number>(0);
  const [ratingsCount, setRatingsCount] = useState<number>(0);
  const [ratingBreakdown, setRatingBreakdown] = useState<{
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  }>({ 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 });

  useEffect(() => {
    if (isGuestMode) {
      // Demo data for guest mode
      setWorkerRating(4.8);
      setRatingsCount(127);
      setRatingBreakdown({ 5: 100, 4: 20, 3: 5, 2: 1, 1: 1 });
      setReviews([
        {
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
        },
        {
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
        }
      ]);
      setLoading(false);
      return;
    }

    if (!user) return;

    const workerId = realWorker?.id ?? user.id;

    const fetchData = async () => {
      try {
        // Fetch rating stats
        const { data: ratingData } = await supabase
          .from('worker_rating_stats')
          .select('avg_rating, ratings_count')
          .eq('worker_id', workerId)
          .maybeSingle();

        if (ratingData) {
          setWorkerRating(Number(ratingData.avg_rating) || 0);
          setRatingsCount(Number(ratingData.ratings_count) || 0);
        }

        // Fetch all reviews
        const { data: reviewsData } = await supabase
          .from('worker_ratings')
          .select('*, bookings(cust_name, service_type, flat_no, community)')
          .eq('worker_id', workerId)
          .order('created_at', { ascending: false });

        if (reviewsData) {
          setReviews(reviewsData as Review[]);
          
          // Calculate rating breakdown
          const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
          reviewsData.forEach((review) => {
            if (review.rating >= 1 && review.rating <= 5) {
              breakdown[review.rating as keyof typeof breakdown]++;
            }
          });
          setRatingBreakdown(breakdown);
        }
      } catch (error) {
        console.error('Error fetching reviews:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, isGuestMode, realWorker?.id]);

  if (loading || workerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/profile")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{t('profile.reviews', 'Customer Reviews')}</h1>
            <p className="text-sm text-muted-foreground">
              {ratingsCount} review{ratingsCount !== 1 ? 's' : ''} • {workerRating.toFixed(1)} avg rating
            </p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {/* Rating Breakdown */}
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

        {/* Reviews List */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-5 h-5" />
              All Reviews ({reviews.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviews.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No reviews yet</p>
              </div>
            ) : (
              reviews.map((review) => (
                <Card key={review.id} className="bg-muted/50">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <p className="font-semibold text-sm">
                          {review.bookings?.cust_name || 'Customer'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {review.bookings?.service_type} • {review.bookings?.community} • Flat {review.bookings?.flat_no}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(review.created_at), 'MMM d, yyyy')}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 bg-amber-100 dark:bg-amber-950 px-2 py-1 rounded-lg">
                        <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                        <span className="font-semibold text-sm">{review.rating}</span>
                      </div>
                    </div>
                    {review.comment && (
                      <p className="text-sm text-foreground mt-3 p-3 bg-background rounded-lg border">
                        "{review.comment}"
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}