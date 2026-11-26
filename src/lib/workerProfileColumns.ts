import type { Database } from "@/integrations/supabase/types";

type WorkerRow = Database["public"]["Tables"]["workers"]["Row"];

/**
 * Columns the shared worker profile (Home, Profile, Settings, Reviews, app shell)
 * may load. Never add FCM tokens, bank details or payout-provider fields here.
 */
export const WORKER_PROFILE_FIELDS = [
  "id", "user_id", "full_name", "phone", "photo_url",
  "community", "communities", "selected_community_id", "service_types",
  "is_active", "is_available", "is_busy", "is_blocked", "blocked_reason",
  "approval_status", "availability_requires_approval",
  "upi_id", "upi_qr_url", "fcm_token_status", "payout_ready",
  "rating", "total_ratings", "updated_at",
] as const satisfies readonly (keyof WorkerRow)[];

export const WORKER_PROFILE_COLUMNS = WORKER_PROFILE_FIELDS.join(", ");
export type WorkerProfile = Pick<WorkerRow, (typeof WORKER_PROFILE_FIELDS)[number]>;

/** Bank/UPI fields — only the payout details screen loads these. */
export const WORKER_PAYOUT_DETAIL_FIELDS = [
  "id", "upi_id", "account_holder_name", "bank_account_number",
  "ifsc_code", "bank_name", "passbook_url",
] as const satisfies readonly (keyof WorkerRow)[];
export const WORKER_PAYOUT_DETAIL_COLUMNS = WORKER_PAYOUT_DETAIL_FIELDS.join(", ");
export type WorkerPayoutDetails = Pick<WorkerRow, (typeof WORKER_PAYOUT_DETAIL_FIELDS)[number]>;

/** Fields the client must never write; the server alone owns account linkage. */
export const SERVER_OWNED_WORKER_FIELDS = ["id", "user_id"] as const;

/** Drops server-owned identity fields from any profile update payload. */
export function sanitizeWorkerUpdate<T extends Record<string, unknown>>(updates: T): Omit<T, "id" | "user_id"> {
  const out: Record<string, unknown> = { ...updates };
  for (const f of SERVER_OWNED_WORKER_FIELDS) delete out[f];
  return out as Omit<T, "id" | "user_id">;
}
