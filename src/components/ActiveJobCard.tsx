import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Phone, Volume2, Utensils, Zap, PlusCircle, Sparkles, CookingPot, KeyRound, Banknote, CreditCard, AlertTriangle } from "lucide-react";
import { BookingWithAddress } from "@/lib/address";
import { parsePHFCode } from "@/lib/address";
import { useCommunityFee } from "@/hooks/useCommunityFee";
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { subscribeMovementStatus, type MovementDebugStatus } from "@/lib/stepMonitoring";
import serviceDishWashing from "@/assets/service-dish-washing.webp";
import serviceFloorCleaning from "@/assets/service-floor-cleaning.webp";
import serviceBathroomCleaning from "@/assets/service-bathroom-cleaning.webp";
import PaymentCollectionModal from "@/components/PaymentCollectionModal";

const TASK_CONFIG: Record<string, {label: string; img: string; icon: typeof Utensils}> = {
  dish_washing: { label: "Dish Washing", img: serviceDishWashing, icon: Utensils },
  floor_cleaning: { label: "Jhadu Pocha", img: serviceFloorCleaning, icon: Sparkles }
};

const SERVICE_TASKS: Record<string, {label: string;img: string;}[]> = {
  bathroom_cleaning: [{ label: "Bathroom Cleaning", img: serviceBathroomCleaning }]
};

type Booking = BookingWithAddress;
interface ActiveJobCardProps {
  booking: Booking;
  onStatusUpdate: (newStatus: string) => Promise<void>;
  updating: boolean;
  onRefresh?: () => void;
}

const MANAGER_PHONE = "8008180018";
const COOLDOWN_MINUTES = 15;

export default function ActiveJobCard({
  booking,
  onStatusUpdate,
  updating,
  onRefresh
}: ActiveJobCardProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [taskPrices, setTaskPrices] = useState<Record<string, number>>({});
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [movementStatus, setMovementStatus] = useState<MovementDebugStatus | null>(null);
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const { breakdown: payoutBreakdown } = useCommunityFee(booking.community, booking.price_inr);

  // Fetch per-task prices
  useEffect(() => {
    if (!booking.maid_tasks || booking.maid_tasks.length === 0) return;
    const flatSize = booking.flat_size || '2BHK';
    const community = booking.community || '';

    const fetchPrices = async () => {
      // Try community-specific first, fallback to default
      const { data } = await supabase.
      from('maid_pricing_tasks').
      select('task, price_inr').
      eq('flat_size', flatSize).
      eq('active', true).
      in('community', [community, '']);

      if (data) {
        const prices: Record<string, number> = {};
        // Community-specific overrides default
        data.forEach((row) => {
          if (!prices[row.task] || row.task) {
            prices[row.task] = row.price_inr;
          }
        });
        // Prefer community-specific
        data.forEach((row) => {
          if ((row as any).community === community && community) {
            prices[row.task] = row.price_inr;
          }
        });
        setTaskPrices(prices);
      }
    };
    fetchPrices();
  }, [booking.maid_tasks, booking.flat_size, booking.community]);

  // Build tasks list
  const tasks = useMemo(() => {
    const result: {label: string;img: string;price?: number;}[] = [];
    if (booking.maid_tasks && booking.maid_tasks.length > 0) {
      booking.maid_tasks.forEach((t) => {
        const cfg = TASK_CONFIG[t];
        if (cfg) result.push({ ...cfg, price: taskPrices[t] });
      });
    } else if (booking.service_type && SERVICE_TASKS[booking.service_type]) {
      result.push(...SERVICE_TASKS[booking.service_type].map((s) => ({
        ...s,
        price: booking.price_inr ?? undefined
      })));
    }
    return result;
  }, [booking.maid_tasks, booking.service_type, booking.price_inr, taskPrices]);

  // Auto-slide every 3s
  useEffect(() => {
    if (tasks.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % tasks.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [tasks.length]);

  // Calculate initial remaining time based on accepted_at timestamp
  const cooldownEndTime = useMemo(() => {
    if (booking.accepted_at) {
      const acceptedTime = new Date(booking.accepted_at).getTime();
      return acceptedTime + COOLDOWN_MINUTES * 60 * 1000;
    }
    return null;
  }, [booking.accepted_at]);

  useEffect(() => {
    if (!cooldownEndTime) {
      setRemainingSeconds(0);
      return;
    }

    const updateRemaining = () => {
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((cooldownEndTime - now) / 1000));
      setRemainingSeconds(diff);
    };

    updateRemaining();
    const interval = setInterval(updateRemaining, 1000);

    return () => clearInterval(interval);
  }, [cooldownEndTime]);

  useEffect(() => {
    return subscribeMovementStatus((status) => {
      setMovementStatus(status?.bookingId === booking.id ? status : null);
    });
  }, [booking.id]);

  // Don't show for completed or cancelled bookings
  if (!['assigned', 'accepted', 'on_the_way', 'started'].includes(booking.status)) {
    console.log('🚫 ActiveJobCard: Not showing card, status is:', booking.status);
    return null;
  }
  console.log('✅ ActiveJobCard: Showing card, status is:', booking.status);

  const phfParsed = parsePHFCode(booking.flat_no);

  const handleCallManager = () => {
    window.location.href = `tel:${MANAGER_PHONE}`;
  };

  const speakFlatNo = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const lang = i18n.language;
    const voices = window.speechSynthesis.getVoices();

    let text: string;
    let utteranceLang: string;

    if (lang === 'te') {
      const teVoice = voices.find((v) => v.lang.startsWith('te'));
      if (teVoice) {
        text = `ఫ్లాట్ నంబర్ ${booking.flat_no}`;
        if (phfParsed) text += `. టవర్ ${phfParsed.tower}. ఫ్లోర్ ${phfParsed.floor}. డోర్ నంబర్ ${phfParsed.door}.`;
        utteranceLang = 'te-IN';
      } else {
        text = `फ्लैट नंबर ${booking.flat_no}`;
        if (phfParsed) text += `. टावर ${phfParsed.tower}. फ्लोर ${phfParsed.floor}. डोर नंबर ${phfParsed.door}.`;
        utteranceLang = 'hi-IN';
      }
    } else if (lang === 'hi') {
      text = `फ्लैट नंबर ${booking.flat_no}`;
      if (phfParsed) text += `. टावर ${phfParsed.tower}. फ्लोर ${phfParsed.floor}. डोर नंबर ${phfParsed.door}.`;
      utteranceLang = 'hi-IN';
    } else {
      text = `Flat number ${booking.flat_no}`;
      if (phfParsed) text += `. Tower ${phfParsed.tower}. Floor ${phfParsed.floor}. Door number ${phfParsed.door}.`;
      utteranceLang = 'en-IN';
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = utteranceLang;
    const langPrefix = utteranceLang.split('-')[0];
    const indianVoice = voices.find((v) => v.lang === utteranceLang) ||
    voices.find((v) => v.lang.startsWith(langPrefix) && v.lang.includes('IN')) ||
    voices.find((v) => v.lang.startsWith(langPrefix));
    if (indianVoice) utterance.voice = indianVoice;
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  };

  const isWorkCompletedDisabled = updating;

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatLastUpdated = (iso: string | null) => {
    if (!iso) return "Never";
    const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (seconds < 60) return `${seconds} sec ago`;
    return `${Math.floor(seconds / 60)} min ago`;
  };

  return <Card className="shadow-lg overflow-hidden border-0">
      <div className="space-y-3 py-0 px-0 my-0 mx-0">
        {/* 1. Flat Number Display - Wooden Door Style */}
        <div className="flat-door-style p-5">
          <div className="text-center mb-4 relative z-10 flex items-center justify-center gap-2">
            <p className="flat-number-text font-extrabold text-3xl tracking-wide uppercase">
              Flat {booking.flat_no}
            </p>
            <button
              onClick={speakFlatNo}
              className="p-2 rounded-full bg-[#5A3423]/60 hover:bg-[#5A3423] transition-colors active:scale-90 ml-2"
              aria-label="Speak flat number">
              <Volume2 className="w-5 h-5 text-[#D6B88A]" />
            </button>
          </div>
          {phfParsed &&
            <div className="grid grid-cols-3 gap-3 relative z-10">
              <div className="text-center">
                <p className="text-[10px] font-bold text-[#D6B88A] mb-2 tracking-wider">TOWER</p>
                <div className="bg-[#5A3423] rounded-xl py-4 shadow-inner border-2 border-[#D6B88A]/50">
                  <p className="text-3xl font-extrabold flat-number-text">{phfParsed.tower}</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-[#D6B88A] mb-2 tracking-wider">FLOOR</p>
                <div className="bg-[#5A3423] rounded-xl py-4 shadow-inner border-2 border-[#D6B88A]/50">
                  <p className="text-3xl font-extrabold flat-number-text">{phfParsed.floor}</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-bold text-[#D6B88A] mb-2 tracking-wider">DOOR</p>
                <div className="bg-[#5A3423] rounded-xl py-4 shadow-inner border-2 border-[#D6B88A]/50">
                  <p className="text-3xl font-extrabold flat-number-text">{phfParsed.door}</p>
                </div>
              </div>
            </div>
          }
        </div>

        {/* 2. Work Tasks + Earnings — Combined Card */}
        <div className="mx-3 rounded-2xl overflow-hidden shadow-md border border-border bg-card">
          {tasks.length > 0 &&
            <div className="relative">
              <div
                className="flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${currentSlide * 100}%)` }}>
                {tasks.map((task) =>
                  <div key={task.label} className="w-full flex-shrink-0 relative">
                    <img src={task.img} alt={task.label} className="w-full h-28 object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                    <div className="absolute bottom-0 right-0 p-3">
                      {task.price != null && task.price > 0 &&
                        <span className="bg-white/20 backdrop-blur-sm text-white font-bold text-base px-3 py-1 rounded-lg">
                          ₹{task.price}
                        </span>
                      }
                    </div>
                  </div>
                )}
              </div>
            </div>
          }
          {booking.price_inr != null && booking.price_inr > 0 &&
            <div className="px-4 py-3 space-y-1.5">
              {/* Breakup chips row */}
              {(() => {
                const surge = booking.slot_surge_amount || 0;
                const extra = (booking.dish_intensity_extra_inr || 0) + (booking.surcharge_amount || 0);
                const glassPartition = booking.glass_partition_fee || 0;
                const chips: { icon: typeof Utensils; label: string; amount: number }[] = [];
                if (surge > 0) chips.push({ icon: Zap, label: 'Surge', amount: surge });
                if (extra > 0) chips.push({ icon: PlusCircle, label: 'Extra', amount: extra });
                if (glassPartition > 0) chips.push({ icon: Sparkles, label: 'Glass Partition', amount: glassPartition });
                return chips.length >= 1 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {chips.map((chip) => {
                      const Icon = chip.icon;
                      return (
                        <span key={chip.label} className="inline-flex items-center gap-1 bg-muted text-muted-foreground text-xs font-medium px-2 py-0.5 rounded-full">
                          <Icon className="w-3 h-3" />
                          {chip.label} ₹{chip.amount}
                        </span>
                      );
                    })}
                  </div>
                ) : null;
              })()}
              {/* Earnings breakdown — driven by community.platform_fee_percent */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Customer Pays</span>
                  <span>₹{payoutBreakdown.gross}</span>
                </div>
                {payoutBreakdown.feeAmount > 0 && (
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Platform Fee ({payoutBreakdown.feePercent}%)</span>
                    <span>−₹{payoutBreakdown.feeAmount}</span>
                  </div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-border/60">
                  <p className="text-sm font-medium text-muted-foreground">You Earn</p>
                  <p className="font-bold text-green-500 text-xl">₹{payoutBreakdown.netPayout}</p>
                </div>
              </div>
            </div>
          }
        </div>

        {/* 4. Call Manager Button */}
        <div className="px-3">
          <Button
            size="lg"
            className="w-full h-12 text-base font-bold bg-green-500 hover:bg-green-600 text-white shadow-md rounded-xl transition-all duration-200 active:scale-[0.98]"
            onClick={handleCallManager}>
            <Phone className="w-5 h-5 mr-2" />
            Call Manager
          </Button>
        </div>

        <div className="mx-3 rounded-xl border border-border bg-muted/40 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-foreground">📊 Movement Status</p>
            <Badge variant={movementStatus?.status === "Moving" ? "default" : "secondary"}>
              {movementStatus?.status ?? "Not Tracking"}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <div>Steps: <span className="font-semibold text-foreground">{movementStatus?.steps ?? 0}</span></div>
            <div>Last Updated: <span className="font-semibold text-foreground">{formatLastUpdated(movementStatus?.lastUpdatedAt ?? null)}</span></div>
            <div>Permission: <span className="font-semibold text-foreground">{movementStatus?.permissionGranted ? "Granted" : "Check pending"}</span></div>
            <div>API: <span className="font-semibold text-foreground">{movementStatus?.lastSendOk === true ? "Success" : movementStatus?.lastSendOk === false ? "Failed" : "Check pending"}</span></div>
          </div>
          {movementStatus?.warning && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{movementStatus.warning}</span>
            </div>
          )}
        </div>


        {/* Pay After Service: Collect Payment Button */}
        {booking.payment_method === 'pay_after_service' && !(booking as any).worker_collected_payment && (
          <div className="px-3">
            <Button
              size="lg"
              variant="outline"
              className="w-full h-12 text-base font-bold border-2 border-blue-500 text-blue-600 hover:bg-blue-50 rounded-xl"
              onClick={() => setShowPaymentModal(true)}
            >
              <Banknote className="w-5 h-5 mr-2" />
              Collect Payment (₹{booking.price_inr})
            </Button>
          </div>
        )}

        {/* 5. Complete with OTP Button */}
        <div className="px-3 pb-3">
          <Button
            size="lg"
            className={`w-full h-14 text-lg font-bold shadow-lg rounded-xl transition-all duration-200 active:scale-[0.98] ${
              isWorkCompletedDisabled ?
              "bg-gray-400 hover:bg-gray-400 cursor-not-allowed text-white/80" :
              "bg-red-500 hover:bg-red-600 text-white"}`
            }
            onClick={() => navigate(`/complete-booking/${booking.id}`)}
            disabled={isWorkCompletedDisabled}>
            {updating ? "Updating..." :
              <>
                <KeyRound className="w-6 h-6 mr-2" />
                Complete with OTP
              </>
            }
          </Button>
        </div>
      </div>

      {/* Payment Collection Modal */}
      <PaymentCollectionModal
        open={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        bookingId={booking.id}
        amount={booking.price_inr || 0}
        onCollected={() => onRefresh?.()}
      />
    </Card>;
}