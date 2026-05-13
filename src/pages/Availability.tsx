import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

// Generate 30-min slots from 7:00 AM to 7:00 PM
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
  const [searchParams] = useSearchParams();
  const fromSignup = searchParams.get("from") === "signup";
  const {
    toast
  } = useToast();
  const {
    user
  } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        
        const endHour = 19;
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
    setWeekData(generateInitialWeekData());
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
  const GREEN = "#16C75A";
  const GREEN_SOFT_BG = "rgba(22, 199, 90, 0.10)";
  const GREEN_SOFT_BORDER = "rgba(22, 199, 90, 0.35)";
  const selectedCount = weekData[activeDay].filter(s => s.selected).length;

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <header className="px-5 pt-5 pb-3">
        <h1 className="text-[20px] font-semibold tracking-tight text-foreground leading-tight">
          {t('availability.title')}
        </h1>
        <p className="text-[12px] text-muted-foreground mt-1 font-medium">
          <span style={{ color: GREEN }} className="font-semibold">{selectedCount} slots</span>
          <span className="mx-1.5 text-muted-foreground/50">·</span>
          {getDayName(activeDay)}
        </p>
      </header>

      {fromSignup && (
        <div className="px-5 pb-3">
          <div
            className="rounded-2xl px-3.5 py-2.5 border"
            style={{ backgroundColor: GREEN_SOFT_BG, borderColor: GREEN_SOFT_BORDER }}
          >
            <p className="text-[12px] text-foreground/80 leading-snug">
              <span className="font-semibold text-foreground">Set your working hours</span> — you won't get bookings until saved.
            </p>
          </div>
        </div>
      )}

      {/* Day Selector — pill cards */}
      <div className="px-4 pt-1">
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const active = activeDay === i;
            return (
              <button
                key={i}
                onClick={() => setActiveDay(i as DayKey)}
                className="flex-1 h-14 rounded-2xl text-[12px] uppercase tracking-wide transition-all duration-200 active:scale-95 flex items-center justify-center border"
                style={
                  active
                    ? {
                        backgroundColor: GREEN_SOFT_BG,
                        color: GREEN,
                        borderColor: GREEN_SOFT_BORDER,
                        fontWeight: 600,
                      }
                    : {
                        backgroundColor: "hsl(var(--background))",
                        color: "hsl(var(--muted-foreground))",
                        borderColor: "hsl(var(--border))",
                        fontWeight: 500,
                      }
                }
              >
                {getDayShort(i)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day Actions */}
      <div className="px-4 pt-4">
        <div className="flex gap-2">
          <button
            onClick={() => selectAllDay(activeDay)}
            className="flex-1 h-9 rounded-xl text-[12px] font-medium flex items-center justify-center gap-1.5 active:scale-95 transition border"
            style={{
              backgroundColor: GREEN_SOFT_BG,
              color: GREEN,
              borderColor: GREEN_SOFT_BORDER,
            }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            {t('availability.selectAll')}
          </button>
          <button
            onClick={() => clearDay(activeDay)}
            className="flex-1 h-9 rounded-xl text-[12px] font-medium transition active:scale-95 border border-border bg-background text-muted-foreground hover:text-foreground"
          >
            {t('availability.clear')}
          </button>
          <button
            onClick={() => copyToAllDays(activeDay)}
            className="flex-1 h-9 rounded-xl text-[12px] font-medium transition active:scale-95 border border-border bg-background text-muted-foreground hover:text-foreground"
          >
            {t('availability.copyToAll')}
          </button>
        </div>
      </div>

      {/* Time Slots */}
      <div className="flex-1 px-4 pt-4 pb-3 min-h-0">
        <div
          className="grid grid-cols-4 gap-2 h-full"
          style={{ gridTemplateRows: "repeat(6, minmax(0, 1fr))" }}
        >
          {weekData[activeDay].map((slot, i) => (
            <button
              key={i}
              onClick={() => toggleSlot(activeDay, i)}
              className="rounded-xl text-[11px] transition-all duration-200 active:scale-95 px-1 py-1 border flex items-center justify-center"
              style={
                slot.selected
                  ? {
                      backgroundColor: GREEN_SOFT_BG,
                      color: GREEN,
                      borderColor: GREEN_SOFT_BORDER,
                      fontWeight: 600,
                      boxShadow: "0 1px 3px rgba(22, 199, 90, 0.10)",
                    }
                  : {
                      backgroundColor: "hsl(var(--background))",
                      color: "hsl(var(--muted-foreground))",
                      borderColor: "hsl(var(--border))",
                      fontWeight: 500,
                    }
              }
            >
              {slot.label}
            </button>
          ))}
        </div>
      </div>

      {/* Save Button — sticky above bottom nav */}
      <div
        className="px-5 pt-3 pb-3 bg-background/80 backdrop-blur-md border-t border-border/50"
        style={{ marginBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          onClick={saveAvailability}
          disabled={saving}
          className="w-full h-12 rounded-2xl text-[14px] font-semibold text-white active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center"
          style={{ backgroundColor: GREEN, boxShadow: `0 6px 16px ${GREEN}40` }}
        >
          {saving ? t('availability.saving') : t('availability.saveAvailability')}
        </button>
      </div>

      <BottomNav />
    </div>
  );
}