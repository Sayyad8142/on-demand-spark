import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Play,
  GraduationCap,
  Award,
  CheckCircle2,
  Flame,
  Lock,
  Search,
  Trophy,
  Star,
  Sparkles,
  AlertCircle,
} from "lucide-react";

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

const CACHE_KEY = "learn_progress_cache_v1";

function fmtMin(sec?: number | null) {
  if (!sec) return "";
  const m = Math.max(1, Math.round(sec / 60));
  return `${m} min`;
}

function ytThumb(l: Lesson) {
  if (l.thumbnail_url) return l.thumbnail_url;
  if (l.youtube_video_id) return `https://img.youtube.com/vi/${l.youtube_video_id}/hqdefault.jpg`;
  return null;
}

function computeStreak(progress: Progress[]) {
  const days = new Set(
    progress
      .filter((p) => p.completed_at)
      .map((p) => new Date(p.completed_at!).toISOString().slice(0, 10)),
  );
  if (days.size === 0) return 0;
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (days.has(key)) streak++;
    else if (i > 0) break;
  }
  return streak;
}

export default function Learn() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { worker } = useWorkerProfile(user?.id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [progress, setProgress] = useState<Progress[]>(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw) as Progress[]) : [];
    } catch {
      return [];
    }
  });
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [search, setSearch] = useState("");

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
            const prog = (progRes.data as Progress[]) ?? [];
            setProgress(prog);
            try {
              localStorage.setItem(CACHE_KEY, JSON.stringify(prog));
            } catch {}
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

  // ----- Sorting: mandatory first, then display_order -----
  const orderedLessons = useMemo(() => {
    return [...lessons].sort((a, b) => {
      if (!!b.is_mandatory !== !!a.is_mandatory) return a.is_mandatory ? -1 : 1;
      return (a.display_order ?? 0) - (b.display_order ?? 0);
    });
  }, [lessons]);

  const progressByLesson = useMemo(() => {
    const m = new Map<string, Progress>();
    progress.forEach((p) => m.set(p.lesson_id, p));
    return m;
  }, [progress]);

  const completedIds = useMemo(
    () => new Set(progress.filter((p) => p.status === "completed").map((p) => p.lesson_id)),
    [progress],
  );

  // ----- Next / Continue lesson -----
  const inProgress = orderedLessons.find(
    (l) => progressByLesson.get(l.id)?.status === "started" && !completedIds.has(l.id),
  );
  const nextLesson =
    inProgress ??
    orderedLessons.find((l) => l.is_mandatory && !completedIds.has(l.id)) ??
    orderedLessons.find((l) => !completedIds.has(l.id)) ??
    orderedLessons[0] ??
    null;

  const pendingMandatory = orderedLessons.filter((l) => l.is_mandatory && !completedIds.has(l.id));
  const streak = useMemo(() => computeStreak(progress), [progress]);
  const completionPct = orderedLessons.length ? Math.round((completedIds.size / orderedLessons.length) * 100) : 0;

  // ----- Path: sequential with lock rules -----
  // A lesson is unlocked if it's the first, OR the previous lesson is completed,
  // OR it's already been started/completed, OR it's not part of the mandatory chain.
  const pathLessons = orderedLessons;
  const isLessonUnlocked = (idx: number) => {
    if (idx === 0) return true;
    const l = pathLessons[idx];
    if (progressByLesson.get(l.id)) return true;
    // Unlock all optionals; gate mandatory sequence
    if (!l.is_mandatory) return true;
    // Prior mandatory must be complete
    for (let i = idx - 1; i >= 0; i--) {
      const prev = pathLessons[i];
      if (prev.is_mandatory) return completedIds.has(prev.id);
    }
    return true;
  };

  // ----- Search results -----
  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    return orderedLessons.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        (l.description ?? "").toLowerCase().includes(q),
    );
  }, [search, orderedLessons]);

  // ----- Achievements (derived) -----
  const achievements = useMemo(() => {
    const total = completedIds.size;
    const catCount = new Map<string, { done: number; total: number; name: string }>();
    categories.forEach((c) => catCount.set(c.id, { done: 0, total: 0, name: c.name }));
    orderedLessons.forEach((l) => {
      if (!l.category_id) return;
      const rec = catCount.get(l.category_id);
      if (!rec) return;
      rec.total++;
      if (completedIds.has(l.id)) rec.done++;
    });
    const perfectCats = Array.from(catCount.values()).filter((c) => c.total > 0 && c.done === c.total);
    return [
      { id: "first-lesson", label: "First Lesson", icon: "🎯", earned: total >= 1 },
      { id: "first-cert", label: "First Certificate", icon: "🎖️", earned: certificates.length >= 1 },
      { id: "10-lessons", label: "10 Lessons", icon: "📚", earned: total >= 10 },
      { id: "30-lessons", label: "30 Lessons", icon: "🏆", earned: total >= 30 },
      ...perfectCats.map((c) => ({ id: `perfect-${c.name}`, label: `100% ${c.name}`, icon: "💯", earned: true })),
    ];
  }, [completedIds, categories, orderedLessons, certificates]);

  return (
    <div className="min-h-screen bg-background pb-6">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-6 h-6 text-primary" />
          <h1 className="text-lg font-bold">Learn</h1>
        </div>
        <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-600">
          <Flame className="w-4 h-4 fill-current" />
          <span className="text-sm font-bold">{streak}</span>
        </div>
      </header>

      <div className="px-4 py-4 space-y-5 max-w-md mx-auto">
        {/* Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search lessons"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {searchResults ? (
          <section className="space-y-2 animate-fade-in">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
            </h2>
            {searchResults.length === 0 ? (
              <EmptyState title="No lessons match" />
            ) : (
              searchResults.map((l) => (
                <LessonRow
                  key={l.id}
                  lesson={l}
                  state={completedIds.has(l.id) ? "done" : progressByLesson.get(l.id)?.status === "started" ? "current" : "upcoming"}
                  onOpen={() => navigate(`/learn/${l.id}`)}
                />
              ))
            )}
          </section>
        ) : (
          <>
            {/* Progress ring + stats */}
            <div className="grid grid-cols-3 gap-2">
              <StatChip icon={<CheckCircle2 className="w-5 h-5" />} label="Done" value={completedIds.size} />
              <StatChip icon={<Trophy className="w-5 h-5" />} label="Badges" value={certificates.length} />
              <StatChip icon={<Sparkles className="w-5 h-5" />} label="Progress" value={`${completionPct}%`} />
            </div>

            {/* Mandatory reminder */}
            {pendingMandatory.length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 flex gap-3 items-start animate-fade-in">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Complete your mandatory lesson today</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {pendingMandatory.length} pending · {fmtMin(pendingMandatory[0].duration_seconds) || "~1 min"}
                  </p>
                </div>
                <Button size="sm" onClick={() => navigate(`/learn/${pendingMandatory[0].id}`)}>
                  Start
                </Button>
              </div>
            )}

            {/* Today's / Continue lesson */}
            {loading && lessons.length === 0 ? (
              <Skeleton className="h-56 w-full rounded-xl" />
            ) : error && lessons.length === 0 ? (
              <ErrorState message={error} />
            ) : nextLesson ? (
              <HeroLessonCard
                lesson={nextLesson}
                mode={inProgress ? "continue" : "today"}
                onOpen={() => navigate(`/learn/${nextLesson.id}`)}
              />
            ) : (
              <EmptyState title="No lessons yet" subtitle="New lessons will appear here soon." />
            )}

            {/* Learning Path */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-base">Your Learning Path</h2>
                <span className="text-xs text-muted-foreground">
                  {completedIds.size}/{pathLessons.length}
                </span>
              </div>
              {loading && pathLessons.length === 0 ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-20 w-full rounded-xl" />
                  ))}
                </div>
              ) : pathLessons.length === 0 ? (
                <EmptyState title="No lessons in your path yet" />
              ) : (
                <div className="relative pl-6">
                  <div className="absolute left-3 top-3 bottom-3 w-0.5 bg-border" />
                  {pathLessons.map((l, i) => {
                    const isDone = completedIds.has(l.id);
                    const progRec = progressByLesson.get(l.id);
                    const unlocked = isLessonUnlocked(i);
                    const isCurrent = !isDone && unlocked && l.id === nextLesson?.id;
                    const state: LessonState = isDone
                      ? "done"
                      : !unlocked
                        ? "locked"
                        : isCurrent
                          ? "current"
                          : progRec?.status === "started"
                            ? "current"
                            : "upcoming";
                    return (
                      <div key={l.id} className="relative pb-3">
                        <div
                          className={`absolute -left-[18px] top-3 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            state === "done"
                              ? "bg-green-500 border-green-500 text-white"
                              : state === "current"
                                ? "bg-primary border-primary text-primary-foreground"
                                : state === "locked"
                                  ? "bg-muted border-muted-foreground/30 text-muted-foreground"
                                  : "bg-background border-muted-foreground/30 text-muted-foreground"
                          }`}
                        >
                          {state === "done" ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : state === "locked" ? (
                            <Lock className="w-2.5 h-2.5" />
                          ) : (
                            <span className="text-[10px] font-bold">{i + 1}</span>
                          )}
                        </div>
                        <LessonRow
                          lesson={l}
                          state={state}
                          onOpen={() => (unlocked ? navigate(`/learn/${l.id}`) : null)}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Certificates */}
            <section className="space-y-3">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Award className="w-5 h-5 text-primary" /> Certificates
              </h2>
              {certificates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Finish courses to earn badges.</p>
              ) : (
                <div className="grid grid-cols-3 gap-3">
                  {certificates.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-col items-center text-center p-3 rounded-xl bg-primary/5 border border-primary/20"
                    >
                      <div className="text-3xl">{c.icon ?? "🏅"}</div>
                      <div className="text-xs font-medium mt-1 line-clamp-2">{c.name}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Achievements */}
            <section className="space-y-3">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Star className="w-5 h-5 text-primary" /> Achievements
              </h2>
              <div className="grid grid-cols-4 gap-2">
                {achievements.map((a) => (
                  <div
                    key={a.id}
                    className={`flex flex-col items-center text-center p-2 rounded-xl border ${
                      a.earned ? "bg-card border-primary/30" : "bg-muted/40 border-transparent opacity-50"
                    }`}
                  >
                    <div className="text-2xl grayscale-0">{a.icon}</div>
                    <div className="text-[10px] mt-1 line-clamp-2 font-medium">{a.label}</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

type LessonState = "done" | "current" | "upcoming" | "locked";

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-card p-3 flex flex-col items-center">
      <div className="text-primary">{icon}</div>
      <div className="text-lg font-bold mt-1">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function HeroLessonCard({
  lesson,
  mode,
  onOpen,
}: {
  lesson: Lesson;
  mode: "today" | "continue";
  onOpen: () => void;
}) {
  const thumb = ytThumb(lesson);
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-primary/30 shadow-lg bg-card animate-fade-in">
      <button onClick={onOpen} className="relative w-full aspect-video bg-muted block">
        {thumb ? (
          <img src={thumb} alt={lesson.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/30 to-primary/10" />
        )}
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-white/95 flex items-center justify-center shadow-xl">
            <Play className="w-8 h-8 text-primary fill-primary ml-1" />
          </div>
        </div>
        <div className="absolute top-2 left-2 flex gap-1.5">
          <Badge className="bg-primary text-primary-foreground shadow">
            {mode === "continue" ? "Continue Learning" : "Today's Lesson"}
          </Badge>
          {lesson.is_mandatory && <Badge variant="destructive" className="shadow">Mandatory</Badge>}
        </div>
      </button>
      <div className="p-4">
        <h3 className="font-bold text-base line-clamp-2">{lesson.title}</h3>
        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
          {lesson.duration_seconds && <span>⏱ {fmtMin(lesson.duration_seconds)}</span>}
          {lesson.language && <span>🌐 {lesson.language.toUpperCase()}</span>}
        </div>
        <Button onClick={onOpen} size="lg" className="w-full mt-3">
          <Play className="w-4 h-4" /> {mode === "continue" ? "Resume Lesson" : "Start Lesson"}
        </Button>
      </div>
    </div>
  );
}

function LessonRow({
  lesson,
  state,
  onOpen,
}: {
  lesson: Lesson;
  state: LessonState;
  onOpen: () => void;
}) {
  const thumb = ytThumb(lesson);
  const locked = state === "locked";
  return (
    <button
      onClick={onOpen}
      disabled={locked}
      className={`w-full flex gap-3 p-2 rounded-xl border text-left transition ${
        state === "current"
          ? "bg-primary/5 border-primary/40"
          : locked
            ? "bg-muted/30 border-border opacity-70"
            : "bg-card border-border active:scale-[0.98]"
      }`}
    >
      <div className="relative w-24 h-16 rounded-md overflow-hidden bg-muted shrink-0">
        {thumb ? (
          <img src={thumb} alt="" className={`w-full h-full object-cover ${locked ? "grayscale" : ""}`} loading="lazy" />
        ) : (
          <div className="w-full h-full bg-primary/10" />
        )}
        <div className="absolute inset-0 flex items-center justify-center bg-black/25">
          {locked ? (
            <Lock className="w-5 h-5 text-white" />
          ) : state === "done" ? (
            <CheckCircle2 className="w-5 h-5 text-white" />
          ) : (
            <Play className="w-5 h-5 text-white fill-white" />
          )}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm line-clamp-2">{lesson.title}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          {lesson.is_mandatory && (
            <Badge variant="destructive" className="text-[10px] py-0 px-1.5">Mandatory</Badge>
          )}
          {state === "current" && <Badge className="text-[10px] py-0 px-1.5">Current</Badge>}
          {state === "done" && (
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 bg-green-100 text-green-700 hover:bg-green-100">
              Done
            </Badge>
          )}
          {lesson.duration_seconds && (
            <span className="text-[11px] text-muted-foreground">⏱ {fmtMin(lesson.duration_seconds)}</span>
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
