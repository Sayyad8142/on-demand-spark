import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWorkerProfile } from "@/hooks/useWorkerProfile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CheckCircle2, PartyPopper, Volume2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Lesson = {
  id: string;
  title: string;
  description: string | null;
  youtube_video_id: string | null;
  youtube_url: string | null;
  duration_seconds: number | null;
  is_mandatory: boolean | null;
  language: string | null;
  category_id: string | null;
};

type Quiz = {
  id: string;
  question_image_url: string | null;
  question_text: string | null;
  option_a_image_url: string | null;
  option_b_image_url: string | null;
  correct_option: string;
  voice_explanation_url: string | null;
  display_order: number | null;
};

function extractYouTubeId(url?: string | null, id?: string | null) {
  if (id) return id;
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export default function LessonDetail() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { worker } = useWorkerProfile(user?.id);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phase, setPhase] = useState<"video" | "quiz" | "celebrate">("video");
  const [quizIdx, setQuizIdx] = useState(0);
  const [answer, setAnswer] = useState<string | null>(null);
  const [answerCorrect, setAnswerCorrect] = useState<boolean | null>(null);
  const [embedFailed, setEmbedFailed] = useState(false);

  useEffect(() => {
    if (!lessonId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [lRes, qRes] = await Promise.all([
          supabase.from("academy_lessons").select("*").eq("id", lessonId).eq("status", "active").maybeSingle(),
          supabase.from("academy_quiz_questions").select("*").eq("lesson_id", lessonId).order("display_order"),
        ]);
        if (lRes.error) throw lRes.error;
        if (cancelled) return;
        setLesson(lRes.data as Lesson);
        setQuiz((qRes.data as Quiz[]) ?? []);
        if (lRes.data?.category_id) {
          const c = await supabase.from("academy_categories").select("name").eq("id", lRes.data.category_id).maybeSingle();
          if (!cancelled) setCategory(c.data?.name ?? null);
        }
        // Record started_at
        if (worker?.id) {
          await supabase.from("academy_worker_progress").upsert(
            { worker_id: worker.id, lesson_id: lessonId, status: "started", started_at: new Date().toISOString(), last_activity_at: new Date().toISOString() },
            { onConflict: "worker_id,lesson_id" },
          );
          const prog = await supabase
            .from("academy_worker_progress")
            .select("status")
            .eq("worker_id", worker.id)
            .eq("lesson_id", lessonId)
            .maybeSingle();
          if (!cancelled) setCompleted(prog.data?.status === "completed");
        }
      } catch (e: any) {
        console.error("Lesson load error", e);
        toast({ title: "Failed to load lesson", description: e?.message, variant: "destructive" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId, worker?.id]);

  const videoId = useMemo(() => extractYouTubeId(lesson?.youtube_url, lesson?.youtube_video_id), [lesson]);

  const markWatched = async () => {
    if (!worker?.id || !lessonId) return;
    setSaving(true);
    try {
      await supabase.from("academy_worker_progress").upsert(
        {
          worker_id: worker.id,
          lesson_id: lessonId,
          status: "completed",
          completed_at: new Date().toISOString(),
          last_activity_at: new Date().toISOString(),
        },
        { onConflict: "worker_id,lesson_id" },
      );
      setCompleted(true);
      if (quiz.length > 0) {
        setPhase("quiz");
      } else {
        setPhase("celebrate");
      }
    } catch (e: any) {
      toast({ title: "Couldn't save", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const submitAnswer = (opt: string) => {
    if (answer) return;
    const current = quiz[quizIdx];
    const correct = opt.toLowerCase() === (current.correct_option ?? "").toLowerCase();
    setAnswer(opt);
    setAnswerCorrect(correct);
    if (correct && worker?.id && lessonId) {
      supabase
        .from("academy_worker_progress")
        .update({ quiz_score: 100, last_activity_at: new Date().toISOString() })
        .eq("worker_id", worker.id)
        .eq("lesson_id", lessonId)
        .then(() => {});
    }
  };

  const nextQuiz = () => {
    if (quizIdx + 1 < quiz.length) {
      setQuizIdx((i) => i + 1);
      setAnswer(null);
      setAnswerCorrect(null);
    } else {
      setPhase("celebrate");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="aspect-video w-full" />
        <Skeleton className="h-6 w-3/4" />
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 gap-3">
        <p className="font-medium">Lesson not found</p>
        <Button onClick={() => navigate("/learn")}>Back to Learn</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-6">
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b px-3 py-2 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/learn")}>
          <ArrowLeft />
        </Button>
        <h1 className="font-semibold line-clamp-1 flex-1">{lesson.title}</h1>
      </header>

      <div className="max-w-md mx-auto">
        {phase === "video" && (
          <>
            <div className="aspect-video w-full bg-black">
              {videoId && !embedFailed ? (
                <iframe
                  key={videoId}
                  className="w-full h-full"
                  src={`https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0&modestbranding=1`}
                  title={lesson.title}
                  allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  onError={() => setEmbedFailed(true)}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-white gap-3 p-4">
                  <p className="text-sm">Video can't play here.</p>
                  {lesson.youtube_url && (
                    <a href={lesson.youtube_url} target="_blank" rel="noreferrer" className="underline text-primary">
                      Open on YouTube
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {category && <Badge variant="secondary">{category}</Badge>}
                {lesson.is_mandatory ? (
                  <Badge variant="destructive">Mandatory</Badge>
                ) : (
                  <Badge variant="outline">Optional</Badge>
                )}
                {lesson.duration_seconds && (
                  <span className="text-xs text-muted-foreground">⏱ {Math.round(lesson.duration_seconds / 60)} min</span>
                )}
              </div>
              <h2 className="text-lg font-bold">{lesson.title}</h2>
              {lesson.description && <p className="text-sm text-muted-foreground whitespace-pre-line">{lesson.description}</p>}

              <Button
                onClick={markWatched}
                disabled={saving}
                size="lg"
                className="w-full mt-3"
                variant={completed ? "secondary" : "default"}
              >
                <CheckCircle2 className="w-5 h-5" />
                {completed ? "Watched" : "I watched this lesson"}
              </Button>
              {completed && quiz.length > 0 && (
                <Button variant="outline" className="w-full" onClick={() => setPhase("quiz")}>
                  Take the quiz
                </Button>
              )}
            </div>
          </>
        )}

        {phase === "quiz" && quiz[quizIdx] && (
          <div className="p-4 space-y-4">
            <p className="text-sm text-muted-foreground">Question {quizIdx + 1} of {quiz.length}</p>
            {quiz[quizIdx].question_image_url && (
              <img src={quiz[quizIdx].question_image_url!} alt="Question" className="w-full rounded-xl border" />
            )}
            {quiz[quizIdx].question_text && (
              <h2 className="text-lg font-semibold text-center">{quiz[quizIdx].question_text}</h2>
            )}

            <div className="grid grid-cols-2 gap-3">
              {(["a", "b"] as const).map((opt) => {
                const img = opt === "a" ? quiz[quizIdx].option_a_image_url : quiz[quizIdx].option_b_image_url;
                const isSelected = answer === opt;
                const isCorrect = quiz[quizIdx].correct_option?.toLowerCase() === opt;
                const showState = !!answer;
                return (
                  <button
                    key={opt}
                    onClick={() => submitAnswer(opt)}
                    disabled={!!answer}
                    className={`rounded-xl border-2 aspect-square overflow-hidden bg-card transition ${
                      showState && isCorrect
                        ? "border-green-500 ring-2 ring-green-500/40"
                        : showState && isSelected && !isCorrect
                          ? "border-red-500 ring-2 ring-red-500/40"
                          : "border-border"
                    }`}
                  >
                    {img ? (
                      <img src={img} alt={`Option ${opt.toUpperCase()}`} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-primary">
                        {opt.toUpperCase()}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {answer && (
              <div className="space-y-3">
                {answerCorrect ? (
                  <p className="text-center text-green-600 font-semibold">✅ Correct!</p>
                ) : (
                  <div className="text-center space-y-2">
                    <p className="text-red-600 font-semibold">Not quite. Try to remember for next time.</p>
                    {quiz[quizIdx].voice_explanation_url && (
                      <Button
                        variant="outline"
                        onClick={() => new Audio(quiz[quizIdx].voice_explanation_url!).play().catch(() => {})}
                      >
                        <Volume2 className="w-4 h-4" /> Hear explanation
                      </Button>
                    )}
                  </div>
                )}
                <Button className="w-full" size="lg" onClick={nextQuiz}>
                  {quizIdx + 1 < quiz.length ? "Next question" : "Finish"}
                </Button>
              </div>
            )}
          </div>
        )}

        {phase === "celebrate" && (
          <div className="p-8 flex flex-col items-center text-center gap-4">
            <PartyPopper className="w-20 h-20 text-primary" />
            <h2 className="text-2xl font-bold">Great job!</h2>
            <p className="text-muted-foreground">You completed this lesson.</p>
            <Button size="lg" className="w-full max-w-xs" onClick={() => navigate("/learn")}>
              Back to Learn
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
