/**
 * Step-based worker movement monitoring after booking acceptance.
 * Uses Android step sensors to passively count steps for 3 minutes.
 * Falls back silently on unsupported devices or web.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

interface StepCounterPlugin {
  checkSupport(): Promise<{ supported: boolean; sensorType: string }>;
  requestPermission(): Promise<{ granted: boolean }>;
  startMonitoring(opts: {
    bookingId: string;
    windowSeconds: number;
  }): Promise<{ status: string; bookingId: string; sensorType?: string }>;
  stopMonitoring(): Promise<void>;
  addListener(
    event: "monitoringComplete",
    cb: (data: MonitoringResult) => void
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

const MONITORING_WINDOW_SECONDS = 180; // 3 minutes
const DEFAULT_MIN_STEPS = 40;

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

let StepCounter: StepCounterPlugin | null = null;

function getPlugin(): StepCounterPlugin | null {
  if (!Capacitor.isNativePlatform()) return null;
  if (!StepCounter) {
    try {
      StepCounter = registerPlugin<StepCounterPlugin>("StepCounter");
    } catch {
      console.log("📊 StepCounter plugin not available");
      return null;
    }
  }
  return StepCounter;
}

/**
 * Start movement monitoring after a booking is accepted.
 * This is fire-and-forget — it will never block or throw to the caller.
 */
export async function startMovementMonitoring(
  bookingId: string,
  workerId: string
): Promise<void> {
  try {
    const plugin = getPlugin();

    // Not on native — record as unsupported and exit
    if (!plugin) {
      await saveMovementCheck(bookingId, workerId, {
        sensor_supported: false,
        permission_granted: false,
        movement_status: "unsupported",
        low_movement_reason: "Not running on native Android",
      });
      return;
    }

    // Check sensor support
    const { supported, sensorType } = await plugin.checkSupport();
    if (!supported) {
      await saveMovementCheck(bookingId, workerId, {
        sensor_supported: false,
        permission_granted: false,
        movement_status: "unsupported",
        low_movement_reason: "Device does not have step sensors",
      });
      return;
    }

    // Request permission
    const { granted } = await plugin.requestPermission();
    if (!granted) {
      await saveMovementCheck(bookingId, workerId, {
        sensor_supported: true,
        permission_granted: false,
        movement_status: "permission_denied",
        low_movement_reason: "ACTIVITY_RECOGNITION permission denied",
        sensor_type_used: sensorType,
      });
      return;
    }

    // Fetch dynamic threshold from backend
    const minSteps = await fetchMinSteps();
    console.log("📊 Using min_movement_steps threshold:", minSteps);

    // Create initial record with the actual threshold used
    await saveMovementCheck(bookingId, workerId, {
      sensor_supported: true,
      permission_granted: true,
      movement_status: "monitoring",
      sensor_type_used: sensorType,
      monitoring_window_seconds: MONITORING_WINDOW_SECONDS,
      min_required_steps: minSteps,
    });

    // Listen for completion
    const listenerHandle = await plugin.addListener(
      "monitoringComplete",
      async (result: MonitoringResult) => {
        console.log("📊 Movement monitoring complete:", result);
        listenerHandle.remove();

        const steps = result.stepsInWindow ?? 0;
        const isLowMovement = steps < minSteps;

        await updateMovementCheck(bookingId, workerId, {
          baseline_step_value: result.baselineStepValue,
          final_step_value: result.finalStepValue,
          steps_in_window: steps,
          movement_status: isLowMovement ? "low_movement" : "ok",
          low_movement_flag: isLowMovement,
          low_movement_reason: isLowMovement
            ? `Only ${steps} steps in ${MONITORING_WINDOW_SECONDS / 60} min (min: ${minSteps})`
            : null,
          checked_at: new Date().toISOString(),
        });
      }
    );

    // Start native monitoring
    const startResult = await plugin.startMonitoring({
      bookingId,
      windowSeconds: MONITORING_WINDOW_SECONDS,
    });

    console.log("📊 Step monitoring started:", startResult);
  } catch (error) {
    console.error("📊 Movement monitoring error (non-blocking):", error);
    // Save error state but never block
    try {
      await saveMovementCheck(bookingId, workerId, {
        sensor_supported: false,
        permission_granted: false,
        movement_status: "error",
        low_movement_reason: String(error),
      });
    } catch {
      // Truly silent — never break booking flow
    }
  }
}

/**
 * Stop monitoring (e.g. if booking is cancelled).
 */
export async function stopMovementMonitoring(): Promise<void> {
  try {
    const plugin = getPlugin();
    if (plugin) await plugin.stopMonitoring();
  } catch {
    // Silent
  }
}

// ─── Persistence helpers ───

async function saveMovementCheck(
  bookingId: string,
  workerId: string,
  fields: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase
      .from("booking_worker_movement_checks" as any)
      .upsert(
        {
          booking_id: bookingId,
          worker_id: workerId,
          accepted_at: new Date().toISOString(),
          ...fields,
        } as any,
        { onConflict: "booking_id,worker_id" }
      );

    if (error) console.error("📊 Failed to save movement check:", error);
  } catch (e) {
    console.error("📊 Movement check save error:", e);
  }
}

async function updateMovementCheck(
  bookingId: string,
  workerId: string,
  fields: Record<string, unknown>
): Promise<void> {
  try {
    const { error } = await supabase
      .from("booking_worker_movement_checks" as any)
      .update(fields as any)
      .eq("booking_id", bookingId)
      .eq("worker_id", workerId);

    if (error) console.error("📊 Failed to update movement check:", error);
  } catch (e) {
    console.error("📊 Movement check update error:", e);
  }
}
