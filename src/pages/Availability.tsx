import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import BottomNav from "@/components/BottomNav";
type DayKey = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type Slot = {
  label: string;
  start: string;
  end: string;
  selected: boolean;
};
const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_SHORT_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

// Generate 30-min slots from 7:00 AM to endHour (default 7:00 PM, cooks get 9:00 PM)
const generateSlots = (endHour: number = 19): Slot[] => {
  const slots: Slot[] = [];
  for (let hour = 7; hour < endHour; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const h = hour.toString().padStart(2, "0");
      const m = min.toString().padStart(2, "0");

      // Convert to 12-hour format for label
      const hour12 = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const period = hour >= 12 ? "PM" : "AM";
      const label = `${hour12}:${m} ${period}`;
      slots.push({
        label,
        start: `${h}:${m}:00`,
        end: `${h}:${min + 30 < 60 ? (min + 30).toString().padStart(2, "0") : "00"}:00`,
        selected: false
      });
    }
  }
  return slots;
};

const generateInitialWeekData = (endHour: number = 19): Record<DayKey, Slot[]> => ({
  0: generateSlots(endHour),
  1: generateSlots(endHour),
  2: generateSlots(endHour),
  3: generateSlots(endHour),
  4: generateSlots(endHour),
  5: generateSlots(endHour),
  6: generateSlots(endHour)
});

export default function Availability() {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const {
    user
  } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isCook, setIsCook] = useState(false);
  const [weekData, setWeekData] = useState<Record<DayKey, Slot[]>>(generateInitialWeekData());
  const [activeDay, setActiveDay] = useState<DayKey>(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1 as DayKey);
  const [workerId, setWorkerId] = useState<string | null>(null);

  const getDayName = (index: number) => t(`availability.days.${DAY_KEYS[index]}`);
  const getDayShort = (index: number) => t(`availability.daysShort.${DAY_SHORT_KEYS[index]}`);

  useEffect(() => {
    loadWorkerAndAvailability();
  }, [user]);

  const loadWorkerAndAvailability = async () => {
    if (!user) return;

    try {
      // First try to fetch worker by user_id
      let { data: workerData, error: workerError } = await supabase
        .from("workers")
        .select("id, service_types")
        .eq("user_id", user.id)
        .maybeSingle();

      // If not found by user_id, try by worker id (for legacy workers where id = user_id)
      if (!workerData && !workerError) {
        const result = await supabase
          .from("workers")
          .select("id, service_types")
          .eq("id", user.id)
          .maybeSingle();
        workerData = result.data;
        workerError = result.error;
      }

      // If still not found, attempt to auto-create the worker row from auth claims
      if (!workerData && !workerError) {
        const { error: ensureError } = await supabase.rpc('ensure_worker_profile');
        if (ensureError) {
          console.error('❌ ensure_worker_profile failed:', ensureError);
        } else {
          // Retry fetch
          let retry = await supabase
            .from("workers")
            .select("id, service_types")
            .eq("user_id", user.id)
            .maybeSingle();

          if (!retry.data && !retry.error) {
            retry = await supabase
              .from("workers")
              .select("id, service_types")
              .eq("id", user.id)
              .maybeSingle();
          }

          workerData = retry.data;
          workerError = retry.error;
        }
      }

      if (workerError) throw workerError;

      if (workerData) {
        setWorkerId(workerData.id);
        
        // Check if worker is a cook - cooks get extended hours till 9 PM
        const workerIsCook = workerData.service_types?.includes('cook') || false;
        setIsCook(workerIsCook);
        
        // Regenerate slots with correct end hour (21 for cooks, 19 for others)
        const endHour = workerIsCook ? 21 : 19;
        setWeekData(generateInitialWeekData(endHour));
        
        await loadAvailability(workerData.id, endHour);
      } else {
        // No worker record found
        toast({
          title: "Error",
          description: "Worker profile not found",
          variant: "destructive"
        });
        setLoading(false);
      }
    } catch (error: any) {
      console.error("Error loading worker:", error);
      toast({
        title: "Error",
        description: "Failed to load your profile",
        variant: "destructive"
      });
      setLoading(false);
    }
  };
  const loadAvailability = async (workerIdToLoad: string, endHour: number = 19) => {
    try {
      const {
        data,
        error
      } = await supabase.from("worker_availability").select("day_of_week, slots").eq("worker_id", workerIdToLoad).order("day_of_week");
      if (error) throw error;
      if (data && data.length > 0) {
        // Start fresh - all slots unselected with correct end hour
        const newWeekData: Record<DayKey, Slot[]> = generateInitialWeekData(endHour);
        
        // Mark only the saved slots as selected
        data.forEach((row: any) => {
          const dayKey = row.day_of_week as DayKey;
          if (row.slots && Array.isArray(row.slots)) {
            const savedSlots = new Set(row.slots.map((s: any) => String(s)));
            newWeekData[dayKey] = newWeekData[dayKey].map(slot => ({
              ...slot,
              selected: savedSlots.has(slot.start)
            }));
          }
        });
        setWeekData(newWeekData);
      } else {
        // First time user - select all slots by default
        const newWeekData = generateInitialWeekData(endHour);
        for (let day = 0; day < 7; day++) {
          newWeekData[day as DayKey] = newWeekData[day as DayKey].map(slot => ({
            ...slot,
            selected: true
          }));
        }
        setWeekData(newWeekData);
      }
    } catch (error: any) {
      console.error("Error loading availability:", error);
      toast({
        title: "Error",
        description: "Failed to load your availability",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const toggleSlot = (day: DayKey, index: number) => {
    setWeekData(prev => ({
      ...prev,
      [day]: prev[day].map((slot, i) => i === index ? {
        ...slot,
        selected: !slot.selected
      } : slot)
    }));
  };
  const selectAllDay = (day: DayKey) => {
    setWeekData(prev => ({
      ...prev,
      [day]: prev[day].map(slot => ({
        ...slot,
        selected: true
      }))
    }));
  };
  const clearDay = (day: DayKey) => {
    setWeekData(prev => ({
      ...prev,
      [day]: prev[day].map(slot => ({
        ...slot,
        selected: false
      }))
    }));
  };
  const copyToAllDays = (sourceDay: DayKey) => {
    const sourceSlots = weekData[sourceDay];
    const newWeekData = {
      ...weekData
    };
    for (let day = 0; day < 7; day++) {
      newWeekData[day as DayKey] = sourceSlots.map(slot => ({
        ...slot
      }));
    }
    setWeekData(newWeekData);
    toast({
      title: t('availability.copied'),
      description: t('availability.copiedDesc')
    });
  };
  const selectAllWeek = () => {
    const newWeekData = {
      ...weekData
    };
    for (let day = 0; day < 7; day++) {
      newWeekData[day as DayKey] = newWeekData[day as DayKey].map(slot => ({
        ...slot,
        selected: true
      }));
    }
    setWeekData(newWeekData);
  };
  const clearAllWeek = () => {
    const endHour = isCook ? 21 : 19;
    setWeekData(generateInitialWeekData(endHour));
  };
  const saveAvailability = async () => {
    if (!workerId) {
      toast({
        title: "Error",
        description: "Worker profile not found",
        variant: "destructive"
      });
      return;
    }

    // Check if at least one slot is selected
    const hasAnySlot = Object.values(weekData).some(slots => slots.some(s => s.selected));
    if (!hasAnySlot) {
      toast({
        title: t('availability.noSlotsError'),
        description: t('availability.noSlotsErrorDesc'),
        variant: "destructive"
      });
      return;
    }
    setSaving(true);
    try {
      // Use upsert to avoid duplicate key errors
      const dayRecords = [];
      for (let day = 0; day < 7; day++) {
        const selectedSlots = weekData[day as DayKey].filter(s => s.selected).map(s => s.start);
        dayRecords.push({
          worker_id: workerId,
          day_of_week: day,
          slots: selectedSlots.length > 0 ? selectedSlots : []
        });
      }
      const {
        error
      } = await supabase.from("worker_availability").upsert(dayRecords, {
        onConflict: 'worker_id,day_of_week',
        ignoreDuplicates: false
      });
      if (error) throw error;
      toast({
        title: t('availability.saved'),
        description: t('availability.savedDesc')
      });

      // Redirect to home after saving
      navigate("/home");
    } catch (error: any) {
      console.error("Error saving availability:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save availability",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };
  const getSummary = () => {
    const summary: string[] = [];
    weekData[activeDay].forEach((slot, i, arr) => {
      if (slot.selected) {
        const isFirst = i === 0 || !arr[i - 1].selected;
        const isLast = i === arr.length - 1 || !arr[i + 1].selected;
        if (isFirst) {
          const endSlot = arr.find((s, idx) => idx > i && !s.selected);
          const endTime = endSlot ? arr[endSlot ? arr.indexOf(endSlot) - 1 : i].label : arr[arr.length - 1].label;
          summary.push(`${slot.label}–${endTime}`);
        }
      }
    });
    return summary.length > 0 ? summary.join(", ") : t('availability.noSlotsSelected');
  };
  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>;
  }
  return <div className="min-h-screen bg-background pb-40">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{t('availability.title')}</h1>
            
          </div>
        </div>
      </div>

      {/* Day Selector */}
      <div className="p-4">
        <Card className="p-4">
          <h2 className="text-base font-semibold mb-4">{t('availability.selectDays')}</h2>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {[0, 1, 2, 3].map((i) => <button key={i} onClick={() => setActiveDay(i as DayKey)} className={`w-full h-16 rounded-lg border-2 transition-all flex flex-col items-center justify-center ${activeDay === i ? "bg-primary border-primary text-primary-foreground shadow-md" : "bg-background border-border hover:border-primary/50"}`}>
                <span className="text-xs font-medium uppercase">
                  {getDayShort(i)}
                </span>
              </button>)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[4, 5, 6].map((i) => <button key={i} onClick={() => setActiveDay(i as DayKey)} className={`w-full h-16 rounded-lg border-2 transition-all flex flex-col items-center justify-center ${activeDay === i ? "bg-primary border-primary text-primary-foreground shadow-md" : "bg-background border-border hover:border-primary/50"}`}>
                <span className="text-xs font-medium uppercase">
                  {getDayShort(i)}
                </span>
              </button>)}
          </div>
        </Card>
      </div>

      {/* Day Actions */}
      <div className="px-4 pb-4">
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => selectAllDay(activeDay)} className="flex-1">
            <Check className="h-4 w-4 mr-1" />
            {t('availability.selectAll')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => copyToAllDays(activeDay)} className="flex-1">
            {t('availability.copyToAll')}
          </Button>
        </div>
      </div>

      {/* Time Slots */}
      <div className="px-4 pb-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <span className="text-base font-semibold">{t('availability.selectTimeSlots', { day: getDayName(activeDay) })}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {weekData[activeDay].map((slot, i) => <button key={i} className={`px-3 py-3 rounded-xl text-sm font-medium transition-all border-2 ${slot.selected ? "bg-primary/10 border-primary text-primary" : "bg-background border-border hover:border-primary/30 text-foreground"}`} onClick={() => toggleSlot(activeDay, i)}>
                {slot.label}
              </button>)}
          </div>
        </Card>
      </div>

      {/* Summary */}
      <div className="px-4 pb-4">
        <Card className="p-4 bg-primary/5 border-primary/20">
          <p className="text-sm font-semibold text-foreground mb-2">
            {t('availability.selectedTimeSlots', { day: getDayName(activeDay) })}
          </p>
          <p className="text-sm text-muted-foreground">{getSummary()}</p>
        </Card>
      </div>

      {/* Bottom Actions */}
      <div className="fixed bottom-20 left-0 right-0 bg-background/95 backdrop-blur-sm border-t p-4 space-y-2 shadow-lg z-10">
        <Button onClick={saveAvailability} disabled={saving} className="w-full max-w-2xl mx-auto" size="lg">
          {saving ? t('availability.saving') : t('availability.saveAvailability')}
        </Button>
      </div>

      <BottomNav />
    </div>;
}