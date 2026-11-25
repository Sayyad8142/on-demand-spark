import { displayText, useWorkerLanguage, serviceLabel, bookingStatusLabel, displayLocale } from "@/i18n/display";
import { useMemo } from "react";
import { useWorkerRatings } from "@/hooks/useWorkerRatings";
import { reviewBreakdown } from "@/lib/workerRatings";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Loader2, Star, MessageSquare, BarChart3 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import RatingBreakdown from "@/components/RatingBreakdown";
import { DEMO_WORKER } from "@/config/demoData";

export default function CustomerReviews() {
  useWorkerLanguage();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
  const isGuestMode = localStorage.getItem('guest_mode') === 'true';
  
  const { worker: realWorker, loading: realWorkerLoading } = useWorkerProfile(!isGuestMode ? user?.id : undefined);
  const worker = isGuestMode ? DEMO_WORKER : realWorker;
  const workerLoading = isGuestMode ? false : realWorkerLoading;

  const { summary, reviews: reviewQuery } = useWorkerRatings(isGuestMode ? null : realWorker?.id, true);
  const demoReviews = useMemo(() => [
    { id: 'demo-1', rating: 5, comment: 'Excellent service!', created_at: '2026-11-12', bookings: { cust_name: 'Demo Customer', service_type: 'maid', flat_no: 'B-205', community: 'Demo Community' } },
    { id: 'demo-2', rating: 5, comment: 'Great work!', created_at: '2026-11-10', bookings: { cust_name: 'Demo Customer', service_type: 'bathroom_cleaning', flat_no: 'C-302', community: 'Demo Community' } },
  ], []);
  const reviews = isGuestMode ? demoReviews : reviewQuery.data ?? [];
  const workerRating = isGuestMode ? DEMO_WORKER.rating : summary.data?.average;
  const ratingsCount = isGuestMode ? DEMO_WORKER.total_ratings : summary.data?.count;
  const ratingBreakdown = useMemo(() => reviewBreakdown(reviews), [reviews]);
  const loading = !isGuestMode && (summary.isLoading || reviewQuery.isLoading);

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
              {ratingsCount ?? '—'} {displayText("review")}{ratingsCount !== 1 ? 's' : ''} • {ratingsCount === 0 ? displayText("New Worker") : <>{workerRating?.toFixed(1) ?? "—"} {displayText("avg rating")}</>}
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
              {displayText("Rating Breakdown")}
            </CardTitle>
            <CardDescription>
              {displayText("Distribution of your")} {reviews.length} {displayText("rating")}{reviews.length !== 1 ? 's' : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reviews.length === 0 && (ratingsCount ?? 0) > 0 ? (
              <p className="text-sm text-muted-foreground">{displayText("No reviews yet")}</p>
            ) : <RatingBreakdown
              ratings={ratingBreakdown} 
              totalRatings={reviews.length}
            />}
          </CardContent>
        </Card>

        {/* Reviews List */}
        <Card className="border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare className="w-5 h-5" />
              {displayText("All Reviews (")}{reviews.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {reviewQuery.isError ? (
              <div className="py-4 text-destructive">{displayText("Unable to load reviews")}
                <Button variant="ghost" onClick={() => void reviewQuery.refetch()}>{displayText("Try again")}</Button>
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">{displayText("No reviews yet")}</p>
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
                          {review.bookings?.service_type} • {review.bookings?.community} {displayText("• Flat")} {review.bookings?.flat_no}
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