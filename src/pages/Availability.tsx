import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, Calendar, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type DayKey = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type Slot = { label: string; start: string; end: string; selected: boolean };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DAYS_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Generate 30-min slots from 6:00 AM to 7:00 PM
const generateSlots = (): Slot[] => {
  const slots: Slot[] = [];
  for (let hour = 6; hour < 19; hour++) {
    for (let min = 0; min < 60; min += 30) {
      const h = hour.toString().padStart(2, "0");
      const m = min.toString().padStart(2, "0");
      const label = `${h}:${m}`;
      slots.push({
        label,
        start: `${h}:${m}:00`,
        end: `${h}:${min + 30 < 60 ? (min + 30).toString().padStart(2, "0") : "00"}:00`,
        selected: false,
      });
    }
  }
  return slots;
};

export default function Availability() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [weekData, setWeekData] = useState<Record<DayKey, Slot[]>>({
    0: generateSlots(),
    1: generateSlots(),
    2: generateSlots(),
    3: generateSlots(),
    4: generateSlots(),
    5: generateSlots(),
    6: generateSlots(),
  });
  const [activeDay, setActiveDay] = useState<DayKey>(new Date().getDay() === 0 ? 6 : (new Date().getDay() - 1) as DayKey);

  useEffect(() => {
    loadAvailability();
  }, []);

  const loadAvailability = async () => {
    try {
      const { data, error } = await supabase
        .from("worker_availability")
        .select("day_of_week, slots")
        .order("day_of_week");

      if (error) throw error;

      if (data && data.length > 0) {
        const newWeekData = { ...weekData };
        data.forEach((row: any) => {
          const dayKey = row.day_of_week as DayKey;
          if (row.slots && Array.isArray(row.slots)) {
            (row.slots as any[]).forEach((timeSlot: any) => {
              const timeStr = String(timeSlot);
              newWeekData[dayKey] = newWeekData[dayKey].map((slot) =>
                slot.start === timeStr ? { ...slot, selected: true } : slot
              );
            });
          }
        });
        setWeekData(newWeekData);
      }
    } catch (error: any) {
      console.error("Error loading availability:", error);
      toast({
        title: "Error",
        description: "Failed to load your availability",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleSlot = (day: DayKey, index: number) => {
    setWeekData((prev) => ({
      ...prev,
      [day]: prev[day].map((slot, i) =>
        i === index ? { ...slot, selected: !slot.selected } : slot
      ),
    }));
  };

  const selectAllDay = (day: DayKey) => {
    setWeekData((prev) => ({
      ...prev,
      [day]: prev[day].map((slot) => ({ ...slot, selected: true })),
    }));
  };

  const clearDay = (day: DayKey) => {
    setWeekData((prev) => ({
      ...prev,
      [day]: prev[day].map((slot) => ({ ...slot, selected: false })),
    }));
  };

  const copyToAllDays = (sourceDay: DayKey) => {
    const sourceSlots = weekData[sourceDay];
    const newWeekData = { ...weekData };
    for (let day = 0; day < 7; day++) {
      newWeekData[day as DayKey] = sourceSlots.map((slot) => ({ ...slot }));
    }
    setWeekData(newWeekData);
    toast({ title: "Copied", description: "Applied this day to all days" });
  };

  const selectAllWeek = () => {
    const newWeekData = { ...weekData };
    for (let day = 0; day < 7; day++) {
      newWeekData[day as DayKey] = newWeekData[day as DayKey].map((slot) => ({
        ...slot,
        selected: true,
      }));
    }
    setWeekData(newWeekData);
  };

  const clearAllWeek = () => {
    const newWeekData = { ...weekData };
    for (let day = 0; day < 7; day++) {
      newWeekData[day as DayKey] = generateSlots();
    }
    setWeekData(newWeekData);
  };

  const saveAvailability = async () => {
    // Check if at least one slot is selected
    const hasAnySlot = Object.values(weekData).some((slots) =>
      slots.some((s) => s.selected)
    );
    if (!hasAnySlot) {
      toast({
        title: "No slots selected",
        description: "Please select at least one time slot",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      // Delete all existing availability for this worker
      await supabase
        .from("worker_availability")
        .delete()
        .eq("worker_id", user!.id);

      // Prepare slots for each day
      const dayRecords = [];
      for (let day = 0; day < 7; day++) {
        const selectedSlots = weekData[day as DayKey]
          .filter((s) => s.selected)
          .map((s) => s.start);

        if (selectedSlots.length > 0) {
          dayRecords.push({
            worker_id: user!.id,
            day_of_week: day,
            slots: selectedSlots,
          });
        }
      }

      if (dayRecords.length > 0) {
        const { error } = await supabase
          .from("worker_availability")
          .insert(dayRecords);

        if (error) throw error;
      }

      toast({
        title: "Availability saved",
        description: "Your free time slots have been updated",
      });
    } catch (error: any) {
      console.error("Error saving availability:", error);
      toast({
        title: "Error",
        description: "Failed to save availability",
        variant: "destructive",
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">Free Time Slots</h1>
            <p className="text-sm text-muted-foreground">
              Choose when you're available
            </p>
          </div>
        </div>
      </div>

      {/* Day Tabs */}
      <Tabs value={activeDay.toString()} onValueChange={(v) => setActiveDay(parseInt(v) as DayKey)} className="w-full">
        <div className="sticky top-[73px] z-10 bg-background/95 backdrop-blur-sm border-b shadow-sm">
          <TabsList className="w-full justify-start overflow-x-auto rounded-none h-12 p-0 bg-transparent">
            {DAYS_SHORT.map((day, i) => (
              <TabsTrigger
                key={i}
                value={i.toString()}
                className="flex-1 min-w-[60px] rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary font-medium"
              >
                {day}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {DAYS.map((_, dayIndex) => (
          <TabsContent key={dayIndex} value={dayIndex.toString()} className="m-0">
            <div className="p-4 space-y-4">
              {/* Day Actions */}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => selectAllDay(dayIndex as DayKey)}
                  className="flex-1"
                >
                  <Check className="h-4 w-4 mr-1" />
                  All
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => clearDay(dayIndex as DayKey)}
                  className="flex-1"
                >
                  Clear
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToAllDays(dayIndex as DayKey)}
                  className="flex-1"
                >
                  Copy to All
                </Button>
              </div>

              {/* Time Slots */}
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{DAYS[dayIndex]}</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {weekData[dayIndex as DayKey].map((slot, i) => (
                    <button
                      key={i}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        slot.selected
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "bg-muted hover:bg-muted/80 text-muted-foreground"
                      }`}
                      onClick={() => toggleSlot(dayIndex as DayKey, i)}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              </Card>

              {/* Summary */}
              <Card className="p-4 bg-primary/5 border-primary/20">
                <div className="flex items-start gap-3">
                  <Calendar className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground mb-1">Selected times:</p>
                    <p className="text-sm text-muted-foreground break-words">{getSummary()}</p>
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {/* Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t p-4 space-y-2 shadow-lg">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <Button variant="outline" onClick={selectAllWeek} className="flex-1">
            Select All Week
          </Button>
          <Button variant="outline" onClick={clearAllWeek} className="flex-1">
            Clear Week
          </Button>
        </div>
        <Button onClick={saveAvailability} disabled={saving} className="w-full max-w-2xl mx-auto" size="lg">
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
