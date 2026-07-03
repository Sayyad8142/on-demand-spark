/**
 * AI Worker Coach — rule-based today.
 *
 * The `generateCoachingPlan()` function is the single seam for future
 * LLM integration. Swap the implementation to call an edge function
 * (which can proxy to OpenAI / Lovable AI Gateway) without touching the UI.
 */

import { supabase } from "@/integrations/supabase/client";

export type CoachTone = "celebrate" | "encourage" | "nudge";

export interface CoachingRecommendation {
  icon: string;
  text: string;
  action?: { label: string; route: string };
}

export interface CoachingPlan {
  worker_id: string;
  date: string; // yyyy-mm-dd
  greeting: string;
  summary_lines: string[];
  daily_goal: string;
  recommendations: CoachingRecommendation[];
  tone: CoachTone;
  spoken_script: string;
}

interface WorkerStats {
  full_name?: string | null;
  rating?: number | null;
  acceptance_rate_7d?: number | null;
  last_7_days_completed_bookings?: number | null;
  last_7_days_online_hours?: number | null;
  total_bookings_completed?: number | null;
  total_earnings?: number | null;
  last_booking_completed_at?: string | null;
}

interface AcademyStats {
  completed_lessons: number;
  pending_mandatory: number;
  certificates: number;
}

function firstName(fullName?: string | null) {
  if (!fullName) return "there";
  return fullName.split(" ")[0];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

async function loadAcademyStats(workerId: string): Promise<AcademyStats> {
  try {
    const [progRes, lessonsRes, certRes] = await Promise.all([
      supabase.from("academy_worker_progress").select("status").eq("worker_id", workerId),
      supabase.from("academy_lessons").select("id,is_mandatory").eq("status", "active"),
      supabase.from("academy_worker_certificates").select("id").eq("worker_id", workerId),
    ]);
    const completedIds = new Set(
      ((progRes.data as any[]) ?? [])
        .filter((p) => p.status === "completed")
        .map((_, i) => i), // just count
    );
    const completed = ((progRes.data as any[]) ?? []).filter((p) => p.status === "completed").length;
    const mandatoryDone = new Set(
      ((progRes.data as any[]) ?? []).filter((p) => p.status === "completed"),
    );
    const mandatoryTotal = ((lessonsRes.data as any[]) ?? []).filter((l) => l.is_mandatory).length;
    const doneMandatoryIds = new Set(
      ((progRes.data as any[]) ?? []).filter((p) => p.status === "completed").map((p) => p.lesson_id),
    );
    const mandatoryCompletedCount = ((lessonsRes.data as any[]) ?? []).filter(
      (l) => l.is_mandatory && doneMandatoryIds.has(l.id),
    ).length;
    return {
      completed_lessons: completed,
      pending_mandatory: Math.max(0, mandatoryTotal - mandatoryCompletedCount),
      certificates: ((certRes.data as any[]) ?? []).length,
    };
  } catch {
    return { completed_lessons: 0, pending_mandatory: 0, certificates: 0 };
  }
}

function buildPlan(worker: WorkerStats, academy: AcademyStats, workerId: string): CoachingPlan {
  const name = firstName(worker.full_name);
  const rating = worker.rating ?? 0;
  const acceptance = Math.round((worker.acceptance_rate_7d ?? 0) * 100);
  const bookings7d = worker.last_7_days_completed_bookings ?? 0;
  const online7d = Math.round(worker.last_7_days_online_hours ?? 0);

  const summary: string[] = [];
  const recs: CoachingRecommendation[] = [];
  let tone: CoachTone = "encourage";
  let goal = "Complete 1 booking today";

  // Summary
  if (bookings7d > 0) {
    summary.push(`You completed ${bookings7d} booking${bookings7d === 1 ? "" : "s"} this week.`);
  } else {
    summary.push("No bookings yet this week. Let's change that today.");
  }
  if (rating > 0) {
    summary.push(`Your rating is ${rating.toFixed(1)} stars.`);
  }
  if (online7d > 0) {
    summary.push(`You were online for about ${online7d} hours this week.`);
  }

  // Tone
  if (rating >= 4.7 && bookings7d >= 5) tone = "celebrate";
  else if (bookings7d === 0 || acceptance < 60) tone = "nudge";

  // Recommendations & goal
  if (academy.pending_mandatory > 0) {
    recs.push({
      icon: "📚",
      text: "Finish today's mandatory lesson — takes less than a minute.",
      action: { label: "Open Learn", route: "/learn" },
    });
    goal = "Complete 1 lesson";
  }

  if (acceptance < 70) {
    recs.push({
      icon: "✅",
      text: "Try to accept your next 3 bookings quickly to raise your priority.",
    });
  }

  if (online7d < 10) {
    recs.push({
      icon: "⏰",
      text: "Stay online between 6 PM and 8 PM today — demand is usually high.",
      action: { label: "Set availability", route: "/availability" },
    });
    if (goal === "Complete 1 booking today") goal = "Stay online 6–8 PM";
  }

  if (rating >= 4.5) {
    recs.push({
      icon: "⭐",
      text: `Great rating! Keep greeting customers with a smile to stay above ${rating.toFixed(1)}.`,
    });
  } else if (rating > 0) {
    recs.push({
      icon: "🙂",
      text: "A warm greeting and neat uniform can lift your rating quickly.",
    });
  }

  if (bookings7d >= 5) {
    recs.push({
      icon: "💰",
      text: "You're on a roll — one more booking today could earn you around ₹350 extra.",
    });
    if (tone === "celebrate") goal = `Complete ${bookings7d + 1} bookings this week`;
  }

  if (academy.certificates === 0 && academy.completed_lessons > 0) {
    recs.push({
      icon: "🏅",
      text: "You're close to your first certificate — finish one more lesson to earn it.",
      action: { label: "Open Learn", route: "/learn" },
    });
  }

  if (recs.length === 0) {
    recs.push({
      icon: "🌟",
      text: "You're doing great. Keep it up today!",
    });
  }

  // Greeting
  const greeting =
    tone === "celebrate"
      ? `Excellent work, ${name}!`
      : tone === "nudge"
        ? `Let's have a great day, ${name}.`
        : `Hi ${name}, here's your plan for today.`;

  const spoken = [
    greeting,
    ...summary,
    `Today's goal: ${goal}.`,
    ...recs.map((r) => r.text),
  ].join(" ");

  return {
    worker_id: workerId,
    date: todayIso(),
    greeting,
    summary_lines: summary,
    daily_goal: goal,
    recommendations: recs,
    tone,
    spoken_script: spoken,
  };
}

const CACHE_PREFIX = "ai_coach_plan_";

function cacheKey(workerId: string) {
  return `${CACHE_PREFIX}${workerId}`;
}

export function loadCachedPlan(workerId: string): CoachingPlan | null {
  try {
    const raw = localStorage.getItem(cacheKey(workerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CoachingPlan;
    if (parsed.date !== todayIso()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function storePlan(plan: CoachingPlan) {
  try {
    localStorage.setItem(cacheKey(plan.worker_id), JSON.stringify(plan));
  } catch {}
}

/**
 * Generate today's coaching plan for the worker.
 * Rule-based today. Swap this body for an edge-function call to enable LLM output.
 */
export async function generateCoachingPlan(
  workerId: string,
  workerRow: any,
  opts: { force?: boolean } = {},
): Promise<CoachingPlan> {
  if (!opts.force) {
    const cached = loadCachedPlan(workerId);
    if (cached) return cached;
  }

  const academy = await loadAcademyStats(workerId);
  const plan = buildPlan(workerRow ?? {}, academy, workerId);
  storePlan(plan);
  return plan;
}

// ------- Voice playback (browser SpeechSynthesis) -------

let currentUtterance: SpeechSynthesisUtterance | null = null;

export function isVoiceSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speak(text: string, lang: string = "en-IN") {
  if (!isVoiceSupported()) return;
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  u.rate = 0.95;
  u.pitch = 1;
  currentUtterance = u;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (!isVoiceSupported()) return;
  window.speechSynthesis.cancel();
  currentUtterance = null;
}
