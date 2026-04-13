import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, Loader2, Banknote, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface PaymentCollectionModalProps {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  amount: number;
  onCollected: () => void;
}

export default function PaymentCollectionModal({ open, onClose, bookingId, amount, onCollected }: PaymentCollectionModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const { toast } = useToast();

  const handleCollect = async () => {
    if (!selectedMethod) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({
          worker_collected_payment: true,
          worker_collection_method: selectedMethod,
          worker_collected_at: new Date().toISOString(),
        })
        .eq("id", bookingId);

      if (error) throw error;

      toast({ title: "Payment Collected", description: `₹${amount} marked as collected via ${selectedMethod}` });
      onCollected();
      onClose();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Collect Payment</DialogTitle>
          <DialogDescription>
            Mark how you collected ₹{amount} from the customer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <button
            onClick={() => setSelectedMethod("cash")}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
              selectedMethod === "cash"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <Banknote className="w-6 h-6 text-green-600" />
            <div className="text-left">
              <p className="font-semibold">Cash</p>
              <p className="text-xs text-muted-foreground">Customer paid in cash</p>
            </div>
          </button>

          <button
            onClick={() => setSelectedMethod("upi")}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
              selectedMethod === "upi"
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <Smartphone className="w-6 h-6 text-blue-600" />
            <div className="text-left">
              <p className="font-semibold">UPI</p>
              <p className="text-xs text-muted-foreground">Customer paid via UPI</p>
            </div>
          </button>

          <Button
            onClick={handleCollect}
            disabled={!selectedMethod || loading}
            className="w-full h-12 text-base font-bold"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Check className="w-5 h-5 mr-2" />
            )}
            Confirm Collection
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
