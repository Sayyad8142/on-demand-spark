-- Create worker_reviews table for customer feedback on completed jobs
CREATE TABLE IF NOT EXISTS public.worker_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL,
  customer_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.worker_reviews ENABLE ROW LEVEL SECURITY;

-- Customers can insert reviews for their completed bookings
CREATE POLICY "worker_reviews_customer_insert"
ON public.worker_reviews
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = customer_id 
  AND EXISTS (
    SELECT 1 FROM bookings b 
    WHERE b.id = booking_id 
    AND b.user_id = auth.uid() 
    AND b.status = 'completed'
    AND b.worker_id = worker_reviews.worker_id
  )
);

-- Workers can view reviews about themselves
CREATE POLICY "worker_reviews_worker_select"
ON public.worker_reviews
FOR SELECT
TO authenticated
USING (worker_id = auth.uid());

-- Customers can view their own reviews
CREATE POLICY "worker_reviews_customer_select"
ON public.worker_reviews
FOR SELECT
TO authenticated
USING (customer_id = auth.uid());

-- Admins can do everything
CREATE POLICY "worker_reviews_admin_all"
ON public.worker_reviews
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

-- Create index for faster queries
CREATE INDEX idx_worker_reviews_worker_id ON public.worker_reviews(worker_id);
CREATE INDEX idx_worker_reviews_booking_id ON public.worker_reviews(booking_id);

-- Trigger to update updated_at
CREATE TRIGGER update_worker_reviews_updated_at
  BEFORE UPDATE ON public.worker_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();