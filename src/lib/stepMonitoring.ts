/**
 * Step-based worker movement monitoring after booking acceptance.
 * Uses Android step sensors and sends live movement updates for admin visibility.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { checkActivityState, checkBatteryState } from "@/lib/permissions";

interface StepCounterPlugin {
  checkSupport(): Promise<{ supported: boolean; sensorType: string }>;
  checkPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  startMonitoring(opts: {
    bookingId: string;
    windowSeconds: number;
  }): Promise<{ status: string; bookingId: string; sensorType?: string }>;
  stopMonitoring(): Promise<void>;
  addListener(
    event: "monitoringComplete" | "stepUpdate",
    cb: (data: MonitoringResult | NativeStepUpdate) => void
  ): Promise<{ remove: () => void }>;
}

interface MonitoringResult {
  bookingId: string;
  stepsInWindow: number;
  baselineStepValue: number | null;
  finalStepValue: number | null;
  sensorType: string;
  windowSeconds: number;
}

interface NativeStepUpdate {
  bookingId: string;
  stepCount: number;
  rawStepValue: number | null;
  baselineStepValue: number | null;
  sensorType: string;
  timestamp: number;
}

export interface MovementDebugStatus {
  bookingId: string;
  workerId: string;
  steps: number;
  previousSteps: number;
  isMoving: boolean;
  status: "Moving" | "Not Moving" | "Not Tracking";
  lastUpdatedAt: string | null;
  lastSentAt: string | null;
  lastSendOk: boolean | null;
  lastError: string | null;
  permissionGranted: boolean | null;
  batteryOk: boolean | null;
  foregroundOrServiceActive: boolean;
  sensorSupported: boolean | null;
  sensorType: string | null;
  warning: string | null;
}

const MONITORING_WINDOW_SECONDS = 180;
const DEFAULT_MIN_STEPS = 40;
const LIVE_SEND_INTERVAL_MS = 12_000;
const NOT_MOVING_AFTER_MS = 150_000;
const FAILSAFE_AFTER_MS = 60_000;
const statusListeners = new Set<(status: MovementDebugStatus) => void>();
let StepCounter: StepCounterPlugin | null = null;
let activeSession: {
  bookingId: string;
  workerId: string;
  minSteps: number;
  lastSteps: number;
  previousSteps: number;
  lastMovementAt: number;
  lastNativeUpdateAt: number;
  lastSentAt: number | null;
  lastPayload: Record<string, unknown> | null;
  intervalId: number | null;
  completionListener?: { remove: () => void };
  stepListener?: { remove: () => void };
  status: MovementDebugStatus;
} | null = null;

async function fetchMinSteps(): Promise<number> {
  try {
    const { data } = await supabase
      .from("ops_settings")
      .select("value")
      .eq("key", "min_movement_steps")
      .maybeSingle();
    if (data?.value) {
      const parsed = parseInt(data.value, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch {
    console.log("📊 Failed to fetch min_movement_steps, using default");
  }
  return DEFAULT_MIN_STEPS;
}

function getPlugin(): StepCounterPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  if (!StepCounter) {
    try {
      StepCounter = registerPlugin<StepCounterPlugin>("StepCounter");
    } catch {
      console.error("📊 StepCounter plugin not available");
      return null;
    }
  }
  return StepCounter;
}

function emitStatus() {
  if (!activeSession) return;
  statusListeners.forEach((listener) => listener(activeSession!.status));
}

function setStatus(patch: Partial<MovementDebugStatus>) {
  if (!activeSession) return;
  activeSession.status = { ...activeSession.status, ...patch };
  emitStatus();
}

function makeInitialStatus(bookingId: string, workerId: string): MovementDebugStatus {
  return {
    bookingId,
    workerId,
    steps: 0,
    previousSteps: 0,
    isMoving: false,
    status: "Not Tracking",
    lastUpdatedAt: null,
    lastSentAt: null,
    lastSendOk: null,
    lastError: null,
    permissionGranted: null,
    batteryOk: null,
    foregroundOrServiceActive: document.visibilityState === "visible" || Capacitor.isNativePlatform(),
    sensorSupported: null,
    sensorType: null,
    warning: "Step tracking starting…",
  };
}

export function subscribeMovementStatus(listener: (status: MovementDebugStatus | null) => void): () => void {
  statusListeners.add(listener as (status: MovementDebugStatus) => void);
  listener(activeSession?.status ?? null);
  return () => statusListeners.delete(listener as (status: MovementDebugStatus) => void);
}

async function ensureMovementPrerequisites(plugin: StepCounterPlugin) {
  const [activity, battery, support] = await Promise.all([
    checkActivityState(),
    checkBatteryState(),
    plugin.checkSupport(),
  ]);
  const foregroundOrServiceActive = document.visibilityState === "visible" || Capacitor.isNativePlatform();
  const permissionGranted = activity.status === "granted" || activity.status === "not_required";
  const batteryOk = battery.status === "granted" || battery.status === "not_required";
  const warnings = [
    !support.supported ? "step sensor not available" : null,
    !permissionGranted ? "ACTIVITY_RECOGNITION permission missing" : null,
    !batteryOk ? "battery optimization is enabled" : null,
    !foregroundOrServiceActive ? "app is not foreground/background-service active" : null,
  ].filter(Boolean);

  setStatus({
    permissionGranted,
    batteryOk,
    foregroundOrServiceActive,
    sensorSupported: support.supported,
    sensorType: support.sensorType,
    warning: warnings.length ? `⚠️ Step tracking not active. Please enable permissions. (${warnings.join(", ")})` : null,
  });
  console.log("[Movement] prerequisite check", { activity, battery, support, foregroundOrServiceActive });
  return { support, permissionGranted, batteryOk, foregroundOrServiceActive };
}

async function sendMovementUpdate(reason: "interval" | "failsafe" | "final" | "startup") {
  if (!activeSession) return;
  const session = activeSession;
  const nowIso = new Date().toISOString();
  const payload = {
    worker_id: session.workerId,
    booking_id: session.bookingId,
    step_count: session.lastSteps,
    timestamp: nowIso,
    is_moving: session.status.isMoving,
    previous_step_count: session.previousSteps,
    source: reason,
  };
  session.lastPayload = payload;

  try {
    console.log("[Movement] POST /worker-movement-update", payload);
    const { data, error } = await supabase.functions.invoke("worker-movement-update", { body: payload });
    if (error) throw error;
    session.lastSentAt = Date.now();
    setStatus({ lastSentAt: nowIso, lastSendOk: true, lastError: null });
    console.log("[Movement] API send success", { reason, response: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setStatus({ lastSendOk: false, lastError: message, warning: `⚠️ Step tracking API failed: ${message}` });
    console.error("[Movement] API send failure", { reason, payload, error });
    await updateMovementCheck(session.bookingId, session.workerId, {
      movement_status: "error",
      low_movement_reason: `worker-movement-update failed: ${message}`,
      raw_meta: { last_payload: payload, reason },
      checked_at: nowIso,
    });
  }
}

function handleStepUpdate(update: NativeStepUpdate) {
  if (!activeSession || update.bookingId !== activeSession.bookingId) return;
  const now = Date.now();
  const previous = activeSession.lastSteps;
  const current = Math.max(0, Number(update.stepCount ?? 0));
  const increased = current > previous;

  activeSession.previousSteps = previous;
  activeSession.lastSteps = current;
  activeSession.lastNativeUpdateAt = now;
  if (increased) activeSession.lastMovementAt = now;

  const isMoving = now - activeSession.lastMovementAt < NOT_MOVING_AFTER_MS && current > 0;
  setStatus({
    steps: current,
    previousSteps: previous,
    isMoving,
    status: isMoving ? "Moving" : "Not Moving",
    lastUpdatedAt: new Date().toISOString(),
    warning: activeSession.status.warning?.startsWith("⚠️ Step tracking API failed") ? activeSession.status.warning : null,
  });
}

function startLiveLoop() {
  if (!activeSession) return;
  if (activeSession.intervalId) window.clearInterval(activeSession.intervalId);
  activeSession.intervalId = window.setInterval(async () => {
    if (!activeSession) return;
    const now = Date.now();
    const isMoving = now - activeSession.lastMovementAt < NOT_MOVING_AFTER_MS && activeSession.lastSteps > 0;
    const lastSentAge = activeSession.lastSentAt ? now - activeSession.lastSentAt : Infinity;
    setStatus({
      isMoving,
      status: activeSession.lastNativeUpdateAt ? (isMoving ? "Moving" : "Not Moving") : "Not Tracking",
      foregroundOrServiceActive: document.visibilityState === "visible" || Capacitor.isNativePlatform(),
      warning: activeSession.lastNativeUpdateAt ? activeSession.status.warning : "⚠️ Step tracking not active. Please enable permissions.",
    });
    console.log("[Movement] periodic status", {
      current_step_count: activeSession.lastSteps,
      previous_step_count: activeSession.previousSteps,
      is_moving: isMoving,
      timestamp: new Date().toISOString(),
      last_api_send_age_ms: Number.isFinite(lastSentAge) ? lastSentAge : null,
    });
    await sendMovementUpdate(lastSentAge > FAILSAFE_AFTER_MS ? "failsafe" : "interval");
    if (lastSentAge > FAILSAFE_AFTER_MS) {
      console.error("[Movement] FAILSAFE retry triggered — no step data sent for over 1 minute");
    }
  }, LIVE_SEND_INTERVAL_MS);
}

/** Start movement monitoring after a booking is accepted. */
export async function startMovementMonitoring(bookingId: string, workerId: string): Promise<void> {
  await stopMovementMonitoring();
  activeSession = {
    bookingId,
    workerId,
    minSteps: DEFAULT_MIN_STEPS,
    lastSteps: 0,
    previousSteps: 0,
    lastMovementAt: 0,
    lastNativeUpdateAt: 0,
    lastSentAt: null,
    lastPayload: null,
    intervalId: null,
    status: makeInitialStatus(bookingId, workerId),
  };
  emitStatus();

  try {
    const plugin = getPlugin();
    console.log(`[Movement] startMovementMonitoring invoked booking=${bookingId} worker=${workerId}`);

    if (!plugin) {
      console.error("[Movement] Skipped — StepCounter plugin unavailable or not native Android");
      setStatus({ warning: "⚠️ Step tracking not active. Please enable permissions.", lastError: "StepCounter plugin unavailable", sensorSupported: false });
      await saveMovementCheck(bookingId, workerId, {
        sensor_supported: false,
        permission_granted: false,
        movement_status: "unsupported",
        low_movement_reason: "Not running on native Android or StepCounter plugin unavailable",
      });
      return;
    }

    const { support } = await ensureMovementPrerequisites(plugin);
    if (!support.supported) {
      await saveMovementCheck(bookingId, workerId, {
        sensor_supported: false,
        permission_granted: false,
        movement_status: "unsupported",
        low_movement_reason: "Device does not have step sensors",
      });
      return;
    }

    const { granted } = await plugin.requestPermission();
    console.log(`[Movement] ACTIVITY_RECOGNITION permission_granted=${granted}`);
    setStatus({ permissionGranted: granted });
    if (!granted) {
      setStatus({ warning: "⚠️ Step tracking not active. Please enable permissions.", status: "Not Tracking", lastError: "ACTIVITY_RECOGNITION permission denied" });
      await saveMovementCheck(bookingId, workerId, {
        sensor_supported: true,
        permission_granted: false,
        movement_status: "permission_denied",
        low_movement_reason: "ACTIVITY_RECOGNITION permission denied",
        sensor_type_used: support.sensorType,
      });
      return;
    }

    const minSteps = await fetchMinSteps();
    activeSession.minSteps = minSteps;
    await saveMovementCheck(bookingId, workerId, {
      sensor_supported: true,
      permission_granted: true,
      movement_status: "monitoring",
      sensor_type_used: support.sensorType,
      monitoring_window_seconds: MONITORING_WINDOW_SECONDS,
      min_required_steps: minSteps,
    });

    activeSession.stepListener = await plugin.addListener("stepUpdate", (data) => handleStepUpdate(data as NativeStepUpdate));
    activeSession.completionListener = await plugin.addListener("monitoringComplete", async (result) => {
      const final = result as MonitoringResult;
      console.log("[Movement] Movement monitoring complete", final);
      const steps = final.stepsInWindow ?? activeSession?.lastSteps ?? 0;
      const isLowMovement = steps < minSteps;
      await sendMovementUpdate("final");
      await updateMovementCheck(bookingId, workerId, {
        baseline_step_value: final.baselineStepValue,
        final_step_value: final.finalStepValue,
        steps_in_window: steps,
        movement_status: isLowMovement ? "low_movement" : "ok",
        low_movement_flag: isLowMovement,
        low_movement_reason: isLowMovement ? `Only ${steps} steps in ${MONITORING_WINDOW_SECONDS / 60} min (min: ${minSteps})` : null,
        checked_at: new Date().toISOString(),
      });
    });

    const startResult = await plugin.startMonitoring({ bookingId, windowSeconds: MONITORING_WINDOW_SECONDS });
    console.log(`[Movement] ✅ Monitoring started — booking=${bookingId} window=${MONITORING_WINDOW_SECONDS}s minSteps=${minSteps}`, startResult);
    setStatus({ status: "Not Moving", warning: null, sensorType: startResult.sensorType ?? support.sensorType });
    startLiveLoop();
    await sendMovementUpdate("startup");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Movement] Movement monitoring error:", error);
    setStatus({ status: "Not Tracking", lastError: message, warning: `⚠️ Step tracking not active. Please enable permissions. (${message})` });
    try {
      await saveMovementCheck(bookingId, workerId, {
        sensor_supported: false,
        permission_granted: false,
        movement_status: "error",
        low_movement_reason: message,
      });
    } catch {
      console.error("[Movement] Failed to save movement tracking error state");
    }
  }
}

/** Stop monitoring (e.g. if booking is cancelled/completed). */
export async function stopMovementMonitoring(): Promise<void> {
  const session = activeSession;
  activeSession = null;
  if (!session) return;
  try {
    if (session.intervalId) window.clearInterval(session.intervalId);
    session.stepListener?.remove();
    session.completionListener?.remove();
    const plugin = getPlugin();
    if (plugin) await plugin.stopMonitoring();
  } catch (error) {
    console.error("[Movement] stopMovementMonitoring failed", error);
  } finally {
    statusListeners.forEach((listener) => listener({ ...session.status, status: "Not Tracking", warning: null }));
  }
}

async function saveMovementCheck(bookingId: string, workerId: string, fields: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await supabase
      .from("booking_worker_movement_checks" as any)
      .upsert({ booking_id: bookingId, worker_id: workerId, accepted_at: new Date().toISOString(), ...fields } as any, { onConflict: "booking_id,worker_id" });
    if (error) console.error("[Movement] Failed to save movement check:", error);
    else console.log(`[Movement] ✅ movement check upserted booking=${bookingId} worker=${workerId} status=${fields.movement_status ?? "unknown"}`);
  } catch (e) {
    console.error("[Movement] Movement check save error:", e);
  }
}

async function updateMovementCheck(bookingId: string, workerId: string, fields: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await supabase
      .from("booking_worker_movement_checks" as any)
      .update(fields as any)
      .eq("booking_id", bookingId)
      .eq("worker_id", workerId);
    if (error) console.error("[Movement] Failed to update movement check:", error);
    else console.log(`[Movement] ✅ movement check updated booking=${bookingId} worker=${workerId} status=${fields.movement_status ?? "unknown"}`);
  } catch (e) {
    console.error("[Movement] Movement check update error:", e);
  }
}
