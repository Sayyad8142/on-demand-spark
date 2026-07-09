import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { voicePrefs } from "@/lib/voice/prefs";
import { Volume2 } from "lucide-react";

type Row = { key: "announce" | "briefing" | "summary" | "tips"; label: string; desc: string };

const ROWS: Row[] = [
  { key: "announce", label: "Speak new bookings", desc: "Announce a short summary when a new booking arrives." },
  { key: "briefing", label: "Morning briefing", desc: "Short recap and encouragement in the morning." },
  { key: "summary", label: "Evening summary", desc: "Today's earnings and highlights when you go offline." },
  { key: "tips", label: "Idle tips", desc: "Occasional suggestions when you're online and idle." },
];

export default function VoiceAssistantPrefsCard() {
  const [state, setState] = useState({
    announce: voicePrefs.announceEnabled(),
    briefing: voicePrefs.briefingEnabled(),
    summary: voicePrefs.summaryEnabled(),
    tips: voicePrefs.tipsEnabled(),
  });

  const toggle = (key: Row["key"], v: boolean) => {
    setState((s) => ({ ...s, [key]: v }));
    if (key === "announce") voicePrefs.setAnnounce(v);
    else if (key === "briefing") voicePrefs.setBriefing(v);
    else if (key === "summary") voicePrefs.setSummary(v);
    else voicePrefs.setTips(v);
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Volume2 className="h-4 w-4" />
        </div>
        <div className="font-semibold">Voice Assistant</div>
      </div>
      <div className="space-y-4">
        {ROWS.map((r) => (
          <div key={r.key} className="flex items-center justify-between">
            <div className="flex-1 pr-4">
              <Label className="text-sm font-medium">{r.label}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
            </div>
            <Switch checked={state[r.key]} onCheckedChange={(v) => toggle(r.key, v)} />
          </div>
        ))}
      </div>
    </Card>
  );
}
