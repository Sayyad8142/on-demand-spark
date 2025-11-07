import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
type DayKey = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type Slot = {
  label: string;
  start: string;
  end: string;
  selected: boolean;
};
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Generate 30-min slots from 6:00 AM to 7:00 PM
const generateSlots = (): Slot[] => {
  const slots: Slot[] = [];
  for (let hour = 6; hour < 19; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const h = hour.toString().padStart(2, "0");
      const m = min.toString().padStart(2, "0");
      
      // Convert to 12-hour format for label
      const hour12 = hour > 12 ? hour - 12 : hour;
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
export default function Availability() {
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  const {
    user
  } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weekData, setWeekData] = useState<Record<DayKey, Slot[]>>({
    0: generateSlots(),
    1: generateSlots(),
    2: generateSlots(),
    3: generateSlots(),
    4: generateSlots(),
    5: generateSlots(),
    6: generateSlots()
  });
  const [activeDay, setActiveDay] = useState<DayKey>(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1 as DayKey);
  useEffect(() => {
    loadAvailability();
  }, []);
  const loadAvailability = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from("worker_availability").select("day_of_week, slots").order("day_of_week");
      if (error) throw error;
      if (data && data.length > 0) {
        const newWeekData = {
          ...weekData
        };
        data.forEach((row: any) => {
          const dayKey = row.day_of_week as DayKey;
          if (row.slots && Array.isArray(row.slots)) {
            (row.slots as any[]).forEach((timeSlot: any) => {
              const timeStr = String(timeSlot);
              newWeekData[dayKey] = newWeekData[dayKey].map(slot => slot.start === timeStr ? {
                ...slot,
                selected: true
              } : slot);
            });
          }
        });
        setWeekData(newWeekData);
      } else {
        // First time user - select all slots by default
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
      title: "Copied",
      description: "Applied this day to all days"
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
    const newWeekData = {
      ...weekData
    };
    for (let day = 0; day < 7; day++) {
      newWeekData[day as DayKey] = generateSlots();
    }
    setWeekData(newWeekData);
  };
  const saveAvailability = async () => {
    // Check if at least one slot is selected
    const hasAnySlot = Object.values(weekData).some(slots => slots.some(s => s.selected));
    if (!hasAnySlot) {
      toast({
        title: "No slots selected",
        description: "Please select at least one time slot",
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
          worker_id: user!.id,
          day_of_week: day,
          slots: selectedSlots.length > 0 ? selectedSlots : []
        });
      }
      
      const {
        error
      } = await supabase
        .from("worker_availability")
        .upsert(dayRecords, { 
          onConflict: 'worker_id,day_of_week',
          ignoreDuplicates: false 
        });
        
      if (error) throw error;
      
      toast({
        title: "Availability saved",
        description: "Your free time slots have been updated"
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
    return summary.length > 0 ? summary.join(", ") : "No slots selected";
  };
  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>;
  }
  return <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/profile")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Set Your Available Time Slots</h1>
            <p className="text-sm text-muted-foreground">
              Select when you're free to accept jobs
            </p>
          </div>
        </div>
      </div>

      {/* Day Selector */}
      <div className="p-4">
        <Card className="p-4">
          <h2 className="text-base font-semibold mb-4">Select days of the week</h2>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {DAYS.slice(0, 4).map((day, i) => <button key={i} onClick={() => setActiveDay(i as DayKey)} className={`w-full h-16 rounded-lg border-2 transition-all flex flex-col items-center justify-center ${activeDay === i ? "bg-primary border-primary text-primary-foreground shadow-md" : "bg-background border-border hover:border-primary/50"}`}>
                <span className="text-xs font-medium uppercase">
                  {DAYS_SHORT[i]}
                </span>
              </button>)}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {DAYS.slice(4, 7).map((day, i) => <button key={i + 4} onClick={() => setActiveDay((i + 4) as DayKey)} className={`w-full h-16 rounded-lg border-2 transition-all flex flex-col items-center justify-center ${activeDay === (i + 4) ? "bg-primary border-primary text-primary-foreground shadow-md" : "bg-background border-border hover:border-primary/50"}`}>
                <span className="text-xs font-medium uppercase">
                  {DAYS_SHORT[i + 4]}
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
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={() => clearDay(activeDay)} className="flex-1">
            Clear Day
          </Button>
          <Button variant="outline" size="sm" onClick={() => copyToAllDays(activeDay)} className="flex-1">
            Copy to All
          </Button>
        </div>
      </div>

      {/* Time Slots */}
      <div className="px-4 pb-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-muted-foreground" />
            <span className="text-base font-semibold">Select time slots for {DAYS[activeDay]}</span>
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
            Selected time slots for {DAYS[activeDay]}:
          </p>
          <p className="text-sm text-muted-foreground">{getSummary()}</p>
        </Card>
      </div>

      {/* Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t p-4 space-y-2 shadow-lg">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <Button variant="outline" onClick={selectAllWeek} className="flex-1">
            All Week
          </Button>
          <Button variant="outline" onClick={clearAllWeek} className="flex-1">
            Clear Week
          </Button>
        </div>
        <Button onClick={saveAvailability} disabled={saving} className="w-full max-w-2xl mx-auto" size="lg">
          {saving ? "Saving..." : "Save Availability"}
        </Button>
      </div>
    </div>;
}