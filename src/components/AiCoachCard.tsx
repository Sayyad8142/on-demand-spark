import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Play, Pause, Target, Sparkles, RefreshCw } from "lucide-react";
import {
  CoachingPlan,
  generateCoachingPlan,
  loadCachedPlan,
  isVoiceSupported,
  speak,
  stopSpeaking,
} from "@/lib/aiCoach";

interface Props {
  workerId: string | undefined;
  workerRow: any;
}

export default function AiCoachCard({ workerId, workerRow }: Props) {
  const [plan, setPlan] = useState<CoachingPlan | null>(() =>
    workerId ? loadCachedPlan(workerId) : null,
  );
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!workerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const p = await generateCoachingPlan(workerId, workerRow);
        if (!cancelled) setPlan(p);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      stopSpeaking();
      setSpeaking(false);
    };
  }, [workerId]);

  const handlePlay = () => {
    if (!plan) return;
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    speak(plan.spoken_script);
    setSpeaking(true);
    // Poll for end
    const poll = setInterval(() => {
      if (typeof window === "undefined") return;
      if (!window.speechSynthesis.speaking) {
        setSpeaking(false);
        clearInterval(poll);
      }
    }, 400);
  };

  const handleRefresh = async () => {
    if (!workerId) return;
    setLoading(true);
    stopSpeaking();
    setSpeaking(false);
    try {
      const p = await generateCoachingPlan(workerId, workerRow, { force: true });
      setPlan(p);
    } finally {
      setLoading(false);
    }
  };

  const preview = plan?.summary_lines[0] ?? plan?.greeting ?? "Your AI Coach is preparing tips...";

  return (
    <>
      <Card
        className="p-4 border-2 border-primary/30 bg-gradient-to-br from-primary/10 via-background to-primary/5 shadow-sm cursor-pointer active:scale-[0.99] transition-transform"
        onClick={() => setOpen(true)}
      >
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
            <Bot className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base">AI Coach</h3>
              <Badge variant="secondary" className="text-[10px] py-0 px-1.5">Today</Badge>
            </div>
            {loading && !plan ? (
              <Skeleton className="h-4 w-3/4 mt-2" />
            ) : (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{preview}</p>
            )}
          </div>
          <Button
            size="icon"
            className="rounded-full h-11 w-11 shrink-0 shadow-md"
            onClick={(e) => {
              e.stopPropagation();
              if (!plan) return;
              setOpen(true);
              setTimeout(() => handlePlay(), 100);
            }}
            aria-label="Play coaching"
            disabled={!plan}
          >
            <Play className="w-5 h-5 fill-primary-foreground" />
          </Button>
        </div>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) {
            stopSpeaking();
            setSpeaking(false);
          }
        }}
      >
        <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
          <DialogTitle className="sr-only">AI Coach</DialogTitle>
          <div className="bg-gradient-to-br from-primary to-primary/70 p-6 text-primary-foreground text-center relative">
            <div className="w-16 h-16 rounded-full bg-white/20 mx-auto flex items-center justify-center backdrop-blur">
              <Bot className="w-9 h-9" />
            </div>
            <h2 className="text-xl font-bold mt-3">{plan?.greeting ?? "AI Coach"}</h2>
            <p className="text-sm opacity-90 mt-1">Your personal coach for today</p>
          </div>

          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* Play button */}
            {isVoiceSupported() && plan && (
              <div className="flex flex-col items-center gap-2 py-2">
                <Button
                  size="lg"
                  onClick={handlePlay}
                  className="rounded-full h-16 w-16 shadow-xl"
                  aria-label={speaking ? "Stop" : "Play coaching"}
                >
                  {speaking ? <Pause className="w-7 h-7 fill-primary-foreground" /> : <Play className="w-7 h-7 fill-primary-foreground ml-0.5" />}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {speaking ? "Playing..." : "Tap to listen"}
                </span>
              </div>
            )}

            {/* Summary */}
            {plan && (
              <div className="space-y-1.5">
                {plan.summary_lines.map((s, i) => (
                  <p key={i} className="text-sm">{s}</p>
                ))}
              </div>
            )}

            {/* Daily goal */}
            {plan?.daily_goal && (
              <div className="rounded-xl p-3 bg-primary/5 border border-primary/20 flex items-center gap-3">
                <Target className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Today's Goal</p>
                  <p className="font-semibold text-sm">{plan.daily_goal}</p>
                </div>
              </div>
            )}

            {/* Recommendations */}
            {plan && plan.recommendations.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <p className="text-sm font-semibold">Coach says</p>
                </div>
                {plan.recommendations.map((r, i) => (
                  <div key={i} className="flex gap-3 items-start p-3 rounded-lg border bg-card">
                    <div className="text-2xl shrink-0">{r.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{r.text}</p>
                      {r.action && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 h-8"
                          onClick={() => {
                            setOpen(false);
                            stopSpeaking();
                            navigate(r.action!.route);
                          }}
                        >
                          {r.action.label}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {loading && !plan && (
              <div className="space-y-2">
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            )}

            <Button variant="ghost" size="sm" onClick={handleRefresh} className="w-full" disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh coaching
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
