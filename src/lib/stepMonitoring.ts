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
  /** Stops the booking-specific track only (passive keeps running). */
  stopMonitoring(): Promise<void>;
  /** Stops only the passive online track. */
  stopPassive?(): Promise<void>;
  /** Stops both tracks and tears down the foreground service. */
  stopAll?(): Promise<void>;
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

// Booking-specific check window: 5 minutes (was 3) — gives the worker time to start moving
// after accepting a booking before the low-movement flag is evaluated.
const MONITORING_WINDOW_SECONDS = 300;
const DEFAULT_MIN_STEPS = 40;
const LIVE_SEND_INTERVAL_MS = 30_000;
const NOT_MOVING_AFTER_MS = 150_000;
const FAILSAFE_AFTER_MS = 60_000;

// Passive monitor (while worker is online, no booking) — long-running, no auto-stop.
// Uses a much larger window so the native plugin does not unregister the sensor.
const PASSIVE_WINDOW_SECONDS = 24 * 60 * 60; // 24h
const PASSIVE_SEND_INTERVAL_MS = 60_000;     // 1 sample per minute
const statusListeners = new Set<(status: MovementDebugStatus) => void>();
let StepCounter: StepCounterPlugin | null = null;
const movementTable = (supabase as unknown as {
  from: (table: string) => {
    upsert: (values: Record<string, unknown>, options: { onConflict: string }) => Promise<{ error: { message?: string } | null }>;
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => { eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }> };
    };
  };
}).from("booking_worker_movement_checks");
const movementTableApi: {
  upsert: (values: Record<string, unknown>, options: { onConflict: string }) => Promise<{ error: { message?: string } | null }>;
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: string) => { eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }> };
  };
} = movementTable;
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
    console.log("[Movement] Supabase log inserted", { booking_id: session.bookingId, worker_id: session.workerId, step_count: session.lastSteps, reason });
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
  console.log("[Movement] step event received", { booking_id: update.bookingId, step_count: current, previous, increased });

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

/** Start movement monitoring after a booking is accepted. Idempotent for same booking+worker. */
export async function startMovementMonitoring(bookingId: string, workerId: string): Promise<void> {
  if (activeSession && activeSession.bookingId === bookingId && activeSession.workerId === workerId) {
    console.log("[Movement] already tracking this booking — skipping duplicate start", { booking_id: bookingId, worker_id: workerId });
    return;
  }
  await stopMovementMonitoring();
  console.log("[Movement] starting tracking");
  console.log("[Movement] worker_id", workerId);
  console.log("[Movement] booking_id", bookingId);
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
    console.log("[Movement] permission status", { granted });
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
    console.log("[Movement] native service started", { booking_id: bookingId, window_seconds: MONITORING_WINDOW_SECONDS, sensor_type: startResult.sensorType ?? support.sensorType, min_steps: minSteps });
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
    const { error } = await movementTableApi.upsert({ booking_id: bookingId, worker_id: workerId, accepted_at: new Date().toISOString(), ...fields }, { onConflict: "booking_id,worker_id" });
    if (error) console.error("[Movement] Failed to save movement check:", error);
    else console.log(`[Movement] ✅ movement check upserted booking=${bookingId} worker=${workerId} status=${fields.movement_status ?? "unknown"}`);
  } catch (e) {
    console.error("[Movement] Movement check save error:", e);
  }
}

async function updateMovementCheck(bookingId: string, workerId: string, fields: Record<string, unknown>): Promise<void> {
  try {
    const { error } = await movementTableApi
      .update(fields)
      .eq("booking_id", bookingId)
      .eq("worker_id", workerId);
    if (error) console.error("[Movement] Failed to update movement check:", error);
    else console.log(`[Movement] ✅ movement check updated booking=${bookingId} worker=${workerId} status=${fields.movement_status ?? "unknown"}`);
  } catch (e) {
    console.error("[Movement] Movement check update error:", e);
  }
}

// ───────────────────────────────────────────────────────────────────────────────
// Passive movement monitoring (while worker is online, no active booking).
// This is intentionally SEPARATE from the booking-specific session above so it
// cannot interfere with dispatch / completion checks.
// ───────────────────────────────────────────────────────────────────────────────

export interface PassiveMovementStatus {
  workerId: string;
  steps: number;
  previousSteps: number;
  isMoving: boolean;
  status: "Tracking" | "Not Tracking" | "Permission Denied" | "Sensor Unsupported";
  permissionGranted: boolean | null;
  sensorSupported: boolean | null;
  sensorType: string | null;
  lastUpdatedAt: string | null;
  lastSentAt: string | null;
  lastSendOk: boolean | null;
  lastError: string | null;
  warning: string | null;
}

let passiveSession: {
  workerId: string;
  lastSteps: number;
  previousSteps: number;
  lastMovementAt: number;
  intervalId: number | null;
  stepListener?: { remove: () => void };
  status: PassiveMovementStatus;
} | null = null;

const passiveListeners = new Set<(s: PassiveMovementStatus | null) => void>();

export function subscribePassiveMovementStatus(
  listener: (s: PassiveMovementStatus | null) => void,
): () => void {
  passiveListeners.add(listener);
  listener(passiveSession?.status ?? null);
  return () => passiveListeners.delete(listener);
}

function emitPassive() {
  passiveListeners.forEach((l) => l(passiveSession?.status ?? null));
}

function setPassive(patch: Partial<PassiveMovementStatus>) {
  if (!passiveSession) return;
  passiveSession.status = { ...passiveSession.status, ...patch };
  emitPassive();
}

async function sendPassiveSample() {
  if (!passiveSession) return;
  const session = passiveSession;
  const nowIso = new Date().toISOString();
  const payload = {
    worker_id: session.workerId,
    step_count: session.lastSteps,
    previous_step_count: session.previousSteps,
    is_moving: session.status.isMoving,
    sensor_type: session.status.sensorType,
    timestamp: nowIso,
    source: "passive",
  };
  try {
    const { error } = await supabase.functions.invoke("worker-passive-movement", { body: payload });
    if (error) throw error;
    setPassive({ lastSentAt: nowIso, lastSendOk: true, lastError: null });
    console.log("[Passive] sample sent", { steps: session.lastSteps, isMoving: session.status.isMoving });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    setPassive({ lastSendOk: false, lastError: message, warning: `API failed: ${message}` });
    console.error("[Passive] sample send failure", { payload, error });
  }
}

function handlePassiveStepUpdate(update: NativeStepUpdate) {
  if (!passiveSession) return;
  // Plugin currently emits with the bookingId we passed in — ignore mismatched events
  if (update.bookingId !== `passive:${passiveSession.workerId}`) return;
  const now = Date.now();
  const previous = passiveSession.lastSteps;
  const current = Math.max(0, Number(update.stepCount ?? 0));
  const increased = current > previous;
  passiveSession.previousSteps = previous;
  passiveSession.lastSteps = current;
  if (increased) passiveSession.lastMovementAt = now;
  const isMoving = now - passiveSession.lastMovementAt < NOT_MOVING_AFTER_MS && current > 0;
  setPassive({
    steps: current,
    previousSteps: previous,
    isMoving,
    status: "Tracking",
    lastUpdatedAt: new Date().toISOString(),
    warning: null,
  });
}

/** Start passive movement tracking (no booking required). Idempotent. */
export async function startPassiveMovementMonitoring(workerId: string): Promise<void> {
  if (passiveSession?.workerId === workerId) {
    console.log("[Passive] already running for this worker, skipping");
    return;
  }
  await stopPassiveMovementMonitoring();

  passiveSession = {
    workerId,
    lastSteps: 0,
    previousSteps: 0,
    lastMovementAt: Date.now(),
    intervalId: null,
    status: {
      workerId,
      steps: 0,
      previousSteps: 0,
      isMoving: false,
      status: "Not Tracking",
      permissionGranted: null,
      sensorSupported: null,
      sensorType: null,
      lastUpdatedAt: null,
      lastSentAt: null,
      lastSendOk: null,
      lastError: null,
      warning: null,
    },
  };
  emitPassive();

  const plugin = getPlugin();
  if (!plugin) {
    console.log("[Passive] plugin unavailable — not native Android, passive tracking disabled");
    setPassive({
      status: "Sensor Unsupported",
      sensorSupported: false,
      permissionGranted: false,
      warning: "Passive tracking requires the Android app",
    });
    return;
  }

  try {
    const support = await plugin.checkSupport();
    setPassive({ sensorSupported: support.supported, sensorType: support.sensorType });
    if (!support.supported) {
      console.log("[Passive] step sensor not supported");
      setPassive({ status: "Sensor Unsupported", warning: "Step sensor not available on this device" });
      return;
    }
    const { granted } = await plugin.requestPermission();
    setPassive({ permissionGranted: granted });
    console.log(`[Passive] ACTIVITY_RECOGNITION granted=${granted}`);
    if (!granted) {
      setPassive({ status: "Permission Denied", warning: "Enable Physical Activity permission to track movement" });
      return;
    }

    passiveSession.stepListener = await plugin.addListener("stepUpdate", (data) =>
      handlePassiveStepUpdate(data as NativeStepUpdate),
    );
    const startResult = await plugin.startMonitoring({
      bookingId: `passive:${workerId}`,
      windowSeconds: PASSIVE_WINDOW_SECONDS,
    });
    setPassive({
      status: "Tracking",
      sensorType: startResult.sensorType ?? passiveSession.status.sensorType,
      warning: null,
    });
    console.log(`[Passive] ✅ tracking started worker=${workerId} sensor=${startResult.sensorType}`);

    passiveSession.intervalId = window.setInterval(() => {
      if (!passiveSession) return;
      void sendPassiveSample();
    }, PASSIVE_SEND_INTERVAL_MS);
    // Send first sample shortly after start
    void sendPassiveSample();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Passive] start failed", error);
    setPassive({ status: "Not Tracking", lastError: message, warning: `Could not start tracking: ${message}` });
  }
}

export async function stopPassiveMovementMonitoring(): Promise<void> {
  const session = passiveSession;
  passiveSession = null;
  if (!session) return;
  console.log("[Passive] stopping tracking");
  try {
    if (session.intervalId) window.clearInterval(session.intervalId);
    session.stepListener?.remove();
    // Stop only the passive track in the foreground service. The booking
    // track (if any) keeps running independently.
    const plugin = getPlugin();
    if (plugin?.stopPassive) {
      await plugin.stopPassive();
    } else if (plugin && !activeSession) {
      // Fallback for older native plugin versions.
      await plugin.stopMonitoring();
    }
  } catch (error) {
    console.error("[Passive] stop failed", error);
  } finally {
    passiveListeners.forEach((l) => l(null));
  }
}

export function isPassiveMonitoringActive(): boolean {
  return passiveSession !== null;
}
