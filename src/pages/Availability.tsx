import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Clock, Copy, Trash2, ArrowLeft } from "lucide-react";
import BottomNav from "@/components/BottomNav";

type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SLOT_COUNT = 26;
const START_HOUR = 6;
const START_MINUTE = 0;

// Generate time slots: 06:00, 06:30, ..., 18:30
function getTimeSlots() {
  const slots: string[] = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const totalMinutes = START_HOUR * 60 + START_MINUTE + i * 30;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const period = hours >= 12 ? "pm" : "am";
    const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    slots.push(`${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`);
  }
  return slots;
}

const TIME_SLOTS = getTimeSlots();

export default function Availability() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [selectedDay, setSelectedDay] = useState<DayOfWeek>(new Date().getDay() as DayOfWeek);
  const [slots, setSlots] = useState<Record<DayOfWeek, boolean[]>>({
    0: Array(SLOT_COUNT).fill(false),
    1: Array(SLOT_COUNT).fill(false),
    2: Array(SLOT_COUNT).fill(false),
    3: Array(SLOT_COUNT).fill(false),
    4: Array(SLOT_COUNT).fill(false),
    5: Array(SLOT_COUNT).fill(false),
    6: Array(SLOT_COUNT).fill(false),
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timezone, setTimezone] = useState("Asia/Kolkata");

  useEffect(() => {
    loadAvailability();
  }, [user]);

  async function loadAvailability() {
    if (!user) return;
    
    try {
      // Get worker details
      const { data: worker } = await supabase
        .from("workers")
        .select("id, timezone")
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .single();
        
      if (worker) {
        setTimezone(worker.timezone || "Asia/Kolkata");
        
        // Load availability
        const { data, error } = await supabase
          .from("worker_availability")
          .select("*")
          .eq("worker_id", worker.id);
          
        if (error) throw error;
        
        if (data && data.length > 0) {
          const newSlots: Record<DayOfWeek, boolean[]> = { ...slots };
          data.forEach((row) => {
            newSlots[row.day_of_week as DayOfWeek] = row.slots;
          });
          setSlots(newSlots);
        }
      }
    } catch (error) {
      console.error("Error loading availability:", error);
      toast({ title: "Error loading availability", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function saveAvailability() {
    if (!user) return;
    
    setSaving(true);
    try {
      const { data: worker } = await supabase
        .from("workers")
        .select("id")
        .or(`id.eq.${user.id},user_id.eq.${user.id}`)
        .single();
        
      if (!worker) throw new Error("Worker not found");
      
      // Upsert all days
      const updates = Object.entries(slots).map(([day, daySlots]) => ({
        worker_id: worker.id,
        day_of_week: parseInt(day),
        slots: daySlots,
      }));
      
      const { error } = await supabase
        .from("worker_availability")
        .upsert(updates, { onConflict: "worker_id,day_of_week" });
        
      if (error) throw error;
      
      toast({ title: "Availability saved" });
    } catch (error) {
      console.error("Error saving availability:", error);
      toast({ title: "Error saving availability", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  function toggleSlot(index: number) {
    const newSlots = { ...slots };
    newSlots[selectedDay] = [...newSlots[selectedDay]];
    newSlots[selectedDay][index] = !newSlots[selectedDay][index];
    setSlots(newSlots);
  }

  function selectAll() {
    const newSlots = { ...slots };
    newSlots[selectedDay] = Array(SLOT_COUNT).fill(true);
    setSlots(newSlots);
  }

  function clearAll() {
    const newSlots = { ...slots };
    newSlots[selectedDay] = Array(SLOT_COUNT).fill(false);
    setSlots(newSlots);
  }

  function setPreset(start: number, end: number) {
    const newSlots = { ...slots };
    newSlots[selectedDay] = Array(SLOT_COUNT).fill(false);
    for (let i = start; i <= end; i++) {
      newSlots[selectedDay][i] = true;
    }
    setSlots(newSlots);
  }

  const morningSlots = TIME_SLOTS.slice(0, 11); // 06:00-11:00
  const afternoonSlots = TIME_SLOTS.slice(11, 21); // 11:30-16:30
  const eveningSlots = TIME_SLOTS.slice(21); // 17:00-18:30

  if (loading) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="bg-card border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/profile")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-semibold">Availability</h1>
        </div>
      </header>
      
      <div className="p-4 space-y-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>All times in {timezone}</span>
          </div>
        </Card>

        {/* Day selector */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {DAYS.map((day, i) => (
            <Button
              key={i}
              variant={selectedDay === i ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedDay(i as DayOfWeek)}
              className="min-w-[60px]"
            >
              {day}
            </Button>
          ))}
        </div>

        {/* Time of day tabs */}
        <Tabs defaultValue="morning" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="morning">Morning</TabsTrigger>
            <TabsTrigger value="afternoon">Afternoon</TabsTrigger>
            <TabsTrigger value="evening">Evening</TabsTrigger>
          </TabsList>
          
          <TabsContent value="morning" className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {morningSlots.map((time, i) => (
                <Button
                  key={i}
                  variant={slots[selectedDay][i] ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleSlot(i)}
                  className="h-12"
                >
                  {time}
                </Button>
              ))}
            </div>
          </TabsContent>
          
          <TabsContent value="afternoon" className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {afternoonSlots.map((time, i) => {
                const index = i + 11;
                return (
                  <Button
                    key={index}
                    variant={slots[selectedDay][index] ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleSlot(index)}
                    className="h-12"
                  >
                    {time}
                  </Button>
                );
              })}
            </div>
          </TabsContent>
          
          <TabsContent value="evening" className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {eveningSlots.map((time, i) => {
                const index = i + 21;
                return (
                  <Button
                    key={index}
                    variant={slots[selectedDay][index] ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleSlot(index)}
                    className="h-12"
                  >
                    {time}
                  </Button>
                );
              })}
            </div>
          </TabsContent>
        </Tabs>

        {/* Quick actions */}
        <Card className="p-4 space-y-3">
          <h3 className="font-semibold">Quick Actions</h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={clearAll}>
              <Trash2 className="w-4 h-4 mr-1" />
              Clear
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Working Hours Presets:</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPreset(0, 14)}>
                6:00-13:00
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setPreset(6, 22)}>
                9:00-17:00
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setPreset(8, 26)}>
                10:00-19:00
              </Button>
            </div>
          </div>
        </Card>

        {slots[selectedDay].every(s => !s) && (
          <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950 p-3 rounded-lg">
            ⚠️ No availability set for this day
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t">
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => navigate("/profile")}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={saveAvailability}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
