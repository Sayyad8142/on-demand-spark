import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Play, GraduationCap, Award, CheckCircle2, Clock, Flame } from "lucide-react";

type Lesson = {
  id: string;
  title: string;
  description: string | null;
  category_id: string | null;
  youtube_video_id: string | null;
  youtube_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  language: string | null;
  is_mandatory: boolean | null;
  service_type: string | null;
  display_order: number | null;
  status: string;
};

type Category = { id: string; name: string; icon: string | null; display_order: number | null };

type Progress = { lesson_id: string; status: string; completed_at: string | null; started_at: string | null };

type Certificate = { id: string; name: string; icon: string | null };

function fmtDuration(sec?: number | null) {
  if (!sec) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}:${s.toString().padStart(2, "0")}` : `${m} min`;
}

function ytThumb(l: Lesson) {
  if (l.thumbnail_url) return l.thumbnail_url;
  if (l.youtube_video_id) return `https://img.youtube.com/vi/${l.youtube_video_id}/hqdefault.jpg`;
  return null;
}

export default function Learn() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { worker } = useWorkerProfile(user?.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [activeCat, setActiveCat] = useState<string | "all">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [catsRes, lessonsRes, targetsRes] = await Promise.all([
          supabase.from("academy_categories").select("id,name,icon,display_order").eq("is_active", true).order("display_order"),
          supabase.from("academy_lessons").select("*").eq("status", "active").order("display_order"),
          supabase.from("academy_lesson_targets").select("lesson_id,target_type,target_value"),
        ]);
        if (catsRes.error) throw catsRes.error;
        if (lessonsRes.error) throw lessonsRes.error;
        if (targetsRes.error) throw targetsRes.error;

        // Filter lessons by targets: all / service / community / worker
        const targetsByLesson = new Map<string, { type: string; value: string }[]>();
        (targetsRes.data ?? []).forEach((t: any) => {
          const arr = targetsByLesson.get(t.lesson_id) ?? [];
          arr.push({ type: t.target_type, value: t.target_value });
          targetsByLesson.set(t.lesson_id, arr);
        });

        const workerService = (worker as any)?.service_type ?? (worker as any)?.services?.[0];
        const workerCommunity = (worker as any)?.community_id;
        const workerId = worker?.id;

        const allowed = (lessonsRes.data as Lesson[]).filter((l) => {
          const targets = targetsByLesson.get(l.id);
          // No targets = visible to all
          if (!targets || targets.length === 0) return true;
          return targets.some((t) => {
            if (t.type === "all") return true;
            if (t.type === "service" && workerService && t.value === workerService) return true;
            if (t.type === "community" && workerCommunity && t.value === workerCommunity) return true;
            if (t.type === "worker" && workerId && t.value === workerId) return true;
            return false;
          });
        });

        if (cancelled) return;
        setCategories(catsRes.data ?? []);
        setLessons(allowed);

        if (worker?.id) {
          const [progRes, certRes] = await Promise.all([
            supabase.from("academy_worker_progress").select("lesson_id,status,completed_at,started_at").eq("worker_id", worker.id),
            supabase.from("academy_worker_certificates").select("certificate_id,academy_certificates(id,name,icon)").eq("worker_id", worker.id),
          ]);
          if (!cancelled) {
            setProgress((progRes.data as any) ?? []);
            const certs = ((certRes.data as any[]) ?? [])
              .map((r) => r.academy_certificates)
              .filter(Boolean);
            setCertificates(certs);
          }
        }
      } catch (e: any) {
        console.error("Learn load error", e);
        if (!cancelled) setError(e?.message ?? "Failed to load lessons");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [worker?.id]);

  const completedIds = useMemo(
    () => new Set(progress.filter((p) => p.status === "completed").map((p) => p.lesson_id)),
    [progress],
  );

  const todaysLesson = useMemo(() => {
    // First mandatory not completed, else first not completed, else first lesson.
    const mand = lessons.find((l) => l.is_mandatory && !completedIds.has(l.id));
    if (mand) return mand;
    const pending = lessons.find((l) => !completedIds.has(l.id));
    return pending ?? lessons[0] ?? null;
  }, [lessons, completedIds]);

  const filteredLessons = useMemo(() => {
    return activeCat === "all" ? lessons : lessons.filter((l) => l.category_id === activeCat);
  }, [lessons, activeCat]);

  const completionPct = lessons.length ? Math.round((completedIds.size / lessons.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-background pb-4">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center gap-2">
        <GraduationCap className="w-6 h-6 text-primary" />
        <h1 className="text-lg font-bold">Learn</h1>
      </header>

      <div className="px-4 py-4 space-y-6 max-w-md mx-auto">
        {/* Progress summary */}
        <div className="grid grid-cols-3 gap-2">
          <StatChip icon={<CheckCircle2 className="w-5 h-5" />} label="Done" value={completedIds.size} />
          <StatChip icon={<Clock className="w-5 h-5" />} label="Pending" value={Math.max(lessons.length - completedIds.size, 0)} />
          <StatChip icon={<Flame className="w-5 h-5" />} label="Progress" value={`${completionPct}%`} />
        </div>

        {/* Today's lesson */}
        {loading ? (
          <Skeleton className="h-56 w-full rounded-xl" />
        ) : error ? (
          <ErrorState message={error} />
        ) : todaysLesson ? (
          <TodayCard lesson={todaysLesson} onOpen={() => navigate(`/learn/${todaysLesson.id}`)} />
        ) : (
          <EmptyState title="No lessons yet" subtitle="New lessons will appear here soon." />
        )}

        {/* Categories chips */}
        {categories.length > 0 && (
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="flex gap-2 w-max">
              <CategoryChip active={activeCat === "all"} onClick={() => setActiveCat("all")} label="All" icon="🎓" />
              {categories.map((c) => (
                <CategoryChip
                  key={c.id}
                  active={activeCat === c.id}
                  onClick={() => setActiveCat(c.id)}
                  label={c.name}
                  icon={c.icon ?? "📚"}
                />
              ))}
            </div>
          </div>
        )}

        {/* Lessons list */}
        <section className="space-y-3">
          <h2 className="font-semibold text-base">Lessons</h2>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : filteredLessons.length === 0 ? (
            <EmptyState title="No lessons in this category" />
          ) : (
            filteredLessons.map((l) => (
              <LessonRow
                key={l.id}
                lesson={l}
                completed={completedIds.has(l.id)}
                onOpen={() => navigate(`/learn/${l.id}`)}
              />
            ))
          )}
        </section>

        {/* Certificates */}
        <section className="space-y-3">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" /> Certificates
          </h2>
          {certificates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Complete lessons to earn badges.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {certificates.map((c) => (
                <div key={c.id} className="flex flex-col items-center text-center p-3 rounded-xl bg-primary/5 border border-primary/20">
                  <div className="text-3xl">{c.icon ?? "🏅"}</div>
                  <div className="text-xs font-medium mt-1 line-clamp-2">{c.name}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-3 flex flex-col items-center">
      <div className="text-primary">{icon}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function CategoryChip({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon: string }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border transition-colors ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border"
      }`}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function TodayCard({ lesson, onOpen }: { lesson: Lesson; onOpen: () => void }) {
  const thumb = ytThumb(lesson);
  return (
    <Card className="overflow-hidden border-primary/20 shadow-md">
      <button onClick={onOpen} className="relative w-full aspect-video bg-muted block">
        {thumb ? (
          <img src={thumb} alt={lesson.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5" />
        )}
        <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center shadow-lg">
            <Play className="w-8 h-8 text-primary fill-primary ml-1" />
          </div>
        </div>
        <div className="absolute top-2 left-2 flex gap-2">
          <Badge className="bg-primary text-primary-foreground">Today's Lesson</Badge>
          {lesson.is_mandatory && <Badge variant="destructive">Mandatory</Badge>}
        </div>
      </button>
      <CardContent className="p-4">
        <h3 className="font-bold text-base line-clamp-2">{lesson.title}</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
          {lesson.duration_seconds && <span>⏱ {fmtDuration(lesson.duration_seconds)}</span>}
          {lesson.language && <span>🌐 {lesson.language.toUpperCase()}</span>}
        </div>
        <Button onClick={onOpen} className="w-full mt-3">
          <Play className="w-4 h-4" /> Play Lesson
        </Button>
      </CardContent>
    </Card>
  );
}

function LessonRow({ lesson, completed, onOpen }: { lesson: Lesson; completed: boolean; onOpen: () => void }) {
  const thumb = ytThumb(lesson);
  return (
    <button onClick={onOpen} className="w-full flex gap-3 p-2 rounded-lg border bg-card active:scale-[0.98] transition-transform text-left">
      <div className="relative w-24 h-16 rounded-md overflow-hidden bg-muted shrink-0">
        {thumb ? (
          <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-primary/10" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Play className="w-5 h-5 text-white fill-white" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-1">
          <p className="font-medium text-sm line-clamp-2 flex-1">{lesson.title}</p>
          {completed && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />}
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {lesson.is_mandatory ? (
            <Badge variant="destructive" className="text-[10px] py-0 px-1.5">Mandatory</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5">Optional</Badge>
          )}
          {lesson.duration_seconds && (
            <span className="text-[11px] text-muted-foreground">⏱ {fmtDuration(lesson.duration_seconds)}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="text-center py-8 rounded-xl border-2 border-dashed border-border">
      <GraduationCap className="w-10 h-10 mx-auto text-muted-foreground/50" />
      <p className="font-medium mt-2">{title}</p>
      {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="text-center py-6 rounded-xl border border-destructive/30 bg-destructive/5">
      <p className="text-sm font-medium text-destructive">Couldn't load lessons</p>
      <p className="text-xs text-muted-foreground mt-1">{message}</p>
    </div>
  );
}
