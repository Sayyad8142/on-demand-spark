import { CURRENT_VERSION_NAME, CURRENT_VERSION_CODE } from "@/config/version";

/**
 * Availability changes from the Worker App may only come from a deliberate
 * worker tap. The action source is a diagnostic label for audit logs; the
 * server must never use it (or any client field) to decide who the actor is.
 */
export const AVAILABILITY_ACTION_SOURCES = ["toggle_tap"] as const;
export type AvailabilityActionSource = (typeof AVAILABILITY_ACTION_SOURCES)[number];

export function buildAvailabilityRequest(isAvailable: boolean, actionSource: AvailabilityActionSource) {
  if (typeof isAvailable !== "boolean") throw new Error("is_available must be a boolean");
  if (!AVAILABILITY_ACTION_SOURCES.includes(actionSource)) throw new Error("unknown availability action source");
  return {
    is_available: isAvailable,
    action_source: actionSource,
    app_version: CURRENT_VERSION_NAME,
    app_version_code: CURRENT_VERSION_CODE,
  };
}
