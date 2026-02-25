import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Phone, Volume2 } from "lucide-react";
import { BookingWithAddress } from "@/lib/address";
import { parsePHFCode } from "@/lib/address";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import serviceDishWashing from "@/assets/service-dish-washing.webp";
import serviceFloorCleaning from "@/assets/service-floor-cleaning.webp";
import serviceBathroomCleaning from "@/assets/service-bathroom-cleaning.webp";
import serviceCooking from "@/assets/service-cooking.webp";

const TASK_CONFIG: Record<string, { label: string; img: string }> = {
  dish_washing: { label: "Dish Washing", img: serviceDishWashing },
  floor_cleaning: { label: "Jhadu Pocha", img: serviceFloorCleaning },
};

const SERVICE_TASKS: Record<string, { label: string; img: string }[]> = {
  bathroom_cleaning: [{ label: "Bathroom Cleaning", img: serviceBathroomCleaning }],
  cook: [{ label: "Cooking", img: serviceCooking }],
};

type Booking = BookingWithAddress;
interface ActiveJobCardProps {
  booking: Booking;
  onStatusUpdate: (newStatus: string) => Promise<void>;
  updating: boolean;
}

const MANAGER_PHONE = "8008180018";
const COOLDOWN_MINUTES = 20;

export default function ActiveJobCard({
  booking,
  onStatusUpdate,
  updating
}: ActiveJobCardProps) {
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [taskPrices, setTaskPrices] = useState<Record<string, number>>({});
  const { i18n } = useTranslation();

  // Fetch per-task prices
  useEffect(() => {
    if (!booking.maid_tasks || booking.maid_tasks.length === 0) return;
    const flatSize = booking.flat_size || '2BHK';
    const community = booking.community || '';

    const fetchPrices = async () => {
      // Try community-specific first, fallback to default
      const { data } = await supabase
        .from('maid_pricing_tasks')
        .select('task, price_inr')
        .eq('flat_size', flatSize)
        .eq('active', true)
        .in('community', [community, '']);

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
    const result: { label: string; img: string; price?: number }[] = [];
    if (booking.maid_tasks && booking.maid_tasks.length > 0) {
      booking.maid_tasks.forEach((t) => {
        const cfg = TASK_CONFIG[t];
        if (cfg) result.push({ ...cfg, price: taskPrices[t] });
      });
    } else if (booking.service_type && SERVICE_TASKS[booking.service_type]) {
      result.push(...SERVICE_TASKS[booking.service_type].map(s => ({
        ...s,
        price: booking.price_inr ?? undefined,
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
      const teVoice = voices.find(v => v.lang.startsWith('te'));
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
    const indianVoice = voices.find(v => v.lang === utteranceLang) 
      || voices.find(v => v.lang.startsWith(langPrefix) && v.lang.includes('IN'))
      || voices.find(v => v.lang.startsWith(langPrefix));
    if (indianVoice) utterance.voice = indianVoice;
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.volume = 1;
    window.speechSynthesis.speak(utterance);
  };

  const isWorkCompletedDisabled = updating || remainingSeconds > 0;

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return <Card className="shadow-lg overflow-hidden border-0">
      <div className="p-4 space-y-3">
        {/* 1. Flat Number Display - Wooden Door Style */}
        <div className="flat-door-style p-5">
          <div className="text-center mb-4 relative z-10 flex items-center justify-center gap-2">
            <p className="flat-number-text font-extrabold text-3xl tracking-wide uppercase">
              Flat {booking.flat_no}
            </p>
            <button
              onClick={speakFlatNo}
              className="p-2 rounded-full bg-[#5A3423]/60 hover:bg-[#5A3423] transition-colors active:scale-90 ml-2"
              aria-label="Speak flat number"
            >
              <Volume2 className="w-5 h-5 text-[#D6B88A]" />
            </button>
          </div>
          {phfParsed && (
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
          )}
        </div>

        {/* Earnings + Call Manager in one row */}
        <div className="flex gap-2">
          {booking.price_inr && (
            <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 shadow-sm flex items-center justify-between">
              <p className="text-xs font-medium text-gray-500">Earnings</p>
              <p className="font-bold text-green-500 text-lg">₹{booking.price_inr}</p>
            </div>
          )}
          <Button 
            size="sm" 
            className="flex-1 h-auto py-2 text-sm font-bold bg-green-500 hover:bg-green-600 text-white shadow-md rounded-xl transition-all duration-200 active:scale-[0.98]" 
            onClick={handleCallManager}
          >
            <Phone className="w-4 h-4 mr-1.5" />
            Call Manager
          </Button>
        </div>

        {/* 4. Work Completed Button */}
        <Button 
          size="lg" 
          className={`w-full h-14 text-lg font-bold shadow-lg rounded-xl transition-all duration-200 active:scale-[0.98] ${
            isWorkCompletedDisabled 
              ? "bg-gray-400 hover:bg-gray-400 cursor-not-allowed text-white/80" 
              : "bg-red-500 hover:bg-red-600 text-white"
          }`}
          onClick={() => onStatusUpdate('completed')} 
          disabled={isWorkCompletedDisabled}
        >
          {updating ? "Updating..." : (
            <>
              <Check className="w-6 h-6 mr-2" />
              Work Completed
              {remainingSeconds > 0 && (
                <span className="ml-2 text-sm font-normal opacity-80">({formatCountdown(remainingSeconds)})</span>
              )}
            </>
          )}
        </Button>

        {/* 5. Work Tasks — Sliding Banner */}
        {tasks.length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted-foreground mb-2 tracking-wider uppercase">Today's Work</p>
            <div className="relative rounded-2xl overflow-hidden shadow-md">
              <div
                className="flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${currentSlide * 100}%)` }}
              >
                {tasks.map((task) => (
                  <div key={task.label} className="w-full flex-shrink-0 relative">
                    <img
                      src={task.img}
                      alt={task.label}
                      className="w-full h-44 object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                    <div className="absolute bottom-0 right-0 p-3">
                      {task.price != null && task.price > 0 && (
                        <span className="bg-white/20 backdrop-blur-sm text-white font-bold text-base px-3 py-1 rounded-lg">
                          ₹{task.price}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Dots */}
              {tasks.length > 1 && (
                <div className="absolute bottom-2 right-4 flex gap-1.5">
                  {tasks.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentSlide(i)}
                      className={`w-2 h-2 rounded-full transition-all ${
                        i === currentSlide ? "bg-white w-4" : "bg-white/50"
                      }`}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>;
}
