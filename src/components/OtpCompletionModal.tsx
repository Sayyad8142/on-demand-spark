import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Check, Loader2, AlertCircle, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PayoutSummary {
  payout_amount: number;
  platform_fee: number;
  booking_amount: number;
  status: string;
}

interface OtpCompletionModalProps {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  onCompleted: () => void;
}

export default function OtpCompletionModal({ open, onClose, bookingId, onCompleted }: OtpCompletionModalProps) {
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [payout, setPayout] = useState<PayoutSummary | null>(null);

  const handleSubmit = async () => {
    if (otp.length < 4) {
      setError("Please enter the complete OTP");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("complete-booking-with-otp", {
        body: { booking_id: bookingId, otp },
      });

      if (fnError) {
        // Parse the error from the edge function response
        const errorBody = fnError.message || "Something went wrong";
        if (errorBody.includes("already completed")) {
          setError("This booking is already completed.");
        } else if (errorBody.includes("Invalid OTP")) {
          setError("Wrong OTP. Please ask the customer for the correct code.");
        } else {
          setError(errorBody);
        }
        setLoading(false);
        return;
      }

      if (data?.error) {
        if (data.already_completed) {
          setError("This booking is already completed.");
        } else {
          setError(data.error);
        }
        setLoading(false);
        return;
      }

      setSuccess(true);
      if (data?.payout) {
        setPayout(data.payout);
      }

      // Auto-close after showing success
      setTimeout(() => {
        onCompleted();
        handleClose();
      }, 3000);
    } catch (err: any) {
      setError(err.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOtp("");
    setError(null);
    setSuccess(false);
    setPayout(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        {!success ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Check className="w-5 h-5 text-primary" />
                Complete Job with OTP
              </DialogTitle>
              <DialogDescription>
                Ask the customer for their 4-digit completion OTP to finish this job.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col items-center gap-4 py-4">
              <InputOTP maxLength={4} value={otp} onChange={setOtp}>
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>

              {error && (
                <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 px-3 py-2 rounded-lg w-full">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={loading || otp.length < 4}
                className="w-full h-12 text-base font-bold"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5 mr-2" />
                    Verify & Complete
                  </>
                )}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6">
            <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
              <PartyPopper className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-xl font-bold text-center">Job Completed! 🎉</h3>

            {payout && (
              <div className="w-full bg-muted rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Booking Amount</span>
                  <span className="font-medium">₹{payout.booking_amount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Platform Fee</span>
                  <span className="font-medium text-destructive">-₹{payout.platform_fee}</span>
                </div>
                <div className="border-t pt-2 flex justify-between">
                  <span className="font-semibold">Your Payout</span>
                  <span className="font-bold text-green-600 text-lg">₹{payout.payout_amount}</span>
                </div>
                <p className="text-xs text-muted-foreground text-center mt-1">
                  Payout will be processed within 24 hours
                </p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
